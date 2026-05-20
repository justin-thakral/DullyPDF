from __future__ import annotations

import io
import json

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, FloatObject, NameObject, NumberObject, TextStringObject

from backend.services.acroform_calculation_export_service import (
    FLAG_READ_ONLY,
    apply_calculation_acroform_behavior,
    set_dullypdf_calculation_metadata,
)


def _text_field(name: str, rect: tuple[float, float, float, float] = (10, 160, 90, 178)) -> DictionaryObject:
    return DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/T"): TextStringObject(name),
            NameObject("/Rect"): ArrayObject([FloatObject(value) for value in rect]),
            NameObject("/Ff"): NumberObject(0),
        }
    )


def _javascript_for(field: DictionaryObject, key: str) -> str:
    return str(field["/AA"][key].get_object()["/JS"])


def test_apply_calculation_acroform_behavior_writes_actions_flags_and_calculation_order() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    base = _text_field('Base "Premium"', (10, 160, 90, 178))
    fee = _text_field("Policy\\Fee", (10, 130, 90, 148))
    subtotal = _text_field("Subtotal", (100, 160, 180, 178))
    total = _text_field("Premium Total", (100, 130, 180, 148))
    unrelated = _text_field("Unrelated Legacy Calculation", (10, 100, 90, 118))
    refs = [writer._add_object(field) for field in (base, fee, subtotal, total, unrelated)]  # pylint: disable=protected-access
    page[NameObject("/Annots")] = ArrayObject(refs)
    acroform = DictionaryObject(
        {
            NameObject("/Fields"): ArrayObject(refs),
            NameObject("/CO"): ArrayObject([refs[-1]]),
        }
    )

    fields = [
        {
            "id": "base",
            "name": 'Base "Premium"',
            "type": "text",
            "valueType": "integer",
            "calculation": {"role": "number_input", "valueType": "integer"},
        },
        {
            "id": "fee",
            "name": "Policy\\Fee",
            "type": "text",
            "valueType": "integer",
            "calculation": {"role": "number_input", "valueType": "integer"},
        },
        {
            "id": "subtotal",
            "name": "Subtotal",
            "type": "text",
            "valueType": "integer",
            "calculation": {
                "role": "calculated_intermediate",
                "valueType": "integer",
                "formula": {
                    "kind": "binary",
                    "op": "+",
                    "left": {"kind": "field", "fieldId": "base"},
                    "right": {"kind": "field", "fieldId": "fee"},
                },
                "output": {"valueType": "integer", "rounding": "round"},
            },
        },
        {
            "id": "total",
            "name": "Premium Total",
            "type": "text",
            "valueType": "integer",
            "calculation": {
                "role": "calculated_output",
                "valueType": "integer",
                "formula": {
                    "kind": "binary",
                    "op": "*",
                    "left": {"kind": "field", "fieldId": "subtotal"},
                    "right": {"kind": "constant", "value": 2},
                },
                "output": {"valueType": "integer", "rounding": "round"},
            },
        },
    ]

    apply_calculation_acroform_behavior(acroform, fields)

    assert set(base["/AA"].keys()) == {"/K", "/V", "/F"}
    assert "AFNumber_Keystroke(0" in _javascript_for(base, "/K")
    assert "Math.floor(n) !== n" in _javascript_for(base, "/V")
    assert "AFNumber_Format(0" in _javascript_for(base, "/F")

    subtotal_js = _javascript_for(subtotal, "/C")
    assert int(subtotal["/Ff"]) & FLAG_READ_ONLY
    assert 'dullyRead("Base \\"Premium\\"")' in subtotal_js
    assert 'dullyRead("Policy\\\\Fee")' in subtotal_js
    assert "event.value = dullyOutput" in subtotal_js
    assert int(total["/Ff"]) & FLAG_READ_ONLY
    assert 'dullyRead("Subtotal")' in _javascript_for(total, "/C")

    ordered_names = [str(entry.get_object()["/T"]) for entry in acroform["/CO"]]
    assert ordered_names == ["Unrelated Legacy Calculation", "Subtotal", "Premium Total"]


def test_set_dullypdf_calculation_metadata_persists_safe_formula_payload_without_import_state() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)

    set_dullypdf_calculation_metadata(
        writer,
        [
            {
                "id": "base",
                "name": "Base Premium",
                "type": "text",
                "page": 1,
                "rect": [10, 20, 90, 38],
                "valueType": "integer",
                "calculation": {
                    "role": "number_input",
                    "valueType": "integer",
                    "imported": {"source": "acroform_js", "supported": False},
                },
            },
            {
                "id": "total",
                "name": "Premium Total",
                "type": "text",
                "page": 1,
                "rect": [100, 20, 180, 38],
                "valueType": "integer",
                "calculation": {
                    "role": "calculated_output",
                    "valueType": "integer",
                    "formula": {"kind": "field", "fieldId": "base"},
                    "output": {"valueType": "integer", "rounding": "round"},
                },
            },
        ],
    )

    buffer = io.BytesIO()
    writer.write(buffer)
    metadata = PdfReader(io.BytesIO(buffer.getvalue())).metadata
    payload = json.loads(metadata["/DullyPDFCalculations"])

    assert payload["schema"] == "dullypdf.calculations.v1"
    assert [field["name"] for field in payload["fields"]] == ["Base Premium", "Premium Total"]
    assert payload["fields"][0]["calculation"] == {"role": "number_input", "valueType": "integer"}
    assert payload["fields"][1]["calculation"]["formula"] == {"kind": "field", "fieldId": "base"}
