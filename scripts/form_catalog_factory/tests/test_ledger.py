from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest

from scripts.form_catalog_factory.ledger import (
    BatchFrozenError,
    BatchStatus,
    CatalogFactoryLedger,
    ConflictError,
    FreezeValidationError,
    IdempotencyConflictError,
    LeaseLostError,
    Stage,
)

ROOT = Path(__file__).resolve().parents[3]


class FakeClock:
    def __init__(self, value: float = 1_800_000_000.0) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


def build_ledger(tmp_path, clock: FakeClock | None = None) -> CatalogFactoryLedger:
    return CatalogFactoryLedger(
        tmp_path / "factory.sqlite3",
        clock=clock or FakeClock(),
    )


def add_item(
    ledger: CatalogFactoryLedger,
    catalog_id: str,
    *,
    priority: int = 0,
    ownership: str = "first_party",
) -> None:
    ledger.add_item(
        catalog_id=catalog_id,
        section="field_service",
        filename=f"{catalog_id}.pdf",
        slug=catalog_id,
        ownership=ownership,
        intent_fingerprint=f"intent:{catalog_id}",
        priority=priority,
        payload={"title": catalog_id.replace("-", " ").title()},
        current_asset_hash="0" * 64,
    )


def test_existing_ledger_adds_hash_bound_review_evidence_columns(tmp_path) -> None:
    database_path = tmp_path / "legacy.sqlite3"
    connection = sqlite3.connect(database_path)
    try:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute(
            """
            CREATE TABLE catalog_factory_batches (
                batch_id TEXT PRIMARY KEY,
                target_count INTEGER,
                base_commit TEXT,
                renderer_commit TEXT,
                status TEXT,
                frozen_digest TEXT,
                manifest_json TEXT,
                created_at REAL,
                frozen_at REAL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE catalog_factory_items (
                catalog_id TEXT PRIMARY KEY,
                section TEXT,
                filename TEXT,
                slug TEXT,
                ownership TEXT,
                intent_fingerprint TEXT,
                stage TEXT,
                batch_id TEXT,
                priority INTEGER,
                payload_json TEXT,
                current_asset_hash TEXT,
                spec_hash TEXT,
                pdf_hash TEXT,
                thumbnail_hash TEXT,
                schema_hash TEXT,
                pdf_uri TEXT,
                thumbnail_uri TEXT,
                qa_evidence_uri TEXT,
                lease_owner TEXT,
                lease_token TEXT,
                fence_epoch INTEGER,
                lease_expires_at REAL,
                attempt_count INTEGER,
                retry_stage TEXT,
                not_before REAL,
                last_error TEXT,
                version INTEGER,
                created_at REAL,
                updated_at REAL
            )
            """
        )
        connection.commit()
    finally:
        connection.close()

    CatalogFactoryLedger(database_path)

    connection = sqlite3.connect(database_path)
    try:
        columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(catalog_factory_items)"
            ).fetchall()
        }
        batch_columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(catalog_factory_batches)"
            ).fetchall()
        }
    finally:
        connection.close()
    assert {
        "qa_evidence_hash",
        "review_evidence_uri",
        "review_evidence_hash",
    } <= columns
    assert {
        "source_commit",
        "selection_digest",
        "build_report_hash",
        "release_manifest_hash",
        "version",
    } <= batch_columns


def test_legacy_idempotency_results_default_new_evidence_fields(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    batch = ledger.create_batch(
        batch_id="legacy-result-batch",
        target_count=1,
        base_commit="base",
        renderer_commit="renderer",
        idempotency_key="legacy:create-batch",
    )
    ledger.add_item(
        catalog_id="legacy-result-item",
        section="field_service",
        filename="legacy-result-item.pdf",
        slug="legacy-result-item",
        idempotency_key="legacy:add-item",
    )
    connection = sqlite3.connect(ledger.database_path)
    try:
        for key, removed_fields in (
            (
                "legacy:create-batch",
                {
                    "source_commit",
                    "selection_digest",
                    "build_report_hash",
                    "release_manifest_hash",
                    "version",
                },
            ),
            (
                "legacy:add-item",
                {
                    "qa_evidence_hash",
                    "review_evidence_uri",
                    "review_evidence_hash",
                },
            ),
        ):
            raw = connection.execute(
                "SELECT result_json FROM catalog_factory_operations "
                "WHERE idempotency_key = ?",
                (key,),
            ).fetchone()[0]
            payload = json.loads(raw)
            for field_name in removed_fields:
                payload.pop(field_name)
            connection.execute(
                "UPDATE catalog_factory_operations SET result_json = ? "
                "WHERE idempotency_key = ?",
                (json.dumps(payload, separators=(",", ":"), sort_keys=True), key),
            )
        connection.commit()
    finally:
        connection.close()

    replayed_batch = ledger.create_batch(
        batch_id=batch.batch_id,
        target_count=1,
        base_commit="base",
        renderer_commit="renderer",
        idempotency_key="legacy:create-batch",
    )
    replayed_item = ledger.add_item(
        catalog_id="legacy-result-item",
        section="field_service",
        filename="legacy-result-item.pdf",
        slug="legacy-result-item",
        idempotency_key="legacy:add-item",
    )

    assert replayed_batch.source_commit is None
    assert replayed_item.qa_evidence_hash is None
    assert replayed_item.review_evidence_uri is None


def approve_item(ledger: CatalogFactoryLedger, catalog_id: str) -> None:
    spec_lease = ledger.claim_next(
        worker_id=f"spec:{catalog_id}",
        claimed_stage=Stage.SPEC_CLAIMED,
        batch_id=ledger.get_item(catalog_id).batch_id,
    )
    assert spec_lease is not None
    ledger.complete_lease(
        spec_lease,
        idempotency_key=f"{catalog_id}:spec",
        artifact_updates={"spec_hash": "1" * 64},
    )

    render_lease = ledger.claim_next(
        worker_id=f"render:{catalog_id}",
        claimed_stage=Stage.RENDER_CLAIMED,
        batch_id=ledger.get_item(catalog_id).batch_id,
    )
    assert render_lease is not None
    ledger.complete_lease(
        render_lease,
        idempotency_key=f"{catalog_id}:render",
        artifact_updates={
            "pdf_hash": "2" * 64,
            "thumbnail_hash": "3" * 64,
            "schema_hash": "4" * 64,
            "pdf_uri": f"gs://candidate/{catalog_id}/{'2' * 64}.pdf",
            "thumbnail_uri": f"gs://candidate/{catalog_id}/{'3' * 64}.webp",
        },
    )

    qa_lease = ledger.claim_next(
        worker_id=f"qa:{catalog_id}",
        claimed_stage=Stage.QA_CLAIMED,
        batch_id=ledger.get_item(catalog_id).batch_id,
    )
    assert qa_lease is not None
    ledger.complete_lease(
        qa_lease,
        idempotency_key=f"{catalog_id}:qa",
        artifact_updates={
            "qa_evidence_uri": f"gs://candidate/{catalog_id}/qa.json",
            "qa_evidence_hash": "5" * 64,
        },
    )

    review_lease = ledger.claim_next(
        worker_id=f"review:{catalog_id}",
        claimed_stage=Stage.REVIEW_CLAIMED,
        batch_id=ledger.get_item(catalog_id).batch_id,
    )
    assert review_lease is not None
    ledger.complete_lease(
        review_lease,
        idempotency_key=f"{catalog_id}:review",
        artifact_updates={
            "review_evidence_uri": f"gs://candidate/{catalog_id}/review.json",
            "review_evidence_hash": "6" * 64,
        },
    )
    assert ledger.get_item(catalog_id).stage is Stage.REVIEW_APPROVED


def prepare_spec_ready_batch(
    ledger: CatalogFactoryLedger,
    *,
    batch_id: str = "batch-retarget",
    catalog_id: str = "retarget-form",
) -> dict:
    ledger.create_batch(
        batch_id=batch_id,
        target_count=1,
        base_commit="a" * 40,
        renderer_commit="b" * 40,
    )
    add_item(ledger, catalog_id)
    ledger.assign_to_batch(batch_id=batch_id, catalog_ids=[catalog_id])
    lease = ledger.claim_next(
        worker_id="retarget-spec-author",
        claimed_stage=Stage.SPEC_CLAIMED,
        batch_id=batch_id,
    )
    assert lease is not None
    ledger.complete_lease(
        lease,
        idempotency_key=f"{batch_id}:spec-ready",
        artifact_updates={"spec_hash": "1" * 64},
    )
    return ledger.get_open_batch_retarget_fence(batch_id)


def test_wal_claim_heartbeat_and_idempotent_completion(tmp_path) -> None:
    clock = FakeClock()
    ledger = build_ledger(tmp_path, clock)
    assert ledger.journal_mode() == "wal"
    add_item(ledger, "low-priority", priority=1)
    add_item(ledger, "high-priority", priority=10)

    lease = ledger.claim_next(
        worker_id="spec-agent",
        claimed_stage=Stage.SPEC_CLAIMED,
        lease_seconds=20,
        idempotency_key="claim:spec-agent:1",
    )
    assert lease is not None
    assert lease.catalog_id == "high-priority"
    assert lease.fence_epoch == 1

    replayed_lease = ledger.claim_next(
        worker_id="spec-agent",
        claimed_stage=Stage.SPEC_CLAIMED,
        lease_seconds=20,
        idempotency_key="claim:spec-agent:1",
    )
    assert replayed_lease == lease

    clock.advance(5)
    heartbeat = ledger.heartbeat(lease, lease_seconds=30)
    assert heartbeat.expires_at == clock.value + 30

    completed = ledger.complete_lease(
        heartbeat,
        idempotency_key="complete:high-priority:spec",
        artifact_updates={"spec_hash": "a" * 64},
    )
    assert completed.idempotent_replay is False
    assert completed.item.stage is Stage.SPEC_READY
    assert completed.item.spec_hash == "a" * 64

    replay = ledger.complete_lease(
        heartbeat,
        idempotency_key="complete:high-priority:spec",
        artifact_updates={"spec_hash": "a" * 64},
    )
    assert replay.idempotent_replay is True
    assert replay.item == completed.item

    with pytest.raises(IdempotencyConflictError):
        ledger.complete_lease(
            heartbeat,
            idempotency_key="complete:high-priority:spec",
            artifact_updates={"spec_hash": "b" * 64},
        )


def test_exact_identity_claim_does_not_take_higher_priority_sibling(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    add_item(ledger, "requested-item", priority=1)
    add_item(ledger, "higher-priority", priority=100)

    lease = ledger.claim_next(
        worker_id="family-lane-agent",
        claimed_stage=Stage.SPEC_CLAIMED,
        catalog_id="requested-item",
    )

    assert lease is not None
    assert lease.catalog_id == "requested-item"
    assert ledger.get_item("higher-priority").stage is Stage.QUEUED


def test_expired_lease_requeues_and_old_fence_cannot_publish(tmp_path) -> None:
    clock = FakeClock()
    ledger = build_ledger(tmp_path, clock)
    add_item(ledger, "repair-order")
    old_lease = ledger.claim_next(
        worker_id="worker-a",
        claimed_stage=Stage.SPEC_CLAIMED,
        lease_seconds=10,
    )
    assert old_lease is not None

    clock.advance(11)
    with pytest.raises(LeaseLostError):
        ledger.heartbeat(old_lease, lease_seconds=10)

    assert ledger.requeue_expired() == 1
    replacement = ledger.claim_next(
        worker_id="worker-b",
        claimed_stage=Stage.SPEC_CLAIMED,
        lease_seconds=10,
    )
    assert replacement is not None
    assert replacement.catalog_id == old_lease.catalog_id
    assert replacement.fence_epoch == old_lease.fence_epoch + 1

    with pytest.raises(LeaseLostError):
        ledger.complete_lease(
            old_lease,
            idempotency_key="stale-completion",
            artifact_updates={"spec_hash": "a" * 64},
        )

    ledger.complete_lease(
        replacement,
        idempotency_key="replacement-completion",
        artifact_updates={"spec_hash": "b" * 64},
    )
    assert ledger.get_item("repair-order").spec_hash == "b" * 64


def test_retry_wait_only_releases_after_backoff(tmp_path) -> None:
    clock = FakeClock()
    ledger = build_ledger(tmp_path, clock)
    add_item(ledger, "incident-report")
    lease = ledger.claim_next(
        worker_id="worker-a",
        claimed_stage=Stage.SPEC_CLAIMED,
    )
    assert lease is not None
    failure = ledger.fail_lease(
        lease,
        error="renderer service unavailable",
        retryable=True,
        retry_delay_seconds=60,
        idempotency_key="failure:1",
    )
    assert failure.item.stage is Stage.RETRY_WAIT
    assert failure.item.retry_stage is Stage.QUEUED
    assert ledger.release_due_retries() == 0
    assert (
        ledger.claim_next(
            worker_id="worker-b",
            claimed_stage=Stage.SPEC_CLAIMED,
        )
        is None
    )

    clock.advance(60)
    assert ledger.release_due_retries() == 1
    retry = ledger.claim_next(
        worker_id="worker-b",
        claimed_stage=Stage.SPEC_CLAIMED,
    )
    assert retry is not None
    assert retry.attempt_count == 2


def test_no_work_claim_replay_does_not_claim_later_item(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    assert (
        ledger.claim_next(
            worker_id="worker-a",
            claimed_stage=Stage.SPEC_CLAIMED,
            idempotency_key="empty-claim",
        )
        is None
    )
    add_item(ledger, "later-item")
    assert (
        ledger.claim_next(
            worker_id="worker-a",
            claimed_stage=Stage.SPEC_CLAIMED,
            idempotency_key="empty-claim",
        )
        is None
    )
    assert (
        ledger.claim_next(
            worker_id="worker-a",
            claimed_stage=Stage.SPEC_CLAIMED,
            idempotency_key="new-claim",
        )
        is not None
    )


def test_identity_and_intent_reservations_reject_duplicates(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    add_item(ledger, "canonical")

    with pytest.raises(ConflictError):
        ledger.add_item(
            catalog_id="duplicate-slug",
            section="other",
            filename="different.pdf",
            slug="canonical",
            intent_fingerprint="intent:different",
        )

    with pytest.raises(ConflictError):
        ledger.add_item(
            catalog_id="duplicate-intent",
            section="other",
            filename="another.pdf",
            slug="another",
            intent_fingerprint="intent:canonical",
        )


def test_concurrent_claimers_cannot_claim_the_same_item(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    add_item(ledger, "single-item")

    def claim(worker: str):
        return ledger.claim_next(
            worker_id=worker,
            claimed_stage=Stage.SPEC_CLAIMED,
            idempotency_key=f"claim:{worker}",
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(claim, ["worker-a", "worker-b"]))

    leases = [result for result in results if result is not None]
    assert len(leases) == 1
    assert leases[0].catalog_id == "single-item"


def test_release_evidence_is_write_once_and_seals_batch_membership(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    ledger.create_batch(
        batch_id="batch-evidence",
        target_count=1,
        base_commit="a" * 40,
        renderer_commit="b" * 40,
    )
    add_item(ledger, "bound-form")
    ledger.assign_to_batch(
        batch_id="batch-evidence",
        catalog_ids=["bound-form"],
    )
    evidence = {
        "batch_id": "batch-evidence",
        "source_commit": "c" * 40,
        "selection_digest": "1" * 64,
        "build_report_hash": "2" * 64,
        "release_manifest_hash": "3" * 64,
    }

    first = ledger.bind_release_evidence(
        **evidence,
        idempotency_key="bind-evidence:first",
    )
    replay = ledger.bind_release_evidence(
        **evidence,
        idempotency_key="bind-evidence:semantic-replay",
    )

    assert replay == first
    with pytest.raises(ConflictError, match="different release evidence"):
        ledger.bind_release_evidence(
            **{**evidence, "release_manifest_hash": "4" * 64},
            idempotency_key="bind-evidence:conflict",
        )
    with pytest.raises(ConflictError, match="membership is sealed"):
        ledger.remove_from_batch(
            batch_id="batch-evidence",
            catalog_ids=["bound-form"],
        )


def test_open_batch_source_retarget_is_fenced_audited_and_idempotent(
    tmp_path,
) -> None:
    ledger = build_ledger(tmp_path)
    fence = prepare_spec_ready_batch(ledger)
    request = {
        "batch_id": "batch-retarget",
        "expected_base_commit": fence["base_commit"],
        "expected_renderer_commit": fence["renderer_commit"],
        "expected_batch_version": fence["batch_version"],
        "expected_state_digest": fence["state_digest"],
        "selection_digest": "4" * 64,
        "expected_catalog_ids": ["retarget-form"],
        "new_source_commit": "c" * 40,
        "actor": "release-controller",
        "idempotency_key": "retarget:batch-retarget:source-c",
    }

    result = ledger.retarget_open_batch_source(**request)

    assert result.idempotent_replay is False
    assert result.batch.base_commit == "a" * 40
    assert result.batch.renderer_commit == "c" * 40
    assert result.batch.source_commit is None
    assert result.batch.version == 1
    assert result.item_count == 1
    assert result.previous_state_digest == fence["state_digest"]
    assert result.current_state_digest != result.previous_state_digest
    assert ledger.get_item("retarget-form").stage is Stage.SPEC_READY

    replay = ledger.retarget_open_batch_source(**request)
    assert replay.idempotent_replay is True
    assert replay.batch == result.batch
    assert replay.current_state_digest == result.current_state_digest
    assert ledger.get_batch("batch-retarget").version == 1

    events = [
        event
        for event in ledger.list_events(batch_id="batch-retarget")
        if event["event_type"] == "batch_open_source_retargeted"
    ]
    assert len(events) == 1
    assert events[0]["actor"] == "release-controller"
    assert events[0]["details"]["selection_digest"] == "4" * 64
    assert events[0]["details"]["new_source_renderer_commit"] == "c" * 40


def test_spec_revision_reopen_is_fenced_audited_and_idempotent(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    fence = prepare_spec_ready_batch(ledger)
    original = ledger.get_item("retarget-form")
    assert original is not None
    request = {
        "batch_id": "batch-retarget",
        "expected_base_commit": fence["base_commit"],
        "expected_renderer_commit": fence["renderer_commit"],
        "expected_batch_version": fence["batch_version"],
        "expected_state_digest": fence["state_digest"],
        "expected_spec_hashes": {"retarget-form": "1" * 64},
        "reason": "Independent usability review rejected customer-visible copy.",
        "actor": "release-controller",
        "idempotency_key": "revise:batch-retarget:copy-review",
    }

    result = ledger.reopen_spec_ready_items_for_revision(**request)

    reopened = ledger.get_item("retarget-form")
    assert reopened is not None
    assert result.idempotent_replay is False
    assert result.reopened_count == 1
    assert result.batch.version == 1
    assert result.previous_state_digest == fence["state_digest"]
    assert result.current_state_digest != result.previous_state_digest
    assert reopened.stage is Stage.QUEUED
    assert reopened.spec_hash is None
    assert reopened.fence_epoch == original.fence_epoch + 1

    replay = ledger.reopen_spec_ready_items_for_revision(**request)
    assert replay.idempotent_replay is True
    assert replay.current_state_digest == result.current_state_digest
    assert ledger.get_batch("batch-retarget").version == 1
    events = [
        event
        for event in ledger.list_events(batch_id="batch-retarget")
        if event["event_type"] == "spec_reopened_for_revision"
    ]
    assert len(events) == 1
    assert events[0]["details"]["previous_spec_hash"] == "1" * 64

    revised_lease = ledger.claim_next(
        worker_id="revision-author",
        claimed_stage=Stage.SPEC_CLAIMED,
        batch_id="batch-retarget",
        catalog_id="retarget-form",
    )
    assert revised_lease is not None
    revised = ledger.complete_lease(
        revised_lease,
        idempotency_key="revise:batch-retarget:complete",
        artifact_updates={"spec_hash": "2" * 64},
    )
    assert revised.item.stage is Stage.SPEC_READY
    assert revised.item.spec_hash == "2" * 64


def test_spec_revision_reopen_rejects_hash_or_state_drift_atomically(
    tmp_path,
) -> None:
    ledger = build_ledger(tmp_path)
    fence = prepare_spec_ready_batch(ledger)
    request = {
        "batch_id": "batch-retarget",
        "expected_base_commit": fence["base_commit"],
        "expected_renderer_commit": fence["renderer_commit"],
        "expected_batch_version": fence["batch_version"],
        "expected_state_digest": fence["state_digest"],
        "expected_spec_hashes": {"retarget-form": "9" * 64},
        "reason": "Correct rejected specification.",
        "actor": "release-controller",
        "idempotency_key": "revise:batch-retarget:wrong-hash",
    }

    with pytest.raises(ConflictError, match="hashes changed"):
        ledger.reopen_spec_ready_items_for_revision(**request)
    unchanged = ledger.get_item("retarget-form")
    assert unchanged is not None
    assert unchanged.stage is Stage.SPEC_READY
    assert unchanged.spec_hash == "1" * 64
    assert ledger.get_batch("batch-retarget").version == 0

    lease = ledger.claim_next(
        worker_id="render-worker",
        claimed_stage=Stage.RENDER_CLAIMED,
        batch_id="batch-retarget",
        catalog_id="retarget-form",
    )
    assert lease is not None
    with pytest.raises(ConflictError, match="state digest changed"):
        ledger.reopen_spec_ready_items_for_revision(
            **{
                **request,
                "expected_spec_hashes": {"retarget-form": "1" * 64},
                "idempotency_key": "revise:batch-retarget:active-lease",
            }
        )
    assert ledger.get_item("retarget-form").stage is Stage.RENDER_CLAIMED


def test_open_batch_source_retarget_can_correct_evidence_free_provenance(
    tmp_path,
) -> None:
    ledger = build_ledger(tmp_path)
    first_fence = prepare_spec_ready_batch(ledger)
    first = ledger.retarget_open_batch_source(
        batch_id="batch-retarget",
        expected_base_commit=first_fence["base_commit"],
        expected_renderer_commit=first_fence["renderer_commit"],
        expected_batch_version=first_fence["batch_version"],
        expected_state_digest=first_fence["state_digest"],
        selection_digest="4" * 64,
        expected_catalog_ids=["retarget-form"],
        new_source_commit="c" * 40,
        actor="release-controller",
        idempotency_key="retarget:batch-retarget:source-c",
    )
    second_fence = ledger.get_open_batch_retarget_fence("batch-retarget")

    corrected = ledger.retarget_open_batch_source(
        batch_id="batch-retarget",
        expected_base_commit=second_fence["base_commit"],
        expected_renderer_commit=second_fence["renderer_commit"],
        expected_batch_version=second_fence["batch_version"],
        expected_state_digest=second_fence["state_digest"],
        selection_digest="4" * 64,
        expected_catalog_ids=["retarget-form"],
        new_source_commit="d" * 40,
        actor="release-controller",
        idempotency_key="retarget:batch-retarget:source-d-correction",
    )

    assert first.batch.renderer_commit == "c" * 40
    assert corrected.batch.renderer_commit == "d" * 40
    assert corrected.batch.base_commit == first_fence["base_commit"]
    assert corrected.batch.version == 2
    assert corrected.batch.source_commit is None
    assert len(
        [
            event
            for event in ledger.list_events(batch_id="batch-retarget")
            if event["event_type"] == "batch_open_source_retargeted"
        ]
    ) == 2


def test_open_batch_source_retarget_rejects_non_lowercase_git_object_id(
    tmp_path,
) -> None:
    ledger = build_ledger(tmp_path)
    fence = prepare_spec_ready_batch(ledger)

    with pytest.raises(ValueError, match="lowercase"):
        ledger.retarget_open_batch_source(
            batch_id="batch-retarget",
            expected_base_commit=fence["base_commit"],
            expected_renderer_commit=fence["renderer_commit"],
            expected_batch_version=fence["batch_version"],
            expected_state_digest=fence["state_digest"],
            selection_digest="4" * 64,
            expected_catalog_ids=["retarget-form"],
            new_source_commit="C" * 40,
            actor="release-controller",
            idempotency_key="retarget:uppercase-source",
        )


@pytest.mark.parametrize(
    ("changed_field", "changed_value", "message"),
    [
        ("expected_base_commit", "9" * 40, "base commit changed"),
        ("expected_renderer_commit", "8" * 40, "renderer commit changed"),
        ("expected_batch_version", 1, "version is 0"),
        ("expected_state_digest", "7" * 64, "state digest changed"),
    ],
)
def test_open_batch_source_retarget_rejects_stale_fence_values(
    tmp_path,
    changed_field,
    changed_value,
    message,
) -> None:
    ledger = build_ledger(tmp_path)
    fence = prepare_spec_ready_batch(ledger)
    request = {
        "batch_id": "batch-retarget",
        "expected_base_commit": fence["base_commit"],
        "expected_renderer_commit": fence["renderer_commit"],
        "expected_batch_version": fence["batch_version"],
        "expected_state_digest": fence["state_digest"],
        "selection_digest": "4" * 64,
        "expected_catalog_ids": ["retarget-form"],
        "new_source_commit": "c" * 40,
        "actor": "release-controller",
        "idempotency_key": f"retarget:stale:{changed_field}",
    }
    request[changed_field] = changed_value

    with pytest.raises(ConflictError, match=message):
        ledger.retarget_open_batch_source(**request)

    assert ledger.get_batch("batch-retarget").renderer_commit == "b" * 40
    assert ledger.get_batch("batch-retarget").version == 0


def test_open_batch_source_retarget_rejects_bound_release_evidence(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    prepare_spec_ready_batch(ledger)
    ledger.bind_release_evidence(
        batch_id="batch-retarget",
        source_commit="d" * 40,
        selection_digest="4" * 64,
        build_report_hash="5" * 64,
        release_manifest_hash="6" * 64,
        idempotency_key="bind:batch-retarget:evidence",
    )
    fence = ledger.get_open_batch_retarget_fence("batch-retarget")
    assert fence["eligible"] is False

    with pytest.raises(ConflictError, match="release or frozen evidence"):
        ledger.retarget_open_batch_source(
            batch_id="batch-retarget",
            expected_base_commit=fence["base_commit"],
            expected_renderer_commit=fence["renderer_commit"],
            expected_batch_version=fence["batch_version"],
            expected_state_digest=fence["state_digest"],
            selection_digest="4" * 64,
            expected_catalog_ids=["retarget-form"],
            new_source_commit="c" * 40,
            actor="release-controller",
            idempotency_key="retarget:evidence-present",
        )


def test_open_batch_source_retarget_rejects_frozen_batch(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    ledger.create_batch(
        batch_id="batch-frozen-retarget",
        target_count=1,
        base_commit="a" * 40,
        renderer_commit="b" * 40,
    )
    add_item(ledger, "frozen-retarget-form")
    ledger.assign_to_batch(
        batch_id="batch-frozen-retarget",
        catalog_ids=["frozen-retarget-form"],
    )
    approve_item(ledger, "frozen-retarget-form")
    ledger.bind_release_evidence(
        batch_id="batch-frozen-retarget",
        source_commit="d" * 40,
        selection_digest="4" * 64,
        build_report_hash="5" * 64,
        release_manifest_hash="6" * 64,
        idempotency_key="bind:batch-frozen-retarget:evidence",
    )
    ledger.freeze_batch(
        batch_id="batch-frozen-retarget",
        idempotency_key="freeze:batch-frozen-retarget",
    )
    fence = ledger.get_open_batch_retarget_fence("batch-frozen-retarget")

    with pytest.raises(BatchFrozenError, match="is frozen"):
        ledger.retarget_open_batch_source(
            batch_id="batch-frozen-retarget",
            expected_base_commit=fence["base_commit"],
            expected_renderer_commit=fence["renderer_commit"],
            expected_batch_version=fence["batch_version"],
            expected_state_digest=fence["state_digest"],
            selection_digest="4" * 64,
            expected_catalog_ids=["frozen-retarget-form"],
            new_source_commit="c" * 40,
            actor="release-controller",
            idempotency_key="retarget:frozen",
        )
    connection = sqlite3.connect(ledger.database_path)
    try:
        with pytest.raises(sqlite3.IntegrityError, match="immutable"):
            connection.execute(
                """
                UPDATE catalog_factory_batches
                SET renderer_commit = ?, version = version + 1
                WHERE batch_id = ?
                """,
                ("c" * 40, "batch-frozen-retarget"),
            )
    finally:
        connection.close()
    frozen = ledger.get_batch("batch-frozen-retarget")
    assert frozen.renderer_commit == "b" * 40
    assert frozen.status is BatchStatus.FROZEN


def test_open_batch_source_retarget_rejects_active_lease(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    prepare_spec_ready_batch(ledger)
    lease = ledger.claim_next(
        worker_id="renderer-in-flight",
        claimed_stage=Stage.RENDER_CLAIMED,
        batch_id="batch-retarget",
    )
    assert lease is not None
    fence = ledger.get_open_batch_retarget_fence("batch-retarget")
    assert fence["eligible"] is False
    assert any("lease" in blocker for blocker in fence["blockers"])

    with pytest.raises(ConflictError, match="lease state"):
        ledger.retarget_open_batch_source(
            batch_id="batch-retarget",
            expected_base_commit=fence["base_commit"],
            expected_renderer_commit=fence["renderer_commit"],
            expected_batch_version=fence["batch_version"],
            expected_state_digest=fence["state_digest"],
            selection_digest="4" * 64,
            expected_catalog_ids=["retarget-form"],
            new_source_commit="c" * 40,
            actor="release-controller",
            idempotency_key="retarget:leased",
        )


def test_open_batch_source_retarget_rejects_non_spec_ready_member(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    ledger.create_batch(
        batch_id="batch-queued-retarget",
        target_count=1,
        base_commit="a" * 40,
        renderer_commit="b" * 40,
    )
    add_item(ledger, "queued-retarget-form")
    ledger.assign_to_batch(
        batch_id="batch-queued-retarget",
        catalog_ids=["queued-retarget-form"],
    )
    fence = ledger.get_open_batch_retarget_fence("batch-queued-retarget")

    with pytest.raises(ConflictError, match="safe spec_ready boundary"):
        ledger.retarget_open_batch_source(
            batch_id="batch-queued-retarget",
            expected_base_commit=fence["base_commit"],
            expected_renderer_commit=fence["renderer_commit"],
            expected_batch_version=fence["batch_version"],
            expected_state_digest=fence["state_digest"],
            selection_digest="4" * 64,
            expected_catalog_ids=["queued-retarget-form"],
            new_source_commit="c" * 40,
            actor="release-controller",
            idempotency_key="retarget:queued",
        )


def test_batch_freeze_is_exact_idempotent_and_immutable(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    batch = ledger.create_batch(
        batch_id="batch-0001",
        target_count=2,
        base_commit="base-sha",
        renderer_commit="renderer-sha",
        idempotency_key="create-batch-0001",
    )
    assert batch.status is BatchStatus.OPEN
    for catalog_id in ("form-a", "form-b"):
        add_item(ledger, catalog_id)
    assigned = ledger.assign_to_batch(
        batch_id=batch.batch_id,
        catalog_ids=["form-a", "form-b"],
        idempotency_key="assign-batch-0001",
    )
    assert {item.catalog_id for item in assigned} == {"form-a", "form-b"}
    for catalog_id in ("form-a", "form-b"):
        approve_item(ledger, catalog_id)
    bound = ledger.bind_release_evidence(
        batch_id=batch.batch_id,
        source_commit="d" * 40,
        selection_digest="1" * 64,
        build_report_hash="2" * 64,
        release_manifest_hash="3" * 64,
        idempotency_key="bind-release-evidence-0001",
    )
    assert bound.source_commit == "d" * 40

    frozen = ledger.freeze_batch(
        batch_id=batch.batch_id,
        idempotency_key="freeze-batch-0001",
    )
    assert frozen.idempotent_replay is False
    assert frozen.batch.status is BatchStatus.FROZEN
    assert len(frozen.batch.frozen_digest) == 64
    assert len(frozen.batch.manifest["items"]) == 2
    assert all(
        item.stage is Stage.BATCH_FROZEN
        for item in ledger.list_items(batch_id=batch.batch_id)
    )

    replay = ledger.freeze_batch(
        batch_id=batch.batch_id,
        idempotency_key="freeze-batch-0001",
    )
    assert replay.idempotent_replay is True
    assert replay.batch == frozen.batch

    with pytest.raises(BatchFrozenError):
        ledger.remove_from_batch(
            batch_id=batch.batch_id,
            catalog_ids=["form-a"],
        )

    upload_lease = ledger.claim_next(
        worker_id="release-agent",
        claimed_stage=Stage.UPLOAD_CLAIMED,
        batch_id=batch.batch_id,
    )
    assert upload_lease is not None
    with pytest.raises(BatchFrozenError):
        ledger.complete_lease(
            upload_lease,
            idempotency_key="upload-with-mutation",
            artifact_updates={"pdf_hash": "9" * 64},
        )
    ledger.complete_lease(
        upload_lease,
        idempotency_key="upload-without-mutation",
    )
    assert ledger.get_item(upload_lease.catalog_id).stage is Stage.STAGING_UPLOADED


def test_freeze_batch_cli_writes_stable_manifest_and_replays(tmp_path) -> None:
    ledger_path = tmp_path / "factory.sqlite3"
    ledger = CatalogFactoryLedger(ledger_path)
    ledger.create_batch(
        batch_id="batch-cli-freeze",
        target_count=1,
        base_commit="b" * 40,
        renderer_commit="c" * 40,
    )
    add_item(ledger, "form-cli")
    ledger.assign_to_batch(
        batch_id="batch-cli-freeze",
        catalog_ids=["form-cli"],
    )
    approve_item(ledger, "form-cli")
    ledger.bind_release_evidence(
        batch_id="batch-cli-freeze",
        source_commit="d" * 40,
        selection_digest="1" * 64,
        build_report_hash="2" * 64,
        release_manifest_hash="3" * 64,
        idempotency_key="bind:batch-cli-freeze:evidence",
    )
    output_path = tmp_path / "frozen-manifest.json"
    command = [
        sys.executable,
        "-m",
        "scripts.form_catalog_factory",
        "freeze-batch",
        "--ledger",
        str(ledger_path),
        "--batch-id",
        "batch-cli-freeze",
        "--idempotency-key",
        "freeze:batch-cli-freeze:evidence",
        "--output",
        str(output_path),
    ]

    first = subprocess.run(
        command,
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert first.returncode == 0, first.stderr
    first_summary = json.loads(first.stdout)
    first_bytes = output_path.read_bytes()
    manifest = json.loads(first_bytes)
    assert first_summary["idempotent_replay"] is False
    assert manifest["status"] == BatchStatus.FROZEN.value
    assert manifest["targetCount"] == 1
    assert manifest["sourceCommit"] == "d" * 40
    assert manifest["manifest"]["selection_digest"] == "1" * 64
    assert manifest["manifest"]["build_report_hash"] == "2" * 64
    assert manifest["manifest"]["release_manifest_hash"] == "3" * 64
    assert len(manifest["frozenDigest"]) == 64
    assert len(manifest["manifest"]["items"]) == 1

    replay = subprocess.run(
        command,
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert replay.returncode == 0, replay.stderr
    assert json.loads(replay.stdout)["idempotent_replay"] is True
    assert output_path.read_bytes() == first_bytes


def test_freeze_rejects_wrong_count_unapproved_or_incomplete_items(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    ledger.create_batch(
        batch_id="batch-invalid",
        target_count=2,
        base_commit="base",
        renderer_commit="renderer",
    )
    add_item(ledger, "only-form")
    ledger.assign_to_batch(
        batch_id="batch-invalid",
        catalog_ids=["only-form"],
    )

    with pytest.raises(FreezeValidationError) as exc_info:
        ledger.freeze_batch(
            batch_id="batch-invalid",
            idempotency_key="invalid-freeze",
        )
    message = str(exc_info.value)
    assert "expected exactly 2 items" in message
    assert "expected review_approved" in message
    assert "missing spec_hash" in message


def test_official_form_cannot_enter_replacement_batch(tmp_path) -> None:
    ledger = build_ledger(tmp_path)
    ledger.create_batch(
        batch_id="first-party-only",
        target_count=1,
        base_commit="base",
        renderer_commit="renderer",
    )
    add_item(ledger, "official-form", ownership="official_public")
    with pytest.raises(ConflictError, match="Only first-party"):
        ledger.assign_to_batch(
            batch_id="first-party-only",
            catalog_ids=["official-form"],
        )
