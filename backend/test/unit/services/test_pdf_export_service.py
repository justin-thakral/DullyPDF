from __future__ import annotations

from io import BytesIO

import fitz
from pypdf import PdfWriter
from reportlab.pdfgen import canvas

from backend.services.pdf_export_service import (
    _coerce_builtin_font_name,
    build_immutable_signing_source_pdf,
    flatten_pdf_form_widgets,
)


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


def _pdf_with_app_only_marker_widget() -> bytes:
    output = BytesIO()
    pdf_canvas = canvas.Canvas(output, pagesize=(220, 220))
    pdf_canvas.drawString(20, 200, "Marker regression")
    pdf_canvas.acroForm.textfield(
        name="client_name",
        x=20,
        y=150,
        width=120,
        height=24,
        value="Jordan Example",
    )
    pdf_canvas.acroForm.textfield(
        name="photo__CVTPF",
        x=20,
        y=90,
        width=140,
        height=36,
        value="CVTPF#@&\nDULLYPDF_META:{\"v\":1,\"type\":\"image\",\"imagePath\":\"gs://bucket/photo.png\"}\nphoto.png\n(IMAGE)",
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


def test_flatten_pdf_form_widgets_deletes_dullypdf_marker_widgets_without_drawing_codes() -> None:
    result = flatten_pdf_form_widgets(_pdf_with_app_only_marker_widget())

    document = fitz.open(stream=result, filetype="pdf")
    try:
        assert document.is_form_pdf is False
        assert list(document[0].widgets() or []) == []
        page_text = document[0].get_text("text")
    finally:
        document.close()

    assert "Jordan Example" in page_text
    assert "CVTPF#@&" not in page_text
    assert "DULLYPDF_META" not in page_text
    assert "(IMAGE)" not in page_text


def test_flatten_font_mapper_supports_dullypdf_base14_resource_names() -> None:
    assert _coerce_builtin_font_name("Time") == "tiro"
    assert _coerce_builtin_font_name("TiIt") == "tiit"
    assert _coerce_builtin_font_name("HeBO") == "hebi"
    assert _coerce_builtin_font_name("CoBO") == "cobi"
    assert _coerce_builtin_font_name("CoOb") == "coit"
    assert _coerce_builtin_font_name("DullyFontHelvetica") == "helv"
    assert _coerce_builtin_font_name("DullyFontHelveticaBold") == "hebo"
    assert _coerce_builtin_font_name("DullyFontHelveticaOblique") == "heit"
    assert _coerce_builtin_font_name("DullyFontHelveticaBoldOblique") == "hebi"
    assert _coerce_builtin_font_name("DullyFontTimesRoman") == "tiro"
    assert _coerce_builtin_font_name("DullyFontTimesBold") == "tibo"
    assert _coerce_builtin_font_name("DullyFontTimesItalic") == "tiit"
    assert _coerce_builtin_font_name("DullyFontTimesBoldItalic") == "tibi"
    assert _coerce_builtin_font_name("DullyFontCourier") == "cour"
    assert _coerce_builtin_font_name("DullyFontCourierBold") == "cobo"
    assert _coerce_builtin_font_name("DullyFontCourierOblique") == "coit"
    assert _coerce_builtin_font_name("DullyFontCourierBoldOblique") == "cobi"
    assert _coerce_builtin_font_name("DullyFontSymbol") == "symb"
    assert _coerce_builtin_font_name("DullyFontZapfDingbats") == "zadb"
