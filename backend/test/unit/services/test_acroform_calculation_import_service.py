from __future__ import annotations

import io

from pypdf import PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, FloatObject, NameObject, NumberObject, TextStringObject

from backend.services import acroform_calculation_import_service
from backend.services.acroform_calculation_import_service import (
    analyze_acroform_calculation_fields,
    enrich_fields_with_acroform_calculation_metadata,
    merge_acroform_calculation_metadata,
)


def _text_field(
    name: str,
    rect: tuple[float, float, float, float],
    *,
    flags: int = 0,
    additional_actions: DictionaryObject | None = None,
) -> DictionaryObject:
    field = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/T"): TextStringObject(name),
            NameObject("/Rect"): ArrayObject([FloatObject(value) for value in rect]),
        }
    )
    if flags:
        field[NameObject("/Ff")] = NumberObject(flags)
    if additional_actions is not None:
        field[NameObject("/AA")] = additional_actions
    return field


def _javascript_action(source: str) -> DictionaryObject:
    return DictionaryObject(
        {
            NameObject("/S"): NameObject("/JavaScript"),
            NameObject("/JS"): TextStringObject(source),
        }
    )


def _calculated_pdf_bytes() -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    input_field = _text_field(
        "base_premium",
        (10, 160, 90, 178),
        additional_actions=DictionaryObject(
            {
                NameObject("/K"): _javascript_action("AFNumber_Keystroke(0, 0, 0, 0, '', true);"),
            }
        ),
    )
    total_field = _text_field(
        "premium_total",
        (100, 160, 180, 178),
        flags=3,
        additional_actions=DictionaryObject(
            {
                NameObject("/C"): _javascript_action(
                    "var private_js_marker = 42; AFSimple_Calculate('SUM', new Array('base_premium'));"
                ),
            }
        ),
    )
    input_ref = writer._add_object(input_field)  # pylint: disable=protected-access
    total_ref = writer._add_object(total_field)  # pylint: disable=protected-access
    page[NameObject("/Annots")] = ArrayObject([input_ref, total_ref])
    acroform = DictionaryObject(
        {
            NameObject("/Fields"): ArrayObject([input_ref, total_ref]),
            NameObject("/CO"): ArrayObject([total_ref]),
        }
    )
    writer._root_object[NameObject("/AcroForm")] = writer._add_object(acroform)  # pylint: disable=protected-access
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def test_analyze_acroform_calculation_fields_detects_external_calculation_without_raw_js() -> None:
    records = analyze_acroform_calculation_fields(_calculated_pdf_bytes())
    by_name = {record["name"]: record for record in records}

    input_record = by_name["base_premium"]
    assert input_record["valueType"] == "integer"
    assert "calculation" not in input_record

    total_record = by_name["premium_total"]
    assert total_record["readOnly"] is True
    assert total_record["required"] is True
    assert total_record["page"] == 1
    assert total_record["rect"] == {"x": 100.0, "y": 22.0, "width": 80.0, "height": 18.0}
    assert total_record["calculation"]["role"] == "external_imported_calculation"
    assert total_record["calculation"]["imported"]["source"] == "acroform_js"
    assert total_record["calculation"]["imported"]["supported"] is False
    assert total_record["calculation"]["imported"]["reason"] == "unsupported_acroform_javascript"
    assert "private_js_marker" not in total_record["calculation"]["imported"]["rawActionSummary"]


def test_analyze_acroform_calculation_fields_logs_import_summary(mocker) -> None:
    info = mocker.patch.object(acroform_calculation_import_service.logger, "info")

    analyze_acroform_calculation_fields(_calculated_pdf_bytes())

    info.assert_called_once()
    assert info.call_args.args[0].startswith("AcroForm calculation import summary")
    assert info.call_args.args[1:] == (1, 0, 1, 0, 1)


def test_analyze_acroform_calculation_fields_skips_when_feature_flag_is_disabled(monkeypatch, mocker) -> None:
    monkeypatch.setenv("DULLYPDF_CALCULATION_FIELDS_ENABLED", "false")
    info = mocker.patch.object(acroform_calculation_import_service.logger, "info")

    assert analyze_acroform_calculation_fields(_calculated_pdf_bytes()) == []
    info.assert_called_once_with("AcroForm calculation import skipped: reason=feature_disabled")


def test_merge_acroform_calculation_metadata_preserves_client_field_identity_with_rect_match() -> None:
    imported_records = analyze_acroform_calculation_fields(_calculated_pdf_bytes())
    fields = [
        {
            "id": "client-input",
            "name": "base_premium",
            "type": "text",
            "page": 1,
            "rect": [10.0, 22.0, 90.0, 40.0],
        },
        {
            "id": "client-total",
            "name": "renamed_total",
            "type": "text",
            "page": 1,
            "rect": [100.0, 22.0, 180.0, 40.0],
        },
    ]

    enriched = merge_acroform_calculation_metadata(fields, imported_records)

    assert enriched[1]["id"] == "client-total"
    assert enriched[1]["readOnly"] is True
    assert enriched[1]["required"] is True
    assert enriched[1]["calculation"]["role"] == "external_imported_calculation"
    assert enriched[0]["valueType"] == "integer"


def test_enrich_fields_with_acroform_calculation_metadata_leaves_invalid_pdfs_unchanged() -> None:
    fields = [{"id": "field-1", "name": "premium_total", "type": "text"}]
    assert enrich_fields_with_acroform_calculation_metadata(fields, b"not a pdf") == fields
