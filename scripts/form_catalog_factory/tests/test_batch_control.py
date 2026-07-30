from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.form_catalog_factory.batch_control import (
    BatchControlError,
    open_batch_from_plan,
)
from scripts.form_catalog_factory.ledger import CatalogFactoryLedger


def _add(ledger: CatalogFactoryLedger, catalog_id: str, sha: str) -> None:
    section, stem = catalog_id.split("/", 1)
    ledger.add_item(
        catalog_id=catalog_id,
        section=section,
        filename=f"{stem}.pdf",
        slug=stem.replace("_", "-"),
        current_asset_hash=sha,
    )


def _write_plan(path: Path, sha: str) -> Path:
    payload = {
        "schemaVersion": 1,
        "releaseId": "catalog-test-001",
        "targetCount": 1,
        "items": [
            {
                "catalogId": "section/form_one",
                "sourceSection": "section",
                "filename": "form_one.pdf",
                "slug": "form-one",
                "currentSha256": sha,
            }
        ],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_open_batch_assigns_exact_tracked_selection(tmp_path: Path) -> None:
    ledger = CatalogFactoryLedger(tmp_path / "factory.sqlite3")
    _add(ledger, "section/form_one", "a" * 64)

    result = open_batch_from_plan(
        ledger,
        selection_path=_write_plan(tmp_path / "plan.json", "a" * 64),
        base_commit="b" * 40,
        renderer_commit="c" * 40,
    )

    assert result["assigned"] == 1
    assert ledger.get_item("section/form_one").batch_id == "catalog-test-001"


def test_open_batch_fails_when_current_asset_hash_drifted(tmp_path: Path) -> None:
    ledger = CatalogFactoryLedger(tmp_path / "factory.sqlite3")
    _add(ledger, "section/form_one", "a" * 64)

    with pytest.raises(BatchControlError, match="currentSha256 changed"):
        open_batch_from_plan(
            ledger,
            selection_path=_write_plan(tmp_path / "plan.json", "d" * 64),
            base_commit="b" * 40,
            renderer_commit="c" * 40,
        )
