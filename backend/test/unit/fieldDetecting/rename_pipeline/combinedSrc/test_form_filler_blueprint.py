from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
import fitz
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, NumberObject, TextStringObject

from backend.fieldDetecting.rename_pipeline.combinedSrc import form_filler
from backend.services.pdf_export_service import flatten_pdf_form_widgets, pdf_has_form_widgets


def _write_blank_pdf(path: Path, *, width: float = 200, height: float = 200) -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=width, height=height)
    with path.open("wb") as fh:
        writer.write(fh)


def _field_debug(pdf_path: Path) -> dict[str, dict[str, str | None]]:
    reader = PdfReader(str(pdf_path))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    debug: dict[str, dict[str, str | None]] = {}
    for field_ref in acroform.get("/Fields", []):
        field = field_ref.get_object()
        name = str(field.get("/T"))
        appearance = field.get("/AP")
        stream = None
        if appearance and "/N" in appearance:
            stream = appearance["/N"].get_object().get_data().decode("utf-8", "ignore")
        debug[name] = {
            "da": str(field.get("/DA")) if field.get("/DA") is not None else None,
            "stream": stream,
        }
    return debug


def _page_content_streams(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    streams: list[str] = []
    for page in reader.pages:
        contents = page.get_contents()
        if contents:
            streams.append(contents.get_data().decode("utf-8", "ignore"))
    return "\n".join(streams)


def _widget(writer: PdfWriter, *, rect: list[float], field_type: str = "/Tx", name: str = "field"):
    annot = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject(field_type),
            NameObject("/T"): TextStringObject(name),
            NameObject("/Rect"): ArrayObject([NumberObject(v) for v in rect]),
        }
    )
    return writer._add_object(annot)  # pylint: disable=protected-access


def test_normalization_helpers_cover_rect_and_field_kind() -> None:
    assert form_filler._normalize_rect({"rect": [1, 2, 3, 4]}) == [1.0, 2.0, 3.0, 4.0]
    assert form_filler._normalize_rect({"x": 1, "y": 2, "width": 3, "height": 4}) == [1.0, 2.0, 4.0, 6.0]
    assert form_filler._normalize_rect({"x": 1}) is None

    assert form_filler._normalize_field_kind("checkbox") == "button"
    assert form_filler._normalize_field_kind("combo") == "choice"
    assert form_filler._normalize_field_kind("signature") == "signature"
    assert form_filler._normalize_field_kind("text") == "text"


def test_checkbox_value_and_confidence_helpers() -> None:
    widget = DictionaryObject()
    form_filler._apply_checkbox_value(widget, export_value="Yes", value=True)
    assert widget[NameObject("/V")] == NameObject("/Yes")

    form_filler._apply_checkbox_value(widget, export_value="Yes", value=False)
    assert widget[NameObject("/V")] == NameObject("/Off")

    assert form_filler._confidence_tag({"confidence": "0.9"}) == "dullypdf:confidence=0.9000"
    assert form_filler._confidence_tag({"confidence": "bad"}) is None


def test_button_appearance_streams_draw_only_selected_marks() -> None:
    writer = PdfWriter()

    checkbox_off = form_filler._build_checkbox_appearance(
        writer,
        width=12,
        height=12,
        checked=False,
    ).get_object().get_data().decode("ascii")
    checkbox_on = form_filler._build_checkbox_appearance(
        writer,
        width=12,
        height=12,
        checked=True,
    ).get_object().get_data().decode("ascii")
    radio_off = form_filler._build_radio_appearance(
        writer,
        width=12,
        height=12,
        checked=False,
    ).get_object().get_data().decode("ascii")
    radio_on = form_filler._build_radio_appearance(
        writer,
        width=12,
        height=12,
        checked=True,
    ).get_object().get_data().decode("ascii")

    assert " re S" not in checkbox_off
    assert " re S" not in checkbox_on
    assert " l " in checkbox_on
    assert radio_off == "q\nQ"
    assert "\nf" in radio_on
    assert "\nS" not in radio_on


def test_dedupe_existing_widgets_and_reset_acroform_fields() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)

    first = _widget(writer, rect=[10, 10, 40, 20], name="a")
    second = _widget(writer, rect=[10.1, 10.1, 40.1, 20.1], name="b")
    page[NameObject("/Annots")] = ArrayObject([first, second])

    removed = form_filler._dedupe_existing_widget_annots(writer, tol=0.5)
    assert removed == 1
    assert len(page["/Annots"]) == 1

    acroform = DictionaryObject({NameObject("/Fields"): ArrayObject([first])})
    form_filler._reset_acroform_fields(acroform)
    assert list(acroform["/Fields"]) == []


def test_update_existing_widget_sets_name_value_and_appearance() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)

    widget_ref = _widget(writer, rect=[10, 10, 70, 30], field_type="/Tx", name="old_name")
    page[NameObject("/Annots")] = ArrayObject([widget_ref])
    widget = widget_ref.get_object()

    changed = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[10, 10, 70, 30],
        field_type="text",
        value="Alice",
        export_value="Yes",
        new_name="new_name",
        confidence_tag="dullypdf:confidence=0.7500",
    )

    assert changed is True
    assert str(widget.get("/T")) == "new_name"
    assert str(widget.get("/V")) == "Alice"
    assert "/AP" in widget
    assert str(widget.get("/TU")) == "dullypdf:confidence=0.7500"


def test_update_existing_widget_uses_resolved_font_size() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)

    widget_ref = _widget(writer, rect=[10, 10, 70, 30], field_type="/Tx", name="old_name")
    page[NameObject("/Annots")] = ArrayObject([widget_ref])
    widget = widget_ref.get_object()

    changed = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[10, 10, 70, 30],
        field_type="text",
        value="Alice",
        export_value="Yes",
        new_name="new_name",
        font_size=13.0,
        default_appearance_font_size=13.0,
    )

    stream = widget["/AP"]["/N"].get_object().get_data().decode("utf-8")
    assert changed is True
    assert "/Helv 13.00 Tf" in stream
    assert str(widget.get("/DA")) == "/Helv 13 Tf 0 0 0 rg"


def test_update_existing_widget_can_skip_text_appearance_streams_for_legacy_payloads() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)

    widget_ref = _widget(writer, rect=[10, 10, 70, 30], field_type="/Tx", name="old_name")
    widget = widget_ref.get_object()
    widget[NameObject("/AP")] = DictionaryObject({NameObject("/N"): DictionaryObject()})
    page[NameObject("/Annots")] = ArrayObject([widget_ref])

    changed = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[10, 10, 70, 30],
        field_type="text",
        value="Alice",
        export_value="Yes",
        new_name="new_name",
        font_name="Times-Italic",
        default_appearance_font_size=12.0,
        render_text_appearance_streams=False,
    )

    assert changed is True
    assert str(widget.get("/V")) == "Alice"
    assert str(widget.get("/DA")) == "/TiIt 12 Tf 0 0 0 rg"
    assert "/AP" not in widget


def test_inject_fields_from_template_handles_duplicates_and_partial_fields(
    tmp_path: Path,
) -> None:
    input_pdf = tmp_path / "input.pdf"
    output_pdf = tmp_path / "output.pdf"
    _write_blank_pdf(input_pdf)

    template = {
        "coordinateSystem": "originTop",
        "fields": [
            {"name": "first_name", "type": "text", "page": 1, "rect": [10, 10, 80, 24], "value": "A"},
            {"name": "first_name_dup", "type": "text", "page": 1, "rect": [10.2, 10.2, 80.2, 24.2], "value": "B"},
            {"name": "agree", "type": "checkbox", "page": 1, "rect": [100, 10, 112, 22], "value": True},
            {"name": "missing_rect", "type": "text", "page": 1},
            {"name": "unknown_kind", "type": "wat", "page": 1, "rect": [10, 40, 20, 50]},
        ],
    }

    form_filler.inject_fields_from_template(input_pdf, template, output_pdf)

    reader = PdfReader(str(output_pdf))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    fields = [ref.get_object() for ref in acroform.get("/Fields", [])]
    names = {str(f.get("/T")) for f in fields}

    assert output_pdf.exists()
    assert len(fields) == 2
    assert "first_name_dup" in names
    assert "agree" in names


def test_inject_fields_from_template_repairs_duplicate_page_two_checkboxes(tmp_path: Path) -> None:
    input_pdf = tmp_path / "input.pdf"
    output_pdf = tmp_path / "output.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    page_two = writer.add_blank_page(width=200, height=200)
    rects = [
        [10, 10, 22, 22],
        [30, 10, 42, 22],
        [50, 10, 62, 22],
    ]
    annots = ArrayObject()
    for idx, rect in enumerate(rects):
        widget = DictionaryObject(
            {
                NameObject("/Subtype"): NameObject("/Widget"),
                NameObject("/FT"): NameObject("/Btn"),
                NameObject("/T"): TextStringObject(f"old_box_{idx}"),
                NameObject("/Rect"): ArrayObject([NumberObject(v) for v in rect]),
            }
        )
        annots.append(writer._add_object(widget))  # pylint: disable=protected-access
    page_two[NameObject("/Annots")] = annots
    with input_pdf.open("wb") as fh:
        writer.write(fh)

    template = {
        "coordinateSystem": "originBottom",
        "fields": [
            {"name": "page2_box_0", "type": "checkbox", "page": 2, "rect": rects[0], "value": True},
            {"name": "page2_box_1", "type": "checkbox", "page": 2, "rect": rects[1], "value": False},
            {"name": "page2_box_2", "type": "checkbox", "page": 2, "rect": rects[2], "value": True},
        ],
    }

    form_filler.inject_fields_from_template(input_pdf, template, output_pdf)

    reader = PdfReader(str(output_pdf))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    fields = [ref.get_object() for ref in acroform.get("/Fields", [])]
    page_two_annots = [ref.get_object() for ref in reader.pages[1].get("/Annots", [])]
    field_names = {str(field.get("/T")) for field in fields}

    assert field_names == {"page2_box_0", "page2_box_1", "page2_box_2"}
    assert len(page_two_annots) == 3
    assert [annot.get("/AS") for annot in page_two_annots] == [
        NameObject("/Yes"),
        NameObject("/Off"),
        NameObject("/Yes"),
    ]
    for annot in page_two_annots:
        normal_states = annot["/AP"]["/N"].get_object()
        assert set(str(key) for key in normal_states.keys()) == {"/Off", "/Yes"}


def test_inject_fields_and_no_fields_edge_cases(tmp_path: Path) -> None:
    input_pdf = tmp_path / "input.pdf"
    json_path = tmp_path / "fields.json"
    output_pdf = tmp_path / "wrapped-output.pdf"
    _write_blank_pdf(input_pdf)

    template = {
        "fields": [
            {"name": "city", "type": "text", "page": 1, "rect": [20, 20, 70, 35], "value": "Austin"}
        ]
    }
    json_path.write_text(json.dumps(template), encoding="utf-8")

    form_filler.inject_fields(input_pdf, json_path, output_pdf)
    assert output_pdf.exists()

    with pytest.raises(ValueError, match="No fields to inject"):
        form_filler.inject_fields_from_template(input_pdf, {"fields": []}, tmp_path / "none.pdf")


def test_inject_fields_from_template_uses_selected_base14_fonts(tmp_path: Path) -> None:
    input_pdf = tmp_path / "input-fonts.pdf"
    output_pdf = tmp_path / "output-fonts.pdf"
    _write_blank_pdf(input_pdf)

    template = {
        "coordinateSystem": "originTop",
        "appearance": {"globalFieldFont": "Times-Italic"},
        "fields": [
            {
                "name": "first_name",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 100, 40],
                "value": "Ada",
                "fontName": "Helvetica-Bold",
            },
            {
                "name": "last_name",
                "type": "text",
                "page": 1,
                "rect": [20, 50, 100, 70],
                "value": "Lovelace",
                "fontName": "global",
            },
        ],
    }

    form_filler.inject_fields_from_template(input_pdf, template, output_pdf)

    reader = PdfReader(str(output_pdf))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    page_font_resources = reader.pages[0]["/Resources"].get_object()["/Font"].get_object()
    font_resources = acroform["/DR"].get_object()["/Font"].get_object()
    base_fonts = {
        str(font_ref.get_object().get("/BaseFont"))
        for font_ref in font_resources.values()
    }
    fonts_by_resource = {str(key): value.get_object() for key, value in font_resources.items()}
    fields = [ref.get_object() for ref in acroform.get("/Fields", [])]
    first_name = next(field for field in fields if str(field.get("/T")) == "first_name")
    last_name = next(field for field in fields if str(field.get("/T")) == "last_name")
    first_ap = first_name["/AP"]["/N"].get_object()
    first_stream = first_ap.get_data().decode("utf-8")
    last_stream = last_name["/AP"]["/N"].get_object().get_data().decode("utf-8")

    assert "/Helvetica-Bold" in base_fonts
    assert "/Times-Italic" in base_fonts
    assert str(fonts_by_resource["/HeBo"].get("/Name")) == "/HeBo"
    assert str(fonts_by_resource["/TiIt"].get("/Encoding")) == "/WinAnsiEncoding"
    assert "/HeBo" in {str(key) for key in page_font_resources.keys()}
    assert "/TiIt" in {str(key) for key in page_font_resources.keys()}
    assert str(acroform.get("/NeedAppearances")) == "False"
    assert str(first_name.get("/Type")) == "/Annot"
    assert int(first_name.get("/F")) == 4
    assert first_name.get("/P") is not None
    assert "/HeBo" in {str(key) for key in first_name["/DR"].get_object()["/Font"].get_object().keys()}
    assert [str(value) for value in first_ap["/Resources"].get_object()["/ProcSet"]] == ["/PDF", "/Text"]
    assert "/HeBo" in first_stream
    assert "/TiIt" in last_stream
    assert str(first_name.get("/DA")) == "/HeBo 10 Tf 0 0 0 rg"
    assert str(last_name.get("/DA")) == "/TiIt 10 Tf 0 0 0 rg"


def test_inject_fields_from_template_writes_editable_values_into_widget_appearances(tmp_path: Path) -> None:
    input_pdf = tmp_path / "input-editable-fonts.pdf"
    output_pdf = tmp_path / "output-editable-fonts.pdf"
    _write_blank_pdf(input_pdf)

    template = {
        "coordinateSystem": "originTop",
        "appearance": {"globalFieldFont": "Times-Italic"},
        "fields": [
            {
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 120, 40],
                "value": "Ada Lovelace",
                "fontName": "global",
            },
        ],
    }

    form_filler.inject_fields_from_template(input_pdf, template, output_pdf)

    reader = PdfReader(str(output_pdf))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    font_resources = acroform["/DR"].get_object()["/Font"].get_object()
    base_fonts = {
        str(font_ref.get_object().get("/BaseFont"))
        for font_ref in font_resources.values()
    }
    field = acroform.get("/Fields")[0].get_object()
    stream = field["/AP"]["/N"].get_object().get_data().decode("utf-8")

    assert "/Times-Italic" in base_fonts
    assert str(field.get("/V")) == "Ada Lovelace"
    assert str(field.get("/DA")) == "/TiIt 10 Tf 0 0 0 rg"
    assert "/TiIt" in stream
    assert "Ada Lovelace" in stream
    assert "Ada Lovelace" not in _page_content_streams(output_pdf)


def test_inject_fields_from_template_removes_stale_same_name_widgets(tmp_path: Path) -> None:
    input_pdf = tmp_path / "input-stale-widget.pdf"
    output_pdf = tmp_path / "output-stale-widget.pdf"

    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)
    stale_ref = _widget(writer, rect=[10, 10, 70, 30], field_type="/Tx", name="full_name")
    page[NameObject("/Annots")] = ArrayObject([stale_ref])
    acroform["/Fields"].append(stale_ref)
    with input_pdf.open("wb") as fh:
        writer.write(fh)

    template = {
        "coordinateSystem": "originBottom",
        "fields": [
            {
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": [90, 90, 170, 115],
                "value": "Ada Lovelace",
                "fontName": "Times-Roman",
            },
        ],
    }

    form_filler.inject_fields_from_template(input_pdf, template, output_pdf)

    reader = PdfReader(str(output_pdf))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    fields = [ref.get_object() for ref in acroform.get("/Fields", [])]
    annots = [ref.get_object() for ref in reader.pages[0].get("/Annots", [])]
    stream = fields[0]["/AP"]["/N"].get_object().get_data().decode("utf-8")

    assert len(fields) == 1
    assert len(annots) == 1
    assert str(fields[0].get("/T")) == "full_name"
    assert [float(v) for v in fields[0].get("/Rect")] == [90.0, 90.0, 170.0, 115.0]
    assert str(fields[0].get("/V")) == "Ada Lovelace"
    assert str(fields[0].get("/DA")) == "/Time 10 Tf 0 0 0 rg"
    assert "/Time" in stream
    assert "Ada Lovelace" not in _page_content_streams(output_pdf)


def test_inject_fields_from_template_resolves_global_and_field_font_sizes(tmp_path: Path) -> None:
    input_pdf = tmp_path / "input-font-size.pdf"
    output_pdf = tmp_path / "output-font-size.pdf"
    _write_blank_pdf(input_pdf)

    template = {
        "coordinateSystem": "originTop",
        "appearance": {"globalFieldFontSize": 14},
        "fields": [
            {
                "name": "global_size",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 120, 40],
                "value": "Global",
            },
            {
                "name": "field_override",
                "type": "text",
                "page": 1,
                "rect": [20, 50, 120, 70],
                "value": "Override",
                "fontSize": 9,
            },
            {
                "name": "field_auto",
                "type": "text",
                "page": 1,
                "rect": [20, 80, 120, 94],
                "value": "Auto",
                "fontSize": "auto",
            },
            {
                "name": "date_global",
                "type": "date",
                "page": 1,
                "rect": [20, 105, 120, 125],
                "value": "2026-05-15",
            },
        ],
    }

    form_filler.inject_fields_from_template(input_pdf, template, output_pdf)

    fields = _field_debug(output_pdf)
    assert "/Helv 14.00 Tf" in fields["global_size"]["stream"]
    assert fields["global_size"]["da"] == "/Helv 14 Tf 0 0 0 rg"
    assert "/Helv 9.00 Tf" in fields["field_override"]["stream"]
    assert fields["field_override"]["da"] == "/Helv 9 Tf 0 0 0 rg"
    assert "/Helv 9.10 Tf" in fields["field_auto"]["stream"]
    assert fields["field_auto"]["da"] == "/Helv 9.1 Tf 0 0 0 rg"
    assert "/Helv 14.00 Tf" in fields["date_global"]["stream"]


def test_inject_fields_from_template_resolves_global_and_field_font_colors(tmp_path: Path) -> None:
    input_pdf = tmp_path / "input-font-color.pdf"
    output_pdf = tmp_path / "output-font-color.pdf"
    _write_blank_pdf(input_pdf)

    template = {
        "coordinateSystem": "originTop",
        "appearance": {"globalFieldFontColor": "#336699"},
        "fields": [
            {
                "name": "global_color",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 120, 40],
                "value": "Global",
            },
            {
                "name": "custom_color",
                "type": "text",
                "page": 1,
                "rect": [20, 50, 120, 70],
                "value": "Custom",
                "fontColor": "#cc3300",
            },
        ],
    }

    form_filler.inject_fields_from_template(input_pdf, template, output_pdf)

    reader = PdfReader(str(output_pdf))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    fields = _field_debug(output_pdf)
    dully_metadata = json.loads(reader.metadata.get("/DullyPDFAppearance"))

    assert str(acroform.get("/DA")) == "/Helv 10 Tf 0.2 0.4 0.6 rg"
    assert fields["global_color"]["da"] == "/Helv 10 Tf 0.2 0.4 0.6 rg"
    assert "0.2 0.4 0.6 rg" in fields["global_color"]["stream"]
    assert fields["custom_color"]["da"] == "/Helv 10 Tf 0.8 0.2 0 rg"
    assert "0.8 0.2 0 rg" in fields["custom_color"]["stream"]
    assert dully_metadata["appearance"]["globalFieldFontColor"] == "#336699"
    assert dully_metadata["fields"] == [
        {"fontColor": "#cc3300", "name": "custom_color", "page": 1, "type": "text"}
    ]


def test_inject_fields_from_template_auto_default_keeps_existing_formula(tmp_path: Path) -> None:
    input_pdf = tmp_path / "input-auto-size.pdf"
    output_pdf = tmp_path / "output-auto-size.pdf"
    _write_blank_pdf(input_pdf)

    template = {
        "coordinateSystem": "originTop",
        "fields": [
            {
                "name": "auto_size",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 120, 34],
                "value": "Auto",
            },
        ],
    }

    form_filler.inject_fields_from_template(input_pdf, template, output_pdf)

    fields = _field_debug(output_pdf)
    assert "/Helv 9.10 Tf" in fields["auto_size"]["stream"]
    assert fields["auto_size"]["da"] is None


def test_flatten_bakes_selected_font_size_appearance(tmp_path: Path) -> None:
    input_pdf = tmp_path / "input-flat-size.pdf"
    output_pdf = tmp_path / "output-flat-size.pdf"
    _write_blank_pdf(input_pdf)

    template = {
        "coordinateSystem": "originTop",
        "appearance": {"globalFieldFontSize": 18},
        "fields": [
            {
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 140, 45],
                "value": "Ada Lovelace",
            },
        ],
    }

    form_filler.inject_fields_from_template(input_pdf, template, output_pdf)
    fields = _field_debug(output_pdf)
    assert "/Helv 18.00 Tf" in fields["full_name"]["stream"]

    flat_bytes = flatten_pdf_form_widgets(output_pdf.read_bytes())
    assert pdf_has_form_widgets(flat_bytes) is False
    with fitz.open(stream=flat_bytes, filetype="pdf") as document:
        assert "Ada Lovelace" in document[0].get_text()
    reader = PdfReader(io.BytesIO(flat_bytes))
    assert "/AcroForm" not in reader.trailer["/Root"] or not reader.trailer["/Root"]["/AcroForm"].get_object().get("/Fields")


def test_inject_fields_from_template_supports_radio_combo_and_signature(
    tmp_path: Path,
) -> None:
    input_pdf = tmp_path / "input-radio-combo-sig.pdf"
    output_pdf = tmp_path / "output-radio-combo-sig.pdf"
    _write_blank_pdf(input_pdf)

    template = {
        "coordinateSystem": "originTop",
        "fields": [
            {
                "name": "gender_m",
                "group": "gender",
                "type": "radio",
                "page": 1,
                "rect": [10, 10, 20, 20],
                "exportValue": "M",
                "value": "M",
            },
            {
                "name": "gender_f",
                "group": "gender",
                "type": "radio",
                "page": 1,
                "rect": [25, 10, 35, 20],
                "exportValue": "F",
            },
            {
                "name": "status",
                "type": "combo",
                "page": 1,
                "rect": [40, 10, 100, 25],
                "options": ["Single", "Married"],
                "value": "Married",
            },
            {
                "name": "signature",
                "type": "signature",
                "page": 1,
                "rect": [110, 10, 180, 30],
            },
        ],
    }

    form_filler.inject_fields_from_template(input_pdf, template, output_pdf)

    reader = PdfReader(str(output_pdf))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    fields = [ref.get_object() for ref in acroform.get("/Fields", [])]

    radio_group = next(f for f in fields if f.get("/FT") == "/Btn")
    combo_field = next(f for f in fields if f.get("/FT") == "/Ch")
    signature_field = next(f for f in fields if f.get("/FT") == "/Sig")

    radio_kids = [kid_ref.get_object() for kid_ref in radio_group.get("/Kids", [])]
    radio_flags = int(radio_group.get("/Ff"))
    assert len(radio_kids) == 2
    assert radio_flags & form_filler.FLAG_RADIO
    assert not radio_flags & form_filler.FLAG_NO_TOGGLE_TO_OFF
    assert not radio_flags & form_filler.FLAG_READ_ONLY
    assert str(radio_group.get("/V")) == "/M"
    assert [str(kid.get("/AS")) for kid in radio_kids] == ["/M", "/Off"]
    assert [set(str(key) for key in kid["/AP"]["/N"].get_object().keys()) for kid in radio_kids] == [
        {"/Off", "/M"},
        {"/Off", "/F"},
    ]
    with fitz.open(str(output_pdf)) as document:
        page = document[0]
        widgets = list(page.widgets() or [])
        radio_states = [
            widget.button_states()
            for widget in widgets
            if widget.field_type == fitz.PDF_WIDGET_TYPE_RADIOBUTTON
        ]
    assert radio_states == [
        {"normal": ["Off", "M"], "down": None},
        {"normal": ["Off", "F"], "down": None},
    ]
    assert [str(opt) for opt in combo_field.get("/Opt", [])] == ["Single", "Married"]
    assert str(combo_field.get("/V")) == "Married"
    assert str(signature_field.get("/T")) == "signature"


def test_inject_fields_from_template_uniquifies_duplicate_radio_export_values(tmp_path: Path) -> None:
    input_pdf = tmp_path / "input-radio-duplicate-values.pdf"
    output_pdf = tmp_path / "output-radio-duplicate-values.pdf"
    _write_blank_pdf(input_pdf)

    template = {
        "coordinateSystem": "originTop",
        "fields": [
            {
                "name": "choice_a",
                "type": "radio",
                "page": 1,
                "rect": [10, 10, 22, 22],
                "radioGroupKey": "choice",
                "radioOptionKey": "same",
                "value": None,
            },
            {
                "name": "choice_b",
                "type": "radio",
                "page": 1,
                "rect": [30, 10, 42, 22],
                "radioGroupKey": "choice",
                "radioOptionKey": "same",
                "value": "same",
            },
        ],
    }

    form_filler.inject_fields_from_template(input_pdf, template, output_pdf)

    reader = PdfReader(str(output_pdf))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    radio_group = acroform.get("/Fields")[0].get_object()
    radio_kids = [kid_ref.get_object() for kid_ref in radio_group.get("/Kids", [])]
    state_sets = [set(str(key) for key in kid["/AP"]["/N"].get_object().keys()) for kid in radio_kids]

    assert str(radio_group.get("/V")) == "/same_2"
    assert [str(kid.get("/AS")) for kid in radio_kids] == ["/Off", "/same_2"]
    assert state_sets == [{"/Off", "/same"}, {"/Off", "/same_2"}]


def test_inject_fields_from_template_groups_radios_by_stable_id_without_group_key(tmp_path: Path) -> None:
    input_pdf = tmp_path / "input-radio-id-only.pdf"
    output_pdf = tmp_path / "output-radio-id-only.pdf"
    _write_blank_pdf(input_pdf)

    template = {
        "coordinateSystem": "originTop",
        "fields": [
            {
                "name": "coverage_yes",
                "type": "radio",
                "page": 1,
                "rect": [10, 10, 22, 22],
                "radioGroupId": "coverage-group-id",
                "radioOptionKey": "yes",
                "value": "yes",
            },
            {
                "name": "coverage_no",
                "type": "radio",
                "page": 1,
                "rect": [30, 10, 42, 22],
                "radioGroupId": "coverage-group-id",
                "radioOptionKey": "no",
                "value": None,
            },
        ],
    }

    form_filler.inject_fields_from_template(input_pdf, template, output_pdf)

    reader = PdfReader(str(output_pdf))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    acro_fields = [field_ref.get_object() for field_ref in acroform.get("/Fields", [])]
    radio_group = acro_fields[0]
    radio_kids = [kid_ref.get_object() for kid_ref in radio_group.get("/Kids", [])]
    radio_flags = int(radio_group.get("/Ff"))

    assert len(acro_fields) == 1
    assert str(radio_group.get("/T")) == "coverage-group-id"
    assert radio_flags & form_filler.FLAG_RADIO
    assert not radio_flags & form_filler.FLAG_NO_TOGGLE_TO_OFF
    assert str(radio_group.get("/V")) == "/yes"
    assert [str(kid.get("/AS")) for kid in radio_kids] == ["/yes", "/Off"]
    assert [str(kid.get("/Parent").get_object().get("/T")) for kid in radio_kids] == [
        "coverage-group-id",
        "coverage-group-id",
    ]
