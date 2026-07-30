from __future__ import annotations

from pathlib import Path

import pytest
from reportlab.pdfgen import canvas

from scripts.form_catalog_factory.browser_pdf_probe import (
    BrowserPdfProbeError,
    inspect_filled_pdf,
)


def _filled_pdf(path: Path, *, text_value: str, checked: bool) -> None:
    document = canvas.Canvas(str(path), pagesize=(612, 792))
    document.drawString(72, 750, "Browser canary probe fixture")
    document.acroForm.textfield(
        name="canary_text",
        value=text_value,
        x=72,
        y=700,
        width=240,
        height=24,
    )
    document.acroForm.checkbox(
        name="canary_checkbox",
        checked=checked,
        x=72,
        y=650,
        size=18,
    )
    document.save()


def test_inspect_filled_pdf_verifies_exact_values(tmp_path: Path) -> None:
    pdf_path = tmp_path / "filled.pdf"
    _filled_pdf(pdf_path, text_value="Catalog canary value", checked=True)

    result = inspect_filled_pdf(
        pdf_path,
        text_field="canary_text",
        expected_text="Catalog canary value",
        checkbox_field="canary_checkbox",
        expected_page_count=1,
        expected_field_count=2,
    )

    assert result["text"]["matched"] is True
    assert result["checkbox"]["checked"] is True
    assert result["sha256"]
    assert result["bytes"] == pdf_path.stat().st_size


def test_inspect_filled_pdf_rejects_a_lost_checkbox_value(tmp_path: Path) -> None:
    pdf_path = tmp_path / "filled.pdf"
    _filled_pdf(pdf_path, text_value="Catalog canary value", checked=False)

    with pytest.raises(BrowserPdfProbeError, match="checkbox reopened"):
        inspect_filled_pdf(
            pdf_path,
            text_field="canary_text",
            expected_text="Catalog canary value",
            checkbox_field="canary_checkbox",
        )
