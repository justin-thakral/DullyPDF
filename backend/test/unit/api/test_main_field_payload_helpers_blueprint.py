import pytest
from pydantic import ValidationError


def test_rect_helpers_validate_numeric_and_positive_size(app_main) -> None:
    assert app_main._rect_from_xywh("1", "2", "3", "4") == {
        "x": 1.0,
        "y": 2.0,
        "width": 3.0,
        "height": 4.0,
    }
    assert app_main._rect_from_corners(1, 2, 5, 9) == {
        "x": 1.0,
        "y": 2.0,
        "width": 4.0,
        "height": 7.0,
    }

    with pytest.raises(ValueError):
        app_main._rect_from_xywh("bad", 0, 1, 1)
    with pytest.raises(ValueError):
        app_main._rect_from_xywh(1, 2, 0, 1)
    with pytest.raises(ValueError):
        app_main._rect_from_corners(10, 10, 5, 5)


def test_template_overlay_field_rect_validator_modes(app_main) -> None:
    field_xywh = app_main.TemplateOverlayField(
        name="a",
        rect={"x": 10, "y": 20, "width": 30, "height": 40},
    )
    assert field_xywh.rect == {"x": 10.0, "y": 20.0, "width": 30.0, "height": 40.0}

    field_corners = app_main.TemplateOverlayField(
        name="b",
        rect={"x1": 1, "y1": 2, "x2": 4, "y2": 8},
    )
    assert field_corners.rect == {"x": 1.0, "y": 2.0, "width": 3.0, "height": 6.0}

    field_list = app_main.TemplateOverlayField(name="c", rect=[1, 2, 5, 6])
    assert field_list.rect == {"x": 1.0, "y": 2.0, "width": 4.0, "height": 4.0}

    with pytest.raises(ValidationError):
        app_main.TemplateOverlayField(name="x", rect=[1, 2, 3])
    with pytest.raises(ValidationError):
        app_main.TemplateOverlayField(name="x", rect={"x": 1, "y": 2, "width": 0, "height": 4})
    with pytest.raises(ValidationError):
        app_main.TemplateOverlayField(name="x", rect={"x": "bad", "y": 2, "width": 1, "height": 4})

    font_field = app_main.TemplateOverlayField(name="fonted", fontName="Times-Italic")
    assert font_field.fontName == "Times-Italic"
    font_size_field = app_main.TemplateOverlayField(name="sized", fontSize="12")
    assert font_size_field.fontSize == 12.0
    aligned_field = app_main.TemplateOverlayField(name="aligned", textAlign="center")
    assert aligned_field.textAlign == "center"
    with pytest.raises(ValidationError):
        app_main.TemplateOverlayField(name="bad_font", fontName="ComicSans")
    with pytest.raises(ValidationError):
        app_main.TemplateOverlayField(name="bad_font_size", fontSize=100)
    with pytest.raises(ValidationError):
        app_main.TemplateOverlayField(name="bad_text_align", textAlign="justify")


def test_coerce_field_payloads_normalizes_mixed_shapes(app_main) -> None:
    raw = [
        {"name": "a", "rect": {"x": 1, "y": 2, "width": 3, "height": 4}},
        {"name": "b", "rect": {"x1": 10, "y1": 20, "x2": 13, "y2": 25}},
        {"name": "c", "rect": [2, 3, 7, 8]},
        {"name": "d", "x": 1, "y": 2, "width": 5, "height": 6},
        {"name": "e", "rect": {"x": "bad"}},
        {"name": "f", "type": "text", "rect": [1, 2, 3, 4], "fontName": "Courier-Bold"},
        {"name": "g", "type": "checkbox", "rect": [1, 2, 3, 4], "fontName": "Courier-Bold"},
        {"name": "h", "type": "text", "rect": [1, 2, 3, 4], "fontName": "ComicSans"},
        {"name": "i", "type": "text", "rect": [1, 2, 3, 4], "fontSize": "auto"},
        {"name": "j", "type": "checkbox", "rect": [1, 2, 3, 4], "fontSize": 12},
        {"name": "k", "type": "text", "rect": [1, 2, 3, 4], "fontSize": 100},
        {"name": "l", "type": "text", "rect": [1, 2, 3, 4], "textAlign": "right"},
        {"name": "m", "type": "checkbox", "rect": [1, 2, 3, 4], "textAlign": "right"},
        {"name": "n", "type": "text", "rect": [1, 2, 3, 4], "textAlign": "justify"},
        "not-a-dict",
    ]
    cleaned = app_main._coerce_field_payloads(raw)
    assert [entry["name"] for entry in cleaned] == [
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g",
        "h",
        "i",
        "j",
        "k",
        "l",
        "m",
        "n",
    ]
    assert cleaned[0]["rect"] == [1.0, 2.0, 4.0, 6.0]
    assert cleaned[1]["rect"] == [10.0, 20.0, 13.0, 25.0]
    assert cleaned[2]["rect"] == [2.0, 3.0, 7.0, 8.0]
    assert cleaned[3]["rect"] == [1.0, 2.0, 6.0, 8.0]
    assert cleaned[4]["rect"] is None
    assert cleaned[5]["fontName"] == "Courier-Bold"
    assert "fontName" not in cleaned[6]
    assert "fontName" not in cleaned[7]
    assert cleaned[8]["fontSize"] == "auto"
    assert "fontSize" not in cleaned[9]
    assert "fontSize" not in cleaned[10]
    assert cleaned[11]["textAlign"] == "right"
    assert "textAlign" not in cleaned[12]
    assert "textAlign" not in cleaned[13]


def test_calculation_metadata_normalizes_for_template_fields_and_materialize_payloads(app_main) -> None:
    calculation = {
        "role": "calculated_output",
        "valueType": "integer",
        "formula": {
            "kind": "binary",
            "op": "+",
            "left": {"kind": "field", "fieldId": "subtotal"},
            "right": {"kind": "constant", "value": 5},
        },
        "dependencies": ["subtotal"],
        "output": {"valueType": "integer", "rounding": "round"},
    }

    field = app_main.TemplateOverlayField(
        name="total",
        type="text",
        rect=[1, 2, 3, 4],
        readOnly=True,
        required=True,
        valueType="integer",
        calculation=calculation,
    )
    assert field.readOnly is True
    assert field.required is True
    assert field.valueType == "integer"
    assert field.calculation["role"] == "calculated_output"

    cleaned = app_main._coerce_field_payloads([
        {
            "name": "total",
            "type": "text",
            "rect": [1, 2, 3, 4],
            "readonly": "true",
            "required": "true",
            "valueType": "integer",
            "calculation": calculation,
        }
    ])

    assert cleaned[0]["readOnly"] is True
    assert cleaned[0]["required"] is True
    assert cleaned[0]["valueType"] == "integer"
    assert cleaned[0]["calculation"]["formula"]["op"] == "+"


def test_calculation_metadata_rejects_unsupported_shapes(app_main) -> None:
    with pytest.raises(ValidationError):
        app_main.TemplateOverlayField(
            name="bad",
            type="checkbox",
            rect=[1, 2, 3, 4],
            valueType="integer",
        )

    with pytest.raises(ValueError, match="formula binary operator"):
        app_main._coerce_field_payloads([
            {
                "name": "bad",
                "type": "text",
                "rect": [1, 2, 3, 4],
                "calculation": {
                    "role": "calculated_output",
                    "valueType": "integer",
                    "formula": {"kind": "binary", "op": "%"},
                },
            }
        ])


def test_field_font_size_resolution_helpers(app_main) -> None:
    assert app_main.resolve_auto_field_font_size(14) == 9.1
    assert app_main.resolve_effective_field_font_size(
        {"type": "text"},
        global_field_font_size="auto",
        auto_size=9.1,
    ) == 9.1
    assert app_main.resolve_effective_field_font_size(
        {"type": "text"},
        global_field_font_size=14,
        auto_size=9.1,
    ) == 14.0
    assert app_main.resolve_effective_field_font_size(
        {"type": "text", "fontSize": 8},
        global_field_font_size=14,
        auto_size=9.1,
    ) == 8.0
    assert app_main.resolve_effective_field_font_size(
        {"type": "text", "fontSize": "auto"},
        global_field_font_size=14,
        auto_size=9.1,
    ) == 9.1
    assert app_main.resolve_effective_field_font_size(
        {"type": "checkbox", "fontSize": 8},
        global_field_font_size=14,
        auto_size=9.1,
    ) is None
    assert app_main.should_write_field_font_size_default_appearance(
        {"type": "text"},
        global_field_font_size=14,
    ) is True
    assert app_main.should_write_field_font_size_default_appearance(
        {"type": "text"},
        global_field_font_size="auto",
    ) is False
    assert app_main.should_write_field_font_size_default_appearance(
        {"type": "text", "fontSize": "auto"},
        global_field_font_size=14,
    ) is True


def test_template_fields_to_rename_fields(app_main) -> None:
    fields = [
        app_main.TemplateOverlayField(
            name="first_name",
            type="text",
            page=2,
            rect={"x": 1, "y": 2, "width": 3, "height": 4},
            groupKey="g",
            optionKey="o",
            optionLabel="Yes",
            groupLabel="Group",
        ),
        app_main.TemplateOverlayField(name="bad_rect", page=10, rect=None),
    ]
    rename_fields = app_main._template_fields_to_rename_fields(fields)
    assert len(rename_fields) == 1
    assert rename_fields[0]["name"] == "first_name"
    assert rename_fields[0]["rect"] == [1.0, 2.0, 4.0, 6.0]
    assert rename_fields[0]["page"] == 2
    assert rename_fields[0]["groupKey"] == "g"


# ---------------------------------------------------------------------------
# Edge-case: TemplateOverlayField with empty dict rect returns None
# ---------------------------------------------------------------------------
# When an empty dict {} is passed as rect the validator should return None
# rather than raising, since there are no x/y/width/height or corner keys.
def test_template_overlay_field_empty_dict_rect_returns_none(app_main) -> None:
    field = app_main.TemplateOverlayField(name="empty_rect", rect={})
    assert field.rect is None


# ---------------------------------------------------------------------------
# Edge-case: coerce_field_payloads handles tuple rect
# ---------------------------------------------------------------------------
# The source explicitly accepts tuple in addition to list for the rect value.
# Verify that a 4-element tuple is treated identically to a list.
def test_coerce_field_payloads_with_tuple_rect(app_main) -> None:
    raw = [
        {"name": "tup", "rect": (10, 20, 50, 60)},
    ]
    cleaned = app_main._coerce_field_payloads(raw)
    assert len(cleaned) == 1
    # Tuple should be converted to the [x1, y1, x2, y2] list format.
    assert cleaned[0]["rect"] == [10.0, 20.0, 50.0, 60.0]
