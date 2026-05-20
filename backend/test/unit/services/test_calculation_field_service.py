from __future__ import annotations

import pytest

from backend.services import calculation_field_service
from backend.services.calculation_field_service import CalculationFieldError, materialize_calculated_fields


def _text_field(field_id: str, name: str, **extra):
    field = {
        "id": field_id,
        "name": name,
        "type": "text",
        "page": 1,
        "rect": [0, 0, 100, 20],
    }
    field.update(extra)
    return field


def test_materialize_calculated_fields_evaluates_chained_integer_outputs() -> None:
    fields = materialize_calculated_fields(
        [
            _text_field(
                "base",
                "Base Premium",
                value="12",
                valueType="integer",
                calculation={"role": "number_input", "valueType": "integer"},
            ),
            _text_field(
                "fee",
                "Fee",
                value="3",
                valueType="integer",
                calculation={"role": "number_input", "valueType": "integer"},
            ),
            _text_field(
                "subtotal",
                "Subtotal",
                valueType="integer",
                calculation={
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
            ),
            _text_field(
                "total",
                "Total",
                readOnly=False,
                valueType="integer",
                calculation={
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
            ),
        ]
    )

    by_id = {field["id"]: field for field in fields}
    assert by_id["subtotal"]["value"] == "15"
    assert by_id["total"]["value"] == "30"
    assert by_id["subtotal"]["readOnly"] is True
    assert by_id["total"]["readOnly"] is True
    assert by_id["total"]["calculation"]["dependencies"] == ["subtotal"]


def test_materialize_calculated_fields_supports_decimal_division_outputs() -> None:
    fields = materialize_calculated_fields(
        [
            _text_field("left", "Left", value="5", valueType="integer"),
            _text_field("right", "Right", value="2", valueType="integer"),
            _text_field(
                "ratio",
                "Ratio",
                valueType="decimal",
                calculation={
                    "role": "calculated_output",
                    "valueType": "decimal",
                    "formula": {
                        "kind": "binary",
                        "op": "/",
                        "left": {"kind": "field", "fieldId": "left"},
                        "right": {"kind": "field", "fieldId": "right"},
                    },
                    "output": {"valueType": "decimal"},
                },
            ),
        ]
    )

    assert {field["id"]: field for field in fields}["ratio"]["value"] == "2.5"


def test_materialize_calculated_fields_respects_blank_and_divide_by_zero_behaviors() -> None:
    fields = materialize_calculated_fields(
        [
            _text_field("left", "Left", value="5", valueType="integer"),
            _text_field("right", "Right", value="", valueType="integer"),
            _text_field(
                "total",
                "Total",
                valueType="integer",
                calculation={
                    "role": "calculated_output",
                    "valueType": "integer",
                    "formula": {
                        "kind": "binary",
                        "op": "/",
                        "left": {"kind": "field", "fieldId": "left"},
                        "right": {"kind": "field", "fieldId": "right"},
                    },
                    "output": {
                        "valueType": "integer",
                        "blankInputBehavior": "blank_result",
                        "divideByZeroBehavior": "validation_error",
                    },
                },
            ),
        ]
    )

    assert {field["id"]: field for field in fields}["total"]["value"] == ""

    with pytest.raises(CalculationFieldError, match="divides by zero"):
        materialize_calculated_fields(
            [
                _text_field("left", "Left", value="5", valueType="integer"),
                _text_field("right", "Right", value="0", valueType="integer"),
                _text_field(
                    "total",
                    "Total",
                    valueType="integer",
                    calculation={
                        "role": "calculated_output",
                        "valueType": "integer",
                        "formula": {
                            "kind": "binary",
                            "op": "/",
                            "left": {"kind": "field", "fieldId": "left"},
                            "right": {"kind": "field", "fieldId": "right"},
                        },
                        "output": {"valueType": "integer", "divideByZeroBehavior": "validation_error"},
                    },
                ),
            ]
        )


def test_materialize_calculated_fields_rejects_cycles_and_non_integer_inputs() -> None:
    with pytest.raises(CalculationFieldError, match="circular dependency"):
        materialize_calculated_fields(
            [
                _text_field(
                    "a",
                    "A",
                    calculation={
                        "role": "calculated_output",
                        "valueType": "integer",
                        "formula": {"kind": "field", "fieldId": "b"},
                    },
                ),
                _text_field(
                    "b",
                    "B",
                    calculation={
                        "role": "calculated_output",
                        "valueType": "integer",
                        "formula": {"kind": "field", "fieldId": "a"},
                    },
                ),
            ]
        )

    with pytest.raises(CalculationFieldError, match="must be an integer"):
        materialize_calculated_fields(
            [
                _text_field(
                    "base",
                    "Base",
                    value="10.5",
                    valueType="integer",
                    calculation={"role": "number_input", "valueType": "integer"},
                ),
                _text_field(
                    "total",
                    "Total",
                    calculation={
                        "role": "calculated_output",
                        "valueType": "integer",
                        "formula": {"kind": "field", "fieldId": "base"},
                    },
                ),
            ]
        )


def test_materialize_calculated_fields_fails_closed_when_feature_flag_is_disabled(monkeypatch, mocker) -> None:
    monkeypatch.setenv("DULLYPDF_CALCULATION_FIELDS_ENABLED", "false")
    warning = mocker.patch.object(calculation_field_service.logger, "warning")

    with pytest.raises(CalculationFieldError, match="disabled"):
        materialize_calculated_fields(
            [
                _text_field(
                    "total",
                    "Total",
                    calculation={
                        "role": "calculated_output",
                        "valueType": "integer",
                        "formula": {"kind": "constant", "value": 5},
                    },
                ),
            ]
        )

    warning.assert_called_once()
    assert warning.call_args.args[1] == "feature_disabled"
