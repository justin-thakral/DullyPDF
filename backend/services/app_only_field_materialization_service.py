"""Prepare DullyPDF-only helper fields for server-side PDF materialization."""

from __future__ import annotations

import base64
import io
import json
import re
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

from PIL import Image, ImageDraw
from reportlab.graphics.barcode import code128
from reportlab.graphics.barcode.qr import QrCodeWidget

import pdf417gen

PHOTO_FIELD_NAME_MARKER = "__CVTPF"
PHOTO_FIELD_VALUE_MARKER = "CVTPF#@&"
PDF417_FIELD_NAME_MARKER = "__CVTP4"
PDF417_FIELD_VALUE_MARKER = "CVTP4#@&"
BARCODE_FIELD_NAME_MARKER = "__CVTBC"
BARCODE_FIELD_VALUE_MARKER = "CVTBC#@&"
QR_FIELD_NAME_MARKER = "__CVTQR"
QR_FIELD_VALUE_MARKER = "CVTQR#@&"
APP_ONLY_MARKER_METADATA_PREFIX = "DULLYPDF_META:"

APP_ONLY_FIELD_TYPES = {"image", "pdf417", "barcode", "qr"}
APP_ONLY_FIELD_VALUE_MARKERS = {
    PHOTO_FIELD_VALUE_MARKER,
    PDF417_FIELD_VALUE_MARKER,
    BARCODE_FIELD_VALUE_MARKER,
    QR_FIELD_VALUE_MARKER,
}
BARCODE_ID_LENGTH = 9
BARCODE_9_DIGIT_FIELD_ASPECT_RATIO = 351 / 127
MAX_PDF417_TEXT_LENGTH = 2000
MAX_QR_TEXT_LENGTH = 2000

PDF417_DEPENDENCY_FIELDS: Tuple[Tuple[str, str], ...] = (
    ("firstName", "FIRST NAME"),
    ("middleName", "MIDDLE NAME"),
    ("lastName", "LAST NAME"),
    ("streetAddress", "STREET ADDRESS"),
    ("city", "CITY"),
    ("state", "STATE"),
    ("zip", "ZIP"),
    ("dob", "DOB"),
    ("sex", "SEX"),
    ("eyeColor", "EYE COLOR"),
    ("height", "HEIGHT"),
    ("customerId", "CUSTOMER ID"),
    ("issueDate", "ISSUE DATE"),
    ("expirationDate", "EXPIRATION DATE"),
)


def _field_type(field: Mapping[str, Any]) -> str:
    return str(field.get("type") or "text").strip().lower()


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).strip()


def _normalize_name(value: Any) -> str:
    return _clean_text(value).lower()


def _data_url_from_png(image: Image.Image) -> str:
    buffer = io.BytesIO()
    if image.mode not in {"RGB", "RGBA", "L"}:
        image = image.convert("RGB")
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _code128_pattern(value: str) -> str:
    barcode = code128.Code128(value, quiet=False)
    barcode.validate()
    barcode.encode()
    return barcode.decompose()


def generate_code128_png_data_url(value: str) -> str:
    """Generate a Code 128 barcode as a PNG data URL."""

    pattern = _code128_pattern(value)
    module_px = 3
    quiet_modules = 10
    width_units = quiet_modules * 2
    for char in pattern:
        if "A" <= char <= "Z":
            width_units += ord(char) - ord("A") + 1
        elif "a" <= char <= "z":
            width_units += ord(char) - ord("a") + 1
    image_width = max(width_units * module_px, 1)
    height_px = max(1, round(image_width / BARCODE_9_DIGIT_FIELD_ASPECT_RATIO))
    image = Image.new("RGB", (image_width, height_px), "white")
    draw = ImageDraw.Draw(image)
    x = quiet_modules * module_px
    for char in pattern:
        if "A" <= char <= "Z":
            width = (ord(char) - ord("A") + 1) * module_px
            draw.rectangle((x, 0, x + width - 1, height_px - 1), fill="black")
            x += width
        elif "a" <= char <= "z":
            x += (ord(char) - ord("a") + 1) * module_px
    return _data_url_from_png(image)


def generate_pdf417_png_data_url(value: str) -> str:
    """Generate a PDF417 barcode as a PNG data URL."""

    normalized = value[:MAX_PDF417_TEXT_LENGTH]
    codes = pdf417gen.encode(normalized, columns=6, security_level=2)
    image = pdf417gen.render_image(codes, scale=2, ratio=3, padding=8)
    return _data_url_from_png(image)


def generate_qr_png_data_url(value: str) -> str:
    """Generate a QR code as a square PNG data URL."""

    normalized = _clean_text(value)
    if not normalized:
        return ""
    if len(normalized) > MAX_QR_TEXT_LENGTH:
        raise ValueError(f"QR field value must be {MAX_QR_TEXT_LENGTH} characters or fewer.")
    widget = QrCodeWidget(normalized, barLevel="M")
    widget.qr.make()
    module_count = widget.qr.getModuleCount()
    module_px = 4
    quiet_modules = 4
    image_size = (module_count + quiet_modules * 2) * module_px
    image = Image.new("RGB", (image_size, image_size), "white")
    draw = ImageDraw.Draw(image)
    offset = quiet_modules * module_px
    for row in range(module_count):
        for col in range(module_count):
            if widget.qr.isDark(row, col):
                left = offset + col * module_px
                top = offset + row * module_px
                draw.rectangle(
                    (left, top, left + module_px - 1, top + module_px - 1),
                    fill="black",
                )
    return _data_url_from_png(image)


def _barcode_digits(value: Any) -> str:
    return re.sub(r"\D", "", _clean_text(value))[:BARCODE_ID_LENGTH]


def _dependency_source_fields(fields: Iterable[Mapping[str, Any]], owner_id: Any) -> List[Mapping[str, Any]]:
    owner = _clean_text(owner_id)
    return [
        field
        for field in fields
        if _clean_text(field.get("id")) != owner and _field_type(field) not in APP_ONLY_FIELD_TYPES
    ]


def _resolve_dependency_value(
    ref: Any,
    fields: Iterable[Mapping[str, Any]],
    owner_id: Any,
) -> str:
    if not isinstance(ref, Mapping):
        return ""
    field_id = _clean_text(ref.get("fieldId"))
    field_name = _normalize_name(ref.get("fieldName"))
    candidates = _dependency_source_fields(fields, owner_id)
    if field_id:
        for field in candidates:
            if _clean_text(field.get("id")) == field_id:
                return _clean_text(field.get("value"))
    if field_name:
        for field in candidates:
            if _normalize_name(field.get("name")) == field_name:
                return _clean_text(field.get("value"))
    return ""


def _normalize_barcode_classes(field: Mapping[str, Any]) -> List[Dict[str, Any]]:
    raw_classes = field.get("barcodeClasses")
    if not isinstance(raw_classes, list):
        return []
    normalized: List[Dict[str, Any]] = []
    for entry in raw_classes:
        if not isinstance(entry, Mapping):
            continue
        mode = "field" if _clean_text(entry.get("mode")) == "field" else "manual"
        normalized.append(
            {
                "label": _clean_text(entry.get("label")) or "VALUE",
                "mode": mode,
                "fieldRef": entry.get("fieldRef") if isinstance(entry.get("fieldRef"), Mapping) else None,
                "manualValue": _clean_text(entry.get("manualValue")),
            }
        )
    return normalized


def _resolve_barcode_class_values(
    field: Mapping[str, Any],
    fields: Iterable[Mapping[str, Any]],
) -> List[Tuple[str, str]]:
    values: List[Tuple[str, str]] = []
    for entry in _normalize_barcode_classes(field):
        if entry["mode"] == "field":
            value = _resolve_dependency_value(entry.get("fieldRef"), fields, field.get("id"))
        else:
            value = _clean_text(entry.get("manualValue"))
        if value:
            values.append((_clean_text(entry.get("label")) or "VALUE", value))
    return values


def _scan_text_from_barcode_classes(class_values: Iterable[Tuple[str, str]]) -> str:
    lines = []
    for label, value in class_values:
        clean_value = _clean_text(value)
        if clean_value:
            lines.append(f"{(_clean_text(label) or 'VALUE').upper()}: {clean_value}")
    return "\n".join(lines)


def _split_manual_name(value: Any) -> Dict[str, str]:
    parts = [part for part in _clean_text(value).split() if part]
    if not parts:
        return {}
    if len(parts) == 1:
        return {"firstName": parts[0]}
    return {
        "firstName": parts[0],
        "middleName": " ".join(parts[1:-1]),
        "lastName": parts[-1],
    }


def build_pdf417_scan_text(data: Mapping[str, Any]) -> str:
    full_name = " ".join(
        entry
        for entry in (
            _clean_text(data.get("firstName")),
            _clean_text(data.get("middleName")),
            _clean_text(data.get("lastName")),
        )
        if entry
    )
    lines = []
    for key, label in PDF417_DEPENDENCY_FIELDS:
        lines.append(f"{label}: {_clean_text(data.get(key))}")
        if key == "lastName":
            lines.append(f"NAME: {full_name}")
    return "\n".join(lines)


def _resolve_pdf417_data(field: Mapping[str, Any], fields: Iterable[Mapping[str, Any]]) -> Dict[str, Any]:
    data: Dict[str, Any] = {}
    data.update(_split_manual_name(field.get("pdf417Name")))
    raw_data = field.get("pdf417Data")
    if isinstance(raw_data, Mapping):
        for key, value in raw_data.items():
            if value is None:
                data[str(key)] = None
            else:
                data[str(key)] = _clean_text(value)
    if field.get("pdf417Dob") is not None and not data.get("dob"):
        data["dob"] = _clean_text(field.get("pdf417Dob"))

    mappings = field.get("pdf417FieldMappings")
    if isinstance(mappings, Mapping):
        for key, ref in mappings.items():
            value = _resolve_dependency_value(ref, fields, field.get("id"))
            data[str(key)] = value or None
    return data


def _has_pdf417_data(data: Mapping[str, Any]) -> bool:
    return any(_clean_text(value) for value in data.values())


def _app_only_marker_info(field_type: str) -> Tuple[str, str] | None:
    if field_type == "image":
        return PHOTO_FIELD_NAME_MARKER, "photo"
    if field_type == "pdf417":
        return PDF417_FIELD_NAME_MARKER, "pdf417_barcode"
    if field_type == "barcode":
        return BARCODE_FIELD_NAME_MARKER, "id_barcode"
    if field_type == "qr":
        return QR_FIELD_NAME_MARKER, "qr_code"
    return None


def _app_only_value_marker(field_type: str) -> str:
    if field_type == "image":
        return PHOTO_FIELD_VALUE_MARKER
    if field_type == "pdf417":
        return PDF417_FIELD_VALUE_MARKER
    if field_type == "barcode":
        return BARCODE_FIELD_VALUE_MARKER
    if field_type == "qr":
        return QR_FIELD_VALUE_MARKER
    return ""


def _editable_marker_footer(field_type: str) -> str:
    if field_type == "image":
        return "(IMAGE)"
    if field_type == "pdf417":
        return "(PDF417)"
    if field_type == "barcode":
        return "(1D)"
    if field_type == "qr":
        return "(QR)"
    return ""


def _metadata_text(value: Any) -> str | None:
    text = _clean_text(value)
    return text or None


def _metadata_dependency_ref(value: Any) -> Dict[str, str] | None:
    if not isinstance(value, Mapping):
        return None
    field_id = _metadata_text(value.get("fieldId")) or ""
    field_name = _metadata_text(value.get("fieldName")) or ""
    if not field_id and not field_name:
        return None
    return {"fieldId": field_id, "fieldName": field_name}


def _metadata_pdf417_mappings(value: Any) -> Dict[str, Dict[str, str]] | None:
    if not isinstance(value, Mapping):
        return None
    mappings: Dict[str, Dict[str, str]] = {}
    for key, ref in value.items():
        normalized = _metadata_dependency_ref(ref)
        if normalized is not None:
            mappings[str(key)] = normalized
    return mappings or None


def _metadata_barcode_classes(value: Any) -> List[Dict[str, Any]] | None:
    if not isinstance(value, list):
        return None
    classes: List[Dict[str, Any]] = []
    for index, entry in enumerate(value):
        if not isinstance(entry, Mapping):
            continue
        mode = "field" if _clean_text(entry.get("mode")) == "field" else "manual"
        normalized: Dict[str, Any] = {
            "id": _metadata_text(entry.get("id")) or f"class_{index + 1}",
            "label": _metadata_text(entry.get("label")) or "",
            "mode": mode,
        }
        if mode == "field":
            normalized["fieldRef"] = _metadata_dependency_ref(entry.get("fieldRef"))
            normalized["manualValue"] = None
        else:
            normalized["fieldRef"] = None
            normalized["manualValue"] = _metadata_text(entry.get("manualValue")) or ""
        if normalized["label"] or normalized.get("fieldRef") or normalized.get("manualValue"):
            classes.append(normalized)
    return classes or None


def _editable_marker_metadata(field: Mapping[str, Any]) -> Dict[str, Any] | None:
    field_type = _field_type(field)
    metadata: Dict[str, Any] = {"v": 1, "type": field_type}
    for key in ("imagePath", "imageSourcePath", "imageMimeType", "imageName", "imageColorMode"):
        value = _metadata_text(field.get(key))
        if value is not None:
            metadata[key] = value
    for key in ("pdf417Name", "pdf417Dob"):
        value = _metadata_text(field.get(key))
        if value is not None:
            metadata[key] = value
    if isinstance(field.get("pdf417Data"), Mapping):
        metadata["pdf417Data"] = {
            str(key): None if value is None else _clean_text(value)
            for key, value in field.get("pdf417Data", {}).items()
        }
    barcode_source = _metadata_dependency_ref(field.get("barcodeSourceField"))
    if barcode_source is not None:
        metadata["barcodeSourceField"] = barcode_source
    qr_source = _metadata_dependency_ref(field.get("qrSourceField"))
    if qr_source is not None:
        metadata["qrSourceField"] = qr_source
    pdf417_mappings = _metadata_pdf417_mappings(field.get("pdf417FieldMappings"))
    if pdf417_mappings is not None:
        metadata["pdf417FieldMappings"] = pdf417_mappings
    barcode_classes = _metadata_barcode_classes(field.get("barcodeClasses"))
    if barcode_classes is not None:
        metadata["barcodeClasses"] = barcode_classes
    return metadata if len(metadata) > 2 else None


def _editable_marker_payload(field: Mapping[str, Any]) -> str:
    field_type = _field_type(field)
    marker = _app_only_value_marker(field_type)
    if field_type == "image":
        content = _clean_text(field.get("imageName")) or _clean_text(field.get("imageMimeType")) or "image"
    else:
        content = _clean_text(field.get("value"))
    parts = [marker]
    marker_metadata = _editable_marker_metadata(field)
    if marker_metadata is not None:
        parts.append(
            f"{APP_ONLY_MARKER_METADATA_PREFIX}{json.dumps(marker_metadata, ensure_ascii=True, separators=(',', ':'), sort_keys=True)}"
        )
    if content:
        parts.append(content)
    parts.append(_editable_marker_footer(field_type))
    return "\n".join(parts)


def _marker_name(field: Mapping[str, Any], marker: str, fallback: str) -> str:
    name = _clean_text(field.get("name")) or fallback
    return name if marker in name else f"{name}{marker}"


def _build_marker_text_field(field: Mapping[str, Any], marker_name: str) -> Dict[str, Any]:
    marker = dict(field)
    marker["id"] = f"{_clean_text(field.get('id')) or 'field'}_{_field_type(field)}_marker"
    marker["name"] = marker_name
    marker["type"] = "text"
    marker["value"] = _editable_marker_payload(field)
    marker["readOnly"] = True
    marker["required"] = False
    marker.pop("imageDataUrl", None)
    marker.pop("imagePath", None)
    marker.pop("imageSourcePath", None)
    marker.pop("imageMimeType", None)
    marker.pop("imageName", None)
    marker.pop("imageColorMode", None)
    marker.pop("pdf417Name", None)
    marker.pop("pdf417Dob", None)
    marker.pop("pdf417Data", None)
    marker.pop("barcodeSourceField", None)
    marker.pop("qrSourceField", None)
    marker.pop("pdf417FieldMappings", None)
    marker.pop("barcodeClasses", None)
    marker.pop("appOnlyMarkerName", None)
    return marker


def _enrich_barcode_field(field: Dict[str, Any], fields: Iterable[Mapping[str, Any]]) -> Dict[str, Any]:
    class_values = _resolve_barcode_class_values(field, fields)
    source_value = class_values[0][1] if class_values else (
        _resolve_dependency_value(field.get("barcodeSourceField"), fields, field.get("id"))
        if field.get("barcodeSourceField") is not None
        else _clean_text(field.get("value"))
    )
    digits = _barcode_digits(source_value)
    field["value"] = digits or None
    if len(digits) == BARCODE_ID_LENGTH:
        field["imageDataUrl"] = generate_code128_png_data_url(digits)
        field["imageMimeType"] = "image/png"
        field["imageName"] = f"{_clean_text(field.get('name')) or 'barcode'}.png"
    return field


def _enrich_pdf417_field(field: Dict[str, Any], fields: Iterable[Mapping[str, Any]]) -> Dict[str, Any]:
    class_values = _resolve_barcode_class_values(field, fields)
    if class_values:
        scan_text = _scan_text_from_barcode_classes(class_values)[:MAX_PDF417_TEXT_LENGTH]
        if not scan_text:
            return field
        field["value"] = scan_text
        field["imageDataUrl"] = generate_pdf417_png_data_url(scan_text)
        field["imageMimeType"] = "image/png"
        field["imageName"] = f"{_clean_text(field.get('name')) or 'pdf417'}.png"
        return field

    direct_value = _clean_text(field.get("value"))
    has_structured_intent = any(
        field.get(key) is not None
        for key in ("pdf417Name", "pdf417Dob", "pdf417Data", "pdf417FieldMappings")
    )
    if direct_value and not has_structured_intent:
        scan_text = direct_value[:MAX_PDF417_TEXT_LENGTH]
    else:
        data = _resolve_pdf417_data(field, fields)
        field["pdf417Data"] = data
        if not _has_pdf417_data(data):
            return field
        scan_text = build_pdf417_scan_text(data)
    field["value"] = scan_text
    field["imageDataUrl"] = generate_pdf417_png_data_url(scan_text)
    field["imageMimeType"] = "image/png"
    field["imageName"] = f"{_clean_text(field.get('name')) or 'pdf417'}.png"
    return field


def _enrich_qr_field(field: Dict[str, Any], fields: Iterable[Mapping[str, Any]]) -> Dict[str, Any]:
    class_values = _resolve_barcode_class_values(field, fields)
    source_value = class_values[0][1] if class_values else (
        _resolve_dependency_value(field.get("qrSourceField"), fields, field.get("id"))
        if field.get("qrSourceField") is not None
        else _clean_text(field.get("value"))
    )
    if len(source_value) > MAX_QR_TEXT_LENGTH:
        raise ValueError(f"QR field value must be {MAX_QR_TEXT_LENGTH} characters or fewer.")
    field["value"] = source_value or None
    if source_value:
        field["imageDataUrl"] = generate_qr_png_data_url(source_value)
        field["imageMimeType"] = "image/png"
        field["imageName"] = f"{_clean_text(field.get('name')) or 'qr'}.png"
    return field


def _enrich_app_only_field(field: Mapping[str, Any], fields: Iterable[Mapping[str, Any]]) -> Dict[str, Any]:
    enriched = dict(field)
    field_type = _field_type(enriched)
    marker_info = _app_only_marker_info(field_type)
    if marker_info is not None:
        enriched["appOnlyMarkerName"] = _marker_name(enriched, marker_info[0], marker_info[1])
    if field_type == "barcode":
        return _enrich_barcode_field(enriched, fields)
    if field_type == "pdf417":
        return _enrich_pdf417_field(enriched, fields)
    if field_type == "qr":
        return _enrich_qr_field(enriched, fields)
    return enriched


def _is_existing_marker_field(field: Mapping[str, Any]) -> bool:
    if _field_type(field) != "text":
        return False
    name = _clean_text(field.get("name"))
    if any(
        marker in name
        for marker in (PHOTO_FIELD_NAME_MARKER, PDF417_FIELD_NAME_MARKER, BARCODE_FIELD_NAME_MARKER, QR_FIELD_NAME_MARKER)
    ):
        return True
    first_value_line = _clean_text(field.get("value")).splitlines()[0].strip() if _clean_text(field.get("value")) else ""
    return first_value_line in APP_ONLY_FIELD_VALUE_MARKERS


def prepare_app_only_fields_for_materialization(
    fields: List[Dict[str, Any]],
    *,
    include_markers: bool = False,
) -> List[Dict[str, Any]]:
    """
    Generate server-side image payloads and optional marker anchors for app-only fields.

    The pass is O(n*m) in the worst case because each dependency lookup scans
    the current field list. Form templates are small, and this keeps dependency
    resolution tolerant of both ID and field-name references without additional
    indexes that must stay in sync with mutations during the pass.
    """

    app_only_marker_names = set()
    for field in fields:
        field_type = _field_type(field)
        marker_info = _app_only_marker_info(field_type)
        if marker_info is not None:
            app_only_marker_names.add(_marker_name(field, marker_info[0], marker_info[1]))

    generated_marker_names = set()
    prepared: List[Dict[str, Any]] = []
    for field in fields:
        field_type = _field_type(field)
        if not include_markers and _is_existing_marker_field(field):
            continue
        if include_markers and _is_existing_marker_field(field) and _clean_text(field.get("name")) in app_only_marker_names:
            continue
        if field_type not in APP_ONLY_FIELD_TYPES:
            prepared.append(dict(field))
            continue
        enriched = _enrich_app_only_field(field, fields)
        prepared.append(enriched)
        if not include_markers:
            continue
        marker_name = _clean_text(enriched.get("appOnlyMarkerName"))
        if marker_name and marker_name not in generated_marker_names:
            prepared.append(_build_marker_text_field(enriched, marker_name))
            generated_marker_names.add(marker_name)
    return prepared
