from __future__ import annotations

import json
import stat
from pathlib import Path

import pytest

from scripts.form_catalog_factory.ledger import CatalogFactoryLedger, Stage
from scripts.form_catalog_factory.worker_control import (
    WorkerControlError,
    claim_spec,
    complete_spec_claim,
    heartbeat_claim,
    register_existing_specs,
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


def _open_single_item_batch(tmp_path: Path) -> CatalogFactoryLedger:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    ledger = CatalogFactoryLedger(tmp_path / "factory.sqlite3")
    ledger.add_item(
        catalog_id=payload["catalog_id"],
        section=payload["source_section"],
        filename=payload["source_filename"],
        slug=payload["slug"],
        payload={
            "title": payload["title"],
            "risk_tier": payload["risk_tier"],
        },
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
