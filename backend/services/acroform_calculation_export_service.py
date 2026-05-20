"""AcroForm calculation export helpers.

This is the export-side counterpart to ``acroform_calculation_import_service``.
It owns the logic that turns DullyPDF's safe calculation model into the PDF
artifacts viewers expect: Acrobat JavaScript actions, the AcroForm ``/CO``
calculation order, and embedded DullyPDF metadata used by future imports.

The module is intentionally self-contained so the writer in ``form_filler`` can
delegate calculation export without becoming a calculation module itself.
"""

import json
import math
from typing import Any, Dict, List, Optional, Tuple

from pypdf import PdfWriter
from pypdf.generic import (
    ArrayObject,
    DictionaryObject,
    NameObject,
    NumberObject,
    TextStringObject,
)

from .acroform_calculation_import_service import (
    DULLYPDF_CALCULATION_METADATA_INFO_KEY,
    DULLYPDF_CALCULATION_METADATA_SCHEMA,
)
from .calculation_field_service import calculated_field_export_order

# PDF field flag bit: ReadOnly (PDF spec). Duplicated here so the export module
# does not need to import from form_filler.
FLAG_READ_ONLY = 1 << 0

DULLYPDF_CALCULATION_METADATA_KEY = f"/{DULLYPDF_CALCULATION_METADATA_INFO_KEY}"


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _pdf_object_matches(entry: Any, target_ref: Any, target_obj: DictionaryObject) -> bool:
    if entry is target_ref or entry == target_ref:
        return True
    try:
        entry_obj = entry.get_object()
    except AttributeError:
        entry_obj = entry
    return entry_obj is target_obj


def _pdf_object_list_contains(entries: ArrayObject, target_ref: Any, target_obj: DictionaryObject) -> bool:
    for entry in list(entries):
        if _pdf_object_matches(entry, target_ref, target_obj):
            return True
    return False


def _field_calculation(field: Dict[str, Any]) -> Dict[str, Any]:
    raw = field.get("calculation")
    return dict(raw) if isinstance(raw, dict) else {}


def _calculation_role(field: Dict[str, Any]) -> str:
    return str(_field_calculation(field).get("role") or "").strip()


def _is_number_input_field(field: Dict[str, Any]) -> bool:
    return str(field.get("type") or "text").strip().lower() == "text" and _calculation_role(field) == "number_input"


def _is_calculated_field(field: Dict[str, Any]) -> bool:
    return str(field.get("type") or "text").strip().lower() == "text" and _calculation_role(field) in {
        "calculated_output",
        "calculated_intermediate",
    }


def _calculation_output(field: Dict[str, Any]) -> Dict[str, Any]:
    output = _field_calculation(field).get("output")
    return dict(output) if isinstance(output, dict) else {}


def _calculation_value_type(field: Dict[str, Any]) -> str:
    calculation = _field_calculation(field)
    output = _calculation_output(field)
    for value in (
        output.get("valueType"),
        calculation.get("valueType"),
        field.get("valueType"),
    ):
        normalized = str(value or "").strip().lower()
        if normalized in {"integer", "decimal"}:
            return normalized
    return "integer"


def _calculation_decimal_places(field: Dict[str, Any]) -> int:
    return 0 if _calculation_value_type(field) == "integer" else 2


def _safe_json_clone(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=True, separators=(",", ":")))


def _field_rect_metadata(field: Dict[str, Any]) -> Optional[Dict[str, float]]:
    rect = field.get("rect")
    if isinstance(rect, list) and len(rect) == 4:
        try:
            x1, y1, x2, y2 = (float(v) for v in rect)
        except (TypeError, ValueError):
            return None
        width = x2 - x1
        height = y2 - y1
        if width <= 0 or height <= 0:
            return None
        return {"x": x1, "y": y1, "width": width, "height": height}

    x = field.get("x")
    y = field.get("y")
    width = field.get("width")
    height = field.get("height")
    if x is None or y is None or width is None or height is None:
        return None
    try:
        x_f = float(x)
        y_f = float(y)
        w_f = float(width)
        h_f = float(height)
    except (TypeError, ValueError):
        return None
    if w_f <= 0 or h_f <= 0:
        return None
    return {"x": x_f, "y": y_f, "width": w_f, "height": h_f}


def _field_calculation_metadata(field: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not (_is_number_input_field(field) or _is_calculated_field(field)):
        return None
    name = str(field.get("name") or "").strip()
    if not name:
        return None
    calculation = _safe_json_clone(_field_calculation(field))
    if not isinstance(calculation, dict) or not calculation.get("role"):
        return None
    # Generated JavaScript is disposable. The safe formula/settings payload is
    # the only calculation source of truth we preserve for future imports.
    calculation.pop("imported", None)
    metadata: Dict[str, Any] = {
        "name": name,
        "type": "text",
        "valueType": _calculation_value_type(field),
        "calculation": calculation,
    }
    if field.get("id") is not None:
        metadata["id"] = str(field.get("id"))
    try:
        metadata["page"] = int(field.get("page") or 1)
    except (TypeError, ValueError):
        metadata["page"] = 1
    rect = _field_rect_metadata(field)
    if rect is not None:
        metadata["rect"] = rect
    return metadata


def set_dullypdf_calculation_metadata(
    writer: PdfWriter,
    fields: List[Dict[str, Any]],
    *,
    logger: Any = None,
) -> None:
    """Attach the safe-calculation metadata payload to the writer's Info dict."""
    metadata_fields = [
        field_metadata
        for field in fields
        if (field_metadata := _field_calculation_metadata(field)) is not None
    ]
    if not metadata_fields:
        return
    payload = {
        "schema": DULLYPDF_CALCULATION_METADATA_SCHEMA,
        "fields": metadata_fields,
    }
    try:
        writer.add_metadata(
            {
                DULLYPDF_CALCULATION_METADATA_KEY: json.dumps(
                    payload,
                    ensure_ascii=True,
                    separators=(",", ":"),
                    sort_keys=True,
                )
            }
        )
    except Exception as error:  # pragma: no cover - defensive; PDF export can continue without metadata.
        if logger is not None:
            logger.debug("Failed to attach DullyPDF calculation metadata: %s", error)


def _js_string_literal(value: Any) -> str:
    return json.dumps(str(value or ""), ensure_ascii=True)


def _js_number_literal(value: Any) -> str:
    try:
        numeric = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Formula constants must be numeric for AcroForm export.") from exc
    if not math.isfinite(numeric):
        raise ValueError("Formula constants must be finite for AcroForm export.")
    if numeric.is_integer():
        return str(int(numeric))
    return repr(numeric)


def _formula_js_expression(
    formula: Any,
    *,
    field_names_by_id: Dict[str, str],
) -> str:
    if not isinstance(formula, dict):
        raise ValueError("Calculated fields require a formula for AcroForm export.")
    kind = str(formula.get("kind") or "").strip()
    if kind == "constant":
        return _js_number_literal(formula.get("value"))
    if kind == "field":
        field_id = str(formula.get("fieldId") or "").strip()
        field_name = field_names_by_id.get(field_id)
        if not field_name:
            raise ValueError("Calculated field references a missing field for AcroForm export.")
        return f"dullyCoerce(dullyRead({_js_string_literal(field_name)}))"
    if kind == "unary":
        if str(formula.get("op") or "").strip() != "-":
            raise ValueError("Unsupported unary operator for AcroForm export.")
        value = _formula_js_expression(formula.get("value"), field_names_by_id=field_names_by_id)
        return f"dullyUnary({value})"
    if kind == "binary":
        op = str(formula.get("op") or "").strip()
        if op not in {"+", "-", "*", "/"}:
            raise ValueError("Unsupported binary operator for AcroForm export.")
        left = _formula_js_expression(formula.get("left"), field_names_by_id=field_names_by_id)
        right = _formula_js_expression(formula.get("right"), field_names_by_id=field_names_by_id)
        return f"dullyOp({_js_string_literal(op)}, {left}, {right})"
    raise ValueError("Unsupported formula node for AcroForm export.")


def _calculation_rounding_js(field: Dict[str, Any]) -> str:
    if _calculation_value_type(field) != "integer":
        return "return String(value);"
    rounding = str(_calculation_output(field).get("rounding") or "round").strip()
    if rounding == "floor":
        return "return String(Math.floor(value));"
    if rounding == "ceil":
        return "return String(Math.ceil(value));"
    if rounding == "truncate":
        return "return String(value < 0 ? Math.ceil(value) : Math.floor(value));"
    return "return String(Math.round(value));"


def _calculation_action_javascript(
    field: Dict[str, Any],
    *,
    field_names_by_id: Dict[str, str],
) -> str:
    calculation = _field_calculation(field)
    output = _calculation_output(field)
    blank_behavior = str(output.get("blankInputBehavior") or "treat_as_zero").strip()
    blank_value = "0" if blank_behavior == "treat_as_zero" else "null"
    expression = _formula_js_expression(
        calculation.get("formula"),
        field_names_by_id=field_names_by_id,
    )
    return "\n".join(
        [
            "(function () {",
            "  function dullyRead(name) {",
            "    var field = this.getField(name);",
            "    if (!field) { return null; }",
            "    var raw = field.valueAsString;",
            "    if (raw === null || raw === undefined) { return null; }",
            "    raw = String(raw).replace(/,/g, '').trim();",
            "    if (raw === '') { return null; }",
            "    var value = Number(raw);",
            "    return isFinite(value) ? value : null;",
            "  }",
            "  function dullyCoerce(value) {",
            f"    return value === null ? {blank_value} : value;",
            "  }",
            "  function dullyUnary(value) {",
            "    return value === null ? null : -value;",
            "  }",
            "  function dullyOp(op, left, right) {",
            "    if (left === null || right === null) { return null; }",
            "    if (op === '+') { return left + right; }",
            "    if (op === '-') { return left - right; }",
            "    if (op === '*') { return left * right; }",
            "    if (op === '/' && right !== 0) { return left / right; }",
            "    return null;",
            "  }",
            "  function dullyOutput(value) {",
            "    if (value === null || !isFinite(value)) { return ''; }",
            f"    {_calculation_rounding_js(field)}",
            "  }",
            f"  event.value = dullyOutput({expression});",
            "}).call(this);",
        ]
    )


def _number_format_javascript(field: Dict[str, Any]) -> str:
    decimals = _calculation_decimal_places(field)
    return f"AFNumber_Format({decimals}, 0, 0, 0, '', true);"


def _number_keystroke_javascript(field: Dict[str, Any]) -> str:
    decimals = _calculation_decimal_places(field)
    return f"AFNumber_Keystroke({decimals}, 0, 0, 0, '', true);"


def _number_validation_javascript(field: Dict[str, Any]) -> str:
    if _calculation_value_type(field) != "integer":
        return (
            "if (event.value !== '') { "
            "var n = Number(String(event.value).replace(/,/g, '')); "
            "if (!isFinite(n)) { event.rc = false; } "
            "}"
        )
    return (
        "if (event.value !== '') { "
        "var n = Number(String(event.value).replace(/,/g, '')); "
        "if (!isFinite(n) || Math.floor(n) !== n) { event.rc = false; } "
        "}"
    )


def _ensure_additional_actions(field: DictionaryObject) -> DictionaryObject:
    actions = field.get("/AA")
    if actions is not None:
        try:
            actions = actions.get_object()
        except AttributeError:
            pass
    if not isinstance(actions, DictionaryObject):
        actions = DictionaryObject()
        field[NameObject("/AA")] = actions
    return actions


def _set_javascript_action(field: DictionaryObject, action_key: str, javascript: str) -> None:
    actions = _ensure_additional_actions(field)
    actions[NameObject(action_key)] = DictionaryObject(
        {
            NameObject("/S"): NameObject("/JavaScript"),
            NameObject("/JS"): TextStringObject(javascript),
        }
    )


def _set_field_flag(field: DictionaryObject, flag: int) -> None:
    field[NameObject("/Ff")] = NumberObject(_coerce_int(field.get("/Ff")) | flag)


def _iter_acroform_leaf_fields(
    field_ref: Any,
    *,
    parent_name: str = "",
) -> List[Tuple[str, Any, DictionaryObject]]:
    try:
        field = field_ref.get_object()
    except AttributeError:
        field = field_ref
    if not isinstance(field, DictionaryObject):
        return []
    partial_name = str(field.get("/T") or "").strip()
    full_name = ".".join(part for part in (parent_name, partial_name) if part)
    kids = field.get("/Kids")
    if kids is not None:
        try:
            kids = kids.get_object()
        except AttributeError:
            pass
    if isinstance(kids, ArrayObject):
        kids_are_widgets = bool(kids) and all(
            (
                isinstance((kid_obj := kid.get_object() if hasattr(kid, "get_object") else kid), DictionaryObject)
                and kid_obj.get("/Subtype") == "/Widget"
                and kid_obj.get("/T") is None
            )
            for kid in kids
        )
        if kids and not kids_are_widgets:
            records: List[Tuple[str, Any, DictionaryObject]] = []
            for kid in kids:
                records.extend(_iter_acroform_leaf_fields(kid, parent_name=full_name))
            return records
    return [(full_name, field_ref, field)] if full_name else []


def _acroform_fields_by_name(acroform: DictionaryObject) -> Dict[str, Tuple[Any, DictionaryObject]]:
    fields = acroform.get("/Fields")
    if fields is None:
        return {}
    try:
        fields = fields.get_object()
    except AttributeError:
        pass
    if not isinstance(fields, ArrayObject):
        return {}
    by_name: Dict[str, Tuple[Any, DictionaryObject]] = {}
    for field_ref in list(fields):
        for name, leaf_ref, leaf_field in _iter_acroform_leaf_fields(field_ref):
            by_name.setdefault(name, (leaf_ref, leaf_field))
    return by_name


def _set_calculation_order(
    acroform: DictionaryObject,
    ordered_entries: List[Tuple[Any, DictionaryObject]],
) -> None:
    if not ordered_entries:
        return
    existing = acroform.get("/CO")
    if existing is not None:
        try:
            existing = existing.get_object()
        except AttributeError:
            pass
    next_order = ArrayObject()
    if isinstance(existing, ArrayObject):
        for entry in list(existing):
            if any(_pdf_object_matches(entry, ref, field) for ref, field in ordered_entries):
                continue
            next_order.append(entry)
    for field_ref, field in ordered_entries:
        if not _pdf_object_list_contains(next_order, field_ref, field):
            next_order.append(field_ref)
    acroform[NameObject("/CO")] = next_order


def apply_calculation_acroform_behavior(
    acroform: DictionaryObject,
    fields: List[Dict[str, Any]],
) -> None:
    """Write Acrobat JS actions, ReadOnly flags, and /CO order for calc fields."""
    field_entries_by_name = _acroform_fields_by_name(acroform)
    field_names_by_id = {
        str(field.get("id") or "").strip(): str(field.get("name") or "").strip()
        for field in fields
        if str(field.get("id") or "").strip() and str(field.get("name") or "").strip()
    }
    fields_by_id = {
        str(field.get("id") or "").strip(): field
        for field in fields
        if str(field.get("id") or "").strip()
    }

    for field in fields:
        name = str(field.get("name") or "").strip()
        entry = field_entries_by_name.get(name)
        if entry is None:
            continue
        _field_ref, acroform_field = entry
        if _is_number_input_field(field):
            _set_javascript_action(acroform_field, "/K", _number_keystroke_javascript(field))
            _set_javascript_action(acroform_field, "/V", _number_validation_javascript(field))
            _set_javascript_action(acroform_field, "/F", _number_format_javascript(field))
        elif _is_calculated_field(field):
            _set_field_flag(acroform_field, FLAG_READ_ONLY)
            _set_javascript_action(
                acroform_field,
                "/C",
                _calculation_action_javascript(field, field_names_by_id=field_names_by_id),
            )
            _set_javascript_action(acroform_field, "/F", _number_format_javascript(field))

    ordered_entries: List[Tuple[Any, DictionaryObject]] = []
    for field_id in calculated_field_export_order(fields):
        field = fields_by_id.get(field_id)
        if field is None:
            continue
        entry = field_entries_by_name.get(str(field.get("name") or "").strip())
        if entry is not None:
            ordered_entries.append(entry)
    _set_calculation_order(acroform, ordered_entries)
