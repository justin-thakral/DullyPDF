from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.form_catalog_factory.models import FormSpec
from scripts.form_catalog_factory import spec_qa
from scripts.form_catalog_factory.spec_qa import (
    usability_profile_for_spec,
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
FIRST_RELEASE_SELECTION = (
    ROOT
    / "form_catalog_releases"
    / "planning"
    / "catalog-20260729-001-selection.json"
)
ACTIVE_RELEASE = ROOT / "form_catalog_releases" / "active.json"


def test_workflow_complete_exemplar_passes_content_qa() -> None:
    result = validate_spec_content(EXEMPLAR)

    assert result.passed, result.errors
    assert result.metrics["sections"] >= 4
    assert result.metrics["widgets"] >= 100
    assert all(result.metrics["lifecycle_coverage"].values())


def test_user_approved_first_release_exemplars_remain_within_fail_safe_ceilings() -> None:
    selection = json.loads(FIRST_RELEASE_SELECTION.read_text(encoding="utf-8"))
    active = json.loads(ACTIVE_RELEASE.read_text(encoding="utf-8"))
    pages_by_identity = {
        f"{item['sourceSection']}/{item['filename'][:-4]}": item["pageCount"]
        for item in active["replacements"]
    }

    for item in selection["items"][:10]:
        path = (
            ROOT
            / "form_catalog_specs"
            / "candidates"
            / item["sourceFamily"]
            / f"{item['catalogId']}.json"
        )
        spec = FormSpec.from_dict(json.loads(path.read_text(encoding="utf-8")))
        result = validate_spec_content(spec)
        profile = usability_profile_for_spec(spec)

        assert result.passed, (spec.catalog_id, result.errors)
        assert not result.warnings, (spec.catalog_id, result.warnings)
        assert pages_by_identity[spec.catalog_id] <= profile.max_pages


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


def test_customer_visible_internal_authoring_copy_fails() -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    payload["sections"][0]["guidance"] = (
        "Use [DFS1100E01] here so this is not a title-swapped checklist."
    )

    result = validate_spec_content(FormSpec.from_dict(payload))

    assert not result.passed
    assert "user_visible_internal_copy" in {
        error["code"] for error in result.errors
    }


def test_repeated_section_guidance_fails_content_qa() -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    repeated = (
        "Complete this same generic workflow instruction before moving to the "
        "next section."
    )
    for section in payload["sections"][:2]:
        section["guidance"] = repeated

    result = validate_spec_content(FormSpec.from_dict(payload))

    assert not result.passed
    assert "repeated_section_guidance" in {
        error["code"] for error in result.errors
    }


def test_two_generic_workflow_section_titles_fail_content_qa() -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    payload["sections"][0]["title"] = "Identity and Routing"
    payload["sections"][1]["title"] = "Working Details"

    result = validate_spec_content(FormSpec.from_dict(payload))

    assert not result.passed
    assert "legacy_generic_shell" in {
        error["code"] for error in result.errors
    }


def test_unpolished_discrete_customer_copy_fails_content_qa() -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    payload["sections"][0]["title"] = "Service Service Details"
    payload["sections"][0]["blocks"][0]["fields"][0]["label"] = (
        "customer account number"
    )

    result = validate_spec_content(FormSpec.from_dict(payload))
    codes = {error["code"] for error in result.errors}

    assert "repeated_customer_copy_word" in codes
    assert "customer_copy_not_sentence_case" in codes


def test_compact_task_rejects_a_generic_six_section_packet() -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    payload["title"] = "Restaurant Reservation Form"
    payload["risk_tier"] = "A"
    spec = FormSpec.from_dict(payload)

    result = validate_spec_content(spec)

    assert usability_profile_for_spec(spec).name == "compact"
    assert not result.passed
    assert "task_scope_too_many_sections" in {
        error["code"] for error in result.errors
    }


@pytest.mark.parametrize(
    ("title", "expected_profile"),
    [
        ("Plant Inspection Form", "standard"),
        ("Food Preservation Log", "standard"),
        ("Estate Planning Intake Form", "complex"),
        ("Restaurant Reservation Form", "compact"),
    ],
)
def test_usability_profile_matches_complete_title_phrases_only(
    title: str,
    expected_profile: str,
) -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    payload["title"] = title

    assert (
        usability_profile_for_spec(FormSpec.from_dict(payload)).name
        == expected_profile
    )


def test_two_section_focused_intake_can_pass_without_generic_lifecycle_filler() -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    payload["title"] = "Appliance Repair Intake Form"
    payload["risk_tier"] = "A"
    payload["sections"] = payload["sections"][:2]

    result = validate_spec_content(FormSpec.from_dict(payload))

    assert result.passed, result.errors
    assert result.metrics["sections"] == 2
    assert result.metrics["required_lifecycle_concepts"] == [
        "identity_and_routing"
    ]


def test_permission_form_requires_a_direct_decision_and_signer_receipt() -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    payload["title"] = "Field Trip Permission Form"
    payload["risk_tier"] = "A"
    payload["sections"] = payload["sections"][:2]
    payload["sections"][1]["blocks"].extend(
        (
            {
                "key": "guardian_permission_decision",
                "type": "fields",
                "label": "Guardian permission decision",
                "fields": [
                    {
                        "key": "permission_decision",
                        "label": "Permission decision",
                    }
                ],
            },
            {
                "key": "generic_completion_receipt",
                "type": "signatures",
                "label": "Completion receipt",
                "fields": [
                    {
                        "key": "completed_by",
                        "label": "Completed or handed off by and date",
                    }
                ],
            },
        )
    )

    result = validate_spec_content(FormSpec.from_dict(payload))

    assert not result.passed
    assert result.metrics["direct_decision_receipt"] == {
        "required": True,
        "decision_control": True,
        "signer_control": False,
    }
    assert "missing_decision_signer_receipt" in {
        error["code"] for error in result.errors
    }


def test_permission_form_requires_a_direct_decision_control() -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    payload["title"] = "Field Trip Permission Form"
    payload["risk_tier"] = "A"
    payload["sections"] = payload["sections"][:2]
    payload["sections"][1]["blocks"].append(
        {
            "key": "guardian_receipt",
            "type": "signatures",
            "label": "Guardian signature and receipt",
            "fields": [
                {
                    "key": "guardian_signature",
                    "label": "Guardian signature and date",
                }
            ],
        }
    )

    result = validate_spec_content(FormSpec.from_dict(payload))

    assert not result.passed
    assert result.metrics["direct_decision_receipt"] == {
        "required": True,
        "decision_control": False,
        "signer_control": True,
    }
    assert "missing_direct_decision_control" in {
        error["code"] for error in result.errors
    }


def test_permission_form_with_direct_decision_and_signer_receipt_passes() -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    payload["title"] = "Field Trip Permission Form"
    payload["risk_tier"] = "A"
    payload["sections"] = payload["sections"][:2]
    payload["sections"][1]["blocks"].extend(
        (
            {
                "key": "guardian_permission_decision",
                "type": "fields",
                "label": "Guardian permission decision",
                "fields": [
                    {
                        "key": "permission_decision",
                        "label": "Permission decision",
                    }
                ],
            },
            {
                "key": "guardian_receipt",
                "type": "signatures",
                "label": "Guardian permission signature and receipt",
                "fields": [
                    {
                        "key": "guardian_signature",
                        "label": "Guardian signature and date",
                    }
                ],
            },
        )
    )

    result = validate_spec_content(FormSpec.from_dict(payload))

    assert result.passed, result.errors
    assert result.metrics["direct_decision_receipt"] == {
        "required": True,
        "decision_control": True,
        "signer_control": True,
    }


def test_release_intake_is_not_misclassified_as_the_release_decision() -> None:
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    payload["title"] = "Medical Records Release Intake Form"
    payload["risk_tier"] = "A"
    payload["sections"] = payload["sections"][:2]

    result = validate_spec_content(FormSpec.from_dict(payload))

    assert result.metrics["direct_decision_receipt"]["required"] is False
    assert {
        error["code"] for error in result.errors
    }.isdisjoint(
        {
            "missing_direct_decision_control",
            "missing_decision_signer_receipt",
        }
    )


def test_batch_rejects_excessive_full_structure_reuse(
    monkeypatch,
) -> None:
    monkeypatch.setattr(spec_qa, "MAX_IDENTICAL_STRUCTURE_COUNT", 1)
    payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    first = FormSpec.from_dict(payload)
    payload["catalog_id"] = "field_service/dfs_1101__appliance_repair_job_work_order_form"
    payload["source_filename"] = "dfs_1101__appliance_repair_job_work_order_form.pdf"
    payload["slug"] = "appliance-repair-job-work-order-form"
    payload["title"] = "Appliance Repair Job Work Order Form"
    payload["description"] += " This record controls a separate work-order decision."
    second = FormSpec.from_dict(payload)

    batch = validate_spec_batch([first, second])

    assert not batch["passed"]
    assert batch["over_reused_structures"][0]["count"] == 2
    assert batch["structure_distribution"]["largest_group"] == 2
    assert "over_reused_structure" in {
        error["code"]
        for result in batch["results"]
        for error in result["errors"]
    }


def test_batch_rejects_reused_semantic_skeleton_despite_layout_jitter(
    monkeypatch,
) -> None:
    monkeypatch.setattr(spec_qa, "MAX_IDENTICAL_STRUCTURE_COUNT", 100)
    monkeypatch.setattr(spec_qa, "MAX_SEMANTIC_SKELETON_COUNT", 1)
    first_payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    first = FormSpec.from_dict(first_payload)
    second_payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    second_payload["catalog_id"] = (
        "field_service/dfs_1101__appliance_repair_job_work_order_form"
    )
    second_payload["source_filename"] = (
        "dfs_1101__appliance_repair_job_work_order_form.pdf"
    )
    second_payload["slug"] = "appliance-repair-job-work-order-form"
    second_payload["title"] = "Appliance Service Call Intake Form"
    second_payload["description"] += (
        " This separate form records a work-order handoff."
    )
    second_payload["sections"][0]["blocks"][0]["fields"].pop()
    second = FormSpec.from_dict(second_payload)

    batch = validate_spec_batch([first, second])

    assert not batch["passed"]
    assert batch["over_reused_structures"] == []
    assert batch["over_reused_semantic_skeletons"][0]["count"] == 2
    assert batch["semantic_skeleton_distribution"]["largest_group"] == 2
    assert "over_reused_semantic_skeleton" in {
        error["code"]
        for result in batch["results"]
        for error in result["errors"]
    }


def test_batch_rejects_long_customer_metadata_boilerplate(
    monkeypatch,
) -> None:
    monkeypatch.setattr(spec_qa, "MAX_REUSED_METADATA_PHRASE_COUNT", 1)
    first_payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    first = FormSpec.from_dict(first_payload)
    second_payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    second_payload["catalog_id"] = (
        "field_service/dfs_1101__appliance_repair_job_work_order_form"
    )
    second_payload["source_filename"] = (
        "dfs_1101__appliance_repair_job_work_order_form.pdf"
    )
    second_payload["slug"] = "appliance-repair-job-work-order-form"
    second_payload["title"] = "Appliance Repair Job Work Order Form"
    second = FormSpec.from_dict(second_payload)

    batch = validate_spec_batch([first, second])

    assert not batch["passed"]
    assert batch["over_reused_metadata_phrases"]
    assert batch["metadata_phrase_distribution"]["largest_group"] == 2
    assert "over_reused_customer_copy" in {
        error["code"]
        for result in batch["results"]
        for error in result["errors"]
    }


def test_batch_rejects_reused_instructional_copy(
    monkeypatch,
) -> None:
    monkeypatch.setattr(spec_qa, "MAX_REUSED_INSTRUCTION_PHRASE_COUNT", 1)
    repeated = (
        "Use this generic instruction to route every decision and preserve the "
        "same evidence trail."
    )
    first_payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    first_payload["sections"][0]["guidance"] = repeated
    first = FormSpec.from_dict(first_payload)
    second_payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    second_payload["catalog_id"] = (
        "field_service/dfs_1101__appliance_repair_job_work_order_form"
    )
    second_payload["source_filename"] = (
        "dfs_1101__appliance_repair_job_work_order_form.pdf"
    )
    second_payload["slug"] = "appliance-repair-job-work-order-form"
    second_payload["title"] = "Appliance Repair Job Work Order Form"
    second_payload["description"] += (
        " This separate form records a work-order handoff."
    )
    second_payload["sections"][0]["guidance"] = repeated
    second = FormSpec.from_dict(second_payload)

    batch = validate_spec_batch([first, second])

    assert not batch["passed"]
    assert batch["over_reused_instruction_phrases"]
    assert batch["instruction_phrase_distribution"]["largest_group"] == 2
    assert "over_reused_instruction_copy" in {
        error["code"]
        for result in batch["results"]
        for error in result["errors"]
    }


def test_batch_rejects_control_labels_reused_across_most_forms(
    monkeypatch,
) -> None:
    monkeypatch.setattr(spec_qa, "MIN_REUSED_CONTROL_LABEL_COUNT", 1)
    first_payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    first = FormSpec.from_dict(first_payload)
    second_payload = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    second_payload["catalog_id"] = (
        "field_service/dfs_1101__appliance_repair_job_work_order_form"
    )
    second_payload["source_filename"] = (
        "dfs_1101__appliance_repair_job_work_order_form.pdf"
    )
    second_payload["slug"] = "appliance-repair-job-work-order-form"
    second_payload["title"] = "Appliance Repair Job Work Order Form"
    second_payload["description"] += (
        " This separate form records a work-order handoff."
    )
    second = FormSpec.from_dict(second_payload)

    batch = validate_spec_batch([first, second])

    assert not batch["passed"]
    assert batch["over_reused_control_labels"]
    assert batch["control_label_distribution"] == {
        "minimum_words": 4,
        "max_allowed_count": 1,
        "unique_labels": batch["control_label_distribution"]["unique_labels"],
        "largest_group": 2,
    }
    assert "over_reused_control_label" in {
        error["code"]
        for result in batch["results"]
        for error in result["errors"]
    }
