"""Validation and storage helpers for saved-form editor snapshots."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from backend.firebaseDB.storage_service import (
    download_saved_form_snapshot_json,
    upload_saved_form_snapshot_json,
)
from backend.logging_config import get_logger
from backend.services.pdf_service import (
    DEFAULT_FIELD_FONT_COLOR,
    DEFAULT_FIELD_FONT_CHOICE,
    DEFAULT_FIELD_FONT_SIZE_CHOICE,
    DEFAULT_FIELD_TEXT_ALIGNMENT,
    CALCULATION_COMPATIBLE_FIELD_TYPES,
    normalize_field_alignment_override,
    normalize_calculation_metadata,
    normalize_field_font_color_override,
    normalize_pdf_base14_font_name,
    normalize_field_font_override,
    normalize_field_font_size_override,
    normalize_global_field_alignment,
    normalize_global_field_font_color,
    normalize_global_field_font_size,
    normalize_numeric_value_type,
    normalize_pdf_hex_color,
)
from backend.time_utils import now_iso


logger = get_logger(__name__)

SAVED_FORM_EDITOR_SNAPSHOT_VERSION = 2
MAX_SAVED_FORM_EDITOR_SNAPSHOT_BYTES = 1_500_000
SAVED_FORM_EDITOR_SNAPSHOT_METADATA_KEY = "editorSnapshot"
ALLOWED_FIELD_TYPES = {"text", "checkbox", "radio", "signature", "image", "pdf417", "barcode", "qr"}
FONT_COMPATIBLE_FIELD_TYPES = {"text"}
PDF417_DEPENDENCY_KEYS = {
    "firstName",
    "middleName",
    "lastName",
    "streetAddress",
    "city",
    "state",
    "zip",
    "dob",
    "sex",
    "eyeColor",
    "height",
    "customerId",
    "issueDate",
    "expirationDate",
}


def _coerce_bool(value: Any, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes"}:
            return True
        if lowered in {"false", "0", "no"}:
            return False
    return bool(value)


def _coerce_float(value: Any, label: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must be numeric") from exc
    if result < 0:
        raise ValueError(f"{label} must be non-negative")
    return result


def _coerce_positive_float(value: Any, label: str) -> float:
    result = _coerce_float(value, label)
    if result <= 0:
        raise ValueError(f"{label} must be positive")
    return result


def _normalize_rect(value: Any) -> Dict[str, float]:
    if not isinstance(value, dict):
        raise ValueError("field rect must be an object")
    return {
        "x": _coerce_float(value.get("x"), "field rect x"),
        "y": _coerce_float(value.get("y"), "field rect y"),
        "width": _coerce_positive_float(value.get("width"), "field rect width"),
        "height": _coerce_positive_float(value.get("height"), "field rect height"),
    }


def _normalize_dependency_ref(value: Any) -> Optional[Dict[str, str]]:
    if not isinstance(value, dict):
        return None
    field_id = str(value.get("fieldId") or "").strip()
    field_name = str(value.get("fieldName") or "").strip()
    if not field_id and not field_name:
        return None
    return {
        "fieldId": field_id,
        "fieldName": field_name,
    }


def _normalize_pdf417_field_mappings(value: Any) -> Optional[Dict[str, Dict[str, str]]]:
    if not isinstance(value, dict):
        return None
    normalized: Dict[str, Dict[str, str]] = {}
    for key in PDF417_DEPENDENCY_KEYS:
        ref = _normalize_dependency_ref(value.get(key))
        if ref:
            normalized[key] = ref
    return normalized or None


def _normalize_appearance(value: Any) -> Dict[str, Any]:
    if value is None:
        return {
            "globalFieldFont": DEFAULT_FIELD_FONT_CHOICE,
            "globalFieldFontSize": DEFAULT_FIELD_FONT_SIZE_CHOICE,
            "globalFieldFontColor": DEFAULT_FIELD_FONT_COLOR,
            "globalFieldAlignment": DEFAULT_FIELD_TEXT_ALIGNMENT,
        }
    if not isinstance(value, dict):
        raise ValueError("appearance must be an object")
    raw_global_font = value.get("globalFieldFont", DEFAULT_FIELD_FONT_CHOICE)
    if raw_global_font in (None, "", DEFAULT_FIELD_FONT_CHOICE):
        global_font = DEFAULT_FIELD_FONT_CHOICE
    else:
        global_font = normalize_pdf_base14_font_name(raw_global_font)
        if not global_font:
            raise ValueError("appearance.globalFieldFont must be default or a supported PDF text font")
    raw_global_font_size = value.get("globalFieldFontSize", DEFAULT_FIELD_FONT_SIZE_CHOICE)
    global_font_size = normalize_global_field_font_size(raw_global_font_size)
    if (
        raw_global_font_size not in (None, "", DEFAULT_FIELD_FONT_SIZE_CHOICE)
        and global_font_size == DEFAULT_FIELD_FONT_SIZE_CHOICE
    ):
        raise ValueError("appearance.globalFieldFontSize must be auto or a font size from 4 to 72")
    raw_global_font_color = value.get("globalFieldFontColor", DEFAULT_FIELD_FONT_COLOR)
    global_font_color = normalize_global_field_font_color(raw_global_font_color)
    if raw_global_font_color not in (None, "") and normalize_pdf_hex_color(raw_global_font_color) is None:
        raise ValueError("appearance.globalFieldFontColor must be a #rrggbb color")
    raw_global_alignment = value.get("globalFieldAlignment", DEFAULT_FIELD_TEXT_ALIGNMENT)
    global_alignment = normalize_global_field_alignment(raw_global_alignment)
    if raw_global_alignment not in (None, "") and global_alignment != str(raw_global_alignment).strip().lower():
        raise ValueError("appearance.globalFieldAlignment must be left, center, or right")
    return {
        "globalFieldFont": global_font,
        "globalFieldFontSize": global_font_size,
        "globalFieldFontColor": global_font_color,
        "globalFieldAlignment": global_alignment,
    }


def _normalize_field(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("snapshot fields must contain objects")
    field_id = str(value.get("id") or "").strip()
    field_name = str(value.get("name") or "").strip()
    field_type = str(value.get("type") or "text").strip().lower()
    if field_type == "date":
        field_type = "text"
    try:
        page = int(value.get("page"))
    except (TypeError, ValueError) as exc:
        raise ValueError("field page must be an integer") from exc
    if not field_id:
        raise ValueError("field id is required")
    if not field_name:
        raise ValueError("field name is required")
    if field_type not in ALLOWED_FIELD_TYPES:
        raise ValueError(f"field type must be one of {sorted(ALLOWED_FIELD_TYPES)}")
    if page < 1:
        raise ValueError("field page must be at least 1")

    normalized: Dict[str, Any] = {
        "id": field_id,
        "name": field_name,
        "type": field_type,
        "page": page,
        "rect": _normalize_rect(value.get("rect")),
    }
    if value.get("fontName") is not None:
        font_name = normalize_field_font_override(value.get("fontName"))
        if not font_name:
            raise ValueError("field fontName must be a supported PDF text font or global")
        if field_type in FONT_COMPATIBLE_FIELD_TYPES:
            normalized["fontName"] = font_name
    if value.get("fontSize") is not None:
        font_size = normalize_field_font_size_override(value.get("fontSize"))
        if font_size is None:
            raise ValueError("field fontSize must be global, auto, or a font size from 4 to 72")
        if field_type in FONT_COMPATIBLE_FIELD_TYPES:
            normalized["fontSize"] = font_size
    if value.get("fontColor") is not None:
        font_color = normalize_field_font_color_override(value.get("fontColor"))
        if font_color is None:
            raise ValueError("field fontColor must be global or a #rrggbb color")
        if field_type in FONT_COMPATIBLE_FIELD_TYPES:
            normalized["fontColor"] = font_color
    if value.get("textAlign") is not None:
        text_alignment = normalize_field_alignment_override(value.get("textAlign"))
        if text_alignment is None:
            raise ValueError("field textAlign must be global, left, center, or right")
        if field_type in FONT_COMPATIBLE_FIELD_TYPES:
            normalized["textAlign"] = text_alignment
    if value.get("readOnly") is not None or value.get("readonly") is not None:
        normalized["readOnly"] = _coerce_bool(value.get("readOnly", value.get("readonly")))
    if value.get("required") is not None:
        normalized["required"] = _coerce_bool(value.get("required"))
    if value.get("valueType") is not None:
        if field_type not in CALCULATION_COMPATIBLE_FIELD_TYPES:
            raise ValueError("field valueType is only supported on text fields")
        value_type = normalize_numeric_value_type(value.get("valueType"))
        if value_type is None:
            raise ValueError("field valueType must be integer or decimal")
        normalized["valueType"] = value_type
    if value.get("calculation") is not None:
        if field_type not in CALCULATION_COMPATIBLE_FIELD_TYPES:
            raise ValueError("field calculation metadata is only supported on text fields")
        normalized["calculation"] = normalize_calculation_metadata(value.get("calculation"))

    for key in (
        "groupKey",
        "optionKey",
        "optionLabel",
        "groupLabel",
        "radioGroupId",
        "radioGroupKey",
        "radioGroupLabel",
        "radioOptionKey",
        "radioOptionLabel",
        "radioGroupSource",
        "imageDataUrl",
        "imageMimeType",
        "imageName",
        "pdf417Name",
        "pdf417Dob",
    ):
        raw = value.get(key)
        if raw is None:
            continue
        normalized[key] = str(raw)

    raw_pdf417_data = value.get("pdf417Data")
    if raw_pdf417_data is None:
        if "pdf417Data" in value:
            normalized["pdf417Data"] = None
    elif isinstance(raw_pdf417_data, dict):
        normalized["pdf417Data"] = {
            str(key): None if entry is None else str(entry)
            for key, entry in raw_pdf417_data.items()
        }

    if "barcodeSourceField" in value:
        normalized["barcodeSourceField"] = _normalize_dependency_ref(value.get("barcodeSourceField"))

    if "qrSourceField" in value:
        normalized["qrSourceField"] = _normalize_dependency_ref(value.get("qrSourceField"))

    if "pdf417FieldMappings" in value:
        normalized["pdf417FieldMappings"] = _normalize_pdf417_field_mappings(value.get("pdf417FieldMappings"))

    for key in ("fieldConfidence", "mappingConfidence", "renameConfidence", "radioOptionOrder"):
        raw = value.get(key)
        if raw is None:
            continue
        normalized[key] = float(raw)

    raw_value = value.get("value")
    if raw_value is None or isinstance(raw_value, (str, int, float, bool)):
        normalized["value"] = raw_value
    else:
        normalized["value"] = str(raw_value)
    return normalized


def _normalize_radio_group_option(value: Any) -> Dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError("radio group options must contain objects")
    field_id = str(value.get("fieldId") or "").strip()
    option_key = str(value.get("optionKey") or "").strip()
    option_label = str(value.get("optionLabel") or "").strip()
    if not field_id:
        raise ValueError("radio group option fieldId is required")
    if not option_key:
        raise ValueError("radio group option optionKey is required")
    if not option_label:
        raise ValueError("radio group option optionLabel is required")
    return {
        "fieldId": field_id,
        "optionKey": option_key,
        "optionLabel": option_label,
    }


def _normalize_radio_groups(value: Any) -> list[Dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("radioGroups must be a list")

    normalized_groups: list[Dict[str, Any]] = []
    for entry in value:
        if not isinstance(entry, dict):
            raise ValueError("radioGroups must contain objects")
        group_id = str(entry.get("id") or "").strip()
        group_key = str(entry.get("key") or "").strip()
        group_label = str(entry.get("label") or "").strip()
        source = str(entry.get("source") or "manual").strip() or "manual"
        if not group_id:
            raise ValueError("radio group id is required")
        if not group_key:
            raise ValueError("radio group key is required")
        if not group_label:
            raise ValueError("radio group label is required")
        raw_options = entry.get("options")
        if not isinstance(raw_options, list) or not raw_options:
            raise ValueError("radio group options must be a non-empty list")
        options = [_normalize_radio_group_option(option) for option in raw_options]
        raw_order = entry.get("optionOrder")
        option_order = [str(item).strip() for item in raw_order] if isinstance(raw_order, list) else []
        if not option_order:
            option_order = [option["optionKey"] for option in options]

        normalized_group: Dict[str, Any] = {
            "id": group_id,
            "key": group_key,
            "label": group_label,
            "source": source,
            "optionOrder": option_order,
            "options": options,
        }
        raw_page = entry.get("page")
        if raw_page is not None:
            try:
                page = int(raw_page)
            except (TypeError, ValueError) as exc:
                raise ValueError("radio group page must be an integer") from exc
            if page < 1:
                raise ValueError("radio group page must be at least 1")
            normalized_group["page"] = page
        normalized_groups.append(normalized_group)
    return normalized_groups


def _normalize_page_sizes(value: Any, page_count: int) -> Dict[str, Dict[str, float]]:
    if not isinstance(value, dict):
        raise ValueError("pageSizes must be an object")
    normalized: Dict[str, Dict[str, float]] = {}
    for page_number in range(1, page_count + 1):
        raw_page = value.get(str(page_number), value.get(page_number))
        if not isinstance(raw_page, dict):
            raise ValueError(f"pageSizes missing entry for page {page_number}")
        normalized[str(page_number)] = {
            "width": _coerce_positive_float(raw_page.get("width"), f"pageSizes[{page_number}].width"),
            "height": _coerce_positive_float(raw_page.get("height"), f"pageSizes[{page_number}].height"),
        }
    return normalized


def normalize_saved_form_editor_snapshot_payload(payload: Any) -> Dict[str, Any]:
    """Validate and normalize a saved-form editor snapshot payload."""
    if not isinstance(payload, dict):
        raise ValueError("editor snapshot must be an object")
    try:
        page_count = int(payload.get("pageCount"))
    except (TypeError, ValueError) as exc:
        raise ValueError("pageCount must be an integer") from exc
    if page_count < 1:
        raise ValueError("pageCount must be at least 1")

    version = payload.get("version", SAVED_FORM_EDITOR_SNAPSHOT_VERSION)
    try:
        version_value = int(version)
    except (TypeError, ValueError) as exc:
        raise ValueError("version must be an integer") from exc
    if version_value not in {1, SAVED_FORM_EDITOR_SNAPSHOT_VERSION}:
        raise ValueError("editor snapshot version is not supported")

    raw_fields = payload.get("fields")
    if not isinstance(raw_fields, list):
        raise ValueError("fields must be a list")

    normalized = {
        "version": SAVED_FORM_EDITOR_SNAPSHOT_VERSION,
        "pageCount": page_count,
        "pageSizes": _normalize_page_sizes(payload.get("pageSizes"), page_count),
        "appearance": _normalize_appearance(payload.get("appearance")),
        "fields": [_normalize_field(field) for field in raw_fields],
        "radioGroups": _normalize_radio_groups(payload.get("radioGroups")),
        "hasRenamedFields": _coerce_bool(payload.get("hasRenamedFields"), default=False),
        "hasMappedSchema": _coerce_bool(payload.get("hasMappedSchema"), default=False),
    }
    return normalized


def parse_saved_form_editor_snapshot_form_value(raw_value: Optional[str]) -> Optional[Dict[str, Any]]:
    """Parse a form-data snapshot payload into a normalized dict."""
    if raw_value is None:
        return None
    raw_text = str(raw_value).strip()
    if not raw_text:
        return None
    if len(raw_text.encode("utf-8")) > MAX_SAVED_FORM_EDITOR_SNAPSHOT_BYTES:
        raise ValueError("editor snapshot payload is too large")
    return normalize_saved_form_editor_snapshot_payload(json.loads(raw_text))


def build_saved_form_editor_snapshot_storage_path(
    user_id: str,
    form_id: str,
    *,
    timestamp_ms: int,
) -> str:
    """Return the storage path used for a saved-form editor snapshot JSON blob."""
    return f"users/{user_id}/saved-form-snapshots/{timestamp_ms}-{form_id}.json"


def build_saved_form_editor_snapshot_manifest(
    bucket_path: str,
    snapshot: Dict[str, Any],
) -> Dict[str, Any]:
    """Build the small metadata manifest stored on the template record."""
    return {
        "version": SAVED_FORM_EDITOR_SNAPSHOT_VERSION,
        "path": bucket_path,
        "fieldCount": len(snapshot.get("fields") or []),
        "pageCount": snapshot.get("pageCount"),
        "updatedAt": now_iso(),
    }


def upload_saved_form_editor_snapshot(
    *,
    user_id: str,
    form_id: str,
    timestamp_ms: int,
    snapshot: Dict[str, Any],
) -> tuple[str, Dict[str, Any]]:
    """Persist a saved-form editor snapshot JSON blob and return its manifest."""
    destination_path = build_saved_form_editor_snapshot_storage_path(
        user_id,
        form_id,
        timestamp_ms=timestamp_ms,
    )
    bucket_path = upload_saved_form_snapshot_json(snapshot, destination_path)
    return bucket_path, build_saved_form_editor_snapshot_manifest(bucket_path, snapshot)


def get_saved_form_editor_snapshot_path(metadata: Optional[Dict[str, Any]]) -> Optional[str]:
    """Extract the snapshot storage path from template metadata when present."""
    if not isinstance(metadata, dict):
        return None
    manifest = metadata.get(SAVED_FORM_EDITOR_SNAPSHOT_METADATA_KEY)
    if not isinstance(manifest, dict):
        return None
    raw_path = manifest.get("path")
    if isinstance(raw_path, str) and raw_path.strip():
        return raw_path.strip()
    return None


def load_saved_form_editor_snapshot(metadata: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Load and validate a stored editor snapshot referenced by template metadata."""
    snapshot_path = get_saved_form_editor_snapshot_path(metadata)
    if not snapshot_path:
        return None
    try:
        raw_snapshot = download_saved_form_snapshot_json(snapshot_path)
        return normalize_saved_form_editor_snapshot_payload(raw_snapshot)
    except Exception as exc:
        logger.warning("Failed to load saved-form editor snapshot path=%s error=%s", snapshot_path, exc)
        return None
