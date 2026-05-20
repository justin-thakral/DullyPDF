"""Import calculation-related AcroForm metadata without executing PDF JavaScript."""

from __future__ import annotations

import io
import json
import re
from collections.abc import Mapping
from typing import Any, Dict, Iterable, List, Optional, Tuple

from pypdf import PdfReader
from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject

from backend.logging_config import get_logger
from backend.services.app_config import calculation_fields_enabled
from backend.services.pdf_service import normalize_calculation_metadata

FIELD_FLAG_READ_ONLY = 1 << 0
FIELD_FLAG_REQUIRED = 1 << 1
RECT_MATCH_TOLERANCE = 4.0
MAX_ACTION_SUMMARY_CHARS = 180
DULLYPDF_CALCULATION_METADATA_INFO_KEY = "DullyPDFCalculations"
DULLYPDF_CALCULATION_METADATA_SCHEMA = "dullypdf.calculations.v1"
logger = get_logger(__name__)


def _resolve_pdf_object(value: Any) -> Any:
    """Resolve pypdf indirect objects while tolerating malformed references."""
    try:
        return value.get_object()
    except Exception:
        return value


def _indirect_key(value: Any) -> Optional[Tuple[int, int]]:
    """Return a stable key for indirect references used by /Annots and /CO."""
    if isinstance(value, IndirectObject):
        return (int(value.idnum), int(value.generation))
    indirect_reference = getattr(value, "indirect_reference", None)
    if isinstance(indirect_reference, IndirectObject):
        return (int(indirect_reference.idnum), int(indirect_reference.generation))
    return None


def _name_value(value: Any) -> str:
    return str(value or "").strip()


def _numeric_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _iter_pdf_array(value: Any) -> Iterable[Any]:
    resolved = _resolve_pdf_object(value)
    if isinstance(resolved, (list, tuple, ArrayObject)):
        return resolved
    return []


def _as_dictionary(value: Any) -> Optional[DictionaryObject]:
    resolved = _resolve_pdf_object(value)
    return resolved if isinstance(resolved, DictionaryObject) else None


def _extract_js_text(action: Any) -> List[str]:
    """Collect JavaScript text for classification only; callers must not persist it."""
    action_object = _resolve_pdf_object(action)
    if isinstance(action_object, DictionaryObject):
        texts: List[str] = []
        js_value = action_object.get("/JS")
        if js_value is not None:
            resolved_js = _resolve_pdf_object(js_value)
            if isinstance(resolved_js, (str, bytes)):
                texts.append(resolved_js.decode("utf-8", "ignore") if isinstance(resolved_js, bytes) else resolved_js)
        next_action = action_object.get("/Next")
        if next_action is not None:
            texts.extend(_extract_js_text(next_action))
        return texts
    if isinstance(action_object, (list, tuple, ArrayObject)):
        texts: List[str] = []
        for item in action_object:
            texts.extend(_extract_js_text(item))
        return texts
    return []


def _action_keys(additional_actions: Dict[str, Any]) -> List[str]:
    return sorted(key for key, value in additional_actions.items() if value is not None)


def _merge_additional_actions(parent: Dict[str, Any], field: DictionaryObject) -> Dict[str, Any]:
    merged = dict(parent)
    field_actions = _as_dictionary(field.get("/AA"))
    if not field_actions:
        return merged
    for key, value in field_actions.items():
        merged[str(key)] = value
    return merged


def _infer_numeric_value_type(js_texts: Iterable[str]) -> Optional[str]:
    combined = "\n".join(js_texts)
    if not combined:
        return None
    if re.search(r"AFNumber_(?:Format|Keystroke)\s*\(\s*0\b", combined):
        return "integer"
    if re.search(r"AFNumber_(?:Format|Keystroke)\s*\(\s*[1-9]\d*\b", combined):
        return "decimal"
    if "AFNumber_" in combined or "AFSpecial_Keystroke" in combined:
        return "decimal"
    return None


def _action_summary(action_keys: List[str], *, in_calculation_order: bool) -> str:
    parts: List[str] = []
    if action_keys:
        parts.append(f"AcroForm additional action keys: {', '.join(action_keys)}")
    if in_calculation_order:
        parts.append("AcroForm calculation order entry present")
    summary = "; ".join(parts) or "AcroForm calculation metadata present"
    if len(summary) > MAX_ACTION_SUMMARY_CHARS:
        return f"{summary[:MAX_ACTION_SUMMARY_CHARS - 1]}..."
    return summary


def _rect_to_origin_top(rect: Any, page_height: Optional[float]) -> Optional[Dict[str, float]]:
    rect_values = list(_iter_pdf_array(rect))
    if len(rect_values) != 4:
        return None
    try:
        x1, y1, x2, y2 = [float(value) for value in rect_values]
    except (TypeError, ValueError):
        return None
    left = min(x1, x2)
    right = max(x1, x2)
    bottom = min(y1, y2)
    top = max(y1, y2)
    height = top - bottom
    if page_height is None:
        y = bottom
    else:
        y = float(page_height) - top
    return {"x": left, "y": y, "width": right - left, "height": height}


def _build_widget_page_lookup(reader: PdfReader) -> Dict[Tuple[int, int], Dict[str, Any]]:
    lookup: Dict[Tuple[int, int], Dict[str, Any]] = {}
    for page_index, page in enumerate(reader.pages, start=1):
        try:
            page_height = float(page.mediabox.height)
        except Exception:
            page_height = None
        for annotation_ref in _iter_pdf_array(page.get("/Annots")):
            key = _indirect_key(annotation_ref)
            if not key:
                continue
            annotation = _as_dictionary(annotation_ref)
            if not annotation:
                continue
            lookup[key] = {
                "page": page_index,
                "pageHeight": page_height,
                "rect": _rect_to_origin_top(annotation.get("/Rect"), page_height),
            }
    return lookup


def _collect_calculation_order_refs(acroform: DictionaryObject) -> set[Tuple[int, int]]:
    return {
        key
        for key in (_indirect_key(item) for item in _iter_pdf_array(acroform.get("/CO")))
        if key is not None
    }


def _widget_infos(
    field: DictionaryObject,
    field_ref: Any,
    kids: List[Any],
    widget_page_lookup: Dict[Tuple[int, int], Dict[str, Any]],
) -> List[Dict[str, Any]]:
    candidates: List[Any] = [field_ref]
    candidates.extend(kids)
    infos: List[Dict[str, Any]] = []
    for candidate in candidates:
        candidate_dict = _as_dictionary(candidate)
        if not candidate_dict:
            continue
        if candidate_dict.get("/Subtype") != "/Widget" and candidate_dict.get("/Rect") is None:
            continue
        key = _indirect_key(candidate)
        page_info = widget_page_lookup.get(key) if key else None
        rect = page_info.get("rect") if page_info else None
        if rect is None:
            rect = _rect_to_origin_top(candidate_dict.get("/Rect"), page_info.get("pageHeight") if page_info else None)
        infos.append(
            {
                "refKey": key,
                "page": page_info.get("page") if page_info else None,
                "rect": rect,
            }
        )
    return infos


def _field_ref_keys(field_ref: Any, kids: List[Any]) -> set[Tuple[int, int]]:
    keys = {_indirect_key(field_ref)}
    keys.update(_indirect_key(kid) for kid in kids)
    return {key for key in keys if key is not None}


def _build_imported_calculation_metadata(
    *,
    action_keys: List[str],
    in_calculation_order: bool,
    value_type: str,
) -> Dict[str, Any]:
    reason = "unsupported_acroform_javascript" if "/C" in action_keys else "calculation_order_only"
    return normalize_calculation_metadata(
        {
            "role": "external_imported_calculation",
            "valueType": value_type,
            "imported": {
                "source": "acroform_js",
                "supported": False,
                "reason": reason,
                "rawActionSummary": _action_summary(action_keys, in_calculation_order=in_calculation_order),
            },
        }
    )


def _record_for_leaf_field(
    *,
    name: str,
    field_type: str,
    flags: int,
    action_keys: List[str],
    js_texts: List[str],
    in_calculation_order: bool,
    widgets: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not name:
        return None
    record: Dict[str, Any] = {
        "name": name,
        "fieldType": field_type,
        "readOnly": bool(flags & FIELD_FLAG_READ_ONLY),
        "required": bool(flags & FIELD_FLAG_REQUIRED),
    }
    if widgets:
        first_widget = widgets[0]
        if first_widget.get("page") is not None:
            record["page"] = first_widget["page"]
        if first_widget.get("rect") is not None:
            record["rect"] = first_widget["rect"]

    numeric_value_type = _infer_numeric_value_type(js_texts)
    has_calculation = "/C" in action_keys or in_calculation_order
    if field_type == "/Tx" and has_calculation:
        value_type = numeric_value_type or "decimal"
        record["valueType"] = value_type
        record["calculation"] = _build_imported_calculation_metadata(
            action_keys=action_keys,
            in_calculation_order=in_calculation_order,
            value_type=value_type,
        )
    elif field_type == "/Tx" and numeric_value_type:
        record["valueType"] = numeric_value_type
    return record


def _walk_acroform_field(
    *,
    field_ref: Any,
    parent_name: str,
    inherited_field_type: str,
    inherited_flags: int,
    inherited_actions: Dict[str, Any],
    calculation_order_refs: set[Tuple[int, int]],
    widget_page_lookup: Dict[Tuple[int, int], Dict[str, Any]],
    records: List[Dict[str, Any]],
) -> None:
    field = _as_dictionary(field_ref)
    if not field:
        return
    partial_name = _name_value(field.get("/T"))
    full_name = ".".join(part for part in (parent_name, partial_name) if part)
    field_type = _name_value(field.get("/FT")) or inherited_field_type
    flags = _numeric_int(field.get("/Ff"), inherited_flags) if field.get("/Ff") is not None else inherited_flags
    actions = _merge_additional_actions(inherited_actions, field)
    kids = list(_iter_pdf_array(field.get("/Kids")))
    kids_are_widgets = bool(kids) and all(
        (_as_dictionary(kid) or {}).get("/Subtype") == "/Widget" and (_as_dictionary(kid) or {}).get("/T") is None
        for kid in kids
    )

    if kids and not kids_are_widgets:
        for kid in kids:
            _walk_acroform_field(
                field_ref=kid,
                parent_name=full_name or parent_name,
                inherited_field_type=field_type,
                inherited_flags=flags,
                inherited_actions=actions,
                calculation_order_refs=calculation_order_refs,
                widget_page_lookup=widget_page_lookup,
                records=records,
            )
        return

    ref_keys = _field_ref_keys(field_ref, kids)
    in_calculation_order = any(key in calculation_order_refs for key in ref_keys)
    action_keys = _action_keys(actions)
    js_texts: List[str] = []
    for action in actions.values():
        js_texts.extend(_extract_js_text(action))
    widgets = _widget_infos(field, field_ref, kids, widget_page_lookup)
    record = _record_for_leaf_field(
        name=full_name or parent_name,
        field_type=field_type,
        flags=flags,
        action_keys=action_keys,
        js_texts=js_texts,
        in_calculation_order=in_calculation_order,
        widgets=widgets,
    )
    if record is not None:
        records.append(record)


def _metadata_record(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _extract_dullypdf_metadata(reader: PdfReader) -> Dict[str, Dict[str, Any]]:
    metadata = _metadata_record(getattr(reader, "metadata", None) or {})
    raw = (
        metadata.get(f"/{DULLYPDF_CALCULATION_METADATA_INFO_KEY}")
        or metadata.get(DULLYPDF_CALCULATION_METADATA_INFO_KEY)
    )
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict) or parsed.get("schema") != DULLYPDF_CALCULATION_METADATA_SCHEMA:
        return {}
    fields = parsed.get("fields")
    if not isinstance(fields, list):
        return {}
    imported: Dict[str, Dict[str, Any]] = {}
    for entry in fields:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        calculation = entry.get("calculation")
        if not name or not isinstance(calculation, dict):
            continue
        try:
            normalized_calculation = normalize_calculation_metadata(calculation)
            imported_metadata = dict(normalized_calculation.get("imported") or {})
            imported_metadata.setdefault("source", "dullypdf_metadata")
            imported_metadata.setdefault("supported", True)
            normalized_calculation["imported"] = imported_metadata
            imported[name] = {
                "valueType": str(entry.get("valueType") or normalized_calculation.get("valueType") or "integer"),
                "calculation": normalized_calculation,
            }
        except ValueError:
            continue
    return imported


def analyze_acroform_calculation_fields(pdf_bytes: bytes) -> List[Dict[str, Any]]:
    """Return calculation-related field metadata found in an AcroForm.

    The pass is intentionally read-only: it inspects additional-action dictionaries
    and calculation order references but never executes or persists JavaScript.
    Walking the field tree is O(F + W), where F is AcroForm field dictionaries and
    W is page widget annotations.
    """
    if not pdf_bytes:
        return []
    if not calculation_fields_enabled():
        logger.info("AcroForm calculation import skipped: reason=feature_disabled")
        return []
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
        root = _as_dictionary(reader.trailer.get("/Root"))
        acroform = _as_dictionary(root.get("/AcroForm")) if root else None
        if not acroform:
            return []
        widget_page_lookup = _build_widget_page_lookup(reader)
        calculation_order_refs = _collect_calculation_order_refs(acroform)
        records: List[Dict[str, Any]] = []
        for field_ref in _iter_pdf_array(acroform.get("/Fields")):
            _walk_acroform_field(
                field_ref=field_ref,
                parent_name="",
                inherited_field_type="",
                inherited_flags=0,
                inherited_actions={},
                calculation_order_refs=calculation_order_refs,
                widget_page_lookup=widget_page_lookup,
                records=records,
            )

        dullypdf_metadata = _extract_dullypdf_metadata(reader)
        if dullypdf_metadata:
            for record in records:
                metadata = dullypdf_metadata.get(str(record.get("name") or ""))
                if metadata:
                    record["valueType"] = metadata["valueType"]
                    record["calculation"] = metadata["calculation"]
        _log_import_summary(records)
        return records
    except Exception:
        return []


def _log_import_summary(records: List[Dict[str, Any]]) -> None:
    supported = 0
    unsupported = 0
    dullypdf_metadata = 0
    external = 0
    for record in records:
        calculation = record.get("calculation")
        if not isinstance(calculation, dict):
            continue
        imported = calculation.get("imported")
        if isinstance(imported, dict):
            if imported.get("supported"):
                supported += 1
            else:
                unsupported += 1
            source = str(imported.get("source") or "")
            if source == "dullypdf_metadata":
                dullypdf_metadata += 1
            elif source == "acroform_js":
                external += 1
    if supported or unsupported:
        logger.info(
            "AcroForm calculation import summary: total=%s supported=%s unsupported=%s dullypdf_metadata=%s external=%s",
            supported + unsupported,
            supported,
            unsupported,
            dullypdf_metadata,
            external,
        )


def _rect_distance(left: Any, right: Any) -> Optional[float]:
    if not isinstance(left, dict):
        return None
    left_values = (left.get("x"), left.get("y"), left.get("width"), left.get("height"))
    if isinstance(right, dict):
        right_values = (right.get("x"), right.get("y"), right.get("width"), right.get("height"))
    elif isinstance(right, (list, tuple)) and len(right) == 4:
        x1, y1, x2, y2 = right
        right_values = (x1, y1, float(x2) - float(x1), float(y2) - float(y1))
    else:
        return None
    try:
        return sum(abs(float(a) - float(b)) for a, b in zip(left_values, right_values))
    except (TypeError, ValueError):
        return None


def _match_imported_record(
    record: Dict[str, Any],
    fields: List[Dict[str, Any]],
    used_indexes: set[int],
) -> Optional[int]:
    name = str(record.get("name") or "").strip()
    exact_candidates = [
        index
        for index, field in enumerate(fields)
        if index not in used_indexes and str(field.get("name") or "").strip() == name
    ]
    if exact_candidates:
        return min(
            exact_candidates,
            key=lambda index: _rect_distance(record.get("rect"), fields[index].get("rect")) or 0.0,
        )

    record_page = record.get("page")
    fallback_candidates: List[Tuple[float, int]] = []
    for index, field in enumerate(fields):
        if index in used_indexes:
            continue
        if record_page is not None and field.get("page") != record_page:
            continue
        distance = _rect_distance(record.get("rect"), field.get("rect"))
        if distance is not None and distance <= RECT_MATCH_TOLERANCE:
            fallback_candidates.append((distance, index))
    if not fallback_candidates:
        return None
    fallback_candidates.sort(key=lambda item: item[0])
    return fallback_candidates[0][1]


def merge_acroform_calculation_metadata(
    fields: List[Dict[str, Any]],
    imported_records: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Merge imported AcroForm field behavior into existing UI/session fields."""
    if not fields or not imported_records:
        return fields
    next_fields = [dict(field) for field in fields]
    used_indexes: set[int] = set()
    for record in imported_records:
        match_index = _match_imported_record(record, next_fields, used_indexes)
        if match_index is None:
            continue
        used_indexes.add(match_index)
        target = next_fields[match_index]
        target["readOnly"] = bool(record.get("readOnly"))
        target["required"] = bool(record.get("required"))
        field_type = str(target.get("type") or "text").strip().lower()
        if field_type != "text":
            continue
        if record.get("valueType") is not None:
            target["valueType"] = record["valueType"]
        if record.get("calculation") is not None:
            target["calculation"] = record["calculation"]
    return next_fields


def enrich_fields_with_acroform_calculation_metadata(
    fields: List[Dict[str, Any]],
    pdf_bytes: bytes,
) -> List[Dict[str, Any]]:
    """Analyze the uploaded PDF and merge supported import metadata into fields."""
    imported_records = analyze_acroform_calculation_fields(pdf_bytes)
    return merge_acroform_calculation_metadata(fields, imported_records)
