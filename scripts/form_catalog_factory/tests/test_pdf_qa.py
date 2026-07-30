from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

import pytest
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, FloatObject, NameObject, TextStringObject
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

# Pytest places this module-local test directory first on sys.path. Add the
# repository root so the scripts namespace resolves the same way as direct CLI
# execution from the project root.
REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from scripts.form_catalog_factory import pdf_qa


def _make_valid_form(path: Path, *, title: str = "QA Fixture") -> Path:
    document = canvas.Canvas(str(path), pagesize=letter, invariant=1)
    document.setTitle(title)
    document.drawString(72, 730, title)
    document.drawString(72, 690, "Customer name")
    document.acroForm.textfield(
        name="fixture_customer_name",
        tooltip="Customer name",
        x=72,
        y=660,
        width=220,
        height=20,
    )
    document.drawString(72, 625, "Approved")
    document.acroForm.checkbox(
        name="fixture_approved",
        tooltip="Approved",
        x=72,
        y=600,
        size=12,
        buttonStyle="check",
    )
    document.save()
    return path


def _write_modified_pdf(source: Path, target: Path, modifier) -> Path:
    reader = PdfReader(source)
    writer = PdfWriter(clone_from=reader)
    modifier(writer)
    with target.open("wb") as output:
        writer.write(output)
    return target


def _error_codes(result: dict) -> set[str]:
    return {error["code"] for error in result["errors"]}


@pytest.mark.skipif(shutil.which("pdftoppm") is None, reason="Poppler is required")
def test_valid_form_passes_render_and_fill_round_trip(tmp_path: Path) -> None:
    pdf_path = _make_valid_form(tmp_path / "valid.pdf")

    result = pdf_qa.validate_pdf(pdf_path)

    assert result["ok"] is True
    assert result["errors"] == []
    assert result["metrics"] == {
        "pages": 1,
        "fields": 2,
        "widgets": 2,
        "field_types": {"/Btn": 1, "/Tx": 1},
        "objects_scanned": result["metrics"]["objects_scanned"],
        "rendered_pages": 1,
        "synthetic_fill_attempted": 2,
        "synthetic_fill_verified": 2,
        "widgets_per_page": [2],
        "lowest_widget_bottom_ratio_per_page": [
            pytest.approx(0.7575757575757576)
        ],
        "last_page_lowest_widget_bottom_ratio": pytest.approx(0.7575757575757576),
    }
    assert result["metrics"]["objects_scanned"] > 0


def test_rejects_missing_acroform_and_widgets(tmp_path: Path) -> None:
    pdf_path = tmp_path / "blank.pdf"
    document = canvas.Canvas(str(pdf_path), pagesize=letter, invariant=1)
    document.drawString(72, 720, "No fields")
    document.save()

    result = pdf_qa.validate_pdf(pdf_path, render=False, synthetic_fill=False)

    assert result["ok"] is False
    assert {"missing_acroform", "missing_widgets"} <= _error_codes(result)


def test_rejects_duplicate_names_missing_tooltips_out_of_bounds_and_actions(
    tmp_path: Path,
) -> None:
    source = _make_valid_form(tmp_path / "source.pdf")

    def modifier(writer: PdfWriter) -> None:
        annotations = writer.pages[0]["/Annots"]
        first = annotations[0].get_object()
        second = annotations[1].get_object()
        second[NameObject("/T")] = TextStringObject(str(first["/T"]))
        if "/TU" in second:
            del second["/TU"]
        second[NameObject("/Rect")] = ArrayObject(
            [FloatObject(-20), FloatObject(600), FloatObject(12), FloatObject(620)]
        )
        writer.root_object[NameObject("/OpenAction")] = DictionaryObject(
            {
                NameObject("/S"): NameObject("/JavaScript"),
                NameObject("/JS"): TextStringObject("app.alert('unsafe')"),
            }
        )

    pdf_path = _write_modified_pdf(source, tmp_path / "invalid.pdf", modifier)
    result = pdf_qa.validate_pdf(pdf_path, render=False)
    codes = _error_codes(result)

    assert result["ok"] is False
    assert "duplicate_field_name" in codes
    assert "missing_field_tooltip" in codes
    assert "widget_out_of_bounds" in codes
    assert "unsafe_pdf_feature" in codes
    assert "unsafe_pdf_action" in codes
    assert result["metrics"]["synthetic_fill_attempted"] == 0


def test_rejects_encrypted_pdf_before_form_inspection(tmp_path: Path) -> None:
    source = _make_valid_form(tmp_path / "source.pdf")
    reader = PdfReader(source)
    writer = PdfWriter(clone_from=reader)
    writer.encrypt("test-password")
    encrypted = tmp_path / "encrypted.pdf"
    with encrypted.open("wb") as output:
        writer.write(output)

    result = pdf_qa.validate_pdf(encrypted, render=False)

    assert result["ok"] is False
    assert _error_codes(result) == {"pdf_encrypted"}
    assert result["metrics"]["pages"] == 0


def test_missing_poppler_is_a_validation_failure(tmp_path: Path) -> None:
    pdf_path = _make_valid_form(tmp_path / "valid.pdf")

    result = pdf_qa.validate_pdf(
        pdf_path,
        poppler_binary="dullypdf-pdftoppm-does-not-exist",
        synthetic_fill=False,
    )

    assert result["ok"] is False
    assert "poppler_missing" in _error_codes(result)


def test_manifest_batch_is_sorted_and_checks_expected_identity(tmp_path: Path) -> None:
    catalog_root = tmp_path / "catalog"
    section = catalog_root / "operations"
    section.mkdir(parents=True)
    first = _make_valid_form(section / "b-form.pdf", title="B Form")
    second = _make_valid_form(section / "a-form.pdf", title="A Form")
    missing = section / "missing.pdf"

    first_sha = hashlib.sha256(first.read_bytes()).hexdigest()
    manifest = {
        "total": 4,
        "forms": [
            {
                "ok": True,
                "section": "operations",
                "filename": first.name,
                "bytes": first.stat().st_size,
                "sha256": first_sha,
            },
            {
                "ok": True,
                "section": "operations",
                "filename": second.name,
                "bytes": second.stat().st_size,
                "sha256": "0" * 64,
            },
            {
                "ok": True,
                "section": "operations",
                "filename": missing.name,
                "bytes": 100,
                "sha256": "1" * 64,
            },
            {
                "ok": False,
                "section": "operations",
                "filename": "ignored.pdf",
            },
        ],
    }
    manifest_path = catalog_root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest))

    report = pdf_qa.validate_manifest(
        manifest_path,
        catalog_root,
        workers=2,
        render=False,
        synthetic_fill=False,
    )

    assert report["ok"] is False
    assert report["manifest"]["selected_entries"] == 3
    assert [result["path"] for result in report["results"]] == [
        "operations/a-form.pdf",
        "operations/b-form.pdf",
        "operations/missing.pdf",
    ]
    assert "sha256_mismatch" in _error_codes(report["results"][0])
    assert report["results"][1]["ok"] is True
    assert _error_codes(report["results"][2]) == {"pdf_missing"}
    assert report["summary"]["total"] == 3
    assert report["summary"]["passed"] == 1
    assert report["summary"]["failed"] == 2


def test_batch_reports_duplicate_inputs_deterministically(tmp_path: Path) -> None:
    first = _make_valid_form(tmp_path / "b.pdf")
    second = _make_valid_form(tmp_path / "a.pdf")

    report = pdf_qa.validate_batch(
        [first, second, first],
        relative_to=tmp_path,
        render=False,
        synthetic_fill=False,
    )

    assert report["ok"] is False
    assert [result["path"] for result in report["results"]] == ["a.pdf", "b.pdf"]
    assert report["batch_errors"][0]["code"] == "duplicate_batch_path"
    assert report["summary"]["total"] == 2
    assert report["summary"]["passed"] == 2
    assert report["summary"]["errors"] == 1
