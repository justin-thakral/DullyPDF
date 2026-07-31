from __future__ import annotations

import hashlib
import json
import stat
from pathlib import Path

import pytest

from scripts.form_catalog_factory import worker_control
from scripts.form_catalog_factory.ledger import CatalogFactoryLedger, Stage
from scripts.form_catalog_factory.worker_control import (
    WorkerControlError,
    claim_spec,
    complete_spec_claim,
    heartbeat_claim,
    publish_spec_revision,
    publish_spec_revisions,
    register_existing_specs,
    reopen_specs_for_revision,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
EXEMPLAR = (
    REPO_ROOT
    / "form_catalog_specs"
    / "candidates"
    / "longtail"
    / "field_service"
    / "dfs_1100__appliance_repair_service_call_intake_form.json"
)


def _open_single_item_batch(
    tmp_path: Path,
    *,
    source_family: str | None = None,
) -> CatalogFactoryLedger:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    item_payload = {
        "title": payload["title"],
        "risk_tier": payload["risk_tier"],
    }
    if source_family is not None:
        item_payload["source_family"] = source_family
    ledger = CatalogFactoryLedger(tmp_path / "factory.sqlite3")
    ledger.add_item(
        catalog_id=payload["catalog_id"],
        section=payload["source_section"],
        filename=payload["source_filename"],
        slug=payload["slug"],
        payload=item_payload,
    )
    ledger.create_batch(
        batch_id="catalog-test-001",
        target_count=1,
        base_commit="a" * 40,
        renderer_commit="b" * 40,
        idempotency_key="create:test",
    )
    ledger.assign_to_batch(
        batch_id="catalog-test-001",
        catalog_ids=[payload["catalog_id"]],
        idempotency_key="assign:test",
    )
    return ledger


def _prepare_reopened_revision(
    tmp_path: Path,
) -> tuple[CatalogFactoryLedger, str, Path, Path, str]:
    ledger = _open_single_item_batch(tmp_path, source_family="longtail")
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    catalog_id = payload["catalog_id"]
    destination = (
        tmp_path
        / "candidates"
        / "longtail"
        / Path(*catalog_id.split("/")).with_suffix(".json")
    )
    destination.parent.mkdir(parents=True)
    destination.write_bytes(EXEMPLAR.read_bytes())
    previous_hash = hashlib.sha256(destination.read_bytes()).hexdigest()
    register_existing_specs(
        ledger,
        batch_id="catalog-test-001",
        worker_id="bootstrap-review",
        spec_paths=[destination],
        claim_root=tmp_path / "initial-claims",
    )
    fence = ledger.get_open_batch_retarget_fence("catalog-test-001")
    reopen_specs_for_revision(
        ledger,
        batch_id="catalog-test-001",
        spec_paths=[destination],
        expected_base_commit=fence["base_commit"],
        expected_renderer_commit=fence["renderer_commit"],
        expected_batch_version=fence["batch_version"],
        expected_state_digest=fence["state_digest"],
        reason="Independent semantic review requires a correction.",
        actor="release-controller",
        idempotency_key=f"revision:helper:{tmp_path.name}",
    )
    payload["description"] += (
        " The reviewed revision captures the appliance service decision."
    )
    draft = tmp_path / "reviewed" / "revision.json"
    draft.parent.mkdir(parents=True)
    draft.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return ledger, catalog_id, destination, draft, previous_hash


def test_claim_heartbeat_and_complete_specification(tmp_path: Path) -> None:
    ledger = _open_single_item_batch(tmp_path)
    claim_path = tmp_path / "claims" / "worker-01.json"

    summary = claim_spec(
        ledger,
        batch_id="catalog-test-001",
        worker_id="worker-01",
        lease_seconds=3600,
        idempotency_key="claim:test:01",
        output_path=claim_path,
    )

    assert summary is not None
    assert summary["catalog_id"].startswith("field_service/")
    assert stat.S_IMODE(claim_path.stat().st_mode) == 0o600
    original_expiry = summary["expires_at"]
    heartbeat = heartbeat_claim(
        ledger,
        claim_path=claim_path,
        lease_seconds=7200,
    )
    assert heartbeat["expires_at"] > original_expiry

    result = complete_spec_claim(
        ledger,
        claim_path=claim_path,
        spec_path=EXEMPLAR,
        idempotency_key="complete:test:01",
    )
    replay = complete_spec_claim(
        ledger,
        claim_path=claim_path,
        spec_path=EXEMPLAR,
        idempotency_key="complete:test:01",
    )

    assert result["stage"] == Stage.SPEC_READY.value
    assert replay["idempotent_replay"] is True
    assert ledger.get_item(result["catalog_id"]).spec_hash == result["spec_sha256"]
    assert json.loads(claim_path.read_text(encoding="utf-8"))["status"] == "completed"


def test_complete_rejects_changed_catalog_identity(tmp_path: Path) -> None:
    ledger = _open_single_item_batch(tmp_path)
    claim_path = tmp_path / "claim.json"
    claim_spec(
        ledger,
        batch_id="catalog-test-001",
        worker_id="worker-02",
        lease_seconds=3600,
        idempotency_key="claim:test:02",
        output_path=claim_path,
    )
    changed_path = tmp_path / "changed.json"
    changed = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    changed["slug"] = "different-public-route"
    changed_path.write_text(json.dumps(changed), encoding="utf-8")

    with pytest.raises(WorkerControlError, match="changes the claimed catalog identity"):
        complete_spec_claim(
            ledger,
            claim_path=claim_path,
            spec_path=changed_path,
            idempotency_key="complete:test:02",
        )

    assert ledger.get_item(changed["catalog_id"]).stage is Stage.SPEC_CLAIMED


def test_register_existing_specs_is_idempotent_for_matching_hash(tmp_path: Path) -> None:
    ledger = _open_single_item_batch(tmp_path)

    first = register_existing_specs(
        ledger,
        batch_id="catalog-test-001",
        worker_id="bootstrap-review",
        spec_paths=[EXEMPLAR],
        claim_root=tmp_path / "claims",
    )
    second = register_existing_specs(
        ledger,
        batch_id="catalog-test-001",
        worker_id="bootstrap-review",
        spec_paths=[EXEMPLAR],
        claim_root=tmp_path / "claims",
    )

    assert first["registered"] == [
        "field_service/dfs_1100__appliance_repair_service_call_intake_form"
    ]
    assert second["registered"] == []
    assert second["unchanged"] == first["registered"]


def test_reopen_specs_for_revision_uses_current_file_hash_and_batch_fence(
    tmp_path: Path,
) -> None:
    ledger = _open_single_item_batch(tmp_path)
    registered = register_existing_specs(
        ledger,
        batch_id="catalog-test-001",
        worker_id="bootstrap-review",
        spec_paths=[EXEMPLAR],
        claim_root=tmp_path / "claims",
    )
    assert len(registered["registered"]) == 1
    fence = ledger.get_open_batch_retarget_fence("catalog-test-001")

    result = reopen_specs_for_revision(
        ledger,
        batch_id="catalog-test-001",
        spec_paths=[EXEMPLAR],
        expected_base_commit=fence["base_commit"],
        expected_renderer_commit=fence["renderer_commit"],
        expected_batch_version=fence["batch_version"],
        expected_state_digest=fence["state_digest"],
        reason="Semantic audit requires a customer-facing copy correction.",
        actor="release-controller",
        idempotency_key="revision:test:001",
    )
    replay = reopen_specs_for_revision(
        ledger,
        batch_id="catalog-test-001",
        spec_paths=[EXEMPLAR],
        expected_base_commit=fence["base_commit"],
        expected_renderer_commit=fence["renderer_commit"],
        expected_batch_version=fence["batch_version"],
        expected_state_digest=fence["state_digest"],
        reason="Semantic audit requires a customer-facing copy correction.",
        actor="release-controller",
        idempotency_key="revision:test:001",
    )

    assert result["reopened"] == 1
    assert result["stage"] == Stage.QUEUED.value
    assert replay["idempotent_replay"] is True
    item = ledger.get_item(registered["registered"][0])
    assert item is not None
    assert item.stage is Stage.QUEUED
    assert item.spec_hash is None


def test_publish_spec_revision_atomically_replaces_and_completes(
    tmp_path: Path,
) -> None:
    ledger = _open_single_item_batch(tmp_path)
    destination = tmp_path / "tracked-spec.json"
    destination.write_bytes(EXEMPLAR.read_bytes())
    previous_hash = hashlib.sha256(destination.read_bytes()).hexdigest()
    register_existing_specs(
        ledger,
        batch_id="catalog-test-001",
        worker_id="bootstrap-review",
        spec_paths=[destination],
        claim_root=tmp_path / "initial-claims",
    )
    fence = ledger.get_open_batch_retarget_fence("catalog-test-001")
    reopen_specs_for_revision(
        ledger,
        batch_id="catalog-test-001",
        spec_paths=[destination],
        expected_base_commit=fence["base_commit"],
        expected_renderer_commit=fence["renderer_commit"],
        expected_batch_version=fence["batch_version"],
        expected_state_digest=fence["state_digest"],
        reason="Independent semantic review requires a correction.",
        actor="release-controller",
        idempotency_key="revision:publish:reopen",
    )
    claim_path = tmp_path / "revision-claim.json"
    claim = claim_spec(
        ledger,
        batch_id="catalog-test-001",
        worker_id="revision-author",
        lease_seconds=3600,
        idempotency_key="revision:publish:claim",
        output_path=claim_path,
    )
    assert claim is not None

    revised_payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    revised_payload["description"] += (
        " The revised record directly captures the appliance service decision."
    )
    draft = tmp_path / "revised-draft.json"
    draft.write_text(json.dumps(revised_payload, indent=2) + "\n", encoding="utf-8")
    expected_revised_hash = hashlib.sha256(draft.read_bytes()).hexdigest()

    with pytest.raises(
        WorkerControlError,
        match="not match expected_draft_sha256",
    ):
        publish_spec_revision(
            ledger,
            claim_path=claim_path,
            draft_path=draft,
            destination_path=destination,
            expected_previous_sha256=previous_hash,
            expected_draft_sha256="0" * 64,
            idempotency_key="revision:publish:unreviewed",
        )
    assert hashlib.sha256(destination.read_bytes()).hexdigest() == previous_hash
    assert ledger.get_item(revised_payload["catalog_id"]).stage is Stage.SPEC_CLAIMED

    result = publish_spec_revision(
        ledger,
        claim_path=claim_path,
        draft_path=draft,
        destination_path=destination,
        expected_previous_sha256=previous_hash,
        expected_draft_sha256=expected_revised_hash,
        idempotency_key="revision:publish:complete",
    )
    replay = publish_spec_revision(
        ledger,
        claim_path=claim_path,
        draft_path=draft,
        destination_path=destination,
        expected_previous_sha256=previous_hash,
        expected_draft_sha256=expected_revised_hash,
        idempotency_key="revision:publish:complete",
    )

    assert result["filesystem_replaced"] is True
    assert replay["filesystem_replaced"] is False
    assert result["revised_spec_sha256"] == expected_revised_hash
    assert destination.read_bytes() == draft.read_bytes()
    item = ledger.get_item(result["catalog_id"])
    assert item is not None
    assert item.stage is Stage.SPEC_READY
    assert item.spec_hash == expected_revised_hash


def test_publish_spec_revision_rejects_hash_not_bound_to_reopen_event(
    tmp_path: Path,
) -> None:
    ledger = _open_single_item_batch(tmp_path)
    destination = tmp_path / "tracked-spec.json"
    destination.write_bytes(EXEMPLAR.read_bytes())
    register_existing_specs(
        ledger,
        batch_id="catalog-test-001",
        worker_id="bootstrap-review",
        spec_paths=[destination],
        claim_root=tmp_path / "initial-claims",
    )
    fence = ledger.get_open_batch_retarget_fence("catalog-test-001")
    reopen_specs_for_revision(
        ledger,
        batch_id="catalog-test-001",
        spec_paths=[destination],
        expected_base_commit=fence["base_commit"],
        expected_renderer_commit=fence["renderer_commit"],
        expected_batch_version=fence["batch_version"],
        expected_state_digest=fence["state_digest"],
        reason="Independent semantic review requires a correction.",
        actor="release-controller",
        idempotency_key="revision:wrong-hash:reopen",
    )
    claim_path = tmp_path / "revision-claim.json"
    claim_spec(
        ledger,
        batch_id="catalog-test-001",
        worker_id="revision-author",
        lease_seconds=3600,
        idempotency_key="revision:wrong-hash:claim",
        output_path=claim_path,
    )
    draft = tmp_path / "revised-draft.json"
    revised_payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    revised_payload["description"] += " Revised."
    draft.write_text(json.dumps(revised_payload), encoding="utf-8")
    draft_hash = hashlib.sha256(draft.read_bytes()).hexdigest()
    original_bytes = destination.read_bytes()

    with pytest.raises(WorkerControlError, match="audited revision event"):
        publish_spec_revision(
            ledger,
            claim_path=claim_path,
            draft_path=draft,
            destination_path=destination,
            expected_previous_sha256="9" * 64,
            expected_draft_sha256=draft_hash,
            idempotency_key="revision:wrong-hash:complete",
        )

    assert destination.read_bytes() == original_bytes
    assert ledger.get_item(revised_payload["catalog_id"]).stage is Stage.SPEC_CLAIMED


def test_publish_spec_revisions_preflights_and_replays_reviewed_set(
    tmp_path: Path,
) -> None:
    ledger = _open_single_item_batch(tmp_path, source_family="longtail")
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    catalog_id = payload["catalog_id"]
    destination = (
        tmp_path
        / "candidates"
        / "longtail"
        / Path(*catalog_id.split("/")).with_suffix(".json")
    )
    destination.parent.mkdir(parents=True)
    destination.write_bytes(EXEMPLAR.read_bytes())
    register_existing_specs(
        ledger,
        batch_id="catalog-test-001",
        worker_id="bootstrap-review",
        spec_paths=[destination],
        claim_root=tmp_path / "initial-claims",
    )
    fence = ledger.get_open_batch_retarget_fence("catalog-test-001")
    reopen_specs_for_revision(
        ledger,
        batch_id="catalog-test-001",
        spec_paths=[destination],
        expected_base_commit=fence["base_commit"],
        expected_renderer_commit=fence["renderer_commit"],
        expected_batch_version=fence["batch_version"],
        expected_state_digest=fence["state_digest"],
        reason="Independent semantic review requires a correction.",
        actor="release-controller",
        idempotency_key="revision:bulk:reopen",
    )

    payload["description"] += (
        " The reviewed revision captures the appliance service decision."
    )
    draft = tmp_path / "reviewed" / "revision.json"
    draft.parent.mkdir(parents=True)
    draft.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    first = publish_spec_revisions(
        ledger,
        batch_id="catalog-test-001",
        worker_id="revision-publisher",
        draft_paths=[draft],
        destination_root=tmp_path / "candidates",
        claim_root=tmp_path / "revision-claims",
    )
    second = publish_spec_revisions(
        ledger,
        batch_id="catalog-test-001",
        worker_id="revision-publisher",
        draft_paths=[draft],
        destination_root=tmp_path / "candidates",
        claim_root=tmp_path / "revision-claims",
    )

    assert first["published"] == [catalog_id]
    assert first["unchanged"] == []
    assert second["published"] == []
    assert second["unchanged"] == [catalog_id]
    assert destination.read_bytes() == draft.read_bytes()


def test_register_existing_specs_rejects_bytes_changed_after_peer_qa(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ledger = _open_single_item_batch(tmp_path)
    candidate = tmp_path / "candidate.json"
    candidate.write_bytes(EXEMPLAR.read_bytes())
    original_validate = worker_control.validate_spec_batch

    def mutate_after_qa(specs):
        result = original_validate(specs)
        payload = json.loads(candidate.read_text(encoding="utf-8"))
        payload["description"] += " Changed after peer review."
        candidate.write_text(json.dumps(payload), encoding="utf-8")
        return result

    monkeypatch.setattr(worker_control, "validate_spec_batch", mutate_after_qa)

    with pytest.raises(WorkerControlError, match="changed during peer content QA"):
        register_existing_specs(
            ledger,
            batch_id="catalog-test-001",
            worker_id="bootstrap-review",
            spec_paths=[candidate],
            claim_root=tmp_path / "claims",
        )

    assert ledger.get_item(json.loads(candidate.read_text())["catalog_id"]).stage is Stage.QUEUED


def test_publish_spec_revisions_rejects_bytes_changed_after_peer_qa(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ledger, catalog_id, destination, draft, previous_hash = (
        _prepare_reopened_revision(tmp_path)
    )
    original_validate = worker_control.validate_spec_batch

    def mutate_after_qa(specs):
        result = original_validate(specs)
        payload = json.loads(draft.read_text(encoding="utf-8"))
        payload["description"] += " Changed after peer review."
        draft.write_text(json.dumps(payload), encoding="utf-8")
        return result

    monkeypatch.setattr(worker_control, "validate_spec_batch", mutate_after_qa)

    with pytest.raises(WorkerControlError, match="changed during peer content QA"):
        publish_spec_revisions(
            ledger,
            batch_id="catalog-test-001",
            worker_id="revision-publisher",
            draft_paths=[draft],
            destination_root=tmp_path / "candidates",
            claim_root=tmp_path / "revision-claims",
        )

    assert hashlib.sha256(destination.read_bytes()).hexdigest() == previous_hash
    assert ledger.get_item(catalog_id).stage is Stage.QUEUED


def test_publish_spec_revisions_resumes_active_claim_after_file_replacement(
    tmp_path: Path,
) -> None:
    ledger, catalog_id, destination, draft, _ = _prepare_reopened_revision(tmp_path)
    identity_digest = hashlib.sha256(catalog_id.encode("utf-8")).hexdigest()[:16]
    claim_path = tmp_path / "revision-claims" / f"{identity_digest}.json"
    claim_spec(
        ledger,
        batch_id="catalog-test-001",
        worker_id="revision-publisher",
        lease_seconds=3600,
        idempotency_key="revision:crash:claim",
        output_path=claim_path,
        catalog_id=catalog_id,
    )
    destination.write_bytes(draft.read_bytes())

    result = publish_spec_revisions(
        ledger,
        batch_id="catalog-test-001",
        worker_id="revision-publisher",
        draft_paths=[draft],
        destination_root=tmp_path / "candidates",
        claim_root=tmp_path / "revision-claims",
    )

    assert result["published"] == [catalog_id]
    assert destination.read_bytes() == draft.read_bytes()
    assert ledger.get_item(catalog_id).stage is Stage.SPEC_READY


def test_publish_spec_revisions_reclaims_expired_lease_with_new_fence(
    tmp_path: Path,
) -> None:
    ledger, catalog_id, destination, draft, _ = _prepare_reopened_revision(tmp_path)
    identity_digest = hashlib.sha256(catalog_id.encode("utf-8")).hexdigest()[:16]
    claim_path = tmp_path / "revision-claims" / f"{identity_digest}.json"
    claim_spec(
        ledger,
        batch_id="catalog-test-001",
        worker_id="revision-publisher",
        lease_seconds=1,
        idempotency_key="revision:expired:claim",
        output_path=claim_path,
        catalog_id=catalog_id,
    )
    claimed = ledger.get_item(catalog_id)
    assert claimed is not None
    expired_ledger = CatalogFactoryLedger(
        ledger.database_path,
        clock=lambda: claimed.lease_expires_at + 1,
    )

    result = publish_spec_revisions(
        expired_ledger,
        batch_id="catalog-test-001",
        worker_id="revision-publisher",
        draft_paths=[draft],
        destination_root=tmp_path / "candidates",
        claim_root=tmp_path / "revision-claims",
    )

    completed = expired_ledger.get_item(catalog_id)
    assert result["published"] == [catalog_id]
    assert completed is not None
    assert completed.stage is Stage.SPEC_READY
    assert completed.fence_epoch == claimed.fence_epoch + 1
