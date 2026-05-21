"""Stamp app-level image helper fields into PDF page content."""

from __future__ import annotations

import base64
import binascii
import re
from typing import Any

import fitz

from backend.firebaseDB.storage_service import download_storage_bytes, is_gcs_path

SUPPORTED_IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg"}
MAX_IMAGE_FIELD_BYTES = 10 * 1024 * 1024
DATA_URL_RE = re.compile(r"^data:(?P<mime>image/[a-z0-9.+-]+);base64,(?P<data>.*)$", re.IGNORECASE | re.DOTALL)


class ImageFieldPayloadError(ValueError):
    """Raised when an image helper field contains malformed or unsupported image data."""


def _field_type(field: dict[str, Any]) -> str:
    return str(field.get("type") or "").strip().lower()


def _image_color_mode(field: dict[str, Any]) -> str:
    mode = str(field.get("imageColorMode") or "original").strip().lower()
    if mode in {"grayscale", "grey scale", "gray scale", "greyscale"}:
        return "grayscale"
    return "original"


def _image_data_url(field: dict[str, Any]) -> str | None:
    data_url = field.get("imageDataUrl")
    if isinstance(data_url, str) and data_url.strip():
        return data_url.strip()
    value = field.get("value")
    if isinstance(value, dict):
        nested_data_url = value.get("imageDataUrl")
        if isinstance(nested_data_url, str) and nested_data_url.strip():
            return nested_data_url.strip()
    if isinstance(value, str) and value.strip().lower().startswith("data:image/"):
        return value.strip()
    return None


def _image_path(field: dict[str, Any]) -> str | None:
    for key in ("imagePath", "imageSourcePath"):
        value = field.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    value = field.get("value")
    if isinstance(value, dict):
        nested_path = value.get("imagePath") or value.get("imageSourcePath")
        if isinstance(nested_path, str) and nested_path.strip():
            return nested_path.strip()
    if isinstance(value, str) and value.strip().startswith("gs://"):
        return value.strip()
    return None


def _image_mime_type_from_bytes(image_bytes: bytes) -> str:
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    raise ImageFieldPayloadError("Only PNG and JPEG image helper fields are supported.")


def _validate_image_bytes(image_bytes: bytes) -> bytes:
    if not image_bytes:
        raise ImageFieldPayloadError("Image helper field data is empty.")
    if len(image_bytes) > MAX_IMAGE_FIELD_BYTES:
        raise ImageFieldPayloadError("Image helper field exceeds the 10MB image limit.")
    _image_mime_type_from_bytes(image_bytes)
    return image_bytes


def decode_image_data_url_payload(data_url: str) -> tuple[bytes, str]:
    """Decode and validate a PNG/JPEG data URL supplied by an image field."""
    match = DATA_URL_RE.match(data_url)
    if not match:
        raise ImageFieldPayloadError("Image helper fields must contain a PNG or JPEG data URL.")

    mime_type = match.group("mime").lower()
    if mime_type not in SUPPORTED_IMAGE_MIME_TYPES:
        raise ImageFieldPayloadError("Only PNG and JPEG image helper fields are supported.")

    encoded = "".join(match.group("data").split())
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ImageFieldPayloadError("Image helper field data is not valid base64.") from exc

    return _validate_image_bytes(image_bytes), "image/jpeg" if mime_type == "image/jpg" else mime_type


def _decode_image_data_url(field: dict[str, Any]) -> bytes | None:
    data_url = _image_data_url(field)
    if not data_url:
        return None
    image_bytes, _mime_type = decode_image_data_url_payload(data_url)
    return image_bytes


def _decode_image_path(field: dict[str, Any]) -> bytes | None:
    path = _image_path(field)
    if not path:
        return None
    if not is_gcs_path(path):
        raise ImageFieldPayloadError("Image helper field paths must use allowlisted gs:// storage objects.")
    return _validate_image_bytes(download_storage_bytes(path))


def _decode_image_payload(field: dict[str, Any]) -> bytes | None:
    image_bytes = _decode_image_data_url(field)
    if image_bytes is not None:
        return image_bytes
    return _decode_image_path(field)


def _grayscale_image_bytes(image_bytes: bytes) -> bytes:
    """Return image bytes converted to DeviceGray PNG for barcode-like stamping."""

    try:
        source = fitz.Pixmap(image_bytes)
        try:
            if source.colorspace == fitz.csGRAY:
                return source.tobytes("png")
            grayscale = fitz.Pixmap(fitz.csGRAY, source)
            try:
                return grayscale.tobytes("png")
            finally:
                grayscale = None
        finally:
            source = None
    except Exception as exc:
        raise ImageFieldPayloadError("Image helper field data could not be converted to grayscale.") from exc


def _fitz_rect_from_field(field: dict[str, Any], page: fitz.Page) -> fitz.Rect | None:
    rect = field.get("rect")
    if not isinstance(rect, list) or len(rect) != 4:
        return None
    try:
        x1, y1, x2, y2 = [float(entry) for entry in rect]
    except (TypeError, ValueError):
        return None

    page_rect = page.rect
    left = min(max(x1, page_rect.x0), page_rect.x1)
    top = min(max(y1, page_rect.y0), page_rect.y1)
    right = min(max(x2, page_rect.x0), page_rect.x1)
    bottom = min(max(y2, page_rect.y0), page_rect.y1)
    if right <= left or bottom <= top:
        return None
    return fitz.Rect(left, top, right, bottom)


def stamp_image_fields_into_pdf(pdf_bytes: bytes, fields: list[dict[str, Any]]) -> bytes:
    """Insert image helper fields as static page content and return PDF bytes."""

    image_fields = [
        field
        for field in fields
        if _field_type(field) in {"image", "pdf417", "barcode", "qr", "signature"}
    ]
    if not image_fields:
        return pdf_bytes

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        stamped_any = False
        for field in image_fields:
            field_type = _field_type(field)
            image_bytes = _decode_image_payload(field)
            if image_bytes is None:
                continue
            if field_type not in {"image", "signature"} or (
                field_type == "image" and _image_color_mode(field) == "grayscale"
            ):
                image_bytes = _grayscale_image_bytes(image_bytes)
            try:
                page_index = int(field.get("page") or 1) - 1
            except (TypeError, ValueError):
                continue
            if page_index < 0 or page_index >= document.page_count:
                continue

            page = document[page_index]
            target_rect = _fitz_rect_from_field(field, page)
            if target_rect is None:
                continue
            try:
                page.insert_image(
                    target_rect,
                    stream=image_bytes,
                    keep_proportion=field_type in {"image", "barcode", "qr", "signature"},
                    overlay=True,
                )
            except Exception as exc:
                raise ImageFieldPayloadError("Image helper field data could not be inserted into the PDF.") from exc
            stamped_any = True

        if not stamped_any:
            return pdf_bytes
        return document.tobytes(garbage=4, deflate=True)
    finally:
        document.close()
