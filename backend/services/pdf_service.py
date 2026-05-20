"""PDF upload, validation, and payload-shape helpers."""

from __future__ import annotations

import hashlib
import io
import json
import math
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, UploadFile

from backend.detection.pdf_validation import PdfValidationError, PdfValidationResult, preflight_pdf_bytes
from backend.services.app_config import calculation_fields_enabled

# Product-facing text fields use the 12 Base 14 fonts that reliably render normal typed text.
PDF_BASE_14_FONTS = frozenset(
    {
        "Helvetica",
        "Helvetica-Bold",
        "Helvetica-Oblique",
        "Helvetica-BoldOblique",
        "Times-Roman",
        "Times-Bold",
        "Times-Italic",
        "Times-BoldItalic",
        "Courier",
        "Courier-Bold",
        "Courier-Oblique",
        "Courier-BoldOblique",
    }
)
DEFAULT_FIELD_FONT_CHOICE = "default"
GLOBAL_FIELD_FONT_CHOICE = "global"
DEFAULT_FIELD_FONT_SIZE_CHOICE = "auto"
GLOBAL_FIELD_FONT_SIZE_CHOICE = "global"
DEFAULT_FIELD_FONT_COLOR = "#000000"
GLOBAL_FIELD_FONT_COLOR_CHOICE = "global"
DEFAULT_FIELD_TEXT_ALIGNMENT = "left"
GLOBAL_FIELD_TEXT_ALIGNMENT_CHOICE = "global"
FIELD_TEXT_ALIGNMENTS = frozenset({"left", "center", "right"})
PDF_QUADDING_BY_ALIGNMENT = {"left": 0, "center": 1, "right": 2}
MIN_FIELD_FONT_SIZE_PT = 4
MAX_FIELD_FONT_SIZE_PT = 72
NUMERIC_VALUE_TYPES = frozenset({"integer", "decimal"})
CALCULATION_COMPATIBLE_FIELD_TYPES = frozenset({"text"})
CALCULATION_FIELD_ROLES = frozenset(
    {
        "none",
        "number_input",
        "calculated_output",
        "calculated_intermediate",
        "external_imported_calculation",
    }
)
FORMULA_BINARY_OPERATORS = frozenset({"+", "-", "*", "/"})
FORMULA_ROUNDING_MODES = frozenset({"round", "floor", "ceil", "truncate"})
FORMULA_BLANK_INPUT_BEHAVIORS = frozenset({"treat_as_zero", "blank_result", "validation_error"})
FORMULA_DIVIDE_BY_ZERO_BEHAVIORS = frozenset({"blank_result", "validation_error"})
CALCULATION_IMPORT_SOURCES = frozenset({"acroform_js", "dullypdf_metadata"})
MAX_FORMULA_NODE_DEPTH = 64


def sanitize_basename_segment(value: str, fallback: str) -> str:
    """Sanitize a filename segment to prevent header injection or path traversal."""
    raw = (value or fallback or "file").strip()
    base = os.path.basename(raw)
    cleaned = re.sub(r"[\r\n]", "", base)
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", cleaned)
    cleaned = re.sub(r"^\.+", "", cleaned)
    return cleaned or fallback


def safe_pdf_download_filename(name: str, fallback: str = "document") -> str:
    """Normalize filenames so browsers receive a safe, short, PDF-only value."""
    safe_base = sanitize_basename_segment(name, fallback)
    if not safe_base.lower().endswith(".pdf"):
        safe_base = f"{safe_base}.pdf"
    if len(safe_base) > 180:
        trimmed = safe_base[:180]
        if not trimmed.lower().endswith(".pdf"):
            trimmed = f"{trimmed[:176]}.pdf"
        return trimmed
    return safe_base


def log_pdf_label(name: str) -> str:
    """Return a stable, non-sensitive identifier for PDF logging."""
    safe = sanitize_basename_segment(name, "document")
    digest = hashlib.sha256(safe.encode("utf-8")).hexdigest()[:10]
    suffix = ".pdf" if safe.lower().endswith(".pdf") else ""
    return f"pdf{suffix}#{digest}"


def sha256_hex_for_bytes(raw_bytes: bytes) -> str:
    """Return the SHA-256 digest for a PDF byte stream as lowercase hex."""
    return hashlib.sha256(raw_bytes or b"").hexdigest()


def normalize_optional_pdf_sha256(value: Optional[str]) -> Optional[str]:
    """Validate and normalize an optional PDF SHA-256 fingerprint."""
    normalized = str(value or "").strip().lower()
    if not normalized:
        return None
    if not re.fullmatch(r"[0-9a-f]{64}", normalized):
        raise ValueError("sourcePdfSha256 must be a 64-character lowercase hex string")
    return normalized


def normalize_pdf_base14_font_name(value: Any) -> Optional[str]:
    """Return a text-safe PDF Base 14 font name or None."""
    normalized = str(value or "").strip()
    return normalized if normalized in PDF_BASE_14_FONTS else None


def normalize_global_field_font(value: Any) -> str:
    """Normalize a workspace-level field font setting."""
    normalized = normalize_pdf_base14_font_name(value)
    return normalized if normalized else DEFAULT_FIELD_FONT_CHOICE


def normalize_field_font_override(value: Any) -> Optional[str]:
    """Normalize a per-field font override for stored editor payloads."""
    normalized = str(value or "").strip()
    if normalized == GLOBAL_FIELD_FONT_CHOICE:
        return GLOBAL_FIELD_FONT_CHOICE
    return normalize_pdf_base14_font_name(normalized)


def _normalize_field_font_size_number(value: Any) -> Optional[float]:
    if isinstance(value, bool) or value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if numeric < MIN_FIELD_FONT_SIZE_PT or numeric > MAX_FIELD_FONT_SIZE_PT:
        return None
    return numeric


def _is_normalized_field_font_size_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def normalize_global_field_font_size(value: Any) -> str | float:
    """Normalize a workspace-level field font-size setting."""
    normalized = str(value or "").strip()
    if not normalized or normalized == DEFAULT_FIELD_FONT_SIZE_CHOICE:
        return DEFAULT_FIELD_FONT_SIZE_CHOICE
    numeric = _normalize_field_font_size_number(value)
    return numeric if numeric is not None else DEFAULT_FIELD_FONT_SIZE_CHOICE


def normalize_field_font_size_override(value: Any) -> Optional[str | float]:
    """Normalize a per-field font-size override for stored editor payloads."""
    normalized = str(value or "").strip()
    if normalized == GLOBAL_FIELD_FONT_SIZE_CHOICE:
        return GLOBAL_FIELD_FONT_SIZE_CHOICE
    if normalized == DEFAULT_FIELD_FONT_SIZE_CHOICE:
        return DEFAULT_FIELD_FONT_SIZE_CHOICE
    return _normalize_field_font_size_number(value)


def normalize_pdf_hex_color(value: Any) -> Optional[str]:
    """Return a normalized #rrggbb color string or None."""
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if not normalized.startswith("#"):
        normalized = f"#{normalized}"
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", normalized):
        return None
    return normalized.lower()


def normalize_global_field_font_color(value: Any) -> str:
    """Normalize a workspace-level text color setting."""
    return normalize_pdf_hex_color(value) or DEFAULT_FIELD_FONT_COLOR


def normalize_field_font_color_override(value: Any) -> Optional[str]:
    """Normalize a per-field text color override for stored editor payloads."""
    normalized = str(value or "").strip()
    if normalized == GLOBAL_FIELD_FONT_COLOR_CHOICE:
        return GLOBAL_FIELD_FONT_COLOR_CHOICE
    return normalize_pdf_hex_color(value)


def normalize_global_field_alignment(value: Any) -> str:
    """Normalize a workspace-level text alignment setting."""
    normalized = str(value or "").strip().lower()
    return normalized if normalized in FIELD_TEXT_ALIGNMENTS else DEFAULT_FIELD_TEXT_ALIGNMENT


def normalize_field_alignment_override(value: Any) -> Optional[str]:
    """Normalize a per-field text alignment override for stored editor payloads."""
    normalized = str(value or "").strip().lower()
    if normalized == GLOBAL_FIELD_TEXT_ALIGNMENT_CHOICE:
        return GLOBAL_FIELD_TEXT_ALIGNMENT_CHOICE
    return normalized if normalized in FIELD_TEXT_ALIGNMENTS else None


def normalize_numeric_value_type(value: Any) -> Optional[str]:
    """Return a supported numeric field value type or None."""
    normalized = str(value or "").strip().lower()
    return normalized if normalized in NUMERIC_VALUE_TYPES else None


def _coerce_payload_bool(value: Any, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    return bool(value)


def _normalize_formula_node(value: Any, *, depth: int = 0) -> Dict[str, Any]:
    """
    Validate one DullyPDF formula node and return its normalized safe shape.

    The recursive walk is O(n) over the number of formula nodes and caps depth
    so malformed payloads cannot create unbounded recursion.
    """
    if depth > MAX_FORMULA_NODE_DEPTH:
        raise ValueError("formula nesting is too deep")
    if not isinstance(value, dict):
        raise ValueError("formula nodes must be objects")
    kind = str(value.get("kind") or "").strip()
    if kind == "constant":
        raw_value = value.get("value")
        if isinstance(raw_value, bool):
            raise ValueError("formula constants must be numeric")
        try:
            numeric = float(raw_value)
        except (TypeError, ValueError) as exc:
            raise ValueError("formula constants must be numeric") from exc
        if not math.isfinite(numeric):
            raise ValueError("formula constants must be finite")
        return {"kind": "constant", "value": numeric}
    if kind == "field":
        field_id = str(value.get("fieldId") or "").strip()
        if not field_id:
            raise ValueError("formula field nodes require fieldId")
        return {"kind": "field", "fieldId": field_id}
    if kind == "unary":
        op = str(value.get("op") or "").strip()
        if op != "-":
            raise ValueError("formula unary operator must be -")
        return {
            "kind": "unary",
            "op": op,
            "value": _normalize_formula_node(value.get("value"), depth=depth + 1),
        }
    if kind == "binary":
        op = str(value.get("op") or "").strip()
        if op not in FORMULA_BINARY_OPERATORS:
            raise ValueError("formula binary operator must be one of +, -, *, /")
        return {
            "kind": "binary",
            "op": op,
            "left": _normalize_formula_node(value.get("left"), depth=depth + 1),
            "right": _normalize_formula_node(value.get("right"), depth=depth + 1),
        }
    raise ValueError("formula node kind is not supported")


def _normalize_formula_output(value: Any, *, default_value_type: str) -> Optional[Dict[str, Any]]:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("calculation.output must be an object")
    raw_value_type = value.get("valueType")
    output_value_type = normalize_numeric_value_type(raw_value_type)
    if raw_value_type is not None and output_value_type is None:
        raise ValueError("calculation.output.valueType is not supported")
    output: Dict[str, Any] = {
        "valueType": output_value_type or default_value_type,
    }
    rounding = value.get("rounding")
    if rounding is not None:
        normalized_rounding = str(rounding or "").strip()
        if normalized_rounding not in FORMULA_ROUNDING_MODES:
            raise ValueError("calculation.output.rounding is not supported")
        output["rounding"] = normalized_rounding
    blank_input_behavior = value.get("blankInputBehavior")
    if blank_input_behavior is not None:
        normalized_blank_behavior = str(blank_input_behavior or "").strip()
        if normalized_blank_behavior not in FORMULA_BLANK_INPUT_BEHAVIORS:
            raise ValueError("calculation.output.blankInputBehavior is not supported")
        output["blankInputBehavior"] = normalized_blank_behavior
    divide_by_zero_behavior = value.get("divideByZeroBehavior")
    if divide_by_zero_behavior is not None:
        normalized_divide_behavior = str(divide_by_zero_behavior or "").strip()
        if normalized_divide_behavior not in FORMULA_DIVIDE_BY_ZERO_BEHAVIORS:
            raise ValueError("calculation.output.divideByZeroBehavior is not supported")
        output["divideByZeroBehavior"] = normalized_divide_behavior
    return output


def _normalize_imported_calculation_metadata(value: Any) -> Optional[Dict[str, Any]]:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("calculation.imported must be an object")
    source = str(value.get("source") or "").strip()
    if source not in CALCULATION_IMPORT_SOURCES:
        raise ValueError("calculation.imported.source is not supported")
    imported: Dict[str, Any] = {
        "source": source,
        "supported": _coerce_payload_bool(value.get("supported"), default=False),
    }
    for key in ("reason", "rawActionSummary"):
        raw = value.get(key)
        if raw is not None:
            imported[key] = str(raw)
    return imported


def normalize_calculation_metadata(value: Any) -> Optional[Dict[str, Any]]:
    """Normalize DullyPDF calculation metadata without evaluating field dependencies."""
    if value is None:
        return None
    if not calculation_fields_enabled():
        raise ValueError("calculation fields are disabled")
    if not isinstance(value, dict):
        raise ValueError("field calculation must be an object")
    role = str(value.get("role") or "").strip()
    if role not in CALCULATION_FIELD_ROLES:
        raise ValueError("calculation.role is not supported")
    raw_value_type = value.get("valueType")
    value_type = normalize_numeric_value_type(raw_value_type)
    if raw_value_type is not None and value_type is None:
        raise ValueError("calculation.valueType is not supported")
    value_type = value_type or "integer"
    normalized: Dict[str, Any] = {
        "role": role,
        "valueType": value_type,
    }
    if value.get("formula") is not None:
        normalized["formula"] = _normalize_formula_node(value.get("formula"))
    dependencies = value.get("dependencies")
    if dependencies is not None:
        if not isinstance(dependencies, list):
            raise ValueError("calculation.dependencies must be a list")
        normalized["dependencies"] = [
            dependency
            for entry in dependencies
            if (dependency := str(entry or "").strip())
        ]
    output = _normalize_formula_output(value.get("output"), default_value_type=value_type)
    if output is not None:
        normalized["output"] = output
    imported = _normalize_imported_calculation_metadata(value.get("imported"))
    if imported is not None:
        normalized["imported"] = imported
    return normalized


def pdf_quadding_from_alignment(value: Any) -> int:
    """Return the AcroForm /Q value for a normalized text alignment."""
    return PDF_QUADDING_BY_ALIGNMENT.get(
        normalize_global_field_alignment(value),
        PDF_QUADDING_BY_ALIGNMENT[DEFAULT_FIELD_TEXT_ALIGNMENT],
    )


def pdf_rgb_from_hex_color(value: Any) -> Tuple[float, float, float]:
    """Convert a #rrggbb color into PDF RGB operands from 0 to 1."""
    normalized = normalize_pdf_hex_color(value) or DEFAULT_FIELD_FONT_COLOR
    return (
        int(normalized[1:3], 16) / 255.0,
        int(normalized[3:5], 16) / 255.0,
        int(normalized[5:7], 16) / 255.0,
    )


def resolve_auto_field_font_size(widget_height: Any) -> float:
    """Return the legacy automatic text appearance font size for a widget height."""
    try:
        height = float(widget_height)
    except (TypeError, ValueError):
        height = 0.0
    return max(6.0, min(12.0, height * 0.65))


def normalize_field_appearance_payload(value: Any) -> Dict[str, Any]:
    """Normalize stored field appearance settings with backwards-compatible defaults."""
    appearance = value if isinstance(value, dict) else {}
    return {
        "globalFieldFont": normalize_global_field_font(appearance.get("globalFieldFont")),
        "globalFieldFontSize": normalize_global_field_font_size(appearance.get("globalFieldFontSize")),
        "globalFieldFontColor": normalize_global_field_font_color(appearance.get("globalFieldFontColor")),
        "globalFieldAlignment": normalize_global_field_alignment(appearance.get("globalFieldAlignment")),
    }


def resolve_effective_field_font(
    field: Dict[str, Any],
    *,
    global_field_font: Any = DEFAULT_FIELD_FONT_CHOICE,
) -> Optional[str]:
    """Resolve the concrete text-safe Base 14 font for a text-like field."""
    field_type = str(field.get("type") or "text").strip().lower()
    if field_type not in {"text", "date", "combo", "combobox"}:
        return None
    field_font = normalize_field_font_override(field.get("fontName"))
    if normalize_pdf_base14_font_name(field_font):
        return field_font
    if field_font == GLOBAL_FIELD_FONT_CHOICE:
        return normalize_pdf_base14_font_name(global_field_font)
    return None


def resolve_effective_field_font_size(
    field: Dict[str, Any],
    *,
    global_field_font_size: Any = DEFAULT_FIELD_FONT_SIZE_CHOICE,
    auto_size: Any,
) -> Optional[float]:
    """Resolve the concrete PDF point size for a text-like field."""
    field_type = str(field.get("type") or "text").strip().lower()
    if field_type not in {"text", "date", "combo", "combobox"}:
        return None

    try:
        resolved_auto_size = float(auto_size)
    except (TypeError, ValueError):
        resolved_auto_size = resolve_auto_field_font_size(0.0)
    if resolved_auto_size <= 0 or resolved_auto_size != resolved_auto_size:
        resolved_auto_size = resolve_auto_field_font_size(0.0)
    field_font_size = normalize_field_font_size_override(field.get("fontSize"))
    if _is_normalized_field_font_size_number(field_font_size):
        return float(field_font_size)
    if field_font_size == DEFAULT_FIELD_FONT_SIZE_CHOICE:
        return resolved_auto_size

    global_font_size = normalize_global_field_font_size(global_field_font_size)
    if _is_normalized_field_font_size_number(global_font_size):
        return float(global_font_size)
    return resolved_auto_size


def resolve_effective_field_font_color(
    field: Dict[str, Any],
    *,
    global_field_font_color: Any = DEFAULT_FIELD_FONT_COLOR,
) -> Optional[str]:
    """Resolve the concrete #rrggbb text color for a text-like field."""
    field_type = str(field.get("type") or "text").strip().lower()
    if field_type not in {"text", "date", "combo", "combobox"}:
        return None
    field_color = normalize_field_font_color_override(field.get("fontColor"))
    if field_color and field_color != GLOBAL_FIELD_FONT_COLOR_CHOICE:
        return field_color
    return normalize_global_field_font_color(global_field_font_color)


def resolve_effective_field_alignment(
    field: Dict[str, Any],
    *,
    global_field_alignment: Any = DEFAULT_FIELD_TEXT_ALIGNMENT,
) -> Optional[str]:
    """Resolve the concrete text alignment for a text-like field."""
    field_type = str(field.get("type") or "text").strip().lower()
    if field_type not in {"text", "date", "combo", "combobox"}:
        return None
    field_alignment = normalize_field_alignment_override(field.get("textAlign"))
    if field_alignment and field_alignment != GLOBAL_FIELD_TEXT_ALIGNMENT_CHOICE:
        return field_alignment
    return normalize_global_field_alignment(global_field_alignment)


def should_write_field_font_size_default_appearance(
    field: Dict[str, Any],
    *,
    global_field_font_size: Any = DEFAULT_FIELD_FONT_SIZE_CHOICE,
) -> bool:
    """Return True when a field's /DA should carry an explicit font size."""
    field_type = str(field.get("type") or "text").strip().lower()
    if field_type not in {"text", "date", "combo", "combobox"}:
        return False

    field_font_size = normalize_field_font_size_override(field.get("fontSize"))
    if _is_normalized_field_font_size_number(field_font_size):
        return True
    if field_font_size == DEFAULT_FIELD_FONT_SIZE_CHOICE:
        return True

    global_font_size = normalize_global_field_font_size(global_field_font_size)
    return _is_normalized_field_font_size_number(global_font_size)


def should_write_field_font_color_default_appearance(
    field: Dict[str, Any],
    *,
    global_field_font_color: Any = DEFAULT_FIELD_FONT_COLOR,
) -> bool:
    """Return True when a field's /DA should carry an explicit text color."""
    field_type = str(field.get("type") or "text").strip().lower()
    if field_type not in {"text", "date", "combo", "combobox"}:
        return False
    field_color = normalize_field_font_color_override(field.get("fontColor"))
    if field_color and field_color != GLOBAL_FIELD_FONT_COLOR_CHOICE:
        return True
    global_color = normalize_global_field_font_color(global_field_font_color)
    return global_color != DEFAULT_FIELD_FONT_COLOR


def cleanup_paths(paths: List[Path]) -> None:
    """Best-effort cleanup for temp files."""
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except Exception:
            continue


def rect_list_from_xywh(x: Any, y: Any, width: Any, height: Any) -> Optional[List[float]]:
    """Convert x/y/width/height into [x1, y1, x2, y2] or return None on invalid inputs."""
    try:
        x1 = float(x)
        y1 = float(y)
        w = float(width)
        h = float(height)
    except (TypeError, ValueError):
        return None
    return [x1, y1, x1 + w, y1 + h]


def rect_list_from_corners(x1: Any, y1: Any, x2: Any, y2: Any) -> Optional[List[float]]:
    """Convert corner coordinates into [x1, y1, x2, y2] or return None on invalid inputs."""
    try:
        return [float(x1), float(y1), float(x2), float(y2)]
    except (TypeError, ValueError):
        return None


def coerce_field_payloads(raw_fields: List[Any]) -> List[Dict[str, Any]]:
    """Normalize incoming field payloads to the expected dict shape."""
    cleaned: List[Dict[str, Any]] = []
    for entry in raw_fields:
        if not isinstance(entry, dict):
            continue
        payload = dict(entry)
        field_type = str(payload.get("type") or "text").strip().lower()
        if field_type == "date":
            field_type = "text"
            payload["type"] = field_type
        font_name = normalize_field_font_override(payload.get("fontName"))
        if font_name and field_type in {"text", "combo", "combobox"}:
            payload["fontName"] = font_name
        else:
            payload.pop("fontName", None)
        font_size = normalize_field_font_size_override(payload.get("fontSize"))
        if font_size is not None and field_type in {"text", "combo", "combobox"}:
            payload["fontSize"] = font_size
        else:
            payload.pop("fontSize", None)
        font_color = normalize_field_font_color_override(payload.get("fontColor"))
        if font_color is not None and field_type in {"text", "combo", "combobox"}:
            payload["fontColor"] = font_color
        else:
            payload.pop("fontColor", None)
        text_alignment = normalize_field_alignment_override(payload.get("textAlign"))
        if text_alignment is not None and field_type in {"text", "combo", "combobox"}:
            payload["textAlign"] = text_alignment
        else:
            payload.pop("textAlign", None)
        if "readOnly" in payload or "readonly" in payload:
            payload["readOnly"] = _coerce_payload_bool(payload.get("readOnly", payload.get("readonly")))
            payload.pop("readonly", None)
        if "required" in payload:
            payload["required"] = _coerce_payload_bool(payload.get("required"))
        if payload.get("valueType") is not None:
            if field_type not in CALCULATION_COMPATIBLE_FIELD_TYPES:
                raise ValueError("valueType is only supported on text fields")
            value_type = normalize_numeric_value_type(payload.get("valueType"))
            if value_type is None:
                raise ValueError("valueType must be integer or decimal")
            payload["valueType"] = value_type
        else:
            payload.pop("valueType", None)
        if payload.get("calculation") is not None:
            if field_type not in CALCULATION_COMPATIBLE_FIELD_TYPES:
                raise ValueError("calculation metadata is only supported on text fields")
            payload["calculation"] = normalize_calculation_metadata(payload.get("calculation"))
        else:
            payload.pop("calculation", None)
        rect_list: Optional[List[float]] = None
        rect = payload.get("rect")
        if isinstance(rect, dict):
            if {"x", "y", "width", "height"}.issubset(rect):
                rect_list = rect_list_from_xywh(rect.get("x"), rect.get("y"), rect.get("width"), rect.get("height"))
                for key in ("x", "y", "width", "height"):
                    if key not in payload and key in rect:
                        payload[key] = rect[key]
            elif {"x1", "y1", "x2", "y2"}.issubset(rect):
                rect_list = rect_list_from_corners(rect.get("x1"), rect.get("y1"), rect.get("x2"), rect.get("y2"))
        elif isinstance(rect, (list, tuple)) and len(rect) == 4:
            rect_list = rect_list_from_corners(rect[0], rect[1], rect[2], rect[3])

        if rect_list is None:
            rect_list = rect_list_from_xywh(
                payload.get("x"),
                payload.get("y"),
                payload.get("width"),
                payload.get("height"),
            )

        if rect_list is not None:
            payload["rect"] = rect_list
            x1, y1, x2, y2 = rect_list
            payload.setdefault("x", x1)
            payload.setdefault("y", y1)
            payload.setdefault("width", x2 - x1)
            payload.setdefault("height", y2 - y1)
        elif isinstance(rect, dict):
            payload["rect"] = None
        cleaned.append(payload)
    return cleaned


def get_pdf_page_count(pdf_bytes: bytes) -> int:
    """Return the number of pages in a PDF byte stream."""
    import fitz

    if not pdf_bytes:
        return 0
    with fitz.open(stream=io.BytesIO(pdf_bytes), filetype="pdf") as doc:
        return max(1, int(doc.page_count))


def validate_pdf_for_detection(pdf_bytes: bytes) -> PdfValidationResult:
    try:
        return preflight_pdf_bytes(pdf_bytes)
    except PdfValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def resolve_upload_limit() -> tuple[int, int]:
    """Resolve the max upload size for PDFs."""
    try:
        max_mb = int(os.getenv("SANDBOX_MAX_UPLOAD_MB", "50"))
    except ValueError:
        max_mb = 50
    if max_mb < 1:
        max_mb = 1
    return max_mb, max_mb * 1024 * 1024


def parse_json_list_form_field(raw: Optional[str], field_name: str) -> Optional[List[Dict[str, Any]]]:
    """Parse an optional JSON list payload from a multipart form field."""
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name} payload") from exc
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a JSON array")
    return [entry for entry in parsed if isinstance(entry, dict)]


async def read_upload_bytes(upload: UploadFile, *, max_bytes: int, limit_message: str) -> bytes:
    """Read an UploadFile into memory with a hard size cap."""
    chunk_size = 1024 * 1024
    buffer = bytearray()
    total = 0
    while True:
        chunk = await upload.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail=limit_message)
        buffer.extend(chunk)
    return bytes(buffer)


def write_upload_to_temp(upload: UploadFile, *, max_bytes: int, limit_message: str) -> Path:
    """Write UploadFile to a temp PDF while enforcing a max byte limit."""
    suffix = ".pdf" if (upload.filename or "").lower().endswith(".pdf") else ""
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        total = 0
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                tmp.flush()
                tmp.close()
                Path(tmp.name).unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=limit_message)
            tmp.write(chunk)
        return Path(tmp.name)
