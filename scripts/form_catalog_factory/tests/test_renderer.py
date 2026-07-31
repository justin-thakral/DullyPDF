from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from pypdf import PdfReader
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

from scripts.form_catalog_factory.models import FormSpec, SpecValidationError
from scripts.form_catalog_factory.pdf_qa import validate_pdf
from scripts.form_catalog_factory.renderer import FormRenderer, render_form
from scripts.form_catalog_factory.themes import (
    CHARCOAL_DEEP_GREEN_GOLD,
    DEFAULT_THEME_ID,
    LEGACY_NAVY_ORANGE,
    ThemeError,
    get_theme,
)


REPO_ROOT = Path(__file__).resolve().parents[3]


def sample_payload() -> dict:
    return {
        "schema_version": 1,
        "catalog_id": "field_service/dfs_1100__appliance_repair_service_call_intake_form",
        "source_section": "field_service",
        "source_filename": "dfs_1100__appliance_repair_service_call_intake_form.pdf",
        "slug": "appliance-repair-service-call-intake-form",
        "title": "Appliance Repair Service Call Intake and Resolution Record",
        "subtitle": "Capture the original request, equipment symptoms, diagnostic findings, authorization, completed work, and follow-up.",
        "description": "A structured appliance service record that follows the job from customer intake through diagnosis, authorization, completion, and final follow-up.",
        "use_case": "Use when a service coordinator and technician need one fillable record for dispatch, findings, parts decisions, customer approval, and closeout.",
        "risk_tier": "A",
        "sections": [
            {
                "key": "request",
                "title": "Request and equipment identity",
                "guidance": "Record enough information to route the service call and identify the affected appliance.",
                "blocks": [
                    {
                        "key": "contact",
                        "type": "fields",
                        "label": "Customer and request",
                        "fields": [
                            {"key": "customer_name", "label": "Customer name", "units": 1.2},
                            {"key": "request_date", "label": "Request date", "units": 0.7},
                            {
                                "key": "priority",
                                "label": "Priority",
                                "units": 0.7,
                                "field_type": "choice",
                                "options": ["Routine", "Urgent", "Emergency"],
                            },
                        ],
                    },
                    {
                        "key": "symptoms",
                        "type": "textarea",
                        "label": "Reported symptoms and access notes",
                        "fields": [{"key": "reported_symptoms", "label": "Reported symptoms"}],
                        "height": 54,
                    },
                ],
            },
            {
                "key": "diagnosis",
                "title": "Technician diagnosis and authorization",
                "guidance": "Document observed conditions and obtain approval before work outside the original scope.",
                "blocks": [
                    {
                        "key": "checks",
                        "type": "checklist",
                        "label": "Diagnostic checks completed",
                        "items": [
                            "Power and controls checked",
                            "Connections and supply checked",
                            "Error codes recorded",
                            "Safety condition assessed",
                        ],
                    },
                    {
                        "key": "parts",
                        "type": "table",
                        "label": "Parts, labor, and authorization",
                        "columns": [
                            {"key": "item", "label": "Part or task", "units": 1.4},
                            {"key": "quantity", "label": "Qty", "units": 0.4},
                            {"key": "amount", "label": "Amount", "units": 0.7},
                            {"key": "approval", "label": "Approval", "units": 0.8},
                        ],
                        "rows": 4,
                    },
                ],
            },
            {
                "key": "closeout",
                "title": "Completion, customer handoff, and follow-up",
                "guidance": "Confirm operation, explain remaining limitations, and record the next required action.",
                "blocks": [
                    {
                        "key": "completion",
                        "type": "textarea",
                        "label": "Work completed, test result, and unresolved concerns",
                        "fields": [{"key": "completion_notes", "label": "Completion notes"}],
                        "height": 64,
                    },
                    {
                        "key": "signoff",
                        "type": "signatures",
                        "label": "Closeout approval",
                        "fields": [
                            {"key": "technician", "label": "Technician"},
                            {"key": "customer", "label": "Customer or site contact"},
                            {"key": "date", "label": "Date", "units": 0.55},
                        ],
                    },
                ],
            },
        ],
    }


def test_render_form_produces_unique_fillable_fields(tmp_path: Path) -> None:
    spec = FormSpec.from_dict(sample_payload())
    output = render_form(spec, tmp_path / "rendered.pdf")
    reader = PdfReader(output)
    fields = reader.get_fields()

    assert len(reader.pages) >= 1
    assert fields
    assert len(fields) == len(set(fields))
    assert all(field.get("/TU") for field in fields.values())


def test_choice_fields_render_with_a_neutral_initial_value(tmp_path: Path) -> None:
    spec = FormSpec.from_dict(sample_payload())
    output = render_form(spec, tmp_path / "neutral-choice.pdf")
    fields = PdfReader(output).get_fields() or {}
    priority = next(
        field for field in fields.values() if field.get("/TU") == "Priority"
    )

    assert priority["/V"] == "Select"
    assert priority["/Opt"] == ["Select", "Routine", "Urgent", "Emergency"]


def test_choice_prompt_matching_does_not_treat_selected_as_neutral(
    tmp_path: Path,
) -> None:
    payload = sample_payload()
    priority = payload["sections"][0]["blocks"][0]["fields"][2]
    priority["options"] = ["Selected by requester", "Declined"]
    spec = FormSpec.from_dict(payload)

    output = render_form(spec, tmp_path / "selected-is-substantive.pdf")
    fields = PdfReader(output).get_fields() or {}
    rendered_priority = next(
        field for field in fields.values() if field.get("/TU") == "Priority"
    )

    assert rendered_priority["/V"] == "Select"
    assert rendered_priority["/Opt"] == [
        "Select",
        "Selected by requester",
        "Declined",
    ]


@pytest.mark.parametrize(
    ("options", "expected"),
    [
        (
            ["Select approved", "Declined"],
            ["Select", "Select approved", "Declined"],
        ),
        (
            ["Approve", "Decline", "Select"],
            ["Select", "Approve", "Decline"],
        ),
        (
            ["Select priority", "Routine", "Urgent"],
            ["Select", "Routine", "Urgent"],
        ),
    ],
)
def test_choice_prompt_normalization_preserves_outcomes_and_unique_values(
    tmp_path: Path,
    options: list[str],
    expected: list[str],
) -> None:
    payload = sample_payload()
    payload["sections"][0]["blocks"][0]["fields"][2]["options"] = options
    spec = FormSpec.from_dict(payload)

    output = render_form(spec, tmp_path / "normalized-choice-prompt.pdf")
    fields = PdfReader(output).get_fields() or {}
    rendered_priority = next(
        field for field in fields.values() if field.get("/TU") == "Priority"
    )

    assert rendered_priority["/V"] == "Select"
    assert rendered_priority["/Opt"] == expected


def test_new_theme_rejects_ellipsized_customer_visible_labels(
    tmp_path: Path,
) -> None:
    payload = sample_payload()
    payload["sections"][0]["blocks"][0]["fields"][2]["label"] = (
        "This intentionally overlong priority label cannot fit in its narrow field"
    )
    spec = FormSpec.from_dict(payload)

    with pytest.raises(ValueError, match="customer-visible line does not fit"):
        render_form(
            spec,
            tmp_path / "truncated-label.pdf",
            theme_id="charcoal-deep-green-gold-v1",
        )

    legacy = render_form(
        spec,
        tmp_path / "legacy-allows-historical-ellipsis.pdf",
        theme_id=DEFAULT_THEME_ID,
    )
    assert legacy.exists()


def test_versioned_theme_registry_has_reviewable_stable_provenance() -> None:
    legacy = get_theme(DEFAULT_THEME_ID)
    themed = get_theme("charcoal-deep-green-gold-v1")

    assert legacy is LEGACY_NAVY_ORANGE
    assert themed is CHARCOAL_DEEP_GREEN_GOLD
    assert themed.provenance() == {
        "schemaVersion": 1,
        "id": "charcoal-deep-green-gold-v1",
        "paletteSha256": hashlib.sha256(
            json.dumps(
                themed.palette(),
                ensure_ascii=True,
                separators=(",", ":"),
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest(),
        "palette": themed.palette(),
    }
    assert themed.accent == "#C49A3A"
    assert themed.header_background == "#173C32"
    assert themed.title_text == "#202824"

    with pytest.raises(ThemeError, match="unknown form theme"):
        get_theme("unreviewed-theme")


def test_theme_changes_only_visual_pdf_surface_and_remains_deterministic(
    tmp_path: Path,
) -> None:
    spec = FormSpec.from_dict(sample_payload())
    default_pdf = render_form(spec, tmp_path / "default.pdf")
    explicit_legacy_pdf = render_form(
        spec,
        tmp_path / "legacy.pdf",
        theme_id=DEFAULT_THEME_ID,
    )
    themed_first = render_form(
        spec,
        tmp_path / "themed-first.pdf",
        theme_id="charcoal-deep-green-gold-v1",
    )
    themed_second = render_form(
        spec,
        tmp_path / "themed-second.pdf",
        theme_id="charcoal-deep-green-gold-v1",
    )

    assert default_pdf.read_bytes() == explicit_legacy_pdf.read_bytes()
    assert themed_first.read_bytes() == themed_second.read_bytes()
    assert themed_first.read_bytes() != default_pdf.read_bytes()

    default_reader = PdfReader(default_pdf)
    themed_reader = PdfReader(themed_first)
    default_text = "\n".join(page.extract_text() or "" for page in default_reader.pages)
    themed_text = "\n".join(page.extract_text() or "" for page in themed_reader.pages)
    assert spec.catalog_id[-22:] in default_text
    assert "DullyPDF Fillable Form" in themed_text
    assert spec.catalog_id[-22:] not in themed_text
    assert "Confirm applicable legal, safety, privacy" in default_text
    assert "Adapt this form to your organization's policies" in themed_text
    assert "Confirm applicable legal, safety, privacy" not in themed_text
    assert len(default_reader.pages) == len(themed_reader.pages)
    assert [
        tuple(float(value) for value in page.mediabox)
        for page in default_reader.pages
    ] == [
        tuple(float(value) for value in page.mediabox)
        for page in themed_reader.pages
    ]
    default_fields = default_reader.get_fields()
    themed_fields = themed_reader.get_fields()
    assert set(default_fields) == set(themed_fields)
    for field_name in default_fields:
        default_field = default_fields[field_name]
        themed_field = themed_fields[field_name]
        assert default_field.get("/FT") == themed_field.get("/FT")
        assert default_field.get("/TU") == themed_field.get("/TU")

    def widget_geometry(reader: PdfReader) -> list[tuple[int, str, tuple[float, ...]]]:
        geometry: list[tuple[int, str, tuple[float, ...]]] = []
        for page_index, page in enumerate(reader.pages):
            for annotation_ref in page.get("/Annots") or []:
                annotation = annotation_ref.get_object()
                if annotation.get("/Subtype") != "/Widget":
                    continue
                parent = annotation.get("/Parent")
                parent_object = parent.get_object() if parent is not None else {}
                field_name = str(annotation.get("/T") or parent_object.get("/T") or "")
                rectangle = tuple(float(value) for value in annotation["/Rect"])
                geometry.append((page_index, field_name, rectangle))
        return geometry

    assert widget_geometry(default_reader) == widget_geometry(themed_reader)


def test_rejects_duplicate_section_keys() -> None:
    payload = sample_payload()
    payload["sections"][1]["key"] = payload["sections"][0]["key"]

    try:
        FormSpec.from_dict(payload)
    except SpecValidationError as exc:
        assert "duplicate keys" in str(exc)
    else:
        raise AssertionError("duplicate section keys should fail validation")


def test_cli_compatible_json_roundtrip(tmp_path: Path) -> None:
    payload = sample_payload()
    path = tmp_path / "spec.json"
    path.write_text(json.dumps(payload), encoding="utf-8")

    loaded = FormSpec.from_dict(json.loads(path.read_text(encoding="utf-8")))
    assert loaded.catalog_id == payload["catalog_id"]


def test_section_heading_moves_with_first_block(tmp_path: Path) -> None:
    spec = FormSpec.from_dict(sample_payload())
    document = canvas.Canvas(str(tmp_path / "keep-with-next.pdf"), invariant=1)
    renderer = FormRenderer(document, spec)
    renderer.y = renderer.bottom_y + 0.2 * inch + 80

    renderer.render_section_heading(
        "Late section",
        "This heading must move with the first substantive block.",
        first_block_height=60,
    )

    assert renderer.page_number == 2
    document.save()


def test_compact_section_moves_to_avoid_a_sparse_continuation(tmp_path: Path) -> None:
    spec = FormSpec.from_dict(sample_payload())
    document = canvas.Canvas(str(tmp_path / "balanced-section.pdf"), invariant=1)
    renderer = FormRenderer(document, spec)
    renderer.y = renderer.bottom_y + 0.2 * inch + 100

    renderer._start_balanced_section(spec.sections[0].blocks)

    assert renderer.page_number == 2
    document.save()


def test_long_checklist_item_wraps_without_dropping_words(tmp_path: Path) -> None:
    payload = sample_payload()
    payload["sections"][1]["blocks"][0]["items"][0] = (
        "Confirm the appliance electrical isolation method and document the "
        "verification result before any guarded panel is opened"
    )
    spec = FormSpec.from_dict(payload)
    output = render_form(spec, tmp_path / "wrapped-checklist.pdf")
    extracted = " ".join(
        " ".join((page.extract_text() or "").split())
        for page in PdfReader(output).pages
    )

    assert (
        "Confirm the appliance electrical isolation method and document the "
        "verification result before any guarded panel is opened"
    ) in extracted


@pytest.mark.parametrize(
    ("relative_spec_path", "expected_widgets_per_page"),
    (
        (
            "longtail/construction_trades/"
            "dct_1026__hvac_installation_safety_walk_checklist_form.json",
            [71, 68, 96, 20, 36],
        ),
        *(
            (
                f"longtail/hr_operations/{filename}",
                [73, 59, 114, 40, 42],
            )
            for filename in (
                "dhr_1803__candidate_interview_incident_report_form.json",
                "dhr_1810__employee_equipment_incident_report_form.json",
                "dhr_1817__time_off_incident_report_form.json",
                "dhr_1824__shift_swap_incident_report_form.json",
                "dhr_1838__training_attendance_incident_report_form.json",
                "dhr_1859__remote_work_incident_report_form.json",
            )
        ),
    ),
)
def test_selected_sparse_page_regressions_remain_balanced(
    tmp_path: Path,
    relative_spec_path: str,
    expected_widgets_per_page: list[int],
) -> None:
    spec_path = (
        REPO_ROOT / "form_catalog_specs" / "candidates" / relative_spec_path
    )
    payload = json.loads(spec_path.read_text(encoding="utf-8"))
    spec = FormSpec.from_dict(payload)
    output = render_form(spec, tmp_path / f"{spec.catalog_id.replace('/', '_')}.pdf")

    result = validate_pdf(output, render=False, synthetic_fill=True)
    assert result["ok"] is True
    assert result["metrics"]["widgets_per_page"] == expected_widgets_per_page
    assert all(
        widget_count > 16 or lowest_ratio <= 0.55
        for widget_count, lowest_ratio in zip(
            result["metrics"]["widgets_per_page"][:-1],
            result["metrics"]["lowest_widget_bottom_ratio_per_page"][:-1],
            strict=True,
        )
    )
