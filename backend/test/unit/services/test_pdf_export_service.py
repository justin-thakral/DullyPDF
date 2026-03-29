from __future__ import annotations

from io import BytesIO

import fitz
from pypdf import PdfWriter
from reportlab.pdfgen import canvas

from backend.services.pdf_export_service import build_immutable_signing_source_pdf


def _blank_pdf_bytes(*, width: float = 200, height: float = 200) -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=width, height=height)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def _fillable_pdf_bytes(*, width: float = 200, height: float = 200) -> bytes:
    output = BytesIO()
    pdf_canvas = canvas.Canvas(output, pagesize=(width, height))
    pdf_canvas.drawString(20, 180, "Client intake")
    pdf_canvas.acroForm.textfield(
        name="client_name",
        x=20,
        y=130,
        width=120,
        height=24,
        value="Jordan Example",
    )
    pdf_canvas.save()
    return output.getvalue()


def test_build_immutable_signing_source_pdf_returns_existing_bytes_when_widgets_are_absent() -> None:
    source_pdf_bytes = _blank_pdf_bytes()

    assert build_immutable_signing_source_pdf(source_pdf_bytes) == source_pdf_bytes


def test_build_immutable_signing_source_pdf_flattens_existing_widgets() -> None:
    result = build_immutable_signing_source_pdf(_fillable_pdf_bytes())

    document = fitz.open(stream=result, filetype="pdf")
    try:
        assert document.is_form_pdf is False
        assert list(document[0].widgets() or []) == []
        page_text = document[0].get_text("text")
    finally:
        document.close()

    assert "Jordan Example" in page_text
