from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

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
            "qa_evidence_uri": f"gs://candidate/{catalog_id}/qa.json"
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
    )
    assert ledger.get_item(catalog_id).stage is Stage.REVIEW_APPROVED


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
