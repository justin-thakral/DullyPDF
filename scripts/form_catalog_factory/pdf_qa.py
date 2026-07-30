#!/usr/bin/env python3
"""Deterministic structural QA for generated form-catalog PDFs.

The validator intentionally returns plain JSON-compatible dictionaries so it
can be used from the catalog factory, a standalone batch command, or focused
tests without coupling PDF checks to an orchestration framework. Validation is
O(p + w + o), where p is the number of pages, w is the number of widgets, and o
is the number of reachable PDF objects inspected for unsafe actions.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject


SCHEMA_VERSION = "dullypdf.form_catalog_pdf_qa.v1"
ALLOWED_FIELD_TYPES = {"/Tx", "/Btn", "/Ch", "/Sig"}
RADIO_FIELD_FLAG = 1 << 15
PUSHBUTTON_FIELD_FLAG = 1 << 16
PDF_SCAN_OBJECT_LIMIT = 100_000

UNSAFE_KEYS = {
    "/AA": "additional_actions",
    "/EF": "embedded_file",
    "/EmbeddedFiles": "embedded_files_name_tree",
    "/JavaScript": "javascript_name_tree",
    "/JS": "javascript",
    "/OpenAction": "open_action",
    "/RichMediaContent": "rich_media",
    "/URI": "external_uri",
    "/XFA": "xfa_form",
}
UNSAFE_ACTION_TYPES = {
    "/GoToE",
    "/GoToR",
    "/ImportData",
    "/JavaScript",
    "/Launch",
    "/Movie",
    "/Rendition",
    "/ResetForm",
    "/Sound",
    "/SubmitForm",
    "/URI",
}
UNSAFE_ANNOTATION_SUBTYPES = {
    "/FileAttachment",
    "/Movie",
    "/RichMedia",
    "/Screen",
    "/Sound",
}


def _issue(code: str, message: str, location: str | None = None) -> dict[str, str]:
    payload = {"code": code, "message": message}
    if location:
        payload["location"] = location
    return payload


def _sort_issues(issues: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    unique: dict[tuple[str, str, str], dict[str, str]] = {}
    for issue in issues:
        key = (
            issue.get("code", ""),
            issue.get("location", ""),
            issue.get("message", ""),
        )
        unique[key] = issue
    return [
        unique[key]
        for key in sorted(unique)
    ]


def _resolve(value: Any) -> Any:
    if isinstance(value, IndirectObject):
        return value.get_object()
    get_object = getattr(value, "get_object", None)
    if callable(get_object):
        try:
            return get_object()
        except Exception:
            return value
    return value


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _field_chain(widget: DictionaryObject) -> list[DictionaryObject]:
    chain: list[DictionaryObject] = []
    current: Any = widget
    visited: set[tuple[str, int, int] | tuple[str, int]] = set()

    for _ in range(32):
        if isinstance(current, IndirectObject):
            marker: tuple[str, int, int] | tuple[str, int] = (
                "indirect",
                current.idnum,
                current.generation,
            )
        else:
            marker = ("direct", id(current))
        if marker in visited:
            break
        visited.add(marker)

        resolved = _resolve(current)
        if not isinstance(resolved, DictionaryObject):
            break
        chain.append(resolved)
        if "/Parent" not in resolved:
            break
        current = resolved["/Parent"]
    return chain


def _inherited(chain: Sequence[DictionaryObject], key: str) -> Any:
    for node in chain:
        if key in node:
            return _resolve(node[key])
    return None


def _qualified_field_name(chain: Sequence[DictionaryObject]) -> str:
    parts: list[str] = []
    for node in reversed(chain):
        value = node.get("/T")
        if value is None:
            continue
        text = str(_resolve(value)).strip()
        if text:
            parts.append(text)
    return ".".join(parts)


def _button_on_states(chain: Sequence[DictionaryObject]) -> list[str]:
    states: set[str] = set()
    for node in chain:
        appearance = _resolve(node.get("/AP"))
        if not isinstance(appearance, DictionaryObject):
            continue
        normal = _resolve(appearance.get("/N"))
        if not isinstance(normal, DictionaryObject):
            continue
        for key in normal.keys():
            state = str(key)
            if state != "/Off":
                states.add(state)
    return sorted(states)


def _first_choice_option(chain: Sequence[DictionaryObject]) -> str | None:
    options = _inherited(chain, "/Opt")
    if not isinstance(options, ArrayObject) or not options:
        return None
    first = _resolve(options[0])
    if isinstance(first, ArrayObject) and first:
        first = _resolve(first[0])
    text = str(first).strip()
    return text or None


def _scan_unsafe_objects(root: Any) -> tuple[list[dict[str, str]], int]:
    """Scan reachable PDF dictionaries without following an object twice."""

    issues: list[dict[str, str]] = []
    stack: list[tuple[Any, str]] = [(root, "catalog")]
    visited: set[tuple[str, int, int] | tuple[str, int]] = set()
    scanned = 0

    while stack:
        raw, location = stack.pop()
        if isinstance(raw, IndirectObject):
            marker: tuple[str, int, int] | tuple[str, int] = (
                "indirect",
                raw.idnum,
                raw.generation,
            )
        else:
            marker = ("direct", id(raw))
        if marker in visited:
            continue
        visited.add(marker)

        try:
            value = _resolve(raw)
        except Exception as exc:
            issues.append(
                _issue(
                    "object_resolution_failed",
                    f"Could not resolve a reachable PDF object: {exc}",
                    location,
                )
            )
            continue

        if not isinstance(value, (DictionaryObject, ArrayObject, list, tuple)):
            continue

        scanned += 1
        if scanned > PDF_SCAN_OBJECT_LIMIT:
            issues.append(
                _issue(
                    "object_scan_limit_exceeded",
                    f"Reachable object scan exceeded {PDF_SCAN_OBJECT_LIMIT} objects.",
                    location,
                )
            )
            break

        if isinstance(value, DictionaryObject):
            for key, reason in UNSAFE_KEYS.items():
                if key in value:
                    issues.append(
                        _issue(
                            "unsafe_pdf_feature",
                            f"Unsafe or unsupported PDF feature found: {reason}.",
                            f"{location}{key}",
                        )
                    )

            action_type = str(_resolve(value.get("/S"))) if "/S" in value else ""
            if action_type in UNSAFE_ACTION_TYPES:
                issues.append(
                    _issue(
                        "unsafe_pdf_action",
                        f"Unsafe PDF action type found: {action_type}.",
                        f"{location}/S",
                    )
                )

            subtype = str(_resolve(value.get("/Subtype"))) if "/Subtype" in value else ""
            if subtype in UNSAFE_ANNOTATION_SUBTYPES:
                issues.append(
                    _issue(
                        "unsafe_annotation",
                        f"Unsafe or unsupported annotation subtype found: {subtype}.",
                        f"{location}/Subtype",
                    )
                )

            for key in sorted(value.keys(), key=str, reverse=True):
                stack.append((value[key], f"{location}{key}"))
        else:
            for index in range(len(value) - 1, -1, -1):
                stack.append((value[index], f"{location}[{index}]"))

    return _sort_issues(issues), scanned


def _validate_widgets(
    reader: PdfReader,
) -> tuple[list[dict[str, str]], list[dict[str, Any]], dict[str, int]]:
    issues: list[dict[str, str]] = []
    widgets: list[dict[str, Any]] = []
    field_types: Counter[str] = Counter()

    for page_index, page in enumerate(reader.pages):
        box = page.cropbox
        page_left = float(box.left)
        page_bottom = float(box.bottom)
        page_right = float(box.right)
        page_top = float(box.top)
        annotations = _resolve(page.get("/Annots")) or []

        for annotation_index, annotation_ref in enumerate(annotations):
            annotation = _resolve(annotation_ref)
            if not isinstance(annotation, DictionaryObject):
                continue
            if str(_resolve(annotation.get("/Subtype"))) != "/Widget":
                continue

            location = f"page[{page_index + 1}].widget[{annotation_index + 1}]"
            chain = _field_chain(annotation)
            name = _qualified_field_name(chain)
            field_type = str(_inherited(chain, "/FT") or "")
            tooltip_value = _inherited(chain, "/TU")
            tooltip = str(tooltip_value).strip() if tooltip_value is not None else ""
            flags_value = _inherited(chain, "/Ff")
            try:
                flags = int(flags_value or 0)
            except (TypeError, ValueError):
                flags = 0

            if not name:
                issues.append(
                    _issue(
                        "missing_field_name",
                        "Widget has no inherited field name.",
                        location,
                    )
                )
            if field_type not in ALLOWED_FIELD_TYPES:
                issues.append(
                    _issue(
                        "invalid_field_type",
                        f"Widget has unsupported or missing field type: {field_type or '<missing>'}.",
                        location,
                    )
                )
            else:
                field_types[field_type] += 1
            if not tooltip:
                issues.append(
                    _issue(
                        "missing_field_tooltip",
                        f"Field {name or '<unnamed>'} has no non-empty tooltip.",
                        location,
                    )
                )

            rectangle = _resolve(annotation.get("/Rect"))
            rect_values: tuple[float, float, float, float] | None = None
            if not isinstance(rectangle, (ArrayObject, list, tuple)) or len(rectangle) != 4:
                issues.append(
                    _issue(
                        "invalid_widget_rectangle",
                        f"Field {name or '<unnamed>'} has no valid four-value rectangle.",
                        location,
                    )
                )
            else:
                try:
                    rect_values = tuple(float(value) for value in rectangle)  # type: ignore[assignment]
                except (TypeError, ValueError):
                    issues.append(
                        _issue(
                            "invalid_widget_rectangle",
                            f"Field {name or '<unnamed>'} has a non-numeric rectangle.",
                            location,
                        )
                    )

            if rect_values is not None:
                left, bottom, right, top = rect_values
                if right <= left or top <= bottom:
                    issues.append(
                        _issue(
                            "non_positive_widget_rectangle",
                            f"Field {name or '<unnamed>'} has a non-positive rectangle.",
                            location,
                        )
                    )
                epsilon = 0.5
                if (
                    left < page_left - epsilon
                    or bottom < page_bottom - epsilon
                    or right > page_right + epsilon
                    or top > page_top + epsilon
                ):
                    issues.append(
                        _issue(
                            "widget_out_of_bounds",
                            (
                                f"Field {name or '<unnamed>'} rectangle "
                                f"{[round(value, 3) for value in rect_values]} is outside "
                                f"the crop box {[page_left, page_bottom, page_right, page_top]}."
                            ),
                            location,
                        )
                    )

            widgets.append(
                {
                    "name": name,
                    "type": field_type,
                    "tooltip": tooltip,
                    "flags": flags,
                    "page_index": page_index,
                    "page_bottom": page_bottom,
                    "page_height": page_top - page_bottom,
                    "rect": list(rect_values) if rect_values is not None else None,
                    "location": location,
                    "button_states": _button_on_states(chain),
                    "choice_option": _first_choice_option(chain),
                }
            )

    widgets_by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for widget in widgets:
        if widget["name"]:
            widgets_by_name[widget["name"]].append(widget)

    for name, matching_widgets in sorted(widgets_by_name.items()):
        if len(matching_widgets) < 2:
            continue
        is_radio_group = all(
            widget["type"] == "/Btn" and widget["flags"] & RADIO_FIELD_FLAG
            for widget in matching_widgets
        )
        if not is_radio_group:
            locations = ", ".join(widget["location"] for widget in matching_widgets)
            issues.append(
                _issue(
                    "duplicate_field_name",
                    f"Field name {name!r} is reused by {len(matching_widgets)} widgets: {locations}.",
                    name,
                )
            )

    return _sort_issues(issues), widgets, dict(sorted(field_types.items()))


def _render_pdf(
    pdf_path: Path,
    *,
    page_count: int,
    poppler_binary: str,
    render_root: Path | None,
    timeout_seconds: int,
    display_path: str,
) -> tuple[list[dict[str, str]], int]:
    issues: list[dict[str, str]] = []
    executable = shutil.which(poppler_binary)
    if executable is None:
        return (
            [
                _issue(
                    "poppler_missing",
                    f"Poppler renderer was not found: {poppler_binary}.",
                    display_path,
                )
            ],
            0,
        )

    temporary_directory: tempfile.TemporaryDirectory[str] | None = None
    if render_root is None:
        temporary_directory = tempfile.TemporaryDirectory(prefix="dullypdf-pdf-qa-render-")
        output_directory = Path(temporary_directory.name)
    else:
        path_hash = hashlib.sha256(display_path.encode("utf-8")).hexdigest()[:10]
        output_directory = render_root / f"{pdf_path.stem}-{path_hash}"
        output_directory.mkdir(parents=True, exist_ok=True)

    prefix = output_directory / "page"
    try:
        # A retained render directory can be reused across retries. Remove only
        # this validator's prior page outputs so a shorter regenerated PDF
        # cannot appear to have extra pages from an earlier run.
        for stale_page in output_directory.glob("page-*.png"):
            stale_page.unlink()
        completed = subprocess.run(
            [
                executable,
                "-png",
                "-r",
                "96",
                str(pdf_path),
                str(prefix),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "").strip()
            issues.append(
                _issue(
                    "poppler_render_failed",
                    f"Poppler exited with {completed.returncode}: {detail[:500]}",
                    display_path,
                )
            )
            return _sort_issues(issues), 0

        rendered_files = sorted(output_directory.glob("page-*.png"))
        if len(rendered_files) != page_count:
            issues.append(
                _issue(
                    "rendered_page_count_mismatch",
                    f"Expected {page_count} rendered pages, found {len(rendered_files)}.",
                    display_path,
                )
            )

        valid_files = 0
        png_signature = b"\x89PNG\r\n\x1a\n"
        for rendered_file in rendered_files:
            try:
                with rendered_file.open("rb") as image_file:
                    signature = image_file.read(len(png_signature))
                if signature != png_signature or rendered_file.stat().st_size <= len(png_signature):
                    issues.append(
                        _issue(
                            "invalid_rendered_page",
                            f"Rendered page is not a valid non-empty PNG: {rendered_file.name}.",
                            display_path,
                        )
                    )
                    continue
                valid_files += 1
            except OSError as exc:
                issues.append(
                    _issue(
                        "rendered_page_read_failed",
                        f"Could not read rendered page {rendered_file.name}: {exc}",
                        display_path,
                    )
                )
        return _sort_issues(issues), valid_files
    except subprocess.TimeoutExpired:
        issues.append(
            _issue(
                "poppler_render_timeout",
                f"Poppler exceeded the {timeout_seconds}-second timeout.",
                display_path,
            )
        )
        return _sort_issues(issues), 0
    except OSError as exc:
        issues.append(
            _issue(
                "poppler_render_failed",
                f"Could not start Poppler: {exc}",
                display_path,
            )
        )
        return _sort_issues(issues), 0
    finally:
        if temporary_directory is not None:
            temporary_directory.cleanup()


def _synthetic_value(widget: Mapping[str, Any], index: int) -> str | None:
    field_type = widget.get("type")
    flags = int(widget.get("flags") or 0)
    if field_type == "/Tx":
        return f"DullyPDF QA {index}"
    if field_type == "/Btn":
        if flags & PUSHBUTTON_FIELD_FLAG:
            return None
        states = widget.get("button_states") or []
        return str(states[0]) if states else None
    if field_type == "/Ch":
        option = widget.get("choice_option")
        return str(option) if option is not None else None
    return None


def _synthetic_fill_round_trip(
    pdf_path: Path,
    reader: PdfReader,
    widgets: Sequence[Mapping[str, Any]],
    *,
    timeout_seconds: int,
    display_path: str,
) -> tuple[list[dict[str, str]], int, int]:
    del timeout_seconds  # Reserved for future isolated fill workers.
    issues: list[dict[str, str]] = []
    values_by_name: dict[str, str] = {}
    pages_by_name: dict[str, set[int]] = defaultdict(set)

    for widget in widgets:
        name = str(widget.get("name") or "")
        if not name or name in values_by_name:
            if name:
                pages_by_name[name].add(int(widget["page_index"]))
            continue
        value = _synthetic_value(widget, len(values_by_name) + 1)
        if value is not None:
            values_by_name[name] = value
        pages_by_name[name].add(int(widget["page_index"]))

    if not values_by_name:
        return (
            [
                _issue(
                    "synthetic_fill_not_applicable",
                    "No supported text, button, or choice fields were available for synthetic fill.",
                    display_path,
                )
            ],
            0,
            0,
        )

    with tempfile.TemporaryDirectory(prefix="dullypdf-pdf-qa-fill-") as temp_dir:
        filled_path = Path(temp_dir) / "filled.pdf"
        try:
            writer = PdfWriter(clone_from=reader)
            for page_index, page in enumerate(writer.pages):
                page_values = {
                    name: value
                    for name, value in values_by_name.items()
                    if page_index in pages_by_name[name]
                }
                if page_values:
                    writer.update_page_form_field_values(
                        page,
                        page_values,
                        auto_regenerate=False,
                    )
            with filled_path.open("wb") as output:
                writer.write(output)
        except Exception as exc:
            return (
                [
                    _issue(
                        "synthetic_fill_write_failed",
                        f"Could not fill and save the PDF: {exc}",
                        display_path,
                    )
                ],
                len(values_by_name),
                0,
            )

        try:
            reopened = PdfReader(filled_path, strict=False)
            if reopened.is_encrypted:
                issues.append(
                    _issue(
                        "synthetic_fill_reopen_encrypted",
                        "Synthetic fill output unexpectedly became encrypted.",
                        display_path,
                    )
                )
                return _sort_issues(issues), len(values_by_name), 0
            if len(reopened.pages) != len(reader.pages):
                issues.append(
                    _issue(
                        "synthetic_fill_page_count_changed",
                        (
                            f"Synthetic fill changed page count from {len(reader.pages)} "
                            f"to {len(reopened.pages)}."
                        ),
                        display_path,
                    )
                )

            reopened_fields = reopened.get_fields() or {}
            verified = 0
            for name, expected_value in sorted(values_by_name.items()):
                field = reopened_fields.get(name)
                if not isinstance(field, Mapping):
                    issues.append(
                        _issue(
                            "synthetic_fill_field_missing",
                            f"Filled field {name!r} was missing after reopen.",
                            name,
                        )
                    )
                    continue
                actual_value = field.get("/V")
                if str(actual_value) != expected_value:
                    issues.append(
                        _issue(
                            "synthetic_fill_value_mismatch",
                            (
                                f"Filled field {name!r} reopened with value "
                                f"{str(actual_value)!r}, expected {expected_value!r}."
                            ),
                            name,
                        )
                    )
                    continue
                verified += 1
            return _sort_issues(issues), len(values_by_name), verified
        except Exception as exc:
            issues.append(
                _issue(
                    "synthetic_fill_reopen_failed",
                    f"Could not reopen synthetic fill output: {exc}",
                    display_path,
                )
            )
            return _sort_issues(issues), len(values_by_name), 0


def _empty_result(display_path: str) -> dict[str, Any]:
    return {
        "path": display_path,
        "sha256": None,
        "bytes": None,
        "ok": False,
        "errors": [],
        "warnings": [],
        "metrics": {
            "pages": 0,
            "fields": 0,
            "widgets": 0,
            "field_types": {},
            "objects_scanned": 0,
            "rendered_pages": 0,
            "synthetic_fill_attempted": 0,
            "synthetic_fill_verified": 0,
            "widgets_per_page": [],
            "lowest_widget_bottom_ratio_per_page": [],
            "last_page_lowest_widget_bottom_ratio": None,
        },
    }


def validate_pdf(
    pdf_path: str | Path,
    *,
    display_path: str | None = None,
    expected_sha256: str | None = None,
    expected_bytes: int | None = None,
    render: bool = True,
    synthetic_fill: bool = True,
    poppler_binary: str = "pdftoppm",
    render_root: str | Path | None = None,
    timeout_seconds: int = 120,
) -> dict[str, Any]:
    """Validate one PDF and return a deterministic JSON-compatible result."""

    path = Path(pdf_path)
    label = display_path or str(path)
    result = _empty_result(label)
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    if not path.is_file():
        result["errors"] = [
            _issue("pdf_missing", "PDF file does not exist.", label)
        ]
        return result

    try:
        byte_count = path.stat().st_size
        sha256 = _sha256_file(path)
        result["bytes"] = byte_count
        result["sha256"] = sha256
    except OSError as exc:
        result["errors"] = [
            _issue("pdf_read_failed", f"Could not read PDF bytes: {exc}", label)
        ]
        return result

    if expected_bytes is not None and byte_count != expected_bytes:
        errors.append(
            _issue(
                "byte_count_mismatch",
                f"Expected {expected_bytes} bytes, found {byte_count}.",
                label,
            )
        )
    normalized_expected_sha = (
        str(expected_sha256).strip().lower()
        if expected_sha256 is not None
        else None
    )
    if normalized_expected_sha is not None and sha256.lower() != normalized_expected_sha:
        errors.append(
            _issue(
                "sha256_mismatch",
                f"Expected SHA-256 {normalized_expected_sha}, found {sha256}.",
                label,
            )
        )

    try:
        with path.open("rb") as source:
            if source.read(5) != b"%PDF-":
                errors.append(
                    _issue(
                        "invalid_pdf_magic",
                        "File does not begin with the PDF magic bytes.",
                        label,
                    )
                )
    except OSError as exc:
        errors.append(
            _issue("pdf_read_failed", f"Could not inspect PDF header: {exc}", label)
        )

    try:
        reader = PdfReader(path, strict=False)
    except Exception as exc:
        errors.append(
            _issue("pdf_parse_failed", f"pypdf could not open the PDF: {exc}", label)
        )
        result["errors"] = _sort_issues(errors)
        return result

    if reader.is_encrypted:
        errors.append(
            _issue(
                "pdf_encrypted",
                "Encrypted PDFs are not allowed in generated catalog output.",
                label,
            )
        )
        result["errors"] = _sort_issues(errors)
        return result

    try:
        page_count = len(reader.pages)
    except Exception as exc:
        page_count = 0
        errors.append(
            _issue(
                "page_tree_read_failed",
                f"Could not enumerate PDF pages: {exc}",
                label,
            )
        )
    result["metrics"]["pages"] = page_count
    if page_count == 0 and not any(
        issue["code"] == "page_tree_read_failed"
        for issue in errors
    ):
        errors.append(_issue("pdf_has_no_pages", "PDF contains no pages.", label))

    try:
        catalog = _resolve(reader.trailer["/Root"])
    except Exception as exc:
        catalog = None
        errors.append(
            _issue(
                "missing_pdf_catalog",
                f"Could not resolve the PDF catalog: {exc}",
                label,
            )
        )

    acroform = _resolve(catalog.get("/AcroForm")) if isinstance(catalog, DictionaryObject) else None
    if not isinstance(acroform, DictionaryObject):
        errors.append(
            _issue(
                "missing_acroform",
                "PDF catalog has no AcroForm dictionary.",
                label,
            )
        )
        fields: Mapping[str, Any] = {}
    else:
        raw_fields = _resolve(acroform.get("/Fields"))
        if not isinstance(raw_fields, (ArrayObject, list, tuple)) or not raw_fields:
            errors.append(
                _issue(
                    "empty_acroform",
                    "AcroForm has no field tree entries.",
                    label,
                )
            )
        try:
            fields = reader.get_fields() or {}
        except Exception as exc:
            fields = {}
            errors.append(
                _issue(
                    "acroform_field_read_failed",
                    f"Could not enumerate AcroForm fields: {exc}",
                    label,
                )
            )

    result["metrics"]["fields"] = len(fields)

    if catalog is not None:
        try:
            unsafe_issues, scanned = _scan_unsafe_objects(catalog)
            errors.extend(unsafe_issues)
            result["metrics"]["objects_scanned"] = scanned
        except Exception as exc:
            errors.append(
                _issue(
                    "unsafe_object_scan_failed",
                    f"Could not complete unsafe-object inspection: {exc}",
                    label,
                )
            )

    try:
        widget_issues, widgets, field_types = _validate_widgets(reader)
        errors.extend(widget_issues)
    except Exception as exc:
        widgets = []
        field_types = {}
        errors.append(
            _issue(
                "widget_validation_failed",
                f"Could not complete widget inspection: {exc}",
                label,
            )
        )
    result["metrics"]["widgets"] = len(widgets)
    result["metrics"]["field_types"] = field_types
    widgets_per_page = Counter(
        int(widget["page_index"]) + 1
        for widget in widgets
    )
    result["metrics"]["widgets_per_page"] = [
        widgets_per_page.get(page_number, 0)
        for page_number in range(1, page_count + 1)
    ]
    widgets_grouped_by_page: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for widget in widgets:
        if widget.get("rect") is not None:
            widgets_grouped_by_page[int(widget["page_index"]) + 1].append(widget)
    lowest_ratios: list[float | None] = []
    for page_number in range(1, page_count + 1):
        page_widgets = widgets_grouped_by_page.get(page_number, [])
        if not page_widgets:
            lowest_ratios.append(None)
            continue
        page_height = float(page_widgets[0]["page_height"])
        page_bottom = float(page_widgets[0]["page_bottom"])
        lowest_ratios.append(
            min(
                (float(widget["rect"][1]) - page_bottom) / page_height
                for widget in page_widgets
            )
            if page_height > 0
            else None
        )
    result["metrics"]["lowest_widget_bottom_ratio_per_page"] = lowest_ratios
    last_page_widgets = [
        widget
        for widget in widgets
        if int(widget["page_index"]) + 1 == page_count
        and widget.get("rect") is not None
    ]
    if last_page_widgets:
        page_height = float(last_page_widgets[0]["page_height"])
        page_bottom = float(last_page_widgets[0]["page_bottom"])
        if page_height > 0:
            result["metrics"]["last_page_lowest_widget_bottom_ratio"] = min(
                (float(widget["rect"][1]) - page_bottom) / page_height
                for widget in last_page_widgets
            )

    if not widgets:
        errors.append(
            _issue(
                "missing_widgets",
                "PDF contains no page-level form widgets.",
                label,
            )
        )

    enumerated_names = {str(name) for name in fields.keys() if str(name).strip()}
    widget_names = {str(widget["name"]) for widget in widgets if widget["name"]}
    for field_name in sorted(enumerated_names - widget_names):
        errors.append(
            _issue(
                "field_without_widget",
                f"AcroForm field {field_name!r} has no page widget.",
                field_name,
            )
        )
    for field_name in sorted(widget_names - enumerated_names):
        errors.append(
            _issue(
                "widget_without_field",
                f"Widget field {field_name!r} is missing from AcroForm enumeration.",
                field_name,
            )
        )

    if render and page_count:
        render_issues, rendered_pages = _render_pdf(
            path,
            page_count=page_count,
            poppler_binary=poppler_binary,
            render_root=Path(render_root) if render_root is not None else None,
            timeout_seconds=timeout_seconds,
            display_path=label,
        )
        errors.extend(render_issues)
        result["metrics"]["rendered_pages"] = rendered_pages

    if synthetic_fill and widgets and not any(
        issue["code"] in {"duplicate_field_name", "invalid_field_type"}
        for issue in errors
    ):
        fill_issues, attempted, verified = _synthetic_fill_round_trip(
            path,
            reader,
            widgets,
            timeout_seconds=timeout_seconds,
            display_path=label,
        )
        for issue in fill_issues:
            if issue["code"] == "synthetic_fill_not_applicable":
                warnings.append(issue)
            else:
                errors.append(issue)
        result["metrics"]["synthetic_fill_attempted"] = attempted
        result["metrics"]["synthetic_fill_verified"] = verified

    result["errors"] = _sort_issues(errors)
    result["warnings"] = _sort_issues(warnings)
    result["ok"] = not result["errors"]
    return result


def _display_path(path: Path, relative_to: Path | None) -> str:
    if relative_to is None:
        return str(path)
    try:
        return str(path.resolve().relative_to(relative_to.resolve()))
    except ValueError:
        return str(path)


def validate_batch(
    pdf_paths: Iterable[str | Path],
    *,
    relative_to: str | Path | None = None,
    expected_by_path: Mapping[str | Path, Mapping[str, Any]] | None = None,
    workers: int = 1,
    render: bool = True,
    synthetic_fill: bool = True,
    poppler_binary: str = "pdftoppm",
    render_root: str | Path | None = None,
    timeout_seconds: int = 120,
) -> dict[str, Any]:
    """Validate a batch and return results sorted by display path."""

    base = Path(relative_to) if relative_to is not None else None
    normalized_paths = [Path(path) for path in pdf_paths]
    expected_lookup = {
        str(Path(path).resolve()): dict(expected)
        for path, expected in (expected_by_path or {}).items()
    }
    batch_errors: list[dict[str, str]] = []

    path_counts = Counter(str(path.resolve()) for path in normalized_paths)
    for duplicate_path, count in sorted(path_counts.items()):
        if count > 1:
            batch_errors.append(
                _issue(
                    "duplicate_batch_path",
                    f"Batch input contains the same PDF path {count} times.",
                    _display_path(Path(duplicate_path), base),
                )
            )

    unique_paths = sorted(
        {path.resolve() for path in normalized_paths},
        key=lambda path: _display_path(path, base),
    )

    def validate_one(path: Path) -> dict[str, Any]:
        expected = expected_lookup.get(str(path.resolve()), {})
        return validate_pdf(
            path,
            display_path=_display_path(path, base),
            expected_sha256=expected.get("sha256"),
            expected_bytes=expected.get("bytes"),
            render=render,
            synthetic_fill=synthetic_fill,
            poppler_binary=poppler_binary,
            render_root=render_root,
            timeout_seconds=timeout_seconds,
        )

    if workers <= 1:
        results = [validate_one(path) for path in unique_paths]
    else:
        completed_results: list[dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(validate_one, path): path
                for path in unique_paths
            }
            for future in as_completed(futures):
                path = futures[future]
                try:
                    completed_results.append(future.result())
                except Exception as exc:
                    failed_result = _empty_result(_display_path(path, base))
                    failed_result["errors"] = [
                        _issue(
                            "validator_internal_error",
                            f"Validator raised an unexpected exception: {exc}",
                            failed_result["path"],
                        )
                    ]
                    completed_results.append(failed_result)
        results = completed_results

    results.sort(key=lambda item: item["path"])
    passed = sum(1 for result in results if result["ok"])
    failed = len(results) - passed
    warning_count = sum(len(result["warnings"]) for result in results)
    error_count = sum(len(result["errors"]) for result in results) + len(batch_errors)

    return {
        "schema_version": SCHEMA_VERSION,
        "ok": failed == 0 and not batch_errors,
        "summary": {
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "errors": error_count,
            "warnings": warning_count,
        },
        "batch_errors": _sort_issues(batch_errors),
        "results": results,
    }


def validate_manifest(
    manifest_path: str | Path,
    catalog_root: str | Path,
    *,
    workers: int = 1,
    render: bool = True,
    synthetic_fill: bool = True,
    poppler_binary: str = "pdftoppm",
    render_root: str | Path | None = None,
    timeout_seconds: int = 120,
) -> dict[str, Any]:
    """Validate every successful PDF entry in a catalog manifest."""

    manifest_file = Path(manifest_path)
    root = Path(catalog_root)
    manifest = json.loads(manifest_file.read_text())
    entries = manifest.get("forms")
    if not isinstance(entries, list):
        raise ValueError("Manifest must contain a 'forms' array.")

    pdf_paths: list[Path] = []
    expected_by_path: dict[Path, dict[str, Any]] = {}
    for index, entry in enumerate(entries):
        if not isinstance(entry, Mapping) or entry.get("ok") is not True:
            continue
        section = str(entry.get("section") or "").strip()
        filename = str(entry.get("filename") or "").strip()
        if not section or not filename:
            raise ValueError(
                f"Successful manifest entry at index {index} is missing section or filename."
            )
        pdf_path = root / section / filename
        pdf_paths.append(pdf_path)
        expected_by_path[pdf_path] = {
            "sha256": entry.get("sha256"),
            "bytes": entry.get("bytes"),
        }

    report = validate_batch(
        pdf_paths,
        relative_to=root,
        expected_by_path=expected_by_path,
        workers=workers,
        render=render,
        synthetic_fill=synthetic_fill,
        poppler_binary=poppler_binary,
        render_root=render_root,
        timeout_seconds=timeout_seconds,
    )
    report["manifest"] = {
        "path": str(manifest_file),
        "declared_total": manifest.get("total"),
        "selected_entries": len(pdf_paths),
    }
    return report


def _write_report(report: Mapping[str, Any], output: str) -> None:
    serialized = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if output == "-":
        print(serialized, end="")
        return
    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_suffix(output_path.suffix + ".tmp")
    temporary_path.write_text(serialized)
    temporary_path.replace(output_path)


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate generated DullyPDF form-catalog PDFs.",
    )
    parser.add_argument("pdfs", nargs="*", help="PDF paths to validate.")
    parser.add_argument(
        "--manifest",
        help="Catalog manifest.json whose successful form entries should be validated.",
    )
    parser.add_argument(
        "--catalog-root",
        help="Catalog root used with --manifest and for relative result paths.",
    )
    parser.add_argument(
        "--output",
        default="-",
        help="Result JSON path, or '-' for stdout.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Concurrent per-PDF validators. Result ordering remains deterministic.",
    )
    parser.add_argument(
        "--render-root",
        help="Optional directory in which Poppler page PNGs should be retained.",
    )
    parser.add_argument(
        "--pdftoppm",
        default="pdftoppm",
        help="Poppler pdftoppm executable name or path.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=120,
        help="Maximum Poppler runtime per PDF.",
    )
    parser.add_argument(
        "--no-render",
        action="store_true",
        help="Skip Poppler raster validation. Intended only for focused diagnostics.",
    )
    parser.add_argument(
        "--no-synthetic-fill",
        action="store_true",
        help="Skip synthetic fill-save-reopen validation.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_argument_parser()
    args = parser.parse_args(argv)
    if args.workers < 1:
        parser.error("--workers must be at least 1.")
    if args.timeout_seconds < 1:
        parser.error("--timeout-seconds must be at least 1.")
    if args.manifest and args.pdfs:
        parser.error("Use either positional PDF paths or --manifest, not both.")
    if args.manifest:
        manifest_path = Path(args.manifest)
        catalog_root = Path(args.catalog_root) if args.catalog_root else manifest_path.parent
        report = validate_manifest(
            manifest_path,
            catalog_root,
            workers=args.workers,
            render=not args.no_render,
            synthetic_fill=not args.no_synthetic_fill,
            poppler_binary=args.pdftoppm,
            render_root=args.render_root,
            timeout_seconds=args.timeout_seconds,
        )
    else:
        if not args.pdfs:
            parser.error("Provide at least one PDF path or --manifest.")
        report = validate_batch(
            args.pdfs,
            relative_to=args.catalog_root,
            workers=args.workers,
            render=not args.no_render,
            synthetic_fill=not args.no_synthetic_fill,
            poppler_binary=args.pdftoppm,
            render_root=args.render_root,
            timeout_seconds=args.timeout_seconds,
        )
    _write_report(report, args.output)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
