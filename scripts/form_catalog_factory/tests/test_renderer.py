from __future__ import annotations

import json
from pathlib import Path

from pypdf import PdfReader
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

from scripts.form_catalog_factory.models import FormSpec, SpecValidationError
from scripts.form_catalog_factory.renderer import FormRenderer, render_form


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
