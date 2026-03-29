"""PDF export helpers shared by standard downloads and signing artifacts.

Flattening walks the document's pages and widget tree once, so the work stays
O(page_count + widget_count). The output preserves the visible field values but
removes the interactive AcroForm widgets that ordinary PDF viewers would
otherwise keep editable.
"""

from __future__ import annotations

import fitz

# MuPDF emits widget-appearance diagnostics directly to stderr during bake().
# Keep the console output disabled process-wide so failed flatten attempts still
# surface through Python exceptions without flooding server logs.
fitz.TOOLS.mupdf_display_errors(False)
fitz.TOOLS.mupdf_display_warnings(False)


def flatten_pdf_form_widgets(pdf_bytes: bytes) -> bytes:
    """Bake visible widget appearances into page content and drop interactivity."""

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        document.bake(annots=False, widgets=True)
        return document.tobytes(garbage=4, deflate=True)
    finally:
        document.close()


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
