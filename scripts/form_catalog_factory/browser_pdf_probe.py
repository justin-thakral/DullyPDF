"""Independently reopen a browser-downloaded catalog PDF and verify fill values."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Sequence

from pypdf import PdfReader


class BrowserPdfProbeError(ValueError):
    """The downloaded PDF is missing or does not preserve the expected values."""


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _pdf_value(value: Any) -> str:
    if value is None:
        return ""
    normalized = str(value)
    return normalized[1:] if normalized.startswith("/") else normalized


def _checked(value: Any) -> bool:
    return _pdf_value(value).strip().lower() not in {
        "",
        "0",
        "false",
        "none",
        "off",
    }


def inspect_filled_pdf(
    pdf_path: str | Path,
    *,
    text_field: str,
    expected_text: str,
    checkbox_field: str,
    expected_page_count: int | None = None,
    expected_field_count: int | None = None,
) -> dict[str, Any]:
    """Return exact PDF facts or raise when either representative fill is lost."""

    path = Path(pdf_path).resolve()
    if not path.is_file():
        raise BrowserPdfProbeError(f"Downloaded PDF does not exist: {path}")
    if path.stat().st_size <= 0:
        raise BrowserPdfProbeError("Downloaded PDF is empty")
    with path.open("rb") as source:
        if source.read(5) != b"%PDF-":
            raise BrowserPdfProbeError("Downloaded artifact is not a PDF")

    try:
        reader = PdfReader(path, strict=False)
        fields = reader.get_fields() or {}
    except Exception as exc:
        raise BrowserPdfProbeError(
            f"Could not reopen the downloaded PDF with pypdf: {exc}"
        ) from exc

    page_count = len(reader.pages)
    field_count = len(fields)
    if expected_page_count is not None and page_count != expected_page_count:
        raise BrowserPdfProbeError(
            f"Expected {expected_page_count} pages, found {page_count}"
        )
    if expected_field_count is not None and field_count != expected_field_count:
        raise BrowserPdfProbeError(
            f"Expected {expected_field_count} fields, found {field_count}"
        )

    if text_field not in fields:
        raise BrowserPdfProbeError(
            f"Filled text field is absent after reopen: {text_field}"
        )
    if checkbox_field not in fields:
        raise BrowserPdfProbeError(
            f"Filled checkbox field is absent after reopen: {checkbox_field}"
        )

    actual_text = _pdf_value(fields[text_field].get("/V"))
    actual_checkbox_value = _pdf_value(fields[checkbox_field].get("/V"))
    actual_checkbox_checked = _checked(fields[checkbox_field].get("/V"))
    if actual_text != expected_text:
        raise BrowserPdfProbeError(
            f"{text_field}: expected {expected_text!r}, found {actual_text!r}"
        )
    if not actual_checkbox_checked:
        raise BrowserPdfProbeError(
            f"{checkbox_field}: checkbox reopened as {actual_checkbox_value!r}"
        )

    return {
        "parser": "pypdf",
        "path": str(path),
        "sha256": _sha256_file(path),
        "bytes": path.stat().st_size,
        "pageCount": page_count,
        "fieldCount": field_count,
        "text": {
            "fieldName": text_field,
            "expectedValue": expected_text,
            "actualValue": actual_text,
            "matched": True,
        },
        "checkbox": {
            "fieldName": checkbox_field,
            "expectedChecked": True,
            "actualValue": actual_checkbox_value,
            "checked": True,
        },
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Reopen one Playwright-downloaded catalog PDF and verify a text "
            "field plus checkbox without trusting browser-authored booleans."
        )
    )
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--text-field", required=True)
    parser.add_argument("--expected-text", required=True)
    parser.add_argument("--checkbox-field", required=True)
    parser.add_argument("--expected-page-count", type=int)
    parser.add_argument("--expected-field-count", type=int)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = inspect_filled_pdf(
            args.pdf,
            text_field=args.text_field,
            expected_text=args.expected_text,
            checkbox_field=args.checkbox_field,
            expected_page_count=args.expected_page_count,
            expected_field_count=args.expected_field_count,
        )
    except BrowserPdfProbeError as exc:
        raise SystemExit(str(exc)) from exc
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
