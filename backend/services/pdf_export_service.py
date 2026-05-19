"""PDF export helpers shared by standard downloads and signing artifacts.

Flattening walks the document's pages and widget tree once, then rewrites the
catalog without stale AcroForm metadata, so the work stays
O(page_count + widget_count + pdf_object_count). The output preserves the visible
field values but removes the interactive widgets that ordinary PDF viewers would
otherwise keep editable.
"""

from __future__ import annotations

import io
from typing import Any

import fitz
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject

# MuPDF emits widget-appearance diagnostics directly to stderr during bake().
# Keep the console output disabled process-wide so failed flatten attempts still
# surface through Python exceptions without flooding server logs.
fitz.TOOLS.mupdf_display_errors(False)
fitz.TOOLS.mupdf_display_warnings(False)


_TRUE_WIDGET_VALUES = {"1", "true", "yes", "y", "on", "checked", "x"}
_OFF_WIDGET_VALUES = {"", "0", "false", "no", "n", "off", "unchecked"}
_TEXT_WIDGET_TYPES = {
    fitz.PDF_WIDGET_TYPE_TEXT,
    fitz.PDF_WIDGET_TYPE_COMBOBOX,
    fitz.PDF_WIDGET_TYPE_LISTBOX,
}
_CHECK_WIDGET_TYPES = {
    fitz.PDF_WIDGET_TYPE_CHECKBOX,
    fitz.PDF_WIDGET_TYPE_RADIOBUTTON,
}
_PYMUPDF_BASE14_ALIASES = {
    "helv": "helv",
    "helvetica": "helv",
    "dullyfonthelvetica": "helv",
    "hebo": "hebo",
    "helveticabold": "hebo",
    "dullyfonthelveticabold": "hebo",
    "heit": "heit",
    "helveticaoblique": "heit",
    "dullyfonthelveticaoblique": "heit",
    "hebi": "hebi",
    "helveticaboldoblique": "hebi",
    "dullyfonthelveticaboldoblique": "hebi",
    "cour": "cour",
    "courier": "cour",
    "dullyfontcourier": "cour",
    "cobo": "cobo",
    "courierbold": "cobo",
    "dullyfontcourierbold": "cobo",
    "coit": "coit",
    "courieroblique": "coit",
    "dullyfontcourieroblique": "coit",
    "cobi": "cobi",
    "courierboldoblique": "cobi",
    "dullyfontcourierboldoblique": "cobi",
    "tiro": "tiro",
    "timesroman": "tiro",
    "dullyfonttimesroman": "tiro",
    "tibo": "tibo",
    "timesbold": "tibo",
    "dullyfonttimesbold": "tibo",
    "tiit": "tiit",
    "timesitalic": "tiit",
    "dullyfonttimesitalic": "tiit",
    "tibi": "tibi",
    "timesbolditalic": "tibi",
    "dullyfonttimesbolditalic": "tibi",
    "symb": "symb",
    "symbol": "symb",
    "dullyfontsymbol": "symb",
    "zadb": "zadb",
    "zapfdingbats": "zadb",
    "dullyfontzapfdingbats": "zadb",
}
_PYMUPDF_BASE14_EXACT_ALIASES = {
    "Helv": "helv",
    "HeBo": "hebo",
    "HeOb": "heit",
    "HeBO": "hebi",
    "Cour": "cour",
    "CoBo": "cobo",
    "CoOb": "coit",
    "CoBO": "cobi",
    "Time": "tiro",
    "TiBo": "tibo",
    "TiIt": "tiit",
    "TiBI": "tibi",
}


def _coerce_widget_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _coerce_widget_color(value: Any) -> tuple[float, float, float]:
    if isinstance(value, (list, tuple)) and value:
        try:
            channels = [float(channel) for channel in value[:3]]
        except (TypeError, ValueError):
            return (0.0, 0.0, 0.0)
        if len(channels) == 1:
            channels = channels * 3
        while len(channels) < 3:
            channels.append(0.0)
        return tuple(max(0.0, min(1.0, channel)) for channel in channels[:3])
    return (0.0, 0.0, 0.0)


def _coerce_widget_font_size(widget, rect: fitz.Rect) -> float:
    try:
        font_size = float(getattr(widget, "text_fontsize", 0) or 0)
    except (TypeError, ValueError):
        font_size = 0.0
    if font_size > 0:
        return font_size
    return max(6.0, min(12.0, float(rect.height) * 0.65))


def _coerce_builtin_font_name(value: Any) -> str:
    exact_token = (
        str(value or "")
        .strip()
        .lstrip("/")
        .replace("-", "")
        .replace("_", "")
        .replace(" ", "")
    )
    exact_match = _PYMUPDF_BASE14_EXACT_ALIASES.get(exact_token)
    if exact_match:
        return exact_match
    normalized = exact_token.lower()
    return _PYMUPDF_BASE14_ALIASES.get(normalized, "helv")


def _widget_is_checked(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    normalized = str(value or "").strip().lower().lstrip("/")
    if normalized in _OFF_WIDGET_VALUES:
        return False
    if normalized in _TRUE_WIDGET_VALUES:
        return True
    return bool(normalized)


def _draw_flat_text_widget(page, payload: dict[str, Any]) -> None:
    value = _coerce_widget_text(payload.get("value")).replace("\r", " ").replace("\n", " ")
    if not value:
        return
    rect = fitz.Rect(payload["rect"])
    font_size = float(payload["font_size"])
    x = rect.x0 + max(1.0, min(4.0, rect.width * 0.05))
    y_from_bottom = max(1.0, (rect.height - font_size) * 0.45)
    baseline_y = rect.y1 - y_from_bottom
    page.insert_text(
        (x, baseline_y),
        value,
        fontsize=font_size,
        fontname=str(payload.get("font_name") or "helv"),
        color=payload.get("color") or (0.0, 0.0, 0.0),
        overlay=True,
    )


def _draw_flat_check_widget(page, payload: dict[str, Any]) -> None:
    rect = fitz.Rect(payload["rect"])
    if rect.is_empty or rect.width <= 0 or rect.height <= 0:
        return
    if not payload.get("checked"):
        return
    color = payload.get("color") or (0.0, 0.0, 0.0)
    stroke_width = max(min(rect.width, rect.height) * 0.08, 0.6)
    widget_type = payload.get("field_type")
    if widget_type == fitz.PDF_WIDGET_TYPE_RADIOBUTTON:
        inset = max(min(rect.width, rect.height) * 0.26, stroke_width)
        inner = fitz.Rect(rect.x0 + inset, rect.y0 + inset, rect.x1 - inset, rect.y1 - inset)
        if not inner.is_empty:
            page.draw_oval(inner, color=color, fill=color, width=stroke_width, overlay=True)
        return

    x1 = rect.x0 + rect.width * 0.14
    y1 = rect.y0 + rect.height * 0.55
    x2 = rect.x0 + rect.width * 0.40
    y2 = rect.y0 + rect.height * 0.84
    x3 = rect.x0 + rect.width * 0.86
    y3 = rect.y0 + rect.height * 0.16
    page.draw_polyline([(x1, y1), (x2, y2), (x3, y3)], color=color, width=stroke_width, overlay=True)


def _collect_widget_payload(widget) -> dict[str, Any]:
    rect = fitz.Rect(widget.rect)
    field_type = getattr(widget, "field_type", fitz.PDF_WIDGET_TYPE_UNKNOWN)
    return {
        "rect": rect,
        "field_type": field_type,
        "value": getattr(widget, "field_value", None),
        "font_size": _coerce_widget_font_size(widget, rect),
        "font_name": _coerce_builtin_font_name(getattr(widget, "text_font", None)),
        "color": _coerce_widget_color(getattr(widget, "text_color", None)),
        "checked": _widget_is_checked(getattr(widget, "field_value", None)),
    }


def _remove_acroform_catalog(pdf_bytes: bytes) -> bytes:
    """Drop stale AcroForm metadata after page widgets have been flattened."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    writer._root_object.pop(NameObject("/AcroForm"), None)  # pylint: disable=protected-access
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def flatten_pdf_form_widgets(pdf_bytes: bytes) -> bytes:
    """Bake visible widget appearances into page content and drop interactivity."""

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        for page in document:
            widgets = list(page.widgets() or [])
            payloads = [_collect_widget_payload(widget) for widget in widgets]
            for widget in widgets:
                page.delete_widget(widget)
            for payload in payloads:
                field_type = payload.get("field_type")
                if field_type in _TEXT_WIDGET_TYPES:
                    _draw_flat_text_widget(page, payload)
                elif field_type in _CHECK_WIDGET_TYPES:
                    _draw_flat_check_widget(page, payload)
        flattened = document.tobytes(garbage=4, deflate=True)
    finally:
        document.close()
    return _remove_acroform_catalog(flattened)


def pdf_has_form_widgets(pdf_bytes: bytes) -> bool:
    """Return True when the PDF still exposes interactive AcroForm widgets."""

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if not document.is_form_pdf:
            return False
        for page in document:
            if any(True for _ in (page.widgets() or ())):
                return True
        return False
    finally:
        document.close()


def build_immutable_signing_source_pdf(pdf_bytes: bytes) -> bytes:
    """Return the canonical non-editable source artifact stored for signing.

    This normalization is intentionally idempotent at the byte-selection level:
    PDFs that already have no live widgets are returned unchanged, while PDFs
    that still expose AcroForm widgets are flattened once before hashing and
    storage so "immutable source" downloads do not remain editable in viewers.
    """

    if not pdf_has_form_widgets(pdf_bytes):
        return bytes(pdf_bytes)
    return flatten_pdf_form_widgets(pdf_bytes)
