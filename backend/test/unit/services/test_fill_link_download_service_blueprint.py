import io
import json
import zipfile
from pathlib import Path
from typing import Any, Dict, List

import pytest
import fitz
from pypdf import PdfReader, PdfWriter

from backend.firebaseDB.template_database import TemplateRecord
from backend.services import fill_link_download_service
from backend.services.fill_link_download_service import (
    GROUP_FILL_LINK_PUBLISH_SNAPSHOT_FORMAT_VERSION,
    apply_fill_link_answers_to_fields,
    build_fill_link_download_payload,
    build_group_fill_link_publish_snapshot,
    build_template_fill_link_download_snapshot,
    group_fill_link_publish_snapshot_template_count,
    materialize_group_fill_link_response_packet,
    materialize_fill_link_response_download,
)
from backend.services.app_only_field_materialization_service import BARCODE_FIELD_NAME_MARKER


def _template_record() -> TemplateRecord:
    return TemplateRecord(
        id="tpl-1",
        pdf_bucket_path="gs://forms/template.pdf",
        template_bucket_path="gs://templates/template.json",
        metadata={
            "name": "Admissions Form",
            "fillRules": {
                "checkboxRules": [
                    {
                        "databaseField": "consent",
                        "groupKey": "consent_group",
                        "operation": "yes_no",
                        "trueOption": "yes",
                        "falseOption": "no",
                    }
                ],
                "textTransformRules": [
                    {
                        "targetField": "full_name",
                        "operation": "concat",
                        "sources": ["first_name", "last_name"],
                        "separator": " ",
                    }
                ],
            },
        },
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
        name="Admissions Form",
    )


def _blank_pdf_bytes() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _pdf_font_debug(pdf_path: Path) -> tuple[set[str], str, str, str]:
    reader = PdfReader(str(pdf_path))
    base_fonts: set[str] = set()
    appearance_streams: List[str] = []
    page_streams: List[str] = []
    default_appearances: List[str] = []

    acroform = reader.trailer["/Root"].get("/AcroForm")
    if acroform:
        acroform = acroform.get_object()
        font_resources = acroform["/DR"].get_object()["/Font"].get_object()
        for font_ref in font_resources.values():
            base_fonts.add(str(font_ref.get_object().get("/BaseFont")))
        for field_ref in acroform.get("/Fields", []):
            field = field_ref.get_object()
            if field.get("/DA") is not None:
                default_appearances.append(str(field.get("/DA")))
            appearance = field.get("/AP")
            if appearance and "/N" in appearance:
                appearance_streams.append(appearance["/N"].get_object().get_data().decode("utf-8", "ignore"))

    for page in reader.pages:
        resources = page.get("/Resources")
        if resources:
            font_resources = resources.get_object().get("/Font")
            if font_resources:
                for font_ref in font_resources.get_object().values():
                    base_fonts.add(str(font_ref.get_object().get("/BaseFont")))
        contents = page.get_contents()
        if contents:
            page_streams.append(contents.get_data().decode("utf-8", "ignore"))

    return (
        base_fonts,
        "\n".join(appearance_streams),
        "\n".join(page_streams),
        "\n".join(default_appearances),
    )


def test_build_template_fill_link_download_snapshot_defaults_page_count_to_zero_without_manifest() -> None:
    """Phase 5 follow-up: when no manifest and no caller override, pageCount is 0."""

    template = TemplateRecord(
        id="tpl-nodata",
        pdf_bucket_path="gs://forms/nodata.pdf",
        template_bucket_path="gs://templates/nodata.json",
        metadata={"name": "No manifest"},
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
        name="No manifest",
    )
    snapshot = build_template_fill_link_download_snapshot(
        template=template,
        fields=[{"name": "f1", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 3, "height": 4}}],
    )
    assert snapshot["pageCount"] == 0


def test_build_template_fill_link_download_snapshot_reads_page_count_from_manifest() -> None:
    """Phase 5 follow-up: pageCount flows from template.metadata['editorSnapshot']['pageCount']."""

    template = TemplateRecord(
        id="tpl-manifest",
        pdf_bucket_path="gs://forms/manifest.pdf",
        template_bucket_path="gs://templates/manifest.json",
        metadata={
            "name": "Has manifest",
            "editorSnapshot": {"path": "gs://snapshots/x.json", "pageCount": 7, "version": 2},
        },
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
        name="Has manifest",
    )
    snapshot = build_template_fill_link_download_snapshot(
        template=template,
        fields=[{"name": "f1", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 3, "height": 4}}],
    )
    assert snapshot["pageCount"] == 7


def test_build_template_fill_link_download_snapshot_caller_override_beats_manifest() -> None:
    """Phase 5 follow-up: caller-supplied page_count wins over the manifest.

    The caller (Phase 4 publish flow) just loaded the full editor snapshot so
    its count is authoritative, whereas the manifest on the template record
    can lag behind when the user has been saving / re-detecting.
    """

    template = TemplateRecord(
        id="tpl-stale-manifest",
        pdf_bucket_path="gs://forms/stale.pdf",
        template_bucket_path="gs://templates/stale.json",
        metadata={
            "name": "Stale manifest",
            "editorSnapshot": {"path": "gs://snapshots/x.json", "pageCount": 3},
        },
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
        name="Stale manifest",
    )
    snapshot = build_template_fill_link_download_snapshot(
        template=template,
        fields=[{"name": "f1", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 3, "height": 4}}],
        page_count=12,
    )
    assert snapshot["pageCount"] == 12


def test_build_template_fill_link_download_snapshot_malformed_manifest_falls_back_to_zero() -> None:
    template = TemplateRecord(
        id="tpl-bad-manifest",
        pdf_bucket_path="gs://forms/bad.pdf",
        template_bucket_path="gs://templates/bad.json",
        metadata={
            "name": "Bad manifest",
            "editorSnapshot": {"path": "gs://snapshots/x.json", "pageCount": "not-a-number"},
        },
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
        name="Bad manifest",
    )
    snapshot = build_template_fill_link_download_snapshot(
        template=template,
        fields=[{"name": "f1", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 3, "height": 4}}],
    )
    assert snapshot["pageCount"] == 0


def test_build_group_fill_link_publish_snapshot_total_page_count_is_nonzero() -> None:
    """Regression for the Phase 7 walkthrough finding: a group bundle's
    templateSnapshots now carry real pageCount values, so
    group_template_api_total_page_count returns the sum — not 0 — and the
    Phase 5 per-request page-limit check on group endpoints actually fires.
    """

    from backend.services.template_api_service import group_template_api_total_page_count

    records = [
        TemplateRecord(
            id="tpl-1",
            pdf_bucket_path="gs://forms/tpl-1.pdf",
            template_bucket_path="gs://templates/tpl-1.json",
            metadata={"name": "A", "editorSnapshot": {"path": "gs://s/a.json", "pageCount": 4}},
            created_at="2024-01-01T00:00:00+00:00",
            updated_at="2024-01-01T00:00:00+00:00",
            name="A",
        ),
        TemplateRecord(
            id="tpl-2",
            pdf_bucket_path="gs://forms/tpl-2.pdf",
            template_bucket_path="gs://templates/tpl-2.json",
            metadata={"name": "B"},  # no manifest — relies on source fallback
            created_at="2024-01-01T00:00:00+00:00",
            updated_at="2024-01-01T00:00:00+00:00",
            name="B",
        ),
    ]
    sources = [
        {"templateId": "tpl-1", "templateName": "A",
         "fields": [{"name": "f1", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 3, "height": 4}}],
         "checkboxRules": []},
        {"templateId": "tpl-2", "templateName": "B",
         "fields": [{"name": "f1", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 3, "height": 4}}],
         "checkboxRules": [],
         "pageCount": 5},
    ]
    bundle = build_group_fill_link_publish_snapshot(
        canonical_schema={"groupId": "grp", "fields": []},
        template_records=records,
        template_sources=sources,
    )
    per_template_counts = [entry["snapshot"]["pageCount"] for entry in bundle["templateSnapshots"]]
    assert per_template_counts == [4, 5]
    assert group_template_api_total_page_count(bundle) == 9


def test_build_template_fill_link_download_snapshot_uses_saved_form_fill_rules() -> None:
    snapshot = build_template_fill_link_download_snapshot(
        template=_template_record(),
        fields=[
            {"name": "first_name", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 3, "height": 4}},
            {"name": "last_name", "type": "text", "page": 1, "rect": {"x": 5, "y": 6, "width": 7, "height": 8}},
        ],
    )

    assert snapshot["version"] == 1
    assert snapshot["sourcePdfPath"] == "gs://forms/template.pdf"
    assert snapshot["filename"] == "Admissions_Form-response.pdf"
    assert snapshot["downloadMode"] == "flat"
    assert snapshot["checkboxRules"][0]["groupKey"] == "consent_group"
    assert snapshot["textTransformRules"][0]["targetField"] == "full_name"


def test_build_group_fill_link_publish_snapshot_preserves_template_font_appearance() -> None:
    bundle = build_group_fill_link_publish_snapshot(
        canonical_schema={"groupId": "grp", "fields": []},
        template_records=[_template_record()],
        template_sources=[
            {
                "templateId": "tpl-1",
                "templateName": "Admissions Form",
                "appearance": {"globalFieldFont": "Times-Roman", "globalFieldFontSize": 11},
                "fields": [
                    {
                        "name": "full_name",
                        "type": "text",
                        "page": 1,
                        "rect": {"x": 1, "y": 2, "width": 3, "height": 4},
                        "fontName": "global",
                        "fontSize": 9,
                    }
                ],
                "checkboxRules": [],
            }
        ],
    )

    snapshot = bundle["templateSnapshots"][0]["snapshot"]
    assert snapshot["appearance"] == {
        "globalFieldFont": "Times-Roman",
        "globalFieldFontSize": 11.0,
        "globalFieldFontColor": "#000000",
        "globalFieldAlignment": "left",
    }
    assert snapshot["fields"][0]["fontName"] == "global"
    assert snapshot["fields"][0]["fontSize"] == 9.0


def test_materialize_fill_link_response_download_preserves_base14_fonts(mocker) -> None:
    mocker.patch.object(fill_link_download_service, "download_pdf_bytes", return_value=_blank_pdf_bytes())
    snapshot = {
        "sourcePdfPath": "gs://forms/template.pdf",
        "templateName": "Admissions Form",
        "filename": "admissions-response.pdf",
        "downloadMode": "editable",
        "appearance": {"globalFieldFont": "Times-Roman"},
        "fields": [
            {
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 120, 40],
                "fontName": "global",
            },
            {
                "name": "policy_number",
                "type": "text",
                "page": 1,
                "rect": [20, 50, 120, 70],
                "fontName": "Courier-Bold",
            },
        ],
        "checkboxRules": [],
        "textTransformRules": [],
        "radioGroups": [],
    }

    output_path, cleanup_targets, _ = materialize_fill_link_response_download(
        snapshot,
        answers={"full_name": "Ada Lovelace", "policy_number": "ABC-123"},
        export_mode="editable",
    )

    try:
        base_fonts, appearance_streams, page_streams, default_appearances = _pdf_font_debug(output_path)
        assert "/Times-Roman" in base_fonts
        assert "/Courier-Bold" in base_fonts
        assert "/Time" in appearance_streams
        assert "/CoBo" in appearance_streams
        assert "Ada Lovelace" not in page_streams
        assert "ABC-123" not in page_streams
        assert "/Time" in default_appearances
        assert "/CoBo" in default_appearances
    finally:
        for path in cleanup_targets:
            path.unlink(missing_ok=True)


def test_materialize_fill_link_response_download_preserves_font_sizes(mocker) -> None:
    mocker.patch.object(fill_link_download_service, "download_pdf_bytes", return_value=_blank_pdf_bytes())
    snapshot = {
        "sourcePdfPath": "gs://forms/template.pdf",
        "templateName": "Admissions Form",
        "filename": "admissions-response.pdf",
        "downloadMode": "editable",
        "appearance": {"globalFieldFontSize": 15},
        "fields": [
            {
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 120, 40],
            },
            {
                "name": "policy_number",
                "type": "text",
                "page": 1,
                "rect": [20, 50, 120, 70],
                "fontSize": 9,
            },
            {
                "name": "city",
                "type": "text",
                "page": 1,
                "rect": [20, 80, 120, 94],
                "fontSize": "auto",
            },
        ],
        "checkboxRules": [],
        "textTransformRules": [],
        "radioGroups": [],
    }

    output_path, cleanup_targets, _ = materialize_fill_link_response_download(
        snapshot,
        answers={"full_name": "Ada Lovelace", "policy_number": "ABC-123", "city": "Austin"},
        export_mode="editable",
    )

    try:
        _base_fonts, appearance_streams, page_streams, default_appearances = _pdf_font_debug(output_path)
        assert "/Helv 15.00 Tf" in appearance_streams
        assert "/Helv 9.00 Tf" in appearance_streams
        assert "/Helv 9.10 Tf" in appearance_streams
        assert "Ada Lovelace" not in page_streams
        assert "/Helv 15 Tf" in default_appearances
        assert "/Helv 9 Tf" in default_appearances
        assert "/Helv 9.1 Tf" in default_appearances
    finally:
        for path in cleanup_targets:
            path.unlink(missing_ok=True)


def test_materialize_fill_link_response_download_stamps_dependency_barcode_flat(mocker) -> None:
    mocker.patch.object(fill_link_download_service, "download_pdf_bytes", return_value=_blank_pdf_bytes())
    snapshot = {
        "sourcePdfPath": "gs://forms/template.pdf",
        "templateName": "Admissions Form",
        "filename": "admissions-response.pdf",
        "downloadMode": "flat",
        "fields": [
            {
                "id": "member-id",
                "name": "member_id",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 120, 40],
            },
            {
                "id": "barcode-id",
                "name": "member_barcode",
                "type": "barcode",
                "page": 1,
                "rect": [20, 50, 160, 90],
                "barcodeSourceField": {"fieldId": "member-id", "fieldName": "member_id"},
            },
        ],
        "checkboxRules": [],
        "textTransformRules": [],
        "radioGroups": [],
    }

    output_path, cleanup_targets, _ = materialize_fill_link_response_download(
        snapshot,
        answers={"member_id": "123456789"},
        export_mode="flat",
    )

    try:
        reader = PdfReader(str(output_path))
        assert "/AcroForm" not in reader.trailer["/Root"]
        with fitz.open(str(output_path)) as document:
            assert document[0].get_images(full=True)
    finally:
        for path in cleanup_targets:
            path.unlink(missing_ok=True)


def test_materialize_fill_link_response_download_preserves_editable_app_only_marker_metadata(mocker) -> None:
    mocker.patch.object(fill_link_download_service, "download_pdf_bytes", return_value=_blank_pdf_bytes())
    snapshot = {
        "sourcePdfPath": "gs://forms/template.pdf",
        "templateName": "Admissions Form",
        "filename": "admissions-response.pdf",
        "downloadMode": "editable",
        "fields": [
            {
                "id": "member-id",
                "name": "member_id",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 120, 40],
            },
            {
                "id": "barcode-id",
                "name": "member_barcode",
                "type": "barcode",
                "page": 1,
                "rect": [20, 50, 160, 90],
                "barcodeSourceField": {"fieldId": "member-id", "fieldName": "member_id"},
            },
        ],
        "checkboxRules": [],
        "textTransformRules": [],
        "radioGroups": [],
    }

    output_path, cleanup_targets, _ = materialize_fill_link_response_download(
        snapshot,
        answers={"member_id": "123456789"},
        export_mode="editable",
    )

    try:
        reader = PdfReader(str(output_path))
        metadata = json.loads(reader.metadata.get("/DullyPDFAppearance"))
        acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
        field_names = {str(field_ref.get_object().get("/T")) for field_ref in acroform.get("/Fields", [])}
        marker_name = f"member_barcode{BARCODE_FIELD_NAME_MARKER}"
        assert marker_name in field_names
        assert metadata["appOnlyFields"][0]["name"] == "member_barcode"
        assert metadata["appOnlyFields"][0]["markerName"] == marker_name
        assert metadata["appOnlyFields"][0]["value"] == "123456789"
        assert metadata["appOnlyFields"][0]["imageDataUrl"].startswith("data:image/png;base64,")
    finally:
        for path in cleanup_targets:
            path.unlink(missing_ok=True)


def test_materialize_group_fill_link_response_packet_preserves_per_template_fonts(mocker, tmp_path: Path) -> None:
    mocker.patch.object(fill_link_download_service, "download_pdf_bytes", return_value=_blank_pdf_bytes())
    canonical_snapshot = {
        "templateSnapshots": [
            {
                "templateId": "tpl-1",
                "templateName": "Admissions Form",
                "snapshot": {
                    "sourcePdfPath": "gs://forms/template.pdf",
                    "templateName": "Admissions Form",
                    "filename": "admissions-response.pdf",
                    "downloadMode": "editable",
                    "appearance": {"globalFieldFont": "Times-Roman", "globalFieldFontSize": 13},
                    "fields": [
                        {
                            "name": "full_name",
                            "type": "text",
                            "page": 1,
                            "rect": [20, 20, 120, 40],
                            "fontName": "global",
                        }
                    ],
                    "checkboxRules": [],
                    "textTransformRules": [],
                    "radioGroups": [],
                },
            }
        ]
    }

    zip_path, cleanup_targets, _ = materialize_group_fill_link_response_packet(
        canonical_schema_snapshot=canonical_snapshot,
        answers={"full_name": "Ada Lovelace"},
        base_filename="admissions",
    )

    extracted_pdf = tmp_path / "group-font-output.pdf"
    try:
        with zipfile.ZipFile(zip_path) as archive:
            extracted_pdf.write_bytes(archive.read(archive.namelist()[0]))
        base_fonts, appearance_streams, page_streams, default_appearances = _pdf_font_debug(extracted_pdf)
        assert "/Times-Roman" in base_fonts
        assert "/Time 13.00 Tf" in appearance_streams
        assert "Ada Lovelace" not in page_streams
        assert "/Time 13 Tf" in default_appearances
    finally:
        for path in cleanup_targets:
            path.unlink(missing_ok=True)


def test_apply_fill_link_answers_to_fields_sets_text_transform_and_checkbox_values() -> None:
    fields = apply_fill_link_answers_to_fields(
        {
            "fields": [
                {"id": "field-1", "name": "full_name", "type": "text", "page": 1, "rect": [1, 2, 4, 6]},
                {
                    "id": "field-2",
                    "name": "i_consent_group_yes",
                    "type": "checkbox",
                    "page": 1,
                    "rect": [1, 2, 4, 6],
                    "groupKey": "consent_group",
                    "optionKey": "yes",
                    "optionLabel": "Yes",
                },
                {
                    "id": "field-3",
                    "name": "i_consent_group_no",
                    "type": "checkbox",
                    "page": 1,
                    "rect": [1, 2, 4, 6],
                    "groupKey": "consent_group",
                    "optionKey": "no",
                    "optionLabel": "No",
                },
            ],
            "checkboxRules": [
                {
                    "databaseField": "consent",
                    "groupKey": "consent_group",
                    "operation": "yes_no",
                    "trueOption": "yes",
                    "falseOption": "no",
                }
            ],
            "textTransformRules": [
                {
                    "targetField": "full_name",
                    "operation": "concat",
                    "sources": ["first_name", "last_name"],
                    "separator": " ",
                }
            ],
        },
        {
            "first_name": "Ada",
            "last_name": "Lovelace",
            "consent": "yes",
        },
    )

    by_name = {str(field.get("name")): field for field in fields}
    assert by_name["full_name"]["value"] == "Ada Lovelace"
    assert by_name["i_consent_group_yes"]["value"] is True
    assert by_name["i_consent_group_no"]["value"] is False


def test_apply_fill_link_answers_to_fields_materializes_calculated_outputs() -> None:
    fields = apply_fill_link_answers_to_fields(
        {
            "fields": [
                {
                    "id": "base",
                    "name": "base_premium",
                    "type": "text",
                    "page": 1,
                    "rect": [1, 2, 4, 6],
                    "valueType": "integer",
                    "calculation": {"role": "number_input", "valueType": "integer"},
                },
                {
                    "id": "fee",
                    "name": "policy_fee",
                    "type": "text",
                    "page": 1,
                    "rect": [1, 8, 4, 12],
                    "valueType": "integer",
                    "calculation": {"role": "number_input", "valueType": "integer"},
                },
                {
                    "id": "total",
                    "name": "premium_total",
                    "type": "text",
                    "page": 1,
                    "rect": [1, 14, 4, 18],
                    "readOnly": False,
                    "valueType": "integer",
                    "calculation": {
                        "role": "calculated_output",
                        "valueType": "integer",
                        "formula": {
                            "kind": "binary",
                            "op": "+",
                            "left": {"kind": "field", "fieldId": "base"},
                            "right": {"kind": "field", "fieldId": "fee"},
                        },
                        "output": {"valueType": "integer"},
                    },
                },
            ]
        },
        {
            "base_premium": "7",
            "policy_fee": "5",
            "premium_total": "999",
        },
    )

    by_name = {str(field.get("name")): field for field in fields}
    assert by_name["premium_total"]["value"] == "12"
    assert by_name["premium_total"]["readOnly"] is True


def test_apply_fill_link_answers_to_fields_sets_direct_checkbox_and_radio_group_values() -> None:
    fields = apply_fill_link_answers_to_fields(
        {
            "fields": [
                {"id": "field-1", "name": "agree_to_terms", "type": "checkbox", "page": 1, "rect": [1, 2, 4, 6]},
                {
                    "id": "field-2",
                    "name": "marital_single",
                    "type": "checkbox",
                    "page": 1,
                    "rect": [1, 2, 4, 6],
                    "groupKey": "marital_status",
                    "optionKey": "single",
                    "optionLabel": "Single",
                },
                {
                    "id": "field-3",
                    "name": "marital_married",
                    "type": "checkbox",
                    "page": 1,
                    "rect": [1, 2, 4, 6],
                    "groupKey": "marital_status",
                    "optionKey": "married",
                    "optionLabel": "Married",
                },
            ],
            "radioGroups": [
                {
                    "groupKey": "marital_status",
                    "options": [
                        {"optionKey": "single", "optionLabel": "Single"},
                        {"optionKey": "married", "optionLabel": "Married"},
                    ],
                }
            ],
        },
        {
            "agree_to_terms": True,
            "marital_status": "married",
        },
    )

    by_name = {str(field.get("name")): field for field in fields}
    assert by_name["agree_to_terms"]["value"] is True
    assert by_name["marital_single"]["value"] is False
    assert by_name["marital_married"]["value"] is True


def test_apply_fill_link_answers_to_fields_sets_implicit_checkbox_group_values_without_rules() -> None:
    fields = apply_fill_link_answers_to_fields(
        {
            "fields": [
                {
                    "id": "field-1",
                    "name": "consent_yes",
                    "type": "checkbox",
                    "page": 1,
                    "rect": [1, 2, 4, 6],
                    "groupKey": "consent_group",
                    "optionKey": "yes",
                    "optionLabel": "Yes",
                },
                {
                    "id": "field-2",
                    "name": "consent_no",
                    "type": "checkbox",
                    "page": 1,
                    "rect": [1, 2, 4, 6],
                    "groupKey": "consent_group",
                    "optionKey": "no",
                    "optionLabel": "No",
                },
            ],
            "checkboxRules": [],
        },
        {
            "consent_group": ["yes"],
        },
    )

    by_name = {str(field.get("name")): field for field in fields}
    assert by_name["consent_yes"]["value"] is True
    assert by_name["consent_no"]["value"] is False


def test_build_fill_link_download_payload_returns_public_download_path() -> None:
    payload = build_fill_link_download_payload(
        type(
            "Record",
            (),
            {
                "scope_type": "template",
                "respondent_pdf_download_enabled": True,
                "respondent_pdf_snapshot": {"filename": "admissions-response.pdf"},
                "template_name": "Admissions Form",
                "title": "Admissions",
            },
        )(),
        token="token-1",
        response_id="resp-1",
    )

    assert payload == {
        "enabled": True,
        "responseId": "resp-1",
        "downloadPath": "/api/fill-links/public/token-1/responses/resp-1/download",
        "filename": "admissions-response.pdf",
        "mode": "flat",
    }


def _group_record(**overrides):
    defaults = {
        "scope_type": "group",
        "respondent_pdf_download_enabled": True,
        "respondent_pdf_snapshot": None,
        "canonical_schema_snapshot": {
            "snapshotFormatVersion": 1,
            "templateSnapshots": [
                {"templateId": "t1", "snapshot": {"pageCount": 2}},
                {"templateId": "t2", "snapshot": {"pageCount": 3}},
            ],
        },
        "template_name": None,
        "group_name": "Immigration Packet",
        "title": "Packet for Maria",
    }
    defaults.update(overrides)
    return type("GroupRecord", (), defaults)()


def test_respondent_pdf_download_enabled_returns_true_for_group_with_canonical_schema() -> None:
    from backend.services.fill_link_download_service import (
        respondent_pdf_download_enabled,
        respondent_pdf_download_mode,
        respondent_pdf_editable_enabled,
    )

    rec = _group_record()
    assert respondent_pdf_download_enabled(rec) is True
    assert respondent_pdf_download_mode(rec) == "flat"
    assert respondent_pdf_editable_enabled(rec) is False


def test_respondent_pdf_download_enabled_returns_false_for_group_without_canonical_schema() -> None:
    from backend.services.fill_link_download_service import respondent_pdf_download_enabled

    rec = _group_record(canonical_schema_snapshot=None)
    assert respondent_pdf_download_enabled(rec) is False


def test_respondent_pdf_download_enabled_returns_false_when_flag_off_even_with_bundle() -> None:
    from backend.services.fill_link_download_service import respondent_pdf_download_enabled

    rec = _group_record(respondent_pdf_download_enabled=False)
    assert respondent_pdf_download_enabled(rec) is False


def test_build_fill_link_download_payload_group_returns_zip_path() -> None:
    rec = _group_record()
    payload = build_fill_link_download_payload(rec, token="tok-2", response_id="resp-9")

    assert payload is not None
    assert payload["downloadPath"] == "/api/fill-links/public/tok-2/responses/resp-9/download"
    assert payload["filename"].endswith(".zip")
    assert "Immigration" in payload["filename"]
    assert payload["mode"] == "flat"


def test_build_fill_link_download_payload_group_returns_none_without_bundle() -> None:
    rec = _group_record(canonical_schema_snapshot=None)
    payload = build_fill_link_download_payload(rec, token="tok-2", response_id="resp-9")
    assert payload is None


def test_build_fill_link_download_payload_group_falls_back_to_title_when_group_name_missing() -> None:
    rec = _group_record(group_name=None, title="Fallback Title")
    payload = build_fill_link_download_payload(rec, token="tok-2", response_id="resp-9")
    assert payload is not None
    assert "Fallback-Title" in payload["filename"] or "Fallback" in payload["filename"]


# ---------------------------------------------------------------------------
# Phase 3: group fill link publish snapshot + materialization
# ---------------------------------------------------------------------------


def _gcs_template_record(template_id: str, name: str) -> TemplateRecord:
    return TemplateRecord(
        id=template_id,
        pdf_bucket_path=f"gs://forms/{template_id}.pdf",
        template_bucket_path=f"gs://templates/{template_id}.json",
        metadata={"name": name},
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
        name=name,
    )


def test_build_group_fill_link_publish_snapshot_bundles_per_template_snapshots() -> None:
    template_records = [
        _gcs_template_record("tpl-1", "Admissions Packet"),
        _gcs_template_record("tpl-2", "Consent Form"),
    ]
    template_sources = [
        {
            "templateId": "tpl-1",
            "templateName": "Admissions Packet",
            "fields": [{"name": "full_name", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 3, "height": 4}}],
            "checkboxRules": [],
        },
        {
            "templateId": "tpl-2",
            "templateName": "Consent Form",
            "fields": [{"name": "dob", "type": "text", "page": 1, "rect": {"x": 5, "y": 6, "width": 7, "height": 8}}],
            "checkboxRules": [],
        },
    ]

    bundle = build_group_fill_link_publish_snapshot(
        canonical_schema={"groupId": "grp-1", "fields": []},
        template_records=template_records,
        template_sources=template_sources,
    )

    assert bundle["snapshotFormatVersion"] == GROUP_FILL_LINK_PUBLISH_SNAPSHOT_FORMAT_VERSION
    assert bundle["schema"]["groupId"] == "grp-1"
    assert bundle["frozenAt"]  # ISO timestamp set
    assert len(bundle["templateSnapshots"]) == 2
    assert bundle["templateSnapshots"][0]["templateId"] == "tpl-1"
    assert bundle["templateSnapshots"][0]["snapshot"]["sourcePdfPath"] == "gs://forms/tpl-1.pdf"
    assert bundle["templateSnapshots"][1]["templateId"] == "tpl-2"
    assert bundle["templateSnapshots"][1]["snapshot"]["sourcePdfPath"] == "gs://forms/tpl-2.pdf"


def test_build_group_fill_link_publish_snapshot_raises_when_template_record_missing() -> None:
    template_sources = [
        {
            "templateId": "tpl-1",
            "templateName": "Admissions Packet",
            "fields": [{"name": "full_name", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 3, "height": 4}}],
        },
    ]
    with pytest.raises(ValueError, match="missing from the publish payload"):
        build_group_fill_link_publish_snapshot(
            canonical_schema={"groupId": "grp-1", "fields": []},
            template_records=[],  # empty
            template_sources=template_sources,
        )


def test_build_group_fill_link_publish_snapshot_skips_sources_without_template_id() -> None:
    template_records = [_gcs_template_record("tpl-1", "Admissions Packet")]
    template_sources = [
        {"templateId": "", "templateName": "ignored", "fields": []},
        {
            "templateId": "tpl-1",
            "templateName": "Admissions Packet",
            "fields": [{"name": "full_name", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 3, "height": 4}}],
        },
    ]
    bundle = build_group_fill_link_publish_snapshot(
        canonical_schema={"groupId": "grp-1", "fields": []},
        template_records=template_records,
        template_sources=template_sources,
    )
    assert [entry["templateId"] for entry in bundle["templateSnapshots"]] == ["tpl-1"]


def test_group_fill_link_publish_snapshot_template_count_handles_missing_data() -> None:
    assert group_fill_link_publish_snapshot_template_count(None) == 0
    assert group_fill_link_publish_snapshot_template_count({}) == 0
    assert group_fill_link_publish_snapshot_template_count({"templateSnapshots": "garbage"}) == 0
    assert (
        group_fill_link_publish_snapshot_template_count(
            {"templateSnapshots": [{"templateId": "tpl-1", "snapshot": {}}, "non-dict", {"templateId": "tpl-2"}]}
        )
        == 2
    )


def test_materialize_group_fill_link_response_packet_zips_per_template_pdfs(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """The materializer calls the per-template helper for each template snapshot
    and returns a zip containing the resulting PDFs."""

    snapshot_bundle = {
        "snapshotFormatVersion": 1,
        "frozenAt": "2026-04-13T00:00:00Z",
        "schema": {"fields": []},
        "templateSnapshots": [
            {"templateId": "tpl-1", "templateName": "Admissions Packet", "snapshot": {"sourcePdfPath": "gs://forms/tpl-1.pdf"}},
            {"templateId": "tpl-2", "templateName": "Consent Form", "snapshot": {"sourcePdfPath": "gs://forms/tpl-2.pdf"}},
        ],
    }

    call_log: List[Dict[str, Any]] = []
    pdf_payloads = {
        "tpl-1": b"%PDF-1.4\nstub-tpl-1\n",
        "tpl-2": b"%PDF-1.4\nstub-tpl-2\n",
    }

    def fake_materialize(snapshot, *, answers):
        template_id = "tpl-1" if snapshot["sourcePdfPath"].endswith("tpl-1.pdf") else "tpl-2"
        call_log.append({"template_id": template_id, "answers": dict(answers)})
        pdf_path = tmp_path / f"{template_id}.pdf"
        pdf_path.write_bytes(pdf_payloads[template_id])
        return pdf_path, [pdf_path], f"{template_id}.pdf"

    monkeypatch.setattr(
        "backend.services.fill_link_download_service.materialize_fill_link_response_download",
        fake_materialize,
    )

    zip_path, cleanup_targets, zip_filename = materialize_group_fill_link_response_packet(
        canonical_schema_snapshot=snapshot_bundle,
        answers={"full_name": "Ada Lovelace"},
        base_filename="admissions-packet",
    )

    assert zip_filename == "admissions-packet.zip"
    assert zip_path.exists()
    archive_bytes = zip_path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        names = archive.namelist()
        assert sorted(names) == sorted(["Admissions_Packet.pdf", "Consent_Form.pdf"])
        assert archive.read("Admissions_Packet.pdf") == pdf_payloads["tpl-1"]
        assert archive.read("Consent_Form.pdf") == pdf_payloads["tpl-2"]

    # Both per-template materialize calls fire with the same answer dict.
    assert [entry["template_id"] for entry in call_log] == ["tpl-1", "tpl-2"]
    assert all(entry["answers"] == {"full_name": "Ada Lovelace"} for entry in call_log)

    # The zip path is included in cleanup targets so the route can wipe it
    # after streaming the response.
    assert zip_path in cleanup_targets


def test_materialize_group_fill_link_response_packet_dedupes_archive_names(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Two templates with identical names produce distinct zip entries (foo.pdf, foo-2.pdf)."""

    snapshot_bundle = {
        "snapshotFormatVersion": 1,
        "frozenAt": "2026-04-13T00:00:00Z",
        "schema": {"fields": []},
        "templateSnapshots": [
            {"templateId": "tpl-1", "templateName": "Intake", "snapshot": {"sourcePdfPath": "gs://forms/tpl-1.pdf"}},
            {"templateId": "tpl-2", "templateName": "Intake", "snapshot": {"sourcePdfPath": "gs://forms/tpl-2.pdf"}},
        ],
    }

    counter = {"value": 0}

    def fake_materialize(snapshot, *, answers):
        counter["value"] += 1
        idx = counter["value"]
        pdf_path = tmp_path / f"intake-{idx}.pdf"
        pdf_path.write_bytes(f"%PDF-1.4\nstub-{idx}\n".encode())
        return pdf_path, [pdf_path], f"intake-{idx}.pdf"

    monkeypatch.setattr(
        "backend.services.fill_link_download_service.materialize_fill_link_response_download",
        fake_materialize,
    )

    zip_path, _, _ = materialize_group_fill_link_response_packet(
        canonical_schema_snapshot=snapshot_bundle,
        answers={},
        base_filename="intake",
    )

    with zipfile.ZipFile(io.BytesIO(zip_path.read_bytes())) as archive:
        names = sorted(archive.namelist())
        assert names == ["Intake-2.pdf", "Intake.pdf"]


def test_materialize_group_fill_link_response_packet_raises_on_missing_snapshot() -> None:
    with pytest.raises(ValueError, match="missing its canonical schema snapshot"):
        materialize_group_fill_link_response_packet(
            canonical_schema_snapshot=None,  # type: ignore[arg-type]
            answers={},
            base_filename="x",
        )


def test_materialize_group_fill_link_response_packet_raises_on_empty_template_snapshots() -> None:
    with pytest.raises(ValueError, match="no template entries"):
        materialize_group_fill_link_response_packet(
            canonical_schema_snapshot={"templateSnapshots": []},
            answers={},
            base_filename="x",
        )


def test_materialize_group_fill_link_response_packet_propagates_per_template_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    snapshot_bundle = {
        "templateSnapshots": [
            {"templateId": "tpl-1", "templateName": "A", "snapshot": {"sourcePdfPath": "gs://forms/tpl-1.pdf"}},
        ],
    }

    def boom(snapshot, *, answers):
        raise FileNotFoundError("source pdf missing")

    monkeypatch.setattr(
        "backend.services.fill_link_download_service.materialize_fill_link_response_download",
        boom,
    )

    with pytest.raises(FileNotFoundError):
        materialize_group_fill_link_response_packet(
            canonical_schema_snapshot=snapshot_bundle,
            answers={},
            base_filename="x",
        )
