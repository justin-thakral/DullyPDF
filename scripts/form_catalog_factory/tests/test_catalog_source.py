from __future__ import annotations

import json
from pathlib import Path

from scripts.form_catalog_factory.catalog_source import (
    build_candidates,
    parse_frontend_catalog,
    seed_ledger,
)
from scripts.form_catalog_factory.ledger import CatalogFactoryLedger, Stage


def _write_catalog(path: Path) -> None:
    entries = [
        {
            "slug": "appliance-repair-service-call-intake-form",
            "title": "Appliance Repair Service Call Intake Form",
            "sourceSection": "field_service",
            "filename": "dfs_1100__appliance_repair_service_call_intake_form.pdf",
            "sourceUrl": "",
            "sha256": "a" * 64,
            "description": "Use this form for appliance repair.",
            "useCase": "",
        },
        {
            "slug": "official-form",
            "title": "Official Form",
            "sourceSection": "official",
            "filename": "official.pdf",
            "sourceUrl": "https://example.gov/form",
            "sha256": "b" * 64,
        },
    ]
    body = "\n".join(f"  {json.dumps(entry)}," for entry in entries)
    path.write_text(
        "const RAW_FORM_CATALOG_ENTRIES = [\n"
        f"{body}\n"
        "];\n"
        "export const IGNORE = true;\n",
        encoding="utf-8",
    )


def test_build_candidates_uses_canonical_registry_not_blank_source_url(
    tmp_path: Path,
) -> None:
    catalog = tmp_path / "catalog.mjs"
    registry = tmp_path / "registry.json"
    _write_catalog(catalog)
    registry.write_text(
        json.dumps(
            {
                "field_service": [
                    {
                        "filename": "dfs_1100__appliance_repair_service_call_intake_form.pdf"
                    },
                    {"filename": "missing.pdf"},
                ]
            }
        ),
        encoding="utf-8",
    )

    candidates, missing = build_candidates(
        frontend_catalog_path=catalog,
        local_registry_path=registry,
    )

    assert len(candidates) == 1
    assert candidates[0].source_family == "longtail"
    assert candidates[0].risk_tier == "A"
    assert candidates[0].priority == 12_500
    assert missing == [("field_service", "missing.pdf")]


def test_seed_ledger_is_idempotent(tmp_path: Path) -> None:
    catalog = tmp_path / "catalog.mjs"
    registry = tmp_path / "registry.json"
    _write_catalog(catalog)
    registry.write_text(
        json.dumps(
            {
                "field_service": [
                    {
                        "filename": "dfs_1100__appliance_repair_service_call_intake_form.pdf"
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    candidates, _ = build_candidates(
        frontend_catalog_path=catalog,
        local_registry_path=registry,
    )
    ledger = CatalogFactoryLedger(tmp_path / "ledger.sqlite3")

    assert seed_ledger(ledger, candidates) == 1
    assert seed_ledger(ledger, candidates) == 1
    items = ledger.list_items(stage=Stage.QUEUED)
    assert len(items) == 1
    assert items[0].slug == "appliance-repair-service-call-intake-form"


def test_parse_frontend_catalog_rejects_missing_raw_array(tmp_path: Path) -> None:
    path = tmp_path / "catalog.mjs"
    path.write_text("export const forms = [];\n", encoding="utf-8")

    try:
        parse_frontend_catalog(path)
    except ValueError as exc:
        assert "RAW_FORM_CATALOG_ENTRIES" in str(exc)
    else:
        raise AssertionError("missing raw catalog array should fail")
