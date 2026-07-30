from __future__ import annotations

import json
from pathlib import Path

from scripts.form_catalog_factory.models import FormSpec
from scripts.form_catalog_factory.spec_qa import (
    validate_spec_batch,
    validate_spec_content,
)


ROOT = Path(__file__).resolve().parents[3]
EXEMPLAR = (
    ROOT
    / "form_catalog_specs"
    / "candidates"
    / "longtail"
    / "field_service"
    / "dfs_1100__appliance_repair_service_call_intake_form.json"
)


def test_workflow_complete_exemplar_passes_content_qa() -> None:
    result = validate_spec_content(EXEMPLAR)

    assert result.passed, result.errors
    assert result.metrics["sections"] >= 4
    assert result.metrics["widgets"] >= 100
    assert all(result.metrics["lifecycle_coverage"].values())


def test_shallow_generic_shell_fails_content_qa() -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    payload["sections"] = [
        {
            "key": f"generic_{index}",
            "title": title,
            "blocks": [
                {
                    "key": "notes",
                    "type": "textarea",
                    "label": "Notes",
                    "fields": [{"key": "notes", "label": "Notes"}],
                }
            ],
        }
        for index, title in enumerate(
            (
                "Contact and Form Context",
                "Details",
                "Checklist and Review Items",
            ),
            start=1,
        )
    ]
    spec = FormSpec.from_dict(payload)

    result = validate_spec_content(spec)

    assert not result.passed
    codes = {error["code"] for error in result.errors}
    assert "insufficient_workflow_sections" in codes
    assert "insufficient_fillable_depth" in codes
    assert "legacy_generic_shell" in codes


def test_batch_rejects_exact_duplicate_content() -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    first = FormSpec.from_dict(payload)
    payload["catalog_id"] = "field_service/dfs_1101__appliance_repair_job_work_order_form"
    payload["source_filename"] = "dfs_1101__appliance_repair_job_work_order_form.pdf"
    payload["slug"] = "appliance-repair-job-work-order-form"
    second = FormSpec.from_dict(payload)

    batch = validate_spec_batch([first, second])

    assert not batch["passed"]
    assert {
        error["code"]
        for result in batch["results"]
        for error in result["errors"]
    } >= {"exact_duplicate_content", "near_duplicate_content"}
