"""Validate and materialize DullyPDF calculation fields before PDF export."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_DOWN, ROUND_FLOOR
from typing import Any, Dict, Iterable, List, Mapping, Optional

from backend.logging_config import get_logger
from backend.services.app_config import calculation_fields_enabled


CALCULATED_FIELD_ROLES = {"calculated_output", "calculated_intermediate"}
FORMULA_BINARY_OPERATORS = {"+", "-", "*", "/"}
NUMERIC_VALUE_TYPES = {"integer", "decimal"}
logger = get_logger(__name__)


class CalculationFieldError(ValueError):
    """Raised when calculation metadata cannot be safely materialized."""


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _field_id(field: Mapping[str, Any]) -> str:
    return _clean_text(field.get("id"))


def _field_name(field: Mapping[str, Any]) -> str:
    return _clean_text(field.get("name")) or _field_id(field) or "calculation field"


def _field_type(field: Mapping[str, Any]) -> str:
    return _clean_text(field.get("type") or "text").lower()


def _calculation(field: Mapping[str, Any]) -> Dict[str, Any]:
    raw = field.get("calculation")
    return dict(raw) if isinstance(raw, Mapping) else {}


def _role(field: Mapping[str, Any]) -> str:
    return _clean_text(_calculation(field).get("role"))


def _is_calculated_role(role: str) -> bool:
    return role in CALCULATED_FIELD_ROLES


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _extract_formula_dependencies(formula: Any) -> List[str]:
    if not isinstance(formula, Mapping):
        return []
    kind = _clean_text(formula.get("kind"))
    if kind == "field":
        field_id = _clean_text(formula.get("fieldId"))
        return [field_id] if field_id else []
    if kind == "constant":
        return []
    if kind == "unary":
        return _extract_formula_dependencies(formula.get("value"))
    if kind == "binary":
        return [
            *_extract_formula_dependencies(formula.get("left")),
            *_extract_formula_dependencies(formula.get("right")),
        ]
    return []


def _clone_fields(fields: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    cloned: List[Dict[str, Any]] = []
    for field in fields:
        next_field = dict(field)
        if isinstance(field.get("calculation"), Mapping):
            next_field["calculation"] = dict(field["calculation"])
        cloned.append(next_field)
    return cloned


def _contains_calculation_metadata(fields: Iterable[Mapping[str, Any]]) -> bool:
    return any(isinstance(field.get("calculation"), Mapping) for field in fields)


def _calculation_error_reason(error: CalculationFieldError) -> str:
    message = str(error).lower()
    if "disabled" in message:
        return "feature_disabled"
    if "duplicate ids" in message:
        return "duplicate_field_id"
    if "requires a formula" in message:
        return "missing_formula"
    if "unsupported unary operator" in message:
        return "unsupported_unary_operator"
    if "unsupported operator" in message:
        return "unsupported_operator"
    if "unsupported node" in message:
        return "unsupported_node"
    if "without an id" in message:
        return "missing_dependency_id"
    if "stable id" in message:
        return "missing_calculated_field_id"
    if "cannot reference itself" in message:
        return "self_reference"
    if "missing field" in message:
        return "missing_dependency"
    if "not a numeric calculation dependency" in message:
        return "non_numeric_dependency"
    if "circular dependency" in message:
        return "cycle"
    if "non-numeric constant" in message:
        return "non_numeric_constant"
    if "non-finite constant" in message:
        return "non_finite_constant"
    if "blank" in message:
        return "blank_dependency"
    if "divides by zero" in message:
        return "divide_by_zero"
    if "must be numeric" in message:
        return "non_numeric_input"
    if "must be finite" in message:
        return "non_finite_input"
    if "must be an integer" in message:
        return "non_integer_input"
    return "unknown"


def _log_calculation_validation_failure(error: CalculationFieldError, fields: Iterable[Mapping[str, Any]]) -> None:
    field_list = list(fields)
    calculated_count = sum(1 for field in field_list if _is_calculated_role(_role(field)))
    logger.warning(
        "Calculation field validation failed: reason=%s field_count=%s calculated_count=%s",
        _calculation_error_reason(error),
        len(field_list),
        calculated_count,
    )


def _ensure_calculation_feature_enabled(fields: Iterable[Mapping[str, Any]]) -> None:
    if calculation_fields_enabled():
        return
    if _contains_calculation_metadata(fields):
        raise CalculationFieldError("Calculation fields are disabled.")


def _value_type(field: Mapping[str, Any]) -> str:
    calculation = _calculation(field)
    output = calculation.get("output") if isinstance(calculation.get("output"), Mapping) else {}
    for candidate in (
        output.get("valueType") if isinstance(output, Mapping) else None,
        calculation.get("valueType"),
        field.get("valueType"),
    ):
        normalized = _clean_text(candidate).lower()
        if normalized in NUMERIC_VALUE_TYPES:
            return normalized
    return "integer"


def _is_formula_dependency_candidate(field: Mapping[str, Any]) -> bool:
    if _field_type(field) != "text":
        return False
    calculation = _calculation(field)
    role = _clean_text(calculation.get("role"))
    if role == "external_imported_calculation":
        imported = calculation.get("imported")
        return bool(isinstance(imported, Mapping) and imported.get("supported"))
    if role == "number_input" or _is_calculated_role(role):
        return True
    return _clean_text(field.get("valueType")).lower() in NUMERIC_VALUE_TYPES


def _build_field_id_lookup(fields: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    lookup: Dict[str, Dict[str, Any]] = {}
    duplicates: set[str] = set()
    for field in fields:
        field_id = _field_id(field)
        if not field_id:
            continue
        if field_id in lookup:
            duplicates.add(field_id)
            continue
        lookup[field_id] = field
    if duplicates:
        preview = ", ".join(sorted(duplicates)[:5])
        raise CalculationFieldError(f"Calculation field ids must be unique. Duplicate ids: {preview}.")
    return lookup


def _validate_formula_node(formula: Any, *, field_label: str) -> None:
    if not isinstance(formula, Mapping):
        raise CalculationFieldError(f"{field_label} requires a formula.")
    kind = _clean_text(formula.get("kind"))
    if kind == "constant":
        _decimal_from_constant(formula.get("value"), field_label=field_label)
        return
    if kind == "field":
        if not _clean_text(formula.get("fieldId")):
            raise CalculationFieldError(f"{field_label} formula references a field without an id.")
        return
    if kind == "unary":
        if _clean_text(formula.get("op")) != "-":
            raise CalculationFieldError(f"{field_label} formula has an unsupported unary operator.")
        _validate_formula_node(formula.get("value"), field_label=field_label)
        return
    if kind == "binary":
        if _clean_text(formula.get("op")) not in FORMULA_BINARY_OPERATORS:
            raise CalculationFieldError(f"{field_label} formula has an unsupported operator.")
        _validate_formula_node(formula.get("left"), field_label=field_label)
        _validate_formula_node(formula.get("right"), field_label=field_label)
        return
    raise CalculationFieldError(f"{field_label} formula contains an unsupported node.")


def _validate_dependencies(fields: List[Dict[str, Any]], fields_by_id: Dict[str, Dict[str, Any]]) -> List[str]:
    calculated_ids: List[str] = []
    for field in fields:
        role = _role(field)
        if not _is_calculated_role(role):
            continue
        field_id = _field_id(field)
        label = _field_name(field)
        if not field_id:
            raise CalculationFieldError(f"{label} needs a stable id before it can be calculated.")
        calculated_ids.append(field_id)
        formula = _calculation(field).get("formula")
        _validate_formula_node(formula, field_label=label)
        dependencies = _extract_formula_dependencies(formula)
        calculation = field.get("calculation")
        if isinstance(calculation, dict):
            calculation["dependencies"] = list(dict.fromkeys(dependencies))
        for dependency_id in dependencies:
            if dependency_id == field_id:
                raise CalculationFieldError(f"{label} cannot reference itself.")
            dependency = fields_by_id.get(dependency_id)
            if dependency is None:
                raise CalculationFieldError(f"{label} references a missing field.")
            if not _is_formula_dependency_candidate(dependency):
                raise CalculationFieldError(f"{_field_name(dependency)} is not a numeric calculation dependency.")
    return calculated_ids


def _topologically_order_calculated_fields(
    calculated_ids: List[str],
    fields_by_id: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    calculated_id_set = set(calculated_ids)
    visiting: set[str] = set()
    visited: set[str] = set()
    ordered: List[Dict[str, Any]] = []

    def visit(field_id: str, path: List[str]) -> None:
        if field_id in visited:
            return
        if field_id in visiting:
            cycle = " -> ".join([*path, field_id])
            raise CalculationFieldError(f"Calculation fields contain a circular dependency: {cycle}.")
        field = fields_by_id.get(field_id)
        if field is None or field_id not in calculated_id_set:
            return
        visiting.add(field_id)
        for dependency_id in _extract_formula_dependencies(_calculation(field).get("formula")):
            if dependency_id in calculated_id_set:
                visit(dependency_id, [*path, field_id])
        visiting.remove(field_id)
        visited.add(field_id)
        ordered.append(field)

    for field_id in calculated_ids:
        visit(field_id, [])
    return ordered


def _decimal_from_constant(value: Any, *, field_label: str) -> Decimal:
    if isinstance(value, bool) or value is None:
        raise CalculationFieldError(f"{field_label} formula has a non-numeric constant.")
    try:
        numeric = Decimal(str(value).strip())
    except (InvalidOperation, ValueError) as exc:
        raise CalculationFieldError(f"{field_label} formula has a non-numeric constant.") from exc
    if not numeric.is_finite():
        raise CalculationFieldError(f"{field_label} formula has a non-finite constant.")
    return numeric


def _decimal_from_field_value(
    source_field: Mapping[str, Any],
    field_values: Mapping[str, Any],
    *,
    blank_input_behavior: str,
) -> Optional[Decimal]:
    field_id = _field_id(source_field)
    label = _field_name(source_field)
    value = field_values.get(field_id)
    if _is_blank(value):
        if blank_input_behavior == "blank_result":
            return None
        if blank_input_behavior == "validation_error":
            raise CalculationFieldError(f"{label} is blank.")
        return Decimal("0")
    try:
        numeric = Decimal(str(value).strip())
    except (InvalidOperation, ValueError) as exc:
        raise CalculationFieldError(f"{label} must be numeric.") from exc
    if not numeric.is_finite():
        raise CalculationFieldError(f"{label} must be finite.")
    if _value_type(source_field) == "integer" and numeric != numeric.to_integral_value():
        raise CalculationFieldError(f"{label} must be an integer.")
    return numeric


def _evaluate_formula_node(
    formula: Any,
    *,
    fields_by_id: Mapping[str, Mapping[str, Any]],
    field_values: Mapping[str, Any],
    field_label: str,
    blank_input_behavior: str,
    divide_by_zero_behavior: str,
) -> Optional[Decimal]:
    kind = _clean_text(formula.get("kind")) if isinstance(formula, Mapping) else ""
    if kind == "constant":
        return _decimal_from_constant(formula.get("value"), field_label=field_label)
    if kind == "field":
        dependency_id = _clean_text(formula.get("fieldId"))
        dependency = fields_by_id.get(dependency_id)
        if dependency is None:
            raise CalculationFieldError(f"{field_label} references a missing field.")
        return _decimal_from_field_value(
            dependency,
            field_values,
            blank_input_behavior=blank_input_behavior,
        )
    if kind == "unary":
        value = _evaluate_formula_node(
            formula.get("value"),
            fields_by_id=fields_by_id,
            field_values=field_values,
            field_label=field_label,
            blank_input_behavior=blank_input_behavior,
            divide_by_zero_behavior=divide_by_zero_behavior,
        )
        return None if value is None else -value
    if kind != "binary":
        raise CalculationFieldError(f"{field_label} formula contains an unsupported node.")

    left = _evaluate_formula_node(
        formula.get("left"),
        fields_by_id=fields_by_id,
        field_values=field_values,
        field_label=field_label,
        blank_input_behavior=blank_input_behavior,
        divide_by_zero_behavior=divide_by_zero_behavior,
    )
    right = _evaluate_formula_node(
        formula.get("right"),
        fields_by_id=fields_by_id,
        field_values=field_values,
        field_label=field_label,
        blank_input_behavior=blank_input_behavior,
        divide_by_zero_behavior=divide_by_zero_behavior,
    )
    if left is None or right is None:
        return None
    operator = _clean_text(formula.get("op"))
    if operator == "+":
        return left + right
    if operator == "-":
        return left - right
    if operator == "*":
        return left * right
    if operator == "/":
        if right == 0:
            if divide_by_zero_behavior == "validation_error":
                raise CalculationFieldError(f"{field_label} divides by zero.")
            return None
        return left / right
    raise CalculationFieldError(f"{field_label} formula has an unsupported operator.")


def _round_decimal(value: Decimal, mode: str) -> Decimal:
    if mode == "floor":
        return value.to_integral_value(rounding=ROUND_FLOOR)
    if mode == "ceil":
        return value.to_integral_value(rounding=ROUND_CEILING)
    if mode == "truncate":
        return value.to_integral_value(rounding=ROUND_DOWN)
    # Match JavaScript Math.round so backend materialization mirrors the UI preview.
    return (value + Decimal("0.5")).to_integral_value(rounding=ROUND_FLOOR)


def _format_decimal(value: Decimal) -> str:
    if value == value.to_integral_value():
        return str(int(value))
    rendered = format(value.normalize(), "f")
    return rendered.rstrip("0").rstrip(".") or "0"


def _format_evaluation_result(value: Optional[Decimal], field: Mapping[str, Any]) -> str:
    if value is None:
        return ""
    calculation = _calculation(field)
    output = calculation.get("output") if isinstance(calculation.get("output"), Mapping) else {}
    value_type = _value_type(field)
    if value_type == "integer":
        rounding = _clean_text(output.get("rounding") if isinstance(output, Mapping) else None) or "round"
        value = _round_decimal(value, rounding)
    return _format_decimal(value)


def _validate_number_inputs(fields: Iterable[Mapping[str, Any]]) -> None:
    for field in fields:
        if _role(field) != "number_input":
            continue
        value = field.get("value")
        if _is_blank(value):
            continue
        try:
            numeric = Decimal(str(value).strip())
        except (InvalidOperation, ValueError) as exc:
            raise CalculationFieldError(f"{_field_name(field)} must be numeric.") from exc
        if not numeric.is_finite():
            raise CalculationFieldError(f"{_field_name(field)} must be finite.")
        if numeric != numeric.to_integral_value():
            raise CalculationFieldError(f"{_field_name(field)} must be an integer.")


def materialize_calculated_fields(fields: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Return fields with DullyPDF-owned calculated values filled in.

    Validation and evaluation are O(F + E), where F is the number of fields and
    E is the number of formula references. The topological walk ensures chained
    calculated intermediates are resolved before downstream outputs.
    """
    try:
        _ensure_calculation_feature_enabled(fields)
        if not _contains_calculation_metadata(fields):
            return [dict(field) for field in fields]

        materialized = _clone_fields(fields)
        fields_by_id = _build_field_id_lookup(materialized)
        calculated_ids = _validate_dependencies(materialized, fields_by_id)
        _validate_number_inputs(materialized)
        ordered_fields = _topologically_order_calculated_fields(calculated_ids, fields_by_id)

        field_values: Dict[str, Any] = {
            field_id: field.get("value")
            for field_id, field in fields_by_id.items()
        }
        for field in ordered_fields:
            calculation = _calculation(field)
            output = calculation.get("output") if isinstance(calculation.get("output"), Mapping) else {}
            value = _evaluate_formula_node(
                calculation.get("formula"),
                fields_by_id=fields_by_id,
                field_values=field_values,
                field_label=_field_name(field),
                blank_input_behavior=(
                    _clean_text(output.get("blankInputBehavior") if isinstance(output, Mapping) else None)
                    or "treat_as_zero"
                ),
                divide_by_zero_behavior=(
                    _clean_text(output.get("divideByZeroBehavior") if isinstance(output, Mapping) else None)
                    or "blank_result"
                ),
            )
            rendered_value = _format_evaluation_result(value, field)
            field["value"] = rendered_value
            field["readOnly"] = True
            field_values[_field_id(field)] = rendered_value

        for field in materialized:
            if _is_calculated_role(_role(field)):
                field["readOnly"] = True
        return materialized
    except CalculationFieldError as error:
        _log_calculation_validation_failure(error, fields)
        raise


def calculated_field_export_order(fields: List[Dict[str, Any]]) -> List[str]:
    """Return calculated field ids in dependency order for AcroForm /CO export."""
    try:
        _ensure_calculation_feature_enabled(fields)
        if not _contains_calculation_metadata(fields):
            return []
        cloned = _clone_fields(fields)
        fields_by_id = _build_field_id_lookup(cloned)
        calculated_ids = _validate_dependencies(cloned, fields_by_id)
        ordered_fields = _topologically_order_calculated_fields(calculated_ids, fields_by_id)
        return [_field_id(field) for field in ordered_fields if _field_id(field)]
    except CalculationFieldError as error:
        _log_calculation_validation_failure(error, fields)
        raise
