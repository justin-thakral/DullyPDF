from __future__ import annotations

from pypdf import PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, NumberObject, TextStringObject

from backend.fieldDetecting.rename_pipeline.combinedSrc import form_filler


def _add_widget(
    writer: PdfWriter,
    *,
    rect: list[float],
    field_type: str = "/Tx",
    name: str = "field",
):
    widget = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject(field_type),
            NameObject("/T"): TextStringObject(name),
            NameObject("/Rect"): ArrayObject([NumberObject(v) for v in rect]),
        }
    )
    return writer._add_object(widget)  # pylint: disable=protected-access


def test_origin_flags_and_kind_helpers() -> None:
    assert form_filler._resolve_origin({"coordinateSystem": "originTop"}) == "top-left"
    assert form_filler._resolve_origin({"coordinateSystem": "OriginBottom"}) == "bottom-left"
    assert form_filler._resolve_origin({"coordinateOrigin": "bottom-left"}) == "bottom-left"
    assert form_filler._resolve_origin({}) == "top-left"

    flags = form_filler._field_flags({"readOnly": True, "required": True})
    assert flags & form_filler.FLAG_READ_ONLY
    assert flags & form_filler.FLAG_REQUIRED

    assert form_filler._pdf_field_kind("/Tx") == "text"
    assert form_filler._pdf_field_kind("/Btn") == "button"
    assert form_filler._pdf_field_kind("/Ch") == "choice"
    assert form_filler._pdf_field_kind("/Sig") == "signature"
    assert form_filler._pdf_field_kind("/Unknown") == "unknown"


def test_confidence_value_parser_and_tag_bounds() -> None:
    assert form_filler._parse_confidence_value(None) is None
    assert form_filler._parse_confidence_value(True) is None
    assert form_filler._parse_confidence_value("1.5") == 1.0
    assert form_filler._parse_confidence_value("-0.2") == 0.0
    assert form_filler._parse_confidence_value("nan") is None

    assert form_filler._confidence_tag({"confidence": "0.25"}) == "dullypdf:confidence=0.2500"


def test_collect_existing_widgets_reads_parent_field_type() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)

    parent = DictionaryObject(
        {
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/T"): TextStringObject("parent_field"),
        }
    )
    parent_ref = writer._add_object(parent)  # pylint: disable=protected-access

    widget = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Parent"): parent_ref,
            NameObject("/Rect"): ArrayObject([NumberObject(10), NumberObject(10), NumberObject(20), NumberObject(20)]),
        }
    )
    widget_ref = writer._add_object(widget)  # pylint: disable=protected-access
    page[NameObject("/Annots")] = ArrayObject([widget_ref])

    existing = form_filler._collect_existing_widgets(writer)

    assert list(existing.keys()) == [1]
    assert existing[1][0]["kind"] == "text"
    assert existing[1][0]["rect"] == [10.0, 10.0, 20.0, 20.0]


def test_strip_existing_widget_annots_preserves_non_widget_annots() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    widget_ref = _add_widget(writer, rect=[10, 10, 20, 20], field_type="/Tx", name="a")

    text_annot = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Text"),
            NameObject("/Rect"): ArrayObject([NumberObject(1), NumberObject(1), NumberObject(5), NumberObject(5)]),
        }
    )
    text_ref = writer._add_object(text_annot)  # pylint: disable=protected-access
    page[NameObject("/Annots")] = ArrayObject([widget_ref, text_ref])

    removed = form_filler._strip_existing_widget_annots(writer)

    assert removed == 1
    remaining = page["/Annots"]
    assert len(remaining) == 1
    assert remaining[0].get_object().get("/Subtype") == "/Text"


def test_pdf_rect_and_unique_annots_helpers() -> None:
    assert form_filler._to_pdf_rect([1, 2, 3, 4], page_height=10, origin="top-left") == [1, 6, 3, 8]
    assert form_filler._to_pdf_rect([1, 2, 3, 4], page_height=10, origin="bottom-left") == [1, 2, 3, 4]

    writer = PdfWriter()
    first_page = writer.add_blank_page(width=200, height=200)
    second_page = writer.add_blank_page(width=200, height=200)
    shared_annots = ArrayObject()
    shared_annots.append(_add_widget(writer, rect=[10, 10, 20, 20], field_type="/Tx", name="shared"))
    first_page[NameObject("/Annots")] = shared_annots
    second_page[NameObject("/Annots")] = shared_annots

    form_filler._ensure_unique_page_annots(writer)

    first_annots = first_page["/Annots"]
    second_annots = second_page["/Annots"]
    assert id(first_annots) != id(second_annots)

    first_annots.append(_add_widget(writer, rect=[30, 30, 40, 40], field_type="/Tx", name="new"))
    assert len(first_annots) == 2
    assert len(second_annots) == 1


def test_pdf_escape_and_text_appearance_helpers() -> None:
    escaped = form_filler._pdf_escape_text(r"A\(B)\r\nC")
    assert r"\(" in escaped and r"\)" in escaped and r"\\" in escaped

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)
    font_ref = form_filler._helv_font_ref(acroform)

    appearance_ref = form_filler._build_text_appearance(
        writer,
        width=120,
        height=24,
        value="Hello",
        font_ref=font_ref,
    )
    assert appearance_ref is not None

    assert form_filler._build_text_appearance(writer, width=0, height=24, value="x", font_ref=font_ref) is None
    assert form_filler._build_text_appearance(writer, width=120, height=24, value="x", font_ref=None) is None


def test_update_existing_widget_normalizes_date_and_combobox_to_text() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)

    date_widget_ref = _add_widget(writer, rect=[10, 10, 60, 30], field_type="/Tx", name="date_old")
    combo_widget_ref = _add_widget(writer, rect=[70, 10, 120, 30], field_type="/Tx", name="combo_old")
    page[NameObject("/Annots")] = ArrayObject([date_widget_ref, combo_widget_ref])

    changed_date = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[10, 10, 60, 30],
        field_type="date",
        value="2026-02-11",
        export_value="Yes",
        new_name="date_new",
    )
    changed_combo = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[70, 10, 120, 30],
        field_type="combobox",
        value="Option A",
        export_value="Yes",
        new_name="combo_new",
    )

    date_widget = date_widget_ref.get_object()
    combo_widget = combo_widget_ref.get_object()
    assert changed_date is True
    assert changed_combo is True
    assert str(date_widget.get("/T")) == "date_new"
    assert str(date_widget.get("/V")) == "2026-02-11"
    assert str(combo_widget.get("/T")) == "combo_new"
    assert str(combo_widget.get("/V")) == "Option A"


def test_update_existing_widget_checkbox_parent_syncs_value_and_confidence_tag() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)

    parent = DictionaryObject(
        {
            NameObject("/FT"): NameObject("/Btn"),
            NameObject("/T"): TextStringObject("consent_old"),
        }
    )
    parent_ref = writer._add_object(parent)  # pylint: disable=protected-access
    widget = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Parent"): parent_ref,
            NameObject("/Rect"): ArrayObject([NumberObject(10), NumberObject(10), NumberObject(20), NumberObject(20)]),
        }
    )
    widget_ref = writer._add_object(widget)  # pylint: disable=protected-access
    page[NameObject("/Annots")] = ArrayObject([widget_ref])

    changed = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[10, 10, 20, 20],
        field_type="checkbox",
        value=True,
        export_value="Yes",
        new_name="consent_new",
        confidence_tag="dullypdf:confidence=0.9000",
    )

    parent_obj = parent_ref.get_object()
    widget_obj = widget_ref.get_object()
    normal_states = widget_obj["/AP"]["/N"].get_object()
    acro_fields = acroform["/Fields"].get_object()
    assert changed is True
    assert str(parent_obj.get("/T")) == "consent_new"
    assert parent_obj.get("/V") == NameObject("/Yes")
    assert widget_obj.get("/V") == NameObject("/Yes")
    assert widget_obj.get("/AS") == NameObject("/Yes")
    assert set(str(key) for key in normal_states.keys()) == {"/Off", "/Yes"}
    assert list(parent_obj.get("/Kids")) == [widget_ref]
    assert list(acro_fields) == [parent_ref]
    assert str(parent_obj.get("/TU")) == "dullypdf:confidence=0.9000"
    assert str(widget_obj.get("/TU")) == "dullypdf:confidence=0.9000"


def test_update_existing_widget_checkbox_replaces_broken_appearance_states() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)

    widget = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Btn"),
            NameObject("/T"): TextStringObject("old_checkbox"),
            NameObject("/Rect"): ArrayObject(
                [NumberObject(10), NumberObject(10), NumberObject(22), NumberObject(22)]
            ),
            NameObject("/AS"): NameObject("/On"),
            NameObject("/AP"): DictionaryObject(
                {
                    NameObject("/N"): DictionaryObject(
                        {
                            NameObject("/On"): DictionaryObject(),
                        }
                    )
                }
            ),
        }
    )
    widget_ref = writer._add_object(widget)  # pylint: disable=protected-access
    page[NameObject("/Annots")] = ArrayObject([widget_ref])

    changed = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[10, 10, 22, 22],
        field_type="checkbox",
        value=None,
        export_value="Yes",
        new_name="new_checkbox",
    )

    widget_obj = widget_ref.get_object()
    normal_states = widget_obj["/AP"]["/N"].get_object()
    assert changed is True
    assert str(widget_obj.get("/T")) == "new_checkbox"
    assert widget_obj.get("/V") == NameObject("/Off")
    assert widget_obj.get("/AS") == NameObject("/Off")
    assert set(str(key) for key in normal_states.keys()) == {"/Off", "/Yes"}
    assert list(acroform["/Fields"].get_object()) == [widget_ref]


def test_update_existing_widget_checkbox_clears_locked_radio_flags() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)

    widget = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Btn"),
            NameObject("/T"): TextStringObject("old_checkbox"),
            NameObject("/Rect"): ArrayObject(
                [NumberObject(10), NumberObject(10), NumberObject(22), NumberObject(22)]
            ),
            NameObject("/Ff"): NumberObject(
                form_filler.FLAG_READ_ONLY
                | form_filler.FLAG_RADIO
                | form_filler.FLAG_NO_TOGGLE_TO_OFF
            ),
            NameObject("/F"): NumberObject(
                form_filler.ANNOT_FLAG_HIDDEN
                | form_filler.ANNOT_FLAG_READ_ONLY
                | form_filler.ANNOT_FLAG_LOCKED
            ),
        }
    )
    widget_ref = writer._add_object(widget)  # pylint: disable=protected-access
    page[NameObject("/Annots")] = ArrayObject([widget_ref])

    changed = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[10, 10, 22, 22],
        field_type="checkbox",
        value=True,
        export_value="Yes",
        flags=form_filler.FLAG_READ_ONLY,
        new_name="new_checkbox",
    )

    widget_obj = widget_ref.get_object()
    field_flags = int(widget_obj.get("/Ff"))
    annot_flags = int(widget_obj.get("/F"))
    assert changed is True
    assert field_flags & form_filler.FLAG_READ_ONLY == 0
    assert field_flags & form_filler.FLAG_RADIO == 0
    assert field_flags & form_filler.FLAG_NO_TOGGLE_TO_OFF == 0
    assert annot_flags == form_filler.ANNOT_FLAG_PRINT
    assert widget_obj.get("/AS") == NameObject("/Yes")


def test_update_existing_widget_checkbox_detaches_from_source_radio_parent() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)

    parent = DictionaryObject(
        {
            NameObject("/FT"): NameObject("/Btn"),
            NameObject("/T"): TextStringObject("old_group"),
            NameObject("/Ff"): NumberObject(form_filler.FLAG_RADIO),
            NameObject("/Kids"): ArrayObject(),
        }
    )
    parent_ref = writer._add_object(parent)  # pylint: disable=protected-access
    first = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Parent"): parent_ref,
            NameObject("/Rect"): ArrayObject(
                [NumberObject(10), NumberObject(10), NumberObject(22), NumberObject(22)]
            ),
        }
    )
    second = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Parent"): parent_ref,
            NameObject("/Rect"): ArrayObject(
                [NumberObject(30), NumberObject(10), NumberObject(42), NumberObject(22)]
            ),
        }
    )
    first_ref = writer._add_object(first)  # pylint: disable=protected-access
    second_ref = writer._add_object(second)  # pylint: disable=protected-access
    parent["/Kids"].extend([first_ref, second_ref])
    page[NameObject("/Annots")] = ArrayObject([first_ref, second_ref])
    acroform["/Fields"].append(parent_ref)

    changed = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[10, 10, 22, 22],
        field_type="checkbox",
        value=True,
        export_value="Yes",
        new_name="standalone_checkbox",
    )

    parent_obj = parent_ref.get_object()
    first_widget = first_ref.get_object()
    assert changed is True
    assert list(parent_obj.get("/Kids")) == [second_ref]
    assert first_widget.get("/Parent") is None
    assert str(first_widget.get("/T")) == "standalone_checkbox"
    assert int(first_widget.get("/Ff")) & form_filler.FLAG_RADIO == 0
    assert list(acroform["/Fields"].get_object()) == [first_ref]


def test_update_existing_widget_radio_parent_sets_group_value_and_appearance() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)

    parent = DictionaryObject(
        {
            NameObject("/FT"): NameObject("/Btn"),
            NameObject("/T"): TextStringObject("contact_old"),
            NameObject("/Ff"): NumberObject(form_filler.FLAG_RADIO),
        }
    )
    parent_ref = writer._add_object(parent)  # pylint: disable=protected-access
    widget = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Parent"): parent_ref,
            NameObject("/Rect"): ArrayObject(
                [NumberObject(10), NumberObject(10), NumberObject(22), NumberObject(22)]
            ),
            NameObject("/AS"): NameObject("/Off"),
        }
    )
    widget_ref = writer._add_object(widget)  # pylint: disable=protected-access
    page[NameObject("/Annots")] = ArrayObject([widget_ref])

    changed = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[10, 10, 22, 22],
        field_type="radio",
        value="email",
        export_value="email",
        new_name="preferred_contact",
    )

    parent_obj = parent_ref.get_object()
    widget_obj = widget_ref.get_object()
    normal_states = widget_obj["/AP"]["/N"].get_object()
    assert changed is True
    assert str(parent_obj.get("/T")) == "preferred_contact"
    assert parent_obj.get("/V") == NameObject("/email")
    assert widget_obj.get("/AS") == NameObject("/email")
    assert set(str(key) for key in normal_states.keys()) == {"/Off", "/email"}


def test_update_existing_widget_radio_without_value_sets_off_appearance() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)

    parent = DictionaryObject(
        {
            NameObject("/FT"): NameObject("/Btn"),
            NameObject("/T"): TextStringObject("contact_old"),
            NameObject("/Ff"): NumberObject(form_filler.FLAG_RADIO),
        }
    )
    parent_ref = writer._add_object(parent)  # pylint: disable=protected-access
    widget = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Parent"): parent_ref,
            NameObject("/Rect"): ArrayObject(
                [NumberObject(10), NumberObject(10), NumberObject(22), NumberObject(22)]
            ),
        }
    )
    widget_ref = writer._add_object(widget)  # pylint: disable=protected-access
    page[NameObject("/Annots")] = ArrayObject([widget_ref])

    changed = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[10, 10, 22, 22],
        field_type="radio",
        value=None,
        export_value="sms",
        new_name="preferred_contact",
    )

    parent_obj = parent_ref.get_object()
    widget_obj = widget_ref.get_object()
    normal_states = widget_obj["/AP"]["/N"].get_object()
    assert changed is True
    assert str(parent_obj.get("/T")) == "preferred_contact"
    assert parent_obj.get("/V") == NameObject("/Off")
    assert widget_obj.get("/AS") == NameObject("/Off")
    assert set(str(key) for key in normal_states.keys()) == {"/Off", "/sms"}


def test_update_existing_widget_radio_reparents_top_level_widgets_into_one_group() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    acroform = form_filler._ensure_acroform(writer)

    first = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Btn"),
            NameObject("/T"): TextStringObject("old_first"),
            NameObject("/Rect"): ArrayObject(
                [NumberObject(10), NumberObject(10), NumberObject(22), NumberObject(22)]
            ),
        }
    )
    second = DictionaryObject(
        {
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Btn"),
            NameObject("/T"): TextStringObject("old_second"),
            NameObject("/Rect"): ArrayObject(
                [NumberObject(30), NumberObject(10), NumberObject(42), NumberObject(22)]
            ),
        }
    )
    first_ref = writer._add_object(first)  # pylint: disable=protected-access
    second_ref = writer._add_object(second)  # pylint: disable=protected-access
    page[NameObject("/Annots")] = ArrayObject([first_ref, second_ref])
    acroform["/Fields"].extend([first_ref, second_ref])
    radio_groups = {}

    changed_first = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[10, 10, 22, 22],
        field_type="radio",
        value="sms",
        export_value="sms",
        new_name="preferred_contact",
        radio_group_state=radio_groups,
        radio_group_name="preferred_contact",
    )
    changed_second = form_filler._update_existing_widget(
        writer,
        page,
        acroform,
        rect=[30, 10, 42, 22],
        field_type="radio",
        value=None,
        export_value="email",
        new_name="preferred_contact",
        radio_group_state=radio_groups,
        radio_group_name="preferred_contact",
    )

    acro_fields = acroform["/Fields"].get_object()
    group_ref = acro_fields[0]
    group = group_ref.get_object()
    first_widget = first_ref.get_object()
    second_widget = second_ref.get_object()
    assert changed_first is True
    assert changed_second is True
    assert len(acro_fields) == 1
    assert str(group.get("/T")) == "preferred_contact"
    assert int(group.get("/Ff")) & form_filler.FLAG_RADIO
    assert not int(group.get("/Ff")) & form_filler.FLAG_NO_TOGGLE_TO_OFF
    assert group.get("/V") == NameObject("/sms")
    assert list(group.get("/Kids")) == [first_ref, second_ref]
    assert first_widget.get("/Parent") == group_ref
    assert second_widget.get("/Parent") == group_ref
    assert "/T" not in first_widget
    assert "/FT" not in first_widget
    assert first_widget.get("/AS") == NameObject("/sms")
    assert second_widget.get("/AS") == NameObject("/Off")
    assert set(str(key) for key in first_widget["/AP"]["/N"].get_object().keys()) == {"/Off", "/sms"}
    assert set(str(key) for key in second_widget["/AP"]["/N"].get_object().keys()) == {"/Off", "/email"}
