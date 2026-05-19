"""Form-field injector for building fillable PDFs."""

import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject,
    BooleanObject,
    DecodedStreamObject,
    DictionaryObject,
    NameObject,
    NumberObject,
    TextStringObject,
)

from .config import get_logger
from .output_layout import temp_prefix_from_pdf
from backend.services.pdf_service import (
    DEFAULT_FIELD_FONT_COLOR,
    DEFAULT_FIELD_FONT_CHOICE,
    DEFAULT_FIELD_FONT_SIZE_CHOICE,
    GLOBAL_FIELD_FONT_COLOR_CHOICE,
    GLOBAL_FIELD_FONT_CHOICE,
    GLOBAL_FIELD_FONT_SIZE_CHOICE,
    normalize_field_appearance_payload,
    normalize_field_font_color_override,
    normalize_field_font_override,
    normalize_field_font_size_override,
    normalize_pdf_base14_font_name,
    pdf_rgb_from_hex_color,
    resolve_auto_field_font_size,
    resolve_effective_field_font,
    resolve_effective_field_font_color,
    resolve_effective_field_font_size,
    should_write_field_font_color_default_appearance,
    should_write_field_font_size_default_appearance,
)

logger = get_logger(__name__)

DULLYPDF_APPEARANCE_METADATA_KEY = "/DullyPDFAppearance"
DULLYPDF_APPEARANCE_METADATA_SCHEMA = "dullypdf.appearance.v1"

# PDF field flag bits (see PDF spec): ReadOnly=1, Required=2.
FLAG_READ_ONLY = 1 << 0
FLAG_REQUIRED = 1 << 1

# Button field flags: NoToggleToOff=1<<14, Radio=1<<15, Pushbutton=1<<16.
FLAG_NO_TOGGLE_TO_OFF = 1 << 14
FLAG_RADIO = 1 << 15
FLAG_PUSHBUTTON = 1 << 16

# Choice field flag: Combo=1<<17.
FLAG_COMBO = 1 << 17

# Annotation flags used to keep DullyPDF-owned widgets visible and interactive.
ANNOT_FLAG_INVISIBLE = 1 << 0
ANNOT_FLAG_HIDDEN = 1 << 1
ANNOT_FLAG_PRINT = 1 << 2
ANNOT_FLAG_NO_VIEW = 1 << 5
ANNOT_FLAG_READ_ONLY = 1 << 6
ANNOT_FLAG_LOCKED = 1 << 7
ANNOT_FLAG_LOCKED_CONTENTS = 1 << 9
ANNOT_FLAGS_CLEAR_FOR_INTERACTIVE_WIDGETS = (
    ANNOT_FLAG_INVISIBLE
    | ANNOT_FLAG_HIDDEN
    | ANNOT_FLAG_NO_VIEW
    | ANNOT_FLAG_READ_ONLY
    | ANNOT_FLAG_LOCKED
    | ANNOT_FLAG_LOCKED_CONTENTS
)

WIDGET_DEDUPE_TOL = float(os.getenv("SANDBOX_WIDGET_DEDUPE_TOL", "0.5"))
STRIP_EXISTING_FIELDS = os.getenv("SANDBOX_STRIP_EXISTING_FIELDS", "false").lower() == "true"
DEDUP_EXISTING_WIDGETS = os.getenv("SANDBOX_DEDUP_EXISTING_WIDGETS", "true").lower() == "true"
CONFIDENCE_TAG_PREFIX = "dullypdf:confidence="
ROOT_KEYS_TO_PRESERVE = (
    "/OCProperties",
    "/Metadata",
    "/ViewerPreferences",
    "/Names",
    "/PageLayout",
    "/PageMode",
    "/Outlines",
)

BASE_14_FONT_RESOURCE_NAMES = {
    "Helvetica": "/Helv",
    "Helvetica-Bold": "/HeBo",
    "Helvetica-Oblique": "/HeOb",
    "Helvetica-BoldOblique": "/HeBO",
    "Times-Roman": "/Time",
    "Times-Bold": "/TiBo",
    "Times-Italic": "/TiIt",
    "Times-BoldItalic": "/TiBI",
    "Courier": "/Cour",
    "Courier-Bold": "/CoBo",
    "Courier-Oblique": "/CoOb",
    "Courier-BoldOblique": "/CoBO",
    "Symbol": "/Symbol",
    "ZapfDingbats": "/ZapfDingbats",
}

WINANSI_BASE_14_FONTS = frozenset(
    font for font in BASE_14_FONT_RESOURCE_NAMES if font not in {"Symbol", "ZapfDingbats"}
)


def _base14_font_dictionary(font_name: str, resource_name: str) -> DictionaryObject:
    """
    Build a viewer-friendly Type1 font resource for AcroForm text fields.
    """
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject(f"/{font_name}"),
            NameObject("/Name"): NameObject(resource_name),
        }
    )
    if font_name in WINANSI_BASE_14_FONTS:
        font[NameObject("/Encoding")] = NameObject("/WinAnsiEncoding")
    return font


def _resolve_origin(template: Dict[str, Any]) -> str:
    """
    Determine the coordinate origin for template rects.
    """
    coordinate_system = str(template.get("coordinateSystem") or "").lower()
    if "origintop" in coordinate_system or "top" in coordinate_system:
        return "top-left"
    if "originbottom" in coordinate_system or "bottom" in coordinate_system:
        return "bottom-left"
    origin = str(template.get("coordinateOrigin") or "").strip().lower()
    if origin:
        return origin
    return "top-left"


def _field_flags(field: Dict[str, Any]) -> int:
    """
    Convert field metadata into PDF annotation flags.
    """
    flags = 0
    read_only = field.get("readonly") if "readonly" in field else field.get("readOnly")
    if read_only:
        flags |= FLAG_READ_ONLY
    if field.get("required"):
        flags |= FLAG_REQUIRED
    return flags


def _coerce_int(value: Any, default: int = 0) -> int:
    """
    Convert PDF numeric objects into plain integers.
    """
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _checkbox_button_flags(flags: int) -> int:
    """
    Keep DullyPDF checkboxes independently toggleable in strict viewers.
    """
    return _coerce_int(flags) & ~(
        FLAG_READ_ONLY
        | FLAG_NO_TOGGLE_TO_OFF
        | FLAG_RADIO
        | FLAG_PUSHBUTTON
    )


def _radio_button_flags(flags: int) -> int:
    """
    Normalize radio parent flags while preserving non-button metadata bits.
    """
    return (
        _coerce_int(flags)
        & ~(FLAG_READ_ONLY | FLAG_PUSHBUTTON | FLAG_NO_TOGGLE_TO_OFF)
    ) | FLAG_RADIO


def _normalize_interactive_widget_annotation(widget: DictionaryObject) -> None:
    """
    Make a DullyPDF-owned widget visible, printable, and clickable.
    """
    current_flags = _coerce_int(widget.get("/F"))
    next_flags = (current_flags | ANNOT_FLAG_PRINT) & ~ANNOT_FLAGS_CLEAR_FOR_INTERACTIVE_WIDGETS
    widget[NameObject("/Type")] = NameObject("/Annot")
    widget[NameObject("/F")] = NumberObject(next_flags)


def _set_widget_page_reference(widget: DictionaryObject, page) -> None:
    """
    Point a widget annotation back at its owning page when pypdf exposes a page reference.
    """
    page_ref = getattr(page, "indirect_reference", None)
    if page_ref is not None:
        widget[NameObject("/P")] = page_ref


def _normalize_widget_for_page(widget: DictionaryObject, page) -> None:
    """
    Normalize widget annotation keys used by strict PDF viewers during focused editing.
    """
    if widget.get("/Subtype") != "/Widget":
        return
    _normalize_interactive_widget_annotation(widget)
    _set_widget_page_reference(widget, page)


def _coerce_template_bool(value: Any, *, default: bool) -> bool:
    """
    Normalize boolean-like template options without rejecting older JSON.
    """
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    return bool(value)


def _render_text_appearance_streams(template: Dict[str, Any]) -> bool:
    """
    Return whether text values should get widget /AP streams during injection.

    Text appearance streams are widget-owned AcroForm data, not flat page
    content. They keep editable downloads visually synchronized with /V and
    /DA, while flat exports later bake the same widget appearances into page
    content.
    """
    return _coerce_template_bool(
        template.get("renderTextAppearanceStreams"),
        default=True,
    )


def _normalize_rect(field: Dict[str, Any]) -> Optional[List[float]]:
    """
    Normalize field rects into [x1, y1, x2, y2].
    """
    rect = field.get("rect")
    if rect and isinstance(rect, list) and len(rect) == 4:
        return [float(v) for v in rect]

    x = field.get("x")
    y = field.get("y")
    width = field.get("width")
    height = field.get("height")
    if x is None or y is None or width is None or height is None:
        return None

    x1 = float(x)
    y1 = float(y)
    return [x1, y1, x1 + float(width), y1 + float(height)]


def _rects_nearly_equal(a: List[float], b: List[float], tol: float) -> bool:
    """
    Compare rectangles with a tolerance.
    """
    if len(a) != 4 or len(b) != 4:
        return False
    return all(abs(float(a[i]) - float(b[i])) <= tol for i in range(4))


def _normalize_field_kind(field_type: str) -> str:
    """
    Normalize field types into PDF widget kinds.
    """
    ft = (field_type or "").strip().lower()
    if ft in {"checkbox", "radio"}:
        return "button"
    if ft in {"combo", "combobox"}:
        return "choice"
    if ft == "signature":
        return "signature"
    return "text"


def _pdf_field_kind(field_type: Any) -> str:
    """
    Map PDF field type tokens to human-readable kinds.
    """
    ft = str(field_type or "")
    mapping = {
        "/Tx": "text",
        "/Btn": "button",
        "/Ch": "choice",
        "/Sig": "signature",
    }
    return mapping.get(ft, "unknown")


def _widget_field_name(annot: DictionaryObject) -> str:
    """
    Return the logical field name for a widget annotation.

    PDF forms can store /T directly on the widget or on a parent field with the
    widget listed in /Kids. DullyPDF treats that logical name as the product
    identifier when deciding whether an imported widget is stale.
    """
    name = str(annot.get("/T") or "").strip()
    if name:
        return name
    parent = annot.get("/Parent")
    if parent is None:
        return ""
    try:
        parent = parent.get_object()
    except AttributeError:
        pass
    if isinstance(parent, DictionaryObject):
        return str(parent.get("/T") or "").strip()
    return ""


def _parse_confidence_value(value: Any) -> Optional[float]:
    """
    Parse and bound confidence values into [0, 1].
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        try:
            confidence = float(str(value).strip())
        except (TypeError, ValueError):
            return None
    if confidence != confidence:
        return None
    return max(0.0, min(1.0, confidence))


def _confidence_tag(field: Dict[str, Any]) -> Optional[str]:
    """
    Build a metadata tag encoding confidence for a widget.
    """
    confidence = _parse_confidence_value(field.get("confidence"))
    if confidence is None:
        return None
    return f"{CONFIDENCE_TAG_PREFIX}{confidence:.4f}"


def _apply_confidence_tag(field: DictionaryObject, confidence_tag: Optional[str]) -> None:
    """
    Attach the confidence tag to the field tooltip.
    """
    if confidence_tag:
        field[NameObject("/TU")] = TextStringObject(confidence_tag)


def _collect_existing_widgets(writer: PdfWriter) -> Dict[int, List[Dict[str, Any]]]:
    """
    Gather existing widget rectangles so we can de-duplicate injections.
    """
    existing: Dict[int, List[Dict[str, Any]]] = {}
    for page_idx, page in enumerate(writer.pages, start=1):
        annots = page.get("/Annots")
        if annots is None:
            continue
        try:
            annots = annots.get_object()
        except AttributeError:
            pass
        for annot_ref in list(annots):
            annot = annot_ref.get_object() if hasattr(annot_ref, "get_object") else annot_ref
            if annot.get("/Subtype") != "/Widget":
                continue
            rect = annot.get("/Rect")
            if not rect or len(rect) != 4:
                continue
            ft = annot.get("/FT")
            if ft is None and annot.get("/Parent") is not None:
                parent = annot.get("/Parent").get_object()
                ft = parent.get("/FT")
            existing.setdefault(page_idx, []).append(
                {
                    "rect": [float(v) for v in rect],
                    "kind": _pdf_field_kind(ft),
                    "name": _widget_field_name(annot),
                }
            )
    return existing


def _target_name_for_field(field: Dict[str, Any], field_type: str, name: str) -> str:
    """
    Return the PDF field name that should be used for stale-widget cleanup.
    """
    if field_type == "radio":
        return _radio_group_name(field, name)
    return name


def _radio_group_name(field: Dict[str, Any], fallback_name: str) -> str:
    """
    Resolve the logical PDF parent field name for one DullyPDF radio option.

    Newer workspace payloads can carry a stable radioGroupId even when the
    editable group key is missing. Using the id before legacy per-option
    fallbacks prevents one UI radio group from exporting as separate one-option
    PDF groups.
    """
    return str(
        field.get("radioGroupKey")
        or field.get("radioGroupId")
        or field.get("group")
        or field.get("radioGroupLabel")
        or fallback_name
    ).strip()


def _build_target_widget_index(
    writer: PdfWriter,
    fields: List[Dict[str, Any]],
    *,
    origin: str,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Build desired widget positions keyed by logical PDF field name.

    This lets the injector remove old same-name widgets only when they no
    longer match any target rect. Time complexity is O(F), excluding the small
    cost of coordinate conversion per requested field.
    """
    targets: Dict[str, List[Dict[str, Any]]] = {}
    for field in fields:
        name = str(field.get("name") or "").strip()
        if not name:
            continue
        try:
            page_idx = int(field.get("page") or 1)
        except (TypeError, ValueError):
            continue
        if page_idx < 1 or page_idx > len(writer.pages):
            continue

        raw_rect = _normalize_rect(field)
        if raw_rect is None:
            continue

        field_type = str(field.get("type") or "text").lower().strip()
        if field_type == "date":
            field_type = "text"
        target_name = _target_name_for_field(field, field_type, name)
        if not target_name:
            continue

        page = writer.pages[page_idx - 1]
        page_box = page.cropbox if page.cropbox else page.mediabox
        pdf_rect = _to_pdf_rect(raw_rect, page_height=float(page_box.height), origin=origin)
        targets.setdefault(target_name, []).append(
            {
                "page": page_idx,
                "kind": _normalize_field_kind(field_type),
                "rect": pdf_rect,
            }
        )
    return targets


def _target_matches_widget(
    targets: List[Dict[str, Any]],
    *,
    page_idx: int,
    field_kind: str,
    rect: List[float],
) -> bool:
    """
    Return True when an existing widget matches one desired target slot.
    """
    for target in targets:
        if int(target.get("page") or 0) != page_idx:
            continue
        target_kind = str(target.get("kind") or "unknown")
        if field_kind not in {target_kind, "unknown"} and target_kind != "unknown":
            continue
        if _rects_nearly_equal(target.get("rect") or [], rect, WIDGET_DEDUPE_TOL):
            return True
    return False


def _object_matches_any_ref_or_object(value: Any, refs: List[Any], objects: List[DictionaryObject]) -> bool:
    """
    Compare a PDF object or indirect reference against removed widget entries.
    """
    for ref in refs:
        if value is ref or value == ref:
            return True
    try:
        obj = value.get_object()
    except AttributeError:
        obj = value
    return any(obj is removed_obj for removed_obj in objects)


def _prune_removed_widget_refs(
    entries: ArrayObject,
    removed_refs: List[Any],
    removed_objects: List[DictionaryObject],
) -> None:
    """
    Remove references to stale widgets from an array in place.
    """
    kept = [
        entry
        for entry in list(entries)
        if not _object_matches_any_ref_or_object(entry, removed_refs, removed_objects)
    ]
    entries.clear()
    for entry in kept:
        entries.append(entry)


def _remove_stale_widgets_by_target_names(
    writer: PdfWriter,
    target_widgets_by_name: Dict[str, List[Dict[str, Any]]],
) -> int:
    """
    Remove existing widgets whose names match current fields but whose rects do not.

    This handles the common "user moved an imported AcroField" case: the source
    widget should not remain behind while DullyPDF inserts the edited widget at
    the new rect. Time complexity is O(W * M) where W is existing widgets and M
    is the number of target widgets sharing the same name, usually one.
    """
    if not target_widgets_by_name:
        return 0

    removed_refs: List[Any] = []
    removed_objects: List[DictionaryObject] = []
    parent_refs: List[Any] = []
    removed_total = 0

    for page_idx, page in enumerate(writer.pages, start=1):
        annots = page.get("/Annots")
        if annots is None:
            continue
        try:
            annots_obj = annots.get_object()
        except AttributeError:
            annots_obj = annots
        if not isinstance(annots_obj, ArrayObject):
            continue

        kept_annots = ArrayObject()
        for annot_ref in list(annots_obj):
            annot = annot_ref.get_object() if hasattr(annot_ref, "get_object") else annot_ref
            if annot.get("/Subtype") != "/Widget":
                kept_annots.append(annot_ref)
                continue
            widget_name = _widget_field_name(annot)
            targets = target_widgets_by_name.get(widget_name)
            if not targets:
                kept_annots.append(annot_ref)
                continue
            rect = annot.get("/Rect")
            if not rect or len(rect) != 4:
                kept_annots.append(annot_ref)
                continue
            field_type = annot.get("/FT")
            parent_ref = annot.get("/Parent")
            if field_type is None and parent_ref is not None:
                try:
                    parent = parent_ref.get_object()
                except AttributeError:
                    parent = parent_ref
                if isinstance(parent, DictionaryObject):
                    field_type = parent.get("/FT")
            field_kind = _pdf_field_kind(field_type)
            rect_vals = [float(v) for v in rect]
            if _target_matches_widget(targets, page_idx=page_idx, field_kind=field_kind, rect=rect_vals):
                kept_annots.append(annot_ref)
                continue

            removed_refs.append(annot_ref)
            removed_objects.append(annot)
            if parent_ref is not None:
                parent_refs.append(parent_ref)
            removed_total += 1

        if len(kept_annots) != len(annots_obj):
            annots_obj.clear()
            for annot_ref in kept_annots:
                annots_obj.append(annot_ref)

    if not removed_refs:
        return 0

    for parent_ref in parent_refs:
        try:
            parent = parent_ref.get_object()
        except AttributeError:
            parent = parent_ref
        if not isinstance(parent, DictionaryObject):
            continue
        kids = parent.get("/Kids")
        if kids is None:
            continue
        try:
            kids_obj = kids.get_object()
        except AttributeError:
            kids_obj = kids
        if isinstance(kids_obj, ArrayObject):
            _prune_removed_widget_refs(kids_obj, removed_refs, removed_objects)

    acroform = writer._root_object.get("/AcroForm")  # pylint: disable=protected-access
    if acroform is None:
        return removed_total
    try:
        acroform = acroform.get_object()
    except AttributeError:
        pass
    if not isinstance(acroform, DictionaryObject):
        return removed_total
    fields = acroform.get("/Fields")
    if fields is None:
        return removed_total
    try:
        fields_obj = fields.get_object()
    except AttributeError:
        fields_obj = fields
    if not isinstance(fields_obj, ArrayObject):
        return removed_total

    kept_fields = ArrayObject()
    for field_ref in list(fields_obj):
        if _object_matches_any_ref_or_object(field_ref, removed_refs, removed_objects):
            continue
        field = field_ref.get_object() if hasattr(field_ref, "get_object") else field_ref
        if isinstance(field, DictionaryObject) and _widget_field_name(field) in target_widgets_by_name:
            kids = field.get("/Kids")
            if kids is not None:
                try:
                    kids_obj = kids.get_object()
                except AttributeError:
                    kids_obj = kids
                if isinstance(kids_obj, ArrayObject) and len(kids_obj) == 0:
                    continue
        kept_fields.append(field_ref)
    fields_obj.clear()
    for field_ref in kept_fields:
        fields_obj.append(field_ref)
    return removed_total


def _strip_existing_widget_annots(writer: PdfWriter) -> int:
    """
    Remove widget annotations from pages while leaving other annotations.
    """
    removed = 0
    for page in writer.pages:
        annots = page.get("/Annots")
        if annots is None:
            continue
        try:
            annots = annots.get_object()
        except AttributeError:
            pass
        if not annots:
            continue
        filtered = ArrayObject()
        for annot_ref in list(annots):
            annot = annot_ref.get_object() if hasattr(annot_ref, "get_object") else annot_ref
            if annot.get("/Subtype") == "/Widget":
                removed += 1
                continue
            filtered.append(annot_ref)
        page[NameObject("/Annots")] = filtered
    return removed


def _reset_acroform_fields(acroform: DictionaryObject) -> None:
    """
    Reset the AcroForm field list.
    """
    acroform[NameObject("/Fields")] = ArrayObject()


def _dedupe_existing_widget_annots(writer: PdfWriter, tol: float) -> int:
    """
    Drop duplicate widgets by comparing rects within a tolerance.

    We keep the first widget per rect/kind and discard later overlaps.
    Time complexity: O(W^2) per page for W widget annotations.
    """
    removed = 0
    for page in writer.pages:
        annots = page.get("/Annots")
        if annots is None:
            continue
        try:
            annots = annots.get_object()
        except AttributeError:
            pass
        if not annots:
            continue
        seen = []
        filtered = ArrayObject()
        for annot_ref in list(annots):
            annot = annot_ref.get_object() if hasattr(annot_ref, "get_object") else annot_ref
            if annot.get("/Subtype") != "/Widget":
                filtered.append(annot_ref)
                continue
            rect = annot.get("/Rect")
            if not rect or len(rect) != 4:
                filtered.append(annot_ref)
                continue
            field_type = annot.get("/FT")
            if field_type is None and annot.get("/Parent") is not None:
                parent = annot.get("/Parent").get_object()
                field_type = parent.get("/FT")
            field_kind = _pdf_field_kind(field_type)
            rect_vals = [float(v) for v in rect]
            is_dup = False
            for prev_kind, prev_rect in seen:
                if prev_kind not in {field_kind, "unknown"}:
                    continue
                if _rects_nearly_equal(prev_rect, rect_vals, tol):
                    is_dup = True
                    break
            if is_dup:
                removed += 1
                continue
            seen.append((field_kind, rect_vals))
            filtered.append(annot_ref)
        page[NameObject("/Annots")] = filtered
    return removed


def _has_duplicate_widget(
    existing: Dict[int, List[Dict[str, Any]]],
    page_idx: int,
    field_kind: str,
    rect: List[float],
) -> bool:
    """
    Check if a widget overlaps an existing one on the same page.
    """
    for widget in existing.get(page_idx, []):
        widget_kind = widget.get("kind")
        if widget_kind not in {field_kind, "unknown"}:
            continue
        if _rects_nearly_equal(widget.get("rect") or [], rect, WIDGET_DEDUPE_TOL):
            return True
    return False


def _to_pdf_rect(
    rect: List[float],
    *,
    page_height: float,
    origin: str,
) -> List[float]:
    """
    Convert template rects to PDF coordinate space.
    """
    x1, y1, x2, y2 = rect
    if origin.startswith("top"):
        return [x1, page_height - y2, x2, page_height - y1]
    return [x1, y1, x2, y2]


def _ensure_acroform(writer: PdfWriter) -> DictionaryObject:
    """
    Ensure an AcroForm dictionary exists with default fonts and appearance.
    """
    root = writer._root_object  # pylint: disable=protected-access
    acroform = root.get("/AcroForm")
    if acroform is None:
        acroform = DictionaryObject()
        root[NameObject("/AcroForm")] = acroform
    else:
        acroform = acroform.get_object()

    fields = acroform.get("/Fields")
    if fields is None:
        acroform[NameObject("/Fields")] = ArrayObject()

    if "/DR" not in acroform:
        acroform[NameObject("/DR")] = DictionaryObject()
    if "/DA" not in acroform:
        acroform[NameObject("/DA")] = TextStringObject("/Helv 10 Tf 0 g")

    dr = acroform["/DR"].get_object()
    if "/Font" not in dr:
        dr[NameObject("/Font")] = DictionaryObject()
    font_dict = dr["/Font"].get_object()
    if "/Helv" not in font_dict:
        helv = _base14_font_dictionary("Helvetica", "/Helv")
        font_ref = writer._add_object(helv)  # pylint: disable=protected-access
        font_dict[NameObject("/Helv")] = font_ref

    acroform[NameObject("/NeedAppearances")] = BooleanObject(False)
    return acroform


def _ensure_unique_page_annots(writer: PdfWriter) -> None:
    """
    Guard against PDFs that reuse a single /Annots array across pages.
    """
    seen: set[int] = set()
    for page in writer.pages:
        annots = page.get("/Annots")
        if annots is None:
            continue
        try:
            annots_obj = annots.get_object()
        except AttributeError:
            annots_obj = annots
        if not isinstance(annots_obj, ArrayObject):
            normalized = ArrayObject(list(annots_obj) if isinstance(annots_obj, list) else [])
            page[NameObject("/Annots")] = normalized
            seen.add(id(normalized))
            continue
        if id(annots_obj) in seen:
            # Clone shared /Annots arrays so fields do not appear on every page.
            annots_obj = ArrayObject(list(annots_obj))
            page[NameObject("/Annots")] = annots_obj
        seen.add(id(annots_obj))


def _add_annotation(page, annot_ref):
    """
    Append an annotation reference to the page annotations list.
    """
    try:
        annot = annot_ref.get_object()
    except AttributeError:
        annot = annot_ref
    if isinstance(annot, DictionaryObject):
        _normalize_widget_for_page(annot, page)
    annots = page.get("/Annots")
    if annots is None:
        annots = ArrayObject()
        page[NameObject("/Annots")] = annots
    else:
        annots = annots.get_object()
    annots.append(annot_ref)


def _ensure_page_font_resource(page, font_resource_name: str, font_ref) -> None:
    """
    Mirror a field font resource onto the page for interactive editor fallback.

    AcroForm /DR is the spec-level home for field fonts, but several viewers
    derive the active typing font from page resources or a simplified font-name
    lookup. Keeping the same resource on the page makes selected-field editing
    and inactive widget appearances more likely to resolve the same font.
    """
    if not font_ref or not font_resource_name:
        return
    resources = page.get("/Resources")
    if resources is None:
        resources = DictionaryObject()
        page[NameObject("/Resources")] = resources
    else:
        try:
            resources = resources.get_object()
        except AttributeError:
            pass
    font_dict = resources.get("/Font")
    if font_dict is None:
        font_dict = DictionaryObject()
        resources[NameObject("/Font")] = font_dict
    else:
        try:
            font_dict = font_dict.get_object()
        except AttributeError:
            pass
    resource_key = NameObject(font_resource_name)
    if resource_key not in font_dict:
        font_dict[resource_key] = font_ref


def _register_field(acroform: DictionaryObject, field_ref):
    """
    Append a field reference to the AcroForm field list.
    """
    fields = acroform.get("/Fields")
    if fields is None:
        fields = ArrayObject()
        acroform[NameObject("/Fields")] = fields
    else:
        fields = fields.get_object()
    fields.append(field_ref)


def _pdf_object_matches(entry: Any, target_ref: Any, target_obj: DictionaryObject) -> bool:
    """
    Return true when an array entry points at a target reference or object.
    """
    if entry is target_ref or entry == target_ref:
        return True
    try:
        entry_obj = entry.get_object()
    except AttributeError:
        entry_obj = entry
    return entry_obj is target_obj


def _pdf_object_list_contains(entries: ArrayObject, target_ref: Any, target_obj: DictionaryObject) -> bool:
    """
    Return true when an array already contains a target reference or object.
    """
    for entry in list(entries):
        if _pdf_object_matches(entry, target_ref, target_obj):
            return True
    return False


def _remove_pdf_object_from_array(
    entries: ArrayObject,
    target_ref: Any,
    target_obj: DictionaryObject,
) -> Tuple[ArrayObject, bool]:
    """
    Return a copy of an array with matching references/objects removed.
    """
    filtered = ArrayObject()
    removed = False
    for entry in list(entries):
        if _pdf_object_matches(entry, target_ref, target_obj):
            removed = True
            continue
        filtered.append(entry)
    return filtered, removed


def _ensure_acroform_field_registered(
    acroform: DictionaryObject,
    field_ref: Any,
    field: DictionaryObject,
) -> None:
    """
    Register a reused source widget or parent field in the output AcroForm tree.
    """
    fields = acroform.get("/Fields")
    if fields is None:
        fields = ArrayObject()
        acroform[NameObject("/Fields")] = fields
    else:
        fields = fields.get_object()
    if not _pdf_object_list_contains(fields, field_ref, field):
        fields.append(field_ref)


def _remove_acroform_field_reference(
    acroform: DictionaryObject,
    field_ref: Any,
    field: DictionaryObject,
) -> bool:
    """
    Remove a stale top-level field reference from the AcroForm tree.
    """
    fields = acroform.get("/Fields")
    if fields is None:
        return False
    fields = fields.get_object()
    filtered, removed = _remove_pdf_object_from_array(fields, field_ref, field)
    if removed:
        acroform[NameObject("/Fields")] = filtered
    return removed


def _ensure_parent_lists_widget(
    parent: DictionaryObject,
    widget_ref: Any,
    widget: DictionaryObject,
) -> None:
    """
    Keep a reused parent field connected to its page widget.
    """
    kids = parent.get("/Kids")
    if kids is None:
        parent[NameObject("/Kids")] = ArrayObject([widget_ref])
        return
    kids = kids.get_object()
    if not _pdf_object_list_contains(kids, widget_ref, widget):
        kids.append(widget_ref)


def _remove_parent_widget_reference(
    parent: DictionaryObject,
    widget_ref: Any,
    widget: DictionaryObject,
) -> bool:
    """
    Detach a widget from a stale parent /Kids array.
    """
    kids = parent.get("/Kids")
    if kids is None:
        return False
    kids = kids.get_object()
    filtered, removed = _remove_pdf_object_from_array(kids, widget_ref, widget)
    if removed:
        parent[NameObject("/Kids")] = filtered
    return removed


def _field_kid_count(field: DictionaryObject) -> int:
    """
    Count child widgets on a parent field.
    """
    kids = field.get("/Kids")
    if kids is None:
        return 0
    try:
        return len(kids.get_object())
    except AttributeError:
        return len(kids)


def _checkbox_should_detach_parent(parent: DictionaryObject) -> bool:
    """
    Decide whether a reused checkbox must be separated from a source parent.
    """
    parent_flags = _coerce_int(parent.get("/Ff"))
    return _field_kid_count(parent) > 1 or bool(parent_flags & (FLAG_RADIO | FLAG_PUSHBUTTON))


def _pdf_escape_text(value: str) -> str:
    """
    Escape PDF string literals for content streams.
    """
    return str(value).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").replace("\r", " ").replace("\n", " ")


def _format_pdf_number(value: float) -> str:
    """
    Format numeric PDF operands without noisy trailing zeroes.
    """
    numeric = float(value)
    if numeric.is_integer():
        return str(int(numeric))
    return f"{numeric:.2f}".rstrip("0").rstrip(".")


def _format_pdf_rgb_operator(color: Optional[str], operator: str = "rg") -> str:
    """
    Format a PDF RGB color operator for text or stroke commands.
    """
    red, green, blue = pdf_rgb_from_hex_color(color or DEFAULT_FIELD_FONT_COLOR)
    return " ".join(
        [
            _format_pdf_number(red),
            _format_pdf_number(green),
            _format_pdf_number(blue),
            operator,
        ]
    )


def _helv_font_ref(acroform: DictionaryObject):
    """
    Retrieve the Helvetica font reference from the AcroForm resource dict.
    """
    dr = acroform.get("/DR")
    if dr is None:
        return None
    try:
        dr = dr.get_object()
    except AttributeError:
        pass
    font_dict = dr.get("/Font")
    if font_dict is None:
        return None
    try:
        font_dict = font_dict.get_object()
    except AttributeError:
        pass
    return font_dict.get("/Helv")


def _font_dict_from_acroform(acroform: DictionaryObject) -> Optional[DictionaryObject]:
    """
    Return the AcroForm font resource dictionary when present.
    """
    dr = acroform.get("/DR")
    if dr is None:
        return None
    try:
        dr = dr.get_object()
    except AttributeError:
        pass
    font_dict = dr.get("/Font")
    if font_dict is None:
        return None
    try:
        font_dict = font_dict.get_object()
    except AttributeError:
        pass
    return font_dict


def _base14_font_resource(
    writer: PdfWriter,
    acroform: DictionaryObject,
    font_name: Optional[str],
):
    """
    Resolve the PDF resource name and object reference for a Base 14 font.
    """
    normalized_font = normalize_pdf_base14_font_name(font_name)
    if not normalized_font:
        return "/Helv", _helv_font_ref(acroform)
    resource_name = BASE_14_FONT_RESOURCE_NAMES[normalized_font]
    font_dict = _font_dict_from_acroform(acroform)
    if font_dict is None:
        return "/Helv", _helv_font_ref(acroform)
    resource_key = NameObject(resource_name)
    existing_ref = font_dict.get(resource_key)
    if existing_ref:
        return resource_name, existing_ref
    font_obj = _base14_font_dictionary(normalized_font, resource_name)
    font_ref = writer._add_object(font_obj)  # pylint: disable=protected-access
    font_dict[resource_key] = font_ref
    return resource_name, font_ref


def _ensure_field_font_resource(field: DictionaryObject, font_resource_name: str, font_ref) -> None:
    """
    Put the selected text font next to the field /DA for focused editor lookup.
    """
    if not font_ref:
        return
    dr = field.get("/DR")
    if dr is None:
        dr = DictionaryObject()
        field[NameObject("/DR")] = dr
    else:
        try:
            dr = dr.get_object()
        except AttributeError:
            pass
    if not isinstance(dr, DictionaryObject):
        return
    fonts = dr.get("/Font")
    if fonts is None:
        fonts = DictionaryObject()
        dr[NameObject("/Font")] = fonts
    else:
        try:
            fonts = fonts.get_object()
        except AttributeError:
            pass
    if isinstance(fonts, DictionaryObject):
        fonts[NameObject(font_resource_name)] = font_ref


def _selected_text_font_resource(
    writer: PdfWriter,
    acroform: DictionaryObject,
    *,
    field: Optional[Dict[str, Any]] = None,
    font_name: Optional[str] = None,
    global_field_font: str = DEFAULT_FIELD_FONT_CHOICE,
):
    """
    Resolve the appearance font for a text-like field.
    """
    resolved_font = normalize_pdf_base14_font_name(font_name)
    if resolved_font is None and field is not None:
        resolved_font = resolve_effective_field_font(field, global_field_font=global_field_font)
    return _base14_font_resource(writer, acroform, resolved_font)


def _build_text_appearance(
    writer: PdfWriter,
    *,
    width: float,
    height: float,
    value: str,
    font_ref,
    font_resource_name: str = "/Helv",
    font_size: Optional[float] = None,
    font_color: Optional[str] = None,
):
    """
    Build a simple appearance stream for text widgets.
    """
    if width <= 0.0 or height <= 0.0:
        return None
    if not font_ref:
        return None

    safe_text = _pdf_escape_text(value)
    # The auto branch preserves the historical field-height sizing formula.
    resolved_font_size = float(font_size) if font_size is not None else resolve_auto_field_font_size(height)
    x = max(1.0, min(4.0, width * 0.05))
    y = max(1.0, (height - resolved_font_size) * 0.45)

    commands = [
        "q",
        f"0 0 {width:.2f} {height:.2f} re W n",
        "BT",
        f"{font_resource_name} {resolved_font_size:.2f} Tf",
        _format_pdf_rgb_operator(font_color, "rg"),
        f"1 0 0 1 {x:.2f} {y:.2f} Tm",
        f"({safe_text}) Tj",
        "ET",
        "Q",
    ]

    resources = DictionaryObject(
        {
            NameObject("/ProcSet"): ArrayObject([NameObject("/PDF"), NameObject("/Text")]),
            NameObject("/Font"): DictionaryObject({NameObject(font_resource_name): font_ref}),
        }
    )

    stream = DecodedStreamObject()
    stream.set_data("\n".join(commands).encode("utf-8"))
    stream.update(
        {
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Form"),
            NameObject("/BBox"): ArrayObject(
                [
                    NumberObject(0),
                    NumberObject(0),
                    NumberObject(width),
                    NumberObject(height),
                ]
            ),
            NameObject("/Resources"): resources,
        }
    )
    return writer._add_object(stream)  # pylint: disable=protected-access


def _set_text_default_appearance(
    field: DictionaryObject,
    *,
    font_resource_name: str,
    font_size: Optional[float] = None,
    font_color: Optional[str] = None,
) -> None:
    """
    Set the widget default appearance when custom text styling is selected.
    """
    if font_resource_name == "/Helv" and font_size is None and font_color is None:
        return
    resolved_font_size = font_size if font_size is not None else 10.0
    field[NameObject("/DA")] = TextStringObject(
        f"{font_resource_name} {_format_pdf_number(resolved_font_size)} Tf "
        f"{_format_pdf_rgb_operator(font_color, 'rg')}"
    )


def _apply_text_default_appearance(
    writer: PdfWriter,
    field: DictionaryObject,
    acroform: DictionaryObject,
    *,
    font_name: Optional[str] = None,
    font_size: Optional[float] = None,
    font_color: Optional[str] = None,
) -> None:
    """
    Register the selected font resource and write the widget default appearance.
    """
    font_resource_name, _font_ref = _selected_text_font_resource(
        writer,
        acroform,
        font_name=font_name,
    )
    _ensure_field_font_resource(field, font_resource_name, _font_ref)
    _set_text_default_appearance(
        field,
        font_resource_name=font_resource_name,
        font_size=font_size,
        font_color=font_color,
    )


def _set_acroform_default_appearance(
    writer: PdfWriter,
    acroform: DictionaryObject,
    *,
    global_field_font: Any = DEFAULT_FIELD_FONT_CHOICE,
    global_field_font_size: Any = DEFAULT_FIELD_FONT_SIZE_CHOICE,
    global_field_font_color: Any = DEFAULT_FIELD_FONT_COLOR,
) -> None:
    """
    Store the workspace fallback appearance on the AcroForm root.
    """
    font_resource_name, _font_ref = _selected_text_font_resource(
        writer,
        acroform,
        font_name=normalize_pdf_base14_font_name(global_field_font),
    )
    try:
        font_size = float(global_field_font_size)
    except (TypeError, ValueError):
        font_size = 10.0
    if font_size <= 0 or font_size != font_size:
        font_size = 10.0
    acroform[NameObject("/DA")] = TextStringObject(
        f"{font_resource_name} {_format_pdf_number(font_size)} Tf "
        f"{_format_pdf_rgb_operator(str(global_field_font_color or DEFAULT_FIELD_FONT_COLOR), 'rg')}"
    )


def _apply_checkbox_value(widget: DictionaryObject, *, export_value: str, value: Any) -> None:
    """
    Set checkbox widget state based on a value.
    """
    checked = _checkbox_checked(value, export_value)
    widget[NameObject("/AS")] = NameObject(f"/{export_value}" if checked else "/Off")
    widget[NameObject("/V")] = NameObject(f"/{export_value}" if checked else "/Off")


def _apply_checkbox_widget_appearance(
    writer: PdfWriter,
    widget: DictionaryObject,
    *,
    rect: List[float],
    export_value: str,
) -> None:
    """
    Attach normal appearance states for a checkbox widget.
    """
    width = float(rect[2]) - float(rect[0])
    height = float(rect[3]) - float(rect[1])
    ap_off = _build_checkbox_appearance(writer, width=width, height=height, checked=False)
    ap_on = _build_checkbox_appearance(writer, width=width, height=height, checked=True)
    if ap_off is None or ap_on is None:
        return
    widget[NameObject("/AP")] = DictionaryObject(
        {
            NameObject("/N"): DictionaryObject(
                {
                    NameObject("/Off"): ap_off,
                    NameObject(f"/{export_value}"): ap_on,
                }
            )
        }
    )


def _apply_radio_widget_appearance(
    writer: PdfWriter,
    widget: DictionaryObject,
    *,
    rect: List[float],
    export_value: str,
) -> None:
    """
    Attach normal appearance states for a radio widget.
    """
    width = float(rect[2]) - float(rect[0])
    height = float(rect[3]) - float(rect[1])
    ap_off = _build_radio_appearance(writer, width=width, height=height, checked=False)
    ap_on = _build_radio_appearance(writer, width=width, height=height, checked=True)
    if ap_off is None or ap_on is None:
        return
    widget[NameObject("/AP")] = DictionaryObject(
        {
            NameObject("/N"): DictionaryObject(
                {
                    NameObject("/Off"): ap_off,
                    NameObject(f"/{export_value}"): ap_on,
                }
            )
        }
    )


def _apply_text_value(field: DictionaryObject, *, value: Any) -> None:
    """
    Assign text values to a field dictionary.
    """
    field[NameObject("/V")] = TextStringObject(str(value))
    field[NameObject("/DV")] = TextStringObject(str(value))


def _apply_text_appearance(
    writer: PdfWriter,
    widget: DictionaryObject,
    acroform: DictionaryObject,
    *,
    rect: List[float],
    value: Any,
    font_name: Optional[str] = None,
    font_size: Optional[float] = None,
    font_color: Optional[str] = None,
    default_appearance_font_size: Optional[float] = None,
    default_appearance_font_color: Optional[str] = None,
    render_appearance_stream: bool = True,
) -> None:
    """
    Attach an appearance stream for text fields.
    """
    width = float(rect[2]) - float(rect[0])
    height = float(rect[3]) - float(rect[1])
    font_resource_name, font_ref = _selected_text_font_resource(
        writer,
        acroform,
        font_name=font_name,
    )
    _ensure_field_font_resource(widget, font_resource_name, font_ref)
    if not render_appearance_stream:
        widget.pop(NameObject("/AP"), None)
        _set_text_default_appearance(
            widget,
            font_resource_name=font_resource_name,
            font_size=default_appearance_font_size,
            font_color=default_appearance_font_color,
        )
        return

    ap = _build_text_appearance(
        writer,
        width=width,
        height=height,
        value=str(value),
        font_ref=font_ref,
        font_resource_name=font_resource_name,
        font_size=font_size,
        font_color=font_color,
    )
    if ap is not None:
        widget[NameObject("/AP")] = DictionaryObject({NameObject("/N"): ap})
        _set_text_default_appearance(
            widget,
            font_resource_name=font_resource_name,
            font_size=default_appearance_font_size,
            font_color=default_appearance_font_color,
        )


def _update_existing_widget(
    writer: PdfWriter,
    page,
    acroform: DictionaryObject,
    *,
    rect: List[float],
    field_type: str,
    value: Any,
    export_value: str,
    flags: int = 0,
    new_name: Optional[str] = None,
    confidence_tag: Optional[str] = None,
    font_name: Optional[str] = None,
    font_size: Optional[float] = None,
    font_color: Optional[str] = None,
    default_appearance_font_size: Optional[float] = None,
    default_appearance_font_color: Optional[str] = None,
    render_text_appearance_streams: bool = True,
    radio_group_state: Optional[Dict[str, Any]] = None,
    radio_group_name: Optional[str] = None,
) -> bool:
    """
    Update matching existing widgets instead of inserting duplicates.
    """
    field_type_norm = str(field_type or "").strip().lower()
    if field_type_norm == "date":
        field_type_norm = "text"
    if field_type_norm in {"combo", "combobox"}:
        field_type_norm = "text"

    annots = page.get("/Annots")
    if annots is None:
        return False
    try:
        annots = annots.get_object()
    except AttributeError:
        pass
    if not annots:
        return False

    updated_any = False
    for annot_ref in list(annots):
        annot = annot_ref.get_object() if hasattr(annot_ref, "get_object") else annot_ref
        if annot.get("/Subtype") != "/Widget":
            continue
        annot_rect = annot.get("/Rect")
        if not annot_rect or len(annot_rect) != 4:
            continue
        rect_vals = [float(v) for v in annot_rect]
        if not _rects_nearly_equal(rect_vals, rect, WIDGET_DEDUPE_TOL):
            continue

        _normalize_widget_for_page(annot, page)
        updated_this_widget = False
        field = annot
        field_ref = annot_ref
        parent_ref = annot.get("/Parent")
        if parent_ref is not None:
            try:
                parent = parent_ref.get_object()
            except AttributeError:
                parent = parent_ref
            if isinstance(parent, DictionaryObject):
                field = parent
                field_ref = parent_ref

        if field_type_norm == "checkbox" and field is not annot and _checkbox_should_detach_parent(field):
            _remove_parent_widget_reference(field, annot_ref, annot)
            _remove_acroform_field_reference(acroform, field_ref, field)
            annot.pop(NameObject("/Parent"), None)
            field = annot
            field_ref = annot_ref
            updated_this_widget = True

        radio_requested_export_value = export_value
        if field_type_norm == "radio" and radio_group_state is not None:
            group = _ensure_radio_group_field(
                writer,
                acroform,
                radio_group_state,
                radio_group_name or new_name or export_value,
                flags=flags,
            )
            export_value = _reserve_radio_export_value(group, export_value)
            if field is not annot:
                _remove_parent_widget_reference(field, annot_ref, annot)
                _remove_acroform_field_reference(acroform, field_ref, field)
            else:
                _remove_acroform_field_reference(acroform, field_ref, field)
            annot[NameObject("/Parent")] = group["ref"]
            for stale_key in ("/FT", "/T", "/Ff", "/V", "/DV", "/Kids"):
                annot.pop(NameObject(stale_key), None)
            field = group["dict"]
            field_ref = group["ref"]
            _ensure_parent_lists_widget(field, annot_ref, annot)
            updated_this_widget = True

        if field_type_norm in {"checkbox", "radio"} and field.get("/FT") is None:
            field[NameObject("/FT")] = NameObject("/Btn")
            updated_this_widget = True

        if field_type_norm == "checkbox":
            field[NameObject("/Ff")] = NumberObject(_checkbox_button_flags(flags))
            updated_this_widget = True
        elif field_type_norm == "radio":
            field[NameObject("/Ff")] = NumberObject(_radio_button_flags(flags))
            updated_this_widget = True

        if field is not annot:
            try:
                _ensure_parent_lists_widget(field, annot_ref, annot)
                updated_this_widget = True
            except AttributeError:
                pass

        if new_name:
            current_name = field.get("/T")
            if not current_name or str(current_name) != new_name:
                field[NameObject("/T")] = TextStringObject(new_name)
                updated_this_widget = True

        if field_type_norm == "radio":
            _normalize_interactive_widget_annotation(annot)
            checked = _checkbox_checked(value, radio_requested_export_value) or _checkbox_checked(
                value,
                export_value,
            )
            annot[NameObject("/AS")] = NameObject(f"/{export_value}" if checked else "/Off")
            _apply_radio_widget_appearance(
                writer,
                annot,
                rect=rect,
                export_value=export_value,
            )
            if field is not annot and checked:
                # Radio groups store the selected option on the parent field.
                field[NameObject("/V")] = NameObject(f"/{export_value}")
            elif field is not annot and field.get("/V") is None:
                field[NameObject("/V")] = NameObject("/Off")
            updated_this_widget = True
        elif field_type_norm == "checkbox":
            _normalize_interactive_widget_annotation(annot)
            _apply_checkbox_value(annot, export_value=export_value, value=value)
            _apply_checkbox_widget_appearance(
                writer,
                annot,
                rect=rect,
                export_value=export_value,
            )
            if field is not annot:
                # Keep parent and widget state aligned so viewers read consistent values.
                field[NameObject("/V")] = annot.get("/V")
            updated_this_widget = True
        elif value is not None:
            if field_type_norm == "text":
                font_resource_name, font_ref = _selected_text_font_resource(
                    writer,
                    acroform,
                    font_name=font_name,
                )
                _ensure_page_font_resource(page, font_resource_name, font_ref)
                _apply_text_value(field, value=value)
                _apply_text_appearance(
                    writer,
                    annot,
                    acroform,
                    rect=rect,
                    value=value,
                    font_name=font_name,
                    font_size=font_size,
                    font_color=font_color,
                    default_appearance_font_size=default_appearance_font_size,
                    default_appearance_font_color=default_appearance_font_color,
                    render_appearance_stream=render_text_appearance_streams,
                )
                if field is not annot:
                    # Copy down the value when the widget has a separate parent field.
                    annot[NameObject("/V")] = field.get("/V")
                    _ensure_field_font_resource(field, font_resource_name, font_ref)
                    if annot.get("/DA") is not None:
                        field[NameObject("/DA")] = annot.get("/DA")
                    if not render_text_appearance_streams:
                        field.pop(NameObject("/AP"), None)
                updated_this_widget = True
        elif field_type_norm == "text" and (
            font_name is not None
            or default_appearance_font_size is not None
            or default_appearance_font_color is not None
        ):
            font_resource_name, font_ref = _selected_text_font_resource(
                writer,
                acroform,
                font_name=font_name,
            )
            _ensure_page_font_resource(page, font_resource_name, font_ref)
            _apply_text_default_appearance(
                writer,
                annot,
                acroform,
                font_name=font_name,
                font_size=default_appearance_font_size,
                font_color=default_appearance_font_color,
            )
            if field is not annot and annot.get("/DA") is not None:
                _ensure_field_font_resource(field, font_resource_name, font_ref)
                field[NameObject("/DA")] = annot.get("/DA")
            if not render_text_appearance_streams:
                annot.pop(NameObject("/AP"), None)
                if field is not annot:
                    field.pop(NameObject("/AP"), None)
            updated_this_widget = True
        if confidence_tag:
            _apply_confidence_tag(annot, confidence_tag)
            if field is not annot:
                _apply_confidence_tag(field, confidence_tag)
            updated_this_widget = True
        if updated_this_widget:
            _ensure_acroform_field_registered(acroform, field_ref, field)
            updated_any = True

    return updated_any


def _checkbox_checked(value: Any, export_value: str) -> bool:
    """
    Interpret checkbox values across common bool/string formats.
    """
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    value_str = str(value).strip().lower()
    if value_str in {"true", "yes", "on", "1"}:
        return True
    return value_str == export_value.strip().lower()


def _build_field_list(template: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Return the list of field definitions from the template.
    """
    return list(template.get("fields") or [])


def _field_appearance_metadata(field: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Return DullyPDF-only appearance metadata needed to rehydrate uploads.
    """
    field_type = str(field.get("type") or "text").strip().lower()
    if field_type not in {"text", "date", "combo", "combobox"}:
        return None

    name = str(field.get("name") or "").strip()
    if not name:
        return None

    try:
        page = int(field.get("page") or 1)
    except (TypeError, ValueError):
        page = 1

    metadata: Dict[str, Any] = {
        "name": name,
        "page": page,
        "type": "date" if field_type == "date" else "text",
    }
    font_name = normalize_field_font_override(field.get("fontName"))
    if font_name and font_name != GLOBAL_FIELD_FONT_CHOICE:
        metadata["fontName"] = font_name
    font_size = normalize_field_font_size_override(field.get("fontSize"))
    if font_size is not None and font_size != GLOBAL_FIELD_FONT_SIZE_CHOICE:
        metadata["fontSize"] = font_size
    font_color = normalize_field_font_color_override(field.get("fontColor"))
    if font_color and font_color != GLOBAL_FIELD_FONT_COLOR_CHOICE:
        metadata["fontColor"] = font_color

    return metadata if any(key in metadata for key in ("fontName", "fontSize", "fontColor")) else None


def _set_dullypdf_appearance_metadata(
    writer: PdfWriter,
    fields: List[Dict[str, Any]],
    appearance: Dict[str, Any],
) -> None:
    """
    Store DullyPDF appearance intent so re-upload can restore global and field overrides.
    """
    payload = {
        "schema": DULLYPDF_APPEARANCE_METADATA_SCHEMA,
        "appearance": normalize_field_appearance_payload(appearance),
        "fields": [
            field_metadata
            for field in fields
            if (field_metadata := _field_appearance_metadata(field)) is not None
        ],
    }
    try:
        writer.add_metadata(
            {
                DULLYPDF_APPEARANCE_METADATA_KEY: json.dumps(
                    payload,
                    ensure_ascii=True,
                    separators=(",", ":"),
                    sort_keys=True,
                )
            }
        )
    except Exception as error:  # pragma: no cover - defensive; PDF export can continue without metadata.
        logger.debug("Failed to attach DullyPDF appearance metadata: %s", error)


def _add_text_field(
    writer: PdfWriter,
    page,
    acroform: DictionaryObject,
    *,
    name: str,
    rect: List[float],
    flags: int,
    value: Any = None,
    confidence_tag: Optional[str] = None,
    font_name: Optional[str] = None,
    font_size: Optional[float] = None,
    font_color: Optional[str] = None,
    default_appearance_font_size: Optional[float] = None,
    default_appearance_font_color: Optional[str] = None,
    render_text_appearance_streams: bool = True,
):
    """
    Add a text field widget to the PDF.
    """
    field = DictionaryObject(
        {
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/T"): TextStringObject(name),
            NameObject("/Rect"): ArrayObject([NumberObject(v) for v in rect]),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Ff"): NumberObject(flags),
        }
    )
    _apply_confidence_tag(field, confidence_tag)
    font_resource_name, font_ref = _selected_text_font_resource(
        writer,
        acroform,
        font_name=font_name,
    )
    _ensure_page_font_resource(page, font_resource_name, font_ref)
    _ensure_field_font_resource(field, font_resource_name, font_ref)
    _set_text_default_appearance(
        field,
        font_resource_name=font_resource_name,
        font_size=default_appearance_font_size,
        font_color=default_appearance_font_color,
    )
    if value is not None:
        field[NameObject("/V")] = TextStringObject(str(value))
        field[NameObject("/DV")] = TextStringObject(str(value))

        if render_text_appearance_streams:
            width = float(rect[2]) - float(rect[0])
            height = float(rect[3]) - float(rect[1])
            ap = _build_text_appearance(
                writer,
                width=width,
                height=height,
                value=str(value),
                font_ref=font_ref,
                font_resource_name=font_resource_name,
                font_size=font_size,
                font_color=font_color,
            )
            if ap is not None:
                field[NameObject("/AP")] = DictionaryObject({NameObject("/N"): ap})
    field_ref = writer._add_object(field)  # pylint: disable=protected-access
    _add_annotation(page, field_ref)
    _register_field(acroform, field_ref)


def _add_checkbox_field(
    writer: PdfWriter,
    page,
    acroform: DictionaryObject,
    *,
    name: str,
    rect: List[float],
    flags: int,
    export_value: str,
    value: Any = None,
    confidence_tag: Optional[str] = None,
):
    """
    Add a checkbox field widget to the PDF.
    """
    checked = _checkbox_checked(value, export_value)
    field = DictionaryObject(
        {
            NameObject("/FT"): NameObject("/Btn"),
            NameObject("/T"): TextStringObject(name),
            NameObject("/Rect"): ArrayObject([NumberObject(v) for v in rect]),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Ff"): NumberObject(_checkbox_button_flags(flags)),
            NameObject("/AS"): NameObject(f"/{export_value}" if checked else "/Off"),
            NameObject("/V"): NameObject(f"/{export_value}" if checked else "/Off"),
        }
    )
    _normalize_interactive_widget_annotation(field)
    _apply_confidence_tag(field, confidence_tag)
    # Create visible on/off states so strict viewers can repaint after clicks.
    _apply_checkbox_widget_appearance(
        writer,
        field,
        rect=rect,
        export_value=export_value,
    )
    field_ref = writer._add_object(field)  # pylint: disable=protected-access
    _add_annotation(page, field_ref)
    _register_field(acroform, field_ref)


def _build_checkbox_appearance(
    writer: PdfWriter,
    *,
    width: float,
    height: float,
    checked: bool,
):
    """
    Build an appearance stream for checkbox widgets.
    """
    if width <= 0.0 or height <= 0.0:
        return None
    border_width = max(min(width, height) * 0.08, 0.6)
    inset = border_width / 2.0
    inner_w = max(width - (inset * 2.0), 0.0)
    inner_h = max(height - (inset * 2.0), 0.0)
    commands = [
        "0 0 0 RG",
        f"{border_width:.2f} w",
        f"{inset:.2f} {inset:.2f} {inner_w:.2f} {inner_h:.2f} re S",
    ]
    if checked:
        x1 = inset + inner_w * 0.14
        y1 = inset + inner_h * 0.52
        x2 = inset + inner_w * 0.40
        y2 = inset + inner_h * 0.20
        x3 = inset + inner_w * 0.86
        y3 = inset + inner_h * 0.82
        commands.append(
            f"{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l {x3:.2f} {y3:.2f} l S"
        )
    stream = DecodedStreamObject()
    stream.set_data("\n".join(commands).encode("ascii"))
    stream.update(
        {
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Form"),
            NameObject("/BBox"): ArrayObject(
                [
                    NumberObject(0),
                    NumberObject(0),
                    NumberObject(width),
                    NumberObject(height),
                ]
            ),
            NameObject("/Resources"): DictionaryObject(),
        }
    )
    return writer._add_object(stream)  # pylint: disable=protected-access


def _build_radio_appearance(
    writer: PdfWriter,
    *,
    width: float,
    height: float,
    checked: bool,
):
    """
    Build an appearance stream for radio button widgets.
    """
    if width <= 0.0 or height <= 0.0:
        return None
    border_width = max(min(width, height) * 0.08, 0.6)
    inset = border_width / 2.0
    x0 = inset
    y0 = inset
    x1 = max(width - inset, x0)
    y1 = max(height - inset, y0)
    cx = (x0 + x1) / 2.0
    cy = (y0 + y1) / 2.0
    rx = max((x1 - x0) / 2.0, 0.0)
    ry = max((y1 - y0) / 2.0, 0.0)
    if rx <= 0.0 or ry <= 0.0:
        return None
    kappa = 0.5522847498

    def ellipse_path(
        center_x: float,
        center_y: float,
        radius_x: float,
        radius_y: float,
    ) -> str:
        return "\n".join(
            [
                f"{center_x + radius_x:.2f} {center_y:.2f} m",
                f"{center_x + radius_x:.2f} {center_y + (kappa * radius_y):.2f} "
                f"{center_x + (kappa * radius_x):.2f} {center_y + radius_y:.2f} "
                f"{center_x:.2f} {center_y + radius_y:.2f} c",
                f"{center_x - (kappa * radius_x):.2f} {center_y + radius_y:.2f} "
                f"{center_x - radius_x:.2f} {center_y + (kappa * radius_y):.2f} "
                f"{center_x - radius_x:.2f} {center_y:.2f} c",
                f"{center_x - radius_x:.2f} {center_y - (kappa * radius_y):.2f} "
                f"{center_x - (kappa * radius_x):.2f} {center_y - radius_y:.2f} "
                f"{center_x:.2f} {center_y - radius_y:.2f} c",
                f"{center_x + (kappa * radius_x):.2f} {center_y - radius_y:.2f} "
                f"{center_x + radius_x:.2f} {center_y - (kappa * radius_y):.2f} "
                f"{center_x + radius_x:.2f} {center_y:.2f} c",
                "h",
            ]
        )

    commands = [
        "0 0 0 RG",
        "0 0 0 rg",
        f"{border_width:.2f} w",
        ellipse_path(cx, cy, rx, ry),
        "S",
    ]
    if checked:
        inner_rx = max(rx * 0.62, border_width)
        inner_ry = max(ry * 0.62, border_width)
        commands.extend(
            [
                ellipse_path(cx, cy, inner_rx, inner_ry),
                "f",
            ]
        )
    stream = DecodedStreamObject()
    stream.set_data("\n".join(commands).encode("ascii"))
    stream.update(
        {
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Form"),
            NameObject("/BBox"): ArrayObject(
                [
                    NumberObject(0),
                    NumberObject(0),
                    NumberObject(width),
                    NumberObject(height),
                ]
            ),
            NameObject("/Resources"): DictionaryObject(),
        }
    )
    return writer._add_object(stream)  # pylint: disable=protected-access


def _ensure_radio_group_field(
    writer: PdfWriter,
    acroform: DictionaryObject,
    group_state: Dict[str, Any],
    group_name: str,
    *,
    flags: int,
):
    """
    Return the shared parent field for a DullyPDF radio group.
    """
    resolved_name = str(group_name or "radio_group").strip() or "radio_group"
    radio_flags = _radio_button_flags(flags)
    group = group_state.get(resolved_name)
    if group is None:
        group_dict = DictionaryObject(
            {
                NameObject("/FT"): NameObject("/Btn"),
                NameObject("/T"): TextStringObject(resolved_name),
                NameObject("/Ff"): NumberObject(radio_flags),
                NameObject("/Kids"): ArrayObject(),
                NameObject("/V"): NameObject("/Off"),
            }
        )
        group_ref = writer._add_object(group_dict)  # pylint: disable=protected-access
        _ensure_acroform_field_registered(acroform, group_ref, group_dict)
        group = {"ref": group_ref, "dict": group_dict, "kids": group_dict["/Kids"], "export_values": set()}
        group_state[resolved_name] = group
    else:
        group["dict"][NameObject("/Ff")] = NumberObject(radio_flags)
        group.setdefault("export_values", set())
    return group


def _reserve_radio_export_value(group: Dict[str, Any], export_value: str) -> str:
    """
    Keep radio appearance state names unique within one parent group.
    """
    base = str(export_value or "Option").strip() or "Option"
    used = group.setdefault("export_values", set())
    if base not in used:
        used.add(base)
        return base
    suffix = 2
    candidate = f"{base}_{suffix}"
    while candidate in used:
        suffix += 1
        candidate = f"{base}_{suffix}"
    used.add(candidate)
    return candidate


def _add_signature_field(
    writer: PdfWriter,
    page,
    acroform: DictionaryObject,
    *,
    name: str,
    rect: List[float],
    flags: int,
    confidence_tag: Optional[str] = None,
):
    """
    Add a signature widget placeholder.
    """
    field = DictionaryObject(
        {
            NameObject("/FT"): NameObject("/Sig"),
            NameObject("/T"): TextStringObject(name),
            NameObject("/Rect"): ArrayObject([NumberObject(v) for v in rect]),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Ff"): NumberObject(flags),
        }
    )
    _apply_confidence_tag(field, confidence_tag)
    field_ref = writer._add_object(field)  # pylint: disable=protected-access
    _add_annotation(page, field_ref)
    _register_field(acroform, field_ref)


def _add_combo_field(
    writer: PdfWriter,
    page,
    acroform: DictionaryObject,
    *,
    name: str,
    rect: List[float],
    flags: int,
    options: List[str],
    value: Any = None,
    confidence_tag: Optional[str] = None,
    font_name: Optional[str] = None,
    font_size: Optional[float] = None,
    font_color: Optional[str] = None,
    default_appearance_font_size: Optional[float] = None,
    default_appearance_font_color: Optional[str] = None,
    render_text_appearance_streams: bool = True,
):
    """
    Add a combo box widget with option list.
    """
    opt_array = ArrayObject([TextStringObject(opt) for opt in options])
    field = DictionaryObject(
        {
            NameObject("/FT"): NameObject("/Ch"),
            NameObject("/T"): TextStringObject(name),
            NameObject("/Rect"): ArrayObject([NumberObject(v) for v in rect]),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Ff"): NumberObject(flags | FLAG_COMBO),
            NameObject("/Opt"): opt_array,
        }
    )
    _apply_confidence_tag(field, confidence_tag)
    font_resource_name, font_ref = _selected_text_font_resource(
        writer,
        acroform,
        font_name=font_name,
    )
    _ensure_page_font_resource(page, font_resource_name, font_ref)
    _ensure_field_font_resource(field, font_resource_name, font_ref)
    _set_text_default_appearance(
        field,
        font_resource_name=font_resource_name,
        font_size=default_appearance_font_size,
        font_color=default_appearance_font_color,
    )
    if value is not None:
        field[NameObject("/V")] = TextStringObject(str(value))
        field[NameObject("/DV")] = TextStringObject(str(value))

        if render_text_appearance_streams:
            width = float(rect[2]) - float(rect[0])
            height = float(rect[3]) - float(rect[1])
            ap = _build_text_appearance(
                writer,
                width=width,
                height=height,
                value=str(value),
                font_ref=font_ref,
                font_resource_name=font_resource_name,
                font_size=font_size,
                font_color=font_color,
            )
            if ap is not None:
                field[NameObject("/AP")] = DictionaryObject({NameObject("/N"): ap})
    field_ref = writer._add_object(field)  # pylint: disable=protected-access
    _add_annotation(page, field_ref)
    _register_field(acroform, field_ref)


def _add_radio_field(
    writer: PdfWriter,
    page,
    acroform: DictionaryObject,
    *,
    group_name: str,
    rect: List[float],
    flags: int,
    export_value: str,
    value: Any = None,
    group_state: Dict[str, Any],
    confidence_tag: Optional[str] = None,
):
    """
    Add a radio widget to a group, creating the group if needed.
    """
    group = _ensure_radio_group_field(
        writer,
        acroform,
        group_state,
        group_name,
        flags=flags,
    )

    requested_export_value = export_value
    export_value = _reserve_radio_export_value(group, export_value)
    checked = _checkbox_checked(value, requested_export_value) or _checkbox_checked(value, export_value)
    widget = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Rect"): ArrayObject([NumberObject(v) for v in rect]),
            NameObject("/Parent"): group["ref"],
            NameObject("/AS"): NameObject(f"/{export_value}" if checked else "/Off"),
        }
    )
    _normalize_interactive_widget_annotation(widget)
    _apply_radio_widget_appearance(
        writer,
        widget,
        rect=rect,
        export_value=export_value,
    )
    _apply_confidence_tag(widget, confidence_tag)
    widget_ref = writer._add_object(widget)  # pylint: disable=protected-access
    group["kids"].append(widget_ref)
    _add_annotation(page, widget_ref)
    if checked:
        group["dict"][NameObject("/V")] = NameObject(f"/{export_value}")


def inject_fields_from_template(
    input_pdf: Path,
    template: Dict[str, Any],
    output_pdf: Path,
    *,
    render_text_appearance_streams: Optional[bool] = None,
) -> None:
    """
    Inject template fields into a PDF and write the result.

    This builds an index of existing widgets, then adds or updates fields per page.
    """
    fields = _build_field_list(template)
    if not fields:
        raise ValueError("No fields to inject.")

    origin = _resolve_origin(template)
    appearance = normalize_field_appearance_payload(template.get("appearance"))
    global_field_font = appearance.get("globalFieldFont") or DEFAULT_FIELD_FONT_CHOICE
    global_field_font_size = appearance.get("globalFieldFontSize") or DEFAULT_FIELD_FONT_SIZE_CHOICE
    global_field_font_color = appearance.get("globalFieldFontColor") or DEFAULT_FIELD_FONT_COLOR
    should_render_text_appearances = (
        _render_text_appearance_streams(template)
        if render_text_appearance_streams is None
        else bool(render_text_appearance_streams)
    )
    reader = PdfReader(str(input_pdf))
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    root_src = reader.trailer.get("/Root")
    if root_src is not None:
        try:
            root_src = root_src.get_object()
        except AttributeError:
            pass
        root_dst = writer._root_object  # pylint: disable=protected-access
        for key in ROOT_KEYS_TO_PRESERVE:
            if key in root_src:
                # Preserve root entries like optional content groups (layers).
                entry = root_src.raw_get(key) if hasattr(root_src, "raw_get") else None
                if entry is None:
                    entry = root_src.get(key)
                root_dst[NameObject(key)] = entry.clone(writer)

    _ensure_unique_page_annots(writer)
    acroform = _ensure_acroform(writer)
    _set_acroform_default_appearance(
        writer,
        acroform,
        global_field_font=global_field_font,
        global_field_font_size=global_field_font_size,
        global_field_font_color=global_field_font_color,
    )
    if STRIP_EXISTING_FIELDS:
        removed = _strip_existing_widget_annots(writer)
        _reset_acroform_fields(acroform)
        logger.info("Stripped %s existing widget annotations before injection.", removed)
    elif DEDUP_EXISTING_WIDGETS:
        removed = _dedupe_existing_widget_annots(writer, WIDGET_DEDUPE_TOL)
        if removed:
            logger.info("Removed %s duplicate widget annotations before injection.", removed)
    radio_groups: Dict[str, Any] = {}
    target_widgets_by_name = _build_target_widget_index(writer, fields, origin=origin)
    removed_stale = _remove_stale_widgets_by_target_names(writer, target_widgets_by_name)
    if removed_stale:
        logger.info("Removed %s stale same-name widget annotations before injection.", removed_stale)
    existing_widgets = _collect_existing_widgets(writer)

    for field in fields:
        name = str(field.get("name") or "").strip()
        if not name:
            logger.warning("Skipping field without name: %s", field)
            continue
        page_idx = int(field.get("page") or 1)
        if page_idx < 1 or page_idx > len(writer.pages):
            logger.warning("Skipping field %s with invalid page index %s", name, page_idx)
            continue

        raw_rect = _normalize_rect(field)
        if raw_rect is None:
            logger.warning("Skipping field %s without rect/size", name)
            continue

        page = writer.pages[page_idx - 1]
        page_box = page.cropbox if page.cropbox else page.mediabox
        page_height = float(page_box.height)
        pdf_rect = _to_pdf_rect(raw_rect, page_height=page_height, origin=origin)
        rect_height = abs(float(pdf_rect[3]) - float(pdf_rect[1]))
        auto_font_size = resolve_auto_field_font_size(rect_height)
        confidence_tag = _confidence_tag(field)

        flags = _field_flags(field)
        field_type = str(field.get("type") or "text").lower().strip()
        selected_font_name = resolve_effective_field_font(field, global_field_font=global_field_font)
        selected_font_size = resolve_effective_field_font_size(
            field,
            global_field_font_size=global_field_font_size,
            auto_size=auto_font_size,
        )
        selected_font_color = resolve_effective_field_font_color(
            field,
            global_field_font_color=global_field_font_color,
        )
        default_appearance_font_size = (
            selected_font_size
            if selected_font_size is not None
            and should_write_field_font_size_default_appearance(
                field,
                global_field_font_size=global_field_font_size,
            )
            else None
        )
        default_appearance_font_color = (
            selected_font_color
            if selected_font_color is not None
            and should_write_field_font_color_default_appearance(
                field,
                global_field_font_color=global_field_font_color,
            )
            else None
        )
        if field_type == "date":
            field_type = "text"
        field_kind = _normalize_field_kind(field_type)
        if _has_duplicate_widget(existing_widgets, page_idx, field_kind, pdf_rect):
            value = field.get("value")
            export_value = str(field.get("exportValue") or "Yes")
            update_name = name
            if field_type == "radio":
                update_name = _radio_group_name(field, name)
                export_value = str(field.get("radioOptionKey") or field.get("exportValue") or name)
            updated = _update_existing_widget(
                writer,
                page,
                acroform,
                rect=pdf_rect,
                field_type=field_type,
                value=value,
                export_value=export_value,
                flags=flags,
                new_name=update_name,
                confidence_tag=confidence_tag,
                font_name=selected_font_name,
                font_size=selected_font_size,
                font_color=selected_font_color,
                default_appearance_font_size=default_appearance_font_size,
                default_appearance_font_color=default_appearance_font_color,
                render_text_appearance_streams=should_render_text_appearances,
                radio_group_state=radio_groups if field_type == "radio" else None,
                radio_group_name=update_name if field_type == "radio" else None,
            )
            if updated:
                logger.debug("Updated existing %s field %s on page %s", field_kind, name, page_idx)
                continue
            logger.debug(
                "Skipping duplicate %s field %s on page %s (rect=%s)",
                field_kind,
                name,
                page_idx,
                pdf_rect,
            )
            continue

        if field_type == "text":
            _add_text_field(
                writer,
                page,
                acroform,
                name=name,
                rect=pdf_rect,
                flags=flags,
                value=field.get("value"),
                confidence_tag=confidence_tag,
                font_name=selected_font_name,
                font_size=selected_font_size,
                font_color=selected_font_color,
                default_appearance_font_size=default_appearance_font_size,
                default_appearance_font_color=default_appearance_font_color,
                render_text_appearance_streams=should_render_text_appearances,
            )
        elif field_type == "checkbox":
            export_value = str(field.get("exportValue") or "Yes")
            _add_checkbox_field(
                writer,
                page,
                acroform,
                name=name,
                rect=pdf_rect,
                flags=flags,
                export_value=export_value,
                value=field.get("value"),
                confidence_tag=confidence_tag,
            )
        elif field_type == "radio":
            group_name = _radio_group_name(field, name)
            export_value = str(field.get("radioOptionKey") or field.get("exportValue") or name)
            _add_radio_field(
                writer,
                page,
                acroform,
                group_name=group_name,
                rect=pdf_rect,
                flags=flags,
                export_value=export_value,
                value=field.get("value"),
                group_state=radio_groups,
                confidence_tag=confidence_tag,
            )
        elif field_type == "signature":
            _add_signature_field(
                writer,
                page,
                acroform,
                name=name,
                rect=pdf_rect,
                flags=flags,
                confidence_tag=confidence_tag,
            )
        elif field_type in {"combo", "combobox"}:
            options = [str(opt) for opt in (field.get("options") or [])]
            _add_combo_field(
                writer,
                page,
                acroform,
                name=name,
                rect=pdf_rect,
                flags=flags,
                options=options,
                value=field.get("value"),
                confidence_tag=confidence_tag,
                font_name=selected_font_name,
                font_size=selected_font_size,
                font_color=selected_font_color,
                default_appearance_font_size=default_appearance_font_size,
                default_appearance_font_color=default_appearance_font_color,
                render_text_appearance_streams=should_render_text_appearances,
            )
        else:
            logger.warning("Unknown field type %s for %s; skipping.", field_type, name)
            continue
        existing_widgets.setdefault(page_idx, []).append({"rect": pdf_rect, "kind": field_kind})

    _set_dullypdf_appearance_metadata(writer, fields, appearance)
    output_pdf.parent.mkdir(parents=True, exist_ok=True)
    with output_pdf.open("wb") as f:
        writer.write(f)
    logger.info("Wrote fillable PDF to %s", output_pdf)


def inject_fields(input_pdf: Path, json_path: Path, output_pdf: Path) -> None:
    """
    Load a JSON template file and inject fields into the PDF.
    """
    template = json.loads(json_path.read_text(encoding="utf-8"))
    inject_fields_from_template(input_pdf, template, output_pdf)


def main() -> None:
    """
    CLI entrypoint for field injection.
    """
    parser = argparse.ArgumentParser(
        description="Inject form fields into a PDF using a rename pipeline JSON template."
    )
    parser.add_argument("pdf", type=Path, help="Input PDF path")
    parser.add_argument("fields", type=Path, help="JSON template with field definitions")
    parser.add_argument(
        "--output",
        type=Path,
        help="Output PDF path (defaults to samples/fieldDetecting/forms/native/temp<first5><last5>.pdf)",
    )
    args = parser.parse_args()

    input_pdf = args.pdf
    if not input_pdf.exists():
        raise SystemExit(f"PDF not found: {input_pdf}")
    if not args.fields.exists():
        raise SystemExit(f"JSON template not found: {args.fields}")

    output = args.output
    if output is None:
        prefix = temp_prefix_from_pdf(input_pdf)
        output = Path("samples/fieldDetecting/forms/native") / f"{prefix}.pdf"

    inject_fields(input_pdf, args.fields, output)


if __name__ == "__main__":
    main()
