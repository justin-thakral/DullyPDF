import io
import hashlib
import json
from pathlib import Path

from fastapi import HTTPException
import pytest
import fitz
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, FloatObject, NameObject, NumberObject, TextStringObject

from backend.detection.pdf_validation import PdfValidationResult
from backend.services.pdf_export_service import pdf_has_form_widgets


def _patch_auth(mocker, app_main, user) -> None:
    mocker.patch.object(app_main, "_verify_token", return_value={"uid": user.app_user_id})
    mocker.patch.object(app_main, "ensure_user", return_value=user)


def _blank_pdf_bytes(*, width: float = 200, height: float = 200) -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=width, height=height)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _calculated_pdf_bytes() -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    total_field = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/T"): TextStringObject("premium_total"),
            NameObject("/Rect"): ArrayObject([FloatObject(10), FloatObject(160), FloatObject(90), FloatObject(178)]),
            NameObject("/Ff"): NumberObject(1),
            NameObject("/AA"): DictionaryObject(
                {
                    NameObject("/C"): DictionaryObject(
                        {
                            NameObject("/S"): NameObject("/JavaScript"),
                            NameObject("/JS"): TextStringObject(
                                "AFSimple_Calculate('SUM', new Array('base_premium'));"
                            ),
                        }
                    )
                }
            ),
        }
    )
    total_ref = writer._add_object(total_field)  # pylint: disable=protected-access
    page[NameObject("/Annots")] = ArrayObject([total_ref])
    acroform = DictionaryObject(
        {
            NameObject("/Fields"): ArrayObject([total_ref]),
            NameObject("/CO"): ArrayObject([total_ref]),
        }
    )
    writer._root_object[NameObject("/AcroForm")] = writer._add_object(acroform)  # pylint: disable=protected-access
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _appearance_streams(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    acroform = reader.trailer["/Root"].get("/AcroForm")
    if not acroform:
        return ""
    streams: list[str] = []
    for field_ref in acroform.get_object().get("/Fields", []):
        field = field_ref.get_object()
        appearance = field.get("/AP")
        if appearance and "/N" in appearance:
            streams.append(appearance["/N"].get_object().get_data().decode("utf-8", "ignore"))
    return "\n".join(streams)


def _page_content_streams(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    streams: list[str] = []
    for page in reader.pages:
        contents = page.get_contents()
        if contents:
            streams.append(contents.get_data().decode("utf-8", "ignore"))
    return "\n".join(streams)


def _field_default_appearances(pdf_bytes: bytes) -> dict[str, str | None]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    acroform = reader.trailer["/Root"].get("/AcroForm")
    if not acroform:
        return {}
    fields: dict[str, str | None] = {}
    for field_ref in acroform.get_object().get("/Fields", []):
        field = field_ref.get_object()
        name = str(field.get("/T"))
        fields[name] = str(field.get("/DA")) if field.get("/DA") is not None else None
    return fields


def _field_values_and_flags(pdf_bytes: bytes) -> dict[str, tuple[str | None, int]]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    acroform = reader.trailer["/Root"].get("/AcroForm")
    if not acroform:
        return {}
    values: dict[str, tuple[str | None, int]] = {}
    for field_ref in acroform.get_object().get("/Fields", []):
        field = field_ref.get_object()
        name = str(field.get("/T"))
        value = field.get("/V")
        values[name] = (str(value) if value is not None else None, int(field.get("/Ff") or 0))
    return values


def _acroform_fields_by_name(pdf_bytes: bytes) -> dict[str, DictionaryObject]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    acroform = reader.trailer["/Root"].get("/AcroForm")
    if not acroform:
        return {}
    fields: dict[str, DictionaryObject] = {}
    for field_ref in acroform.get_object().get("/Fields", []):
        field = field_ref.get_object()
        name = str(field.get("/T") or "")
        if name:
            fields[name] = field
    return fields


def _calculation_order_names(pdf_bytes: bytes) -> list[str]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    acroform = reader.trailer["/Root"].get("/AcroForm")
    if not acroform:
        return []
    order = acroform.get_object().get("/CO") or []
    return [str(field_ref.get_object().get("/T") or "") for field_ref in order]


class _FakePdfDoc:
    def __init__(self, page_count: int = 1) -> None:
        self.page_count = page_count

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return None


def test_template_session_fields_validation_and_page_limits(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    response = client.post(
        "/api/templates/session",
        files={"pdf": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
        data={"fields": "{bad"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "Invalid fields payload" in response.text

    mocker.patch.object(app_main, "_read_upload_bytes", return_value=b"%PDF-1.4\n")
    mocker.patch.object(
        app_main,
        "_validate_pdf_for_detection",
        return_value=PdfValidationResult(pdf_bytes=b"%PDF-1.4\n", page_count=10, was_decrypted=False),
    )
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=5)
    response = client.post(
        "/api/templates/session",
        files={"pdf": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
        data={"fields": '[{"name":"f","x":1,"y":2,"width":3,"height":4}]'},
        headers=auth_headers,
    )
    assert response.status_code == 403
    assert "Fillable upload limited to 5 pages" in response.text


def test_pdf_page_count_validates_upload_and_returns_detect_limit_metadata(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    response = client.post(
        "/api/pdf/page-count",
        files={"pdf": ("x.txt", b"hello", "text/plain")},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "Only PDF uploads" in response.text

    mocker.patch.object(app_main, "_read_upload_bytes", return_value=b"")
    response = client.post(
        "/api/pdf/page-count",
        files={"pdf": ("x.pdf", b"", "application/pdf")},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "Uploaded file is empty" in response.text

    mocker.patch.object(app_main, "_read_upload_bytes", return_value=b"%PDF-1.4\n")
    mocker.patch.object(
        app_main,
        "_validate_pdf_for_detection",
        return_value=PdfValidationResult(pdf_bytes=b"%PDF-1.4\n", page_count=7, was_decrypted=False),
    )
    mocker.patch.object(app_main, "_resolve_detect_max_pages", return_value=5)
    response = client.post(
        "/api/pdf/page-count",
        files={"pdf": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "pageCount": 7,
        "detectMaxPages": 5,
        "withinDetectLimit": False,
    }


def test_template_session_success_coerces_fields(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_read_upload_bytes", return_value=b"%PDF-1.4\n")
    mocker.patch.object(
        app_main,
        "_validate_pdf_for_detection",
        return_value=PdfValidationResult(pdf_bytes=b"%PDF-1.4\n", page_count=1, was_decrypted=False),
    )
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=5)
    store_mock = mocker.patch.object(app_main, "_store_session_entry", return_value=None)
    response = client.post(
        "/api/templates/session",
        files={"pdf": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
        data={"fields": '[{"name":"f","x":1,"y":2,"width":3,"height":4}]'},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["fieldCount"] == 1
    assert response.json()["fields"][0]["rect"] == {"x": 1.0, "y": 2.0, "width": 3.0, "height": 4.0}
    stored_entry = store_mock.call_args.args[1]
    assert stored_entry["fields"][0]["rect"] == [1.0, 2.0, 4.0, 6.0]


def test_template_session_imports_acroform_calculation_metadata(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    pdf_bytes = _calculated_pdf_bytes()
    mocker.patch.object(app_main, "_read_upload_bytes", return_value=pdf_bytes)
    mocker.patch.object(
        app_main,
        "_validate_pdf_for_detection",
        return_value=PdfValidationResult(pdf_bytes=pdf_bytes, page_count=1, was_decrypted=False),
    )
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=5)
    store_mock = mocker.patch.object(app_main, "_store_session_entry", return_value=None)

    response = client.post(
        "/api/templates/session",
        files={"pdf": ("x.pdf", pdf_bytes, "application/pdf")},
        data={
            "fields": json.dumps(
                [
                    {
                        "id": "client-total",
                        "name": "premium_total",
                        "type": "text",
                        "page": 1,
                        "x": 10,
                        "y": 22,
                        "width": 80,
                        "height": 18,
                    }
                ]
            )
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    response_field = response.json()["fields"][0]
    assert response_field["id"] == "client-total"
    assert response_field["readOnly"] is True
    assert response_field["calculation"]["role"] == "external_imported_calculation"
    assert response_field["calculation"]["imported"]["supported"] is False
    stored_field = store_mock.call_args.args[1]["fields"][0]
    assert stored_field["calculation"]["imported"]["reason"] == "unsupported_acroform_javascript"


def test_template_session_uses_original_upload_hash_when_preflight_decrypts_pdf(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    original_pdf_bytes = b"%PDF-1.4\nencrypted-template\n"
    decrypted_pdf_bytes = b"%PDF-1.4\ndecrypted-template\n"
    mocker.patch.object(app_main, "_read_upload_bytes", return_value=original_pdf_bytes)
    mocker.patch.object(
        app_main,
        "_validate_pdf_for_detection",
        return_value=PdfValidationResult(pdf_bytes=decrypted_pdf_bytes, page_count=1, was_decrypted=True),
    )
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=5)
    store_mock = mocker.patch.object(app_main, "_store_session_entry", return_value=None)

    response = client.post(
        "/api/templates/session",
        files={"pdf": ("x.pdf", original_pdf_bytes, "application/pdf")},
        data={"fields": '[{"name":"f","x":1,"y":2,"width":3,"height":4}]'},
        headers=auth_headers,
    )

    assert response.status_code == 200
    stored_entry = store_mock.call_args.args[1]
    assert stored_entry["pdf_bytes"] == decrypted_pdf_bytes
    assert stored_entry["source_pdf_sha256"] == hashlib.sha256(original_pdf_bytes).hexdigest()


def test_materialize_empty_fields_fast_path_and_invalid_upload(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
    tmp_path: Path,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    temp_pdf = tmp_path / "materialize.pdf"
    temp_pdf.write_bytes(b"%PDF-1.4\nfake")
    mocker.patch.object(app_main, "_write_upload_to_temp", return_value=temp_pdf)
    mocker.patch.object(app_main.fitz, "open", return_value=_FakePdfDoc(page_count=1))
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    mocker.patch.object(app_main, "_resolve_stream_cors_headers", return_value={"Access-Control-Allow-Origin": "https://app.example.com"})
    response = client.post(
        "/api/forms/materialize",
        files={"pdf": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
        data={"fields": "[]"},
        headers={**auth_headers, "Origin": "https://app.example.com"},
    )
    assert response.status_code == 200
    assert "filename=\"x.pdf\"" in response.headers["content-disposition"]
    assert response.headers["access-control-allow-origin"] == "https://app.example.com"
    assert response.headers["cache-control"] == "private, no-store"

    # Invalid PDF upload path triggers cleanup + 400.
    mocker.patch.object(app_main.fitz, "open", side_effect=RuntimeError("bad pdf"))
    cleanup_mock = mocker.patch.object(app_main, "_cleanup_paths", return_value=None)
    response = client.post(
        "/api/forms/materialize",
        files={"pdf": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
        data={"fields": "[]"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    cleanup_mock.assert_called()


def test_materialize_inject_fields_path_and_filename_sanitization(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
    tmp_path: Path,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    temp_pdf = tmp_path / "input.pdf"
    temp_pdf.write_bytes(b"%PDF-1.4\nfake")
    mocker.patch.object(app_main, "_write_upload_to_temp", return_value=temp_pdf)
    mocker.patch.object(app_main.fitz, "open", return_value=_FakePdfDoc(page_count=1))
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)

    def _inject(temp_path, template_path, output_path):
        output_path.write_bytes(b"%PDF-1.4\noutput")

    mocker.patch.object(app_main, "inject_fields", side_effect=_inject)
    response = client.post(
        "/api/forms/materialize",
        files={"pdf": ("../../evil\r\n.pdf", b"%PDF-1.4\n", "application/pdf")},
        data={"fields": '[{"name":"f","x":1,"y":2,"width":3,"height":4}]'},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert "-fillable" in response.headers["content-disposition"]
    assert "\r" not in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "private, no-store"


def test_materialize_form_uses_font_size_payload_in_editable_field_appearances(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)

    payload = {
        "appearance": {"globalFieldFontSize": 15},
        "fields": [
            {
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 140, 45],
                "value": "Ada Lovelace",
            },
            {
                "name": "policy_number",
                "type": "text",
                "page": 1,
                "rect": [20, 55, 140, 80],
                "value": "ABC-123",
                "fontSize": 9,
            },
        ],
    }

    response = client.post(
        "/api/forms/materialize",
        files={"pdf": ("font-size.pdf", _blank_pdf_bytes(), "application/pdf")},
        data={"fields": json.dumps(payload), "exportMode": "editable"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    appearance_streams = _appearance_streams(response.content)
    assert "/Helv 15.00 Tf" in appearance_streams
    assert "/Helv 9.00 Tf" in appearance_streams
    assert "Ada Lovelace" not in _page_content_streams(response.content)
    default_appearances = _field_default_appearances(response.content)
    assert default_appearances["full_name"] == "/Helv 15 Tf 0 0 0 rg"
    assert default_appearances["policy_number"] == "/Helv 9 Tf 0 0 0 rg"


def test_materialize_flat_mode_flattens_generated_output(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
    tmp_path: Path,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    temp_pdf = tmp_path / "flat-input.pdf"
    temp_pdf.write_bytes(b"%PDF-1.4\nfake")
    mocker.patch.object(app_main, "_write_upload_to_temp", return_value=temp_pdf)
    mocker.patch.object(app_main.fitz, "open", return_value=_FakePdfDoc(page_count=1))
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)

    def _inject(temp_path, template_path, output_path):
        output_path.write_bytes(b"%PDF-1.4\nfilled")

    mocker.patch.object(app_main, "inject_fields", side_effect=_inject)
    flatten_mock = mocker.patch.object(app_main, "_flatten_pdf_form_widgets", return_value=b"%PDF-1.4\nflat")

    response = client.post(
        "/api/forms/materialize",
        files={"pdf": ("flat.pdf", b"%PDF-1.4\n", "application/pdf")},
        data={
            "fields": '[{"name":"f","x":1,"y":2,"width":3,"height":4}]',
            "exportMode": "flat",
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert "-flat" in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "private, no-store"
    flatten_mock.assert_called_once_with(b"%PDF-1.4\nfilled")


def test_materialize_form_flat_mode_completes_with_font_size_payload(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)

    payload = {
        "appearance": {"globalFieldFontSize": 16},
        "fields": [
            {
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 140, 45],
                "value": "Ada Lovelace",
            }
        ],
    }
    response = client.post(
        "/api/forms/materialize",
        files={"pdf": ("flat-font-size.pdf", _blank_pdf_bytes(), "application/pdf")},
        data={"fields": json.dumps(payload), "exportMode": "flat"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert pdf_has_form_widgets(response.content) is False
    with fitz.open(stream=response.content, filetype="pdf") as document:
        assert "Ada Lovelace" in document[0].get_text()


def test_materialize_form_evaluates_calculation_fields_for_editable_and_flat_exports(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)

    payload = {
        "fields": [
            {
                "id": "base",
                "name": "base_premium",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 110, 42],
                "value": "7",
                "valueType": "integer",
                "calculation": {"role": "number_input", "valueType": "integer"},
            },
            {
                "id": "fee",
                "name": "policy_fee",
                "type": "text",
                "page": 1,
                "rect": [20, 50, 110, 72],
                "value": "5",
                "valueType": "integer",
                "calculation": {"role": "number_input", "valueType": "integer"},
            },
            {
                "id": "total",
                "name": "premium_total",
                "type": "text",
                "page": 1,
                "rect": [20, 80, 110, 102],
                "readOnly": False,
                "valueType": "integer",
                "calculation": {
                    "role": "calculated_output",
                    "valueType": "integer",
                    "formula": {
                        "kind": "binary",
                        "op": "+",
                        "left": {"kind": "field", "fieldId": "base"},
                        "right": {"kind": "field", "fieldId": "fee"},
                    },
                    "output": {"valueType": "integer", "rounding": "round"},
                },
            },
        ]
    }

    editable = client.post(
        "/api/forms/materialize",
        files={"pdf": ("calculated.pdf", _blank_pdf_bytes(), "application/pdf")},
        data={"fields": json.dumps(payload), "exportMode": "editable"},
        headers=auth_headers,
    )

    assert editable.status_code == 200
    field_values = _field_values_and_flags(editable.content)
    assert field_values["premium_total"] == ("12", 1)
    assert "12" in _appearance_streams(editable.content)

    flat = client.post(
        "/api/forms/materialize",
        files={"pdf": ("calculated-flat.pdf", _blank_pdf_bytes(), "application/pdf")},
        data={"fields": json.dumps(payload), "exportMode": "flat"},
        headers=auth_headers,
    )

    assert flat.status_code == 200
    assert pdf_has_form_widgets(flat.content) is False
    with fitz.open(stream=flat.content, filetype="pdf") as document:
        assert "12" in document[0].get_text()


def test_materialize_form_exports_acrobat_calculation_actions_and_metadata(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    from backend.services.acroform_calculation_import_service import analyze_acroform_calculation_fields

    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)

    payload = {
        "fields": [
            {
                "id": "base",
                "name": "base_premium",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 110, 42],
                "value": "7",
                "valueType": "integer",
                "calculation": {"role": "number_input", "valueType": "integer"},
            },
            {
                "id": "fee",
                "name": "policy_fee",
                "type": "text",
                "page": 1,
                "rect": [20, 50, 110, 72],
                "value": "5",
                "valueType": "integer",
                "calculation": {"role": "number_input", "valueType": "integer"},
            },
            {
                "id": "subtotal",
                "name": "premium_subtotal",
                "type": "text",
                "page": 1,
                "rect": [20, 80, 110, 102],
                "valueType": "integer",
                "calculation": {
                    "role": "calculated_intermediate",
                    "valueType": "integer",
                    "formula": {
                        "kind": "binary",
                        "op": "+",
                        "left": {"kind": "field", "fieldId": "base"},
                        "right": {"kind": "field", "fieldId": "fee"},
                    },
                    "output": {"valueType": "integer", "rounding": "round"},
                },
            },
            {
                "id": "total",
                "name": "premium_total",
                "type": "text",
                "page": 1,
                "rect": [20, 110, 110, 132],
                "readOnly": False,
                "valueType": "integer",
                "calculation": {
                    "role": "calculated_output",
                    "valueType": "integer",
                    "formula": {
                        "kind": "binary",
                        "op": "*",
                        "left": {"kind": "field", "fieldId": "subtotal"},
                        "right": {"kind": "constant", "value": 2},
                    },
                    "output": {"valueType": "integer", "rounding": "round"},
                },
            },
        ]
    }

    response = client.post(
        "/api/forms/materialize",
        files={"pdf": ("calculated-actions.pdf", _blank_pdf_bytes(), "application/pdf")},
        data={"fields": json.dumps(payload), "exportMode": "editable"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    fields_by_name = _acroform_fields_by_name(response.content)
    base_actions = fields_by_name["base_premium"][NameObject("/AA")]
    assert NameObject("/K") in base_actions
    assert NameObject("/V") in base_actions
    assert NameObject("/F") in base_actions

    subtotal_actions = fields_by_name["premium_subtotal"][NameObject("/AA")]
    total_actions = fields_by_name["premium_total"][NameObject("/AA")]
    assert NameObject("/C") in subtotal_actions
    assert NameObject("/F") in subtotal_actions
    assert NameObject("/C") in total_actions
    assert int(fields_by_name["premium_total"].get("/Ff") or 0) & 1
    assert _calculation_order_names(response.content) == ["premium_subtotal", "premium_total"]

    total_js = str(total_actions[NameObject("/C")].get("/JS"))
    assert "event.value = dullyOutput" in total_js
    assert 'dullyRead("premium_subtotal")' in total_js

    reader = PdfReader(io.BytesIO(response.content))
    metadata = json.loads(reader.metadata["/DullyPDFCalculations"])
    assert metadata["schema"] == "dullypdf.calculations.v1"
    assert {field["name"] for field in metadata["fields"]} == {
        "base_premium",
        "policy_fee",
        "premium_subtotal",
        "premium_total",
    }

    imported = {
        record["name"]: record
        for record in analyze_acroform_calculation_fields(response.content)
    }
    assert imported["base_premium"]["calculation"]["role"] == "number_input"
    assert imported["premium_total"]["calculation"]["role"] == "calculated_output"
    assert imported["premium_total"]["calculation"]["imported"]["source"] == "dullypdf_metadata"


def test_materialize_inject_failure_cleans_temp_files_immediately(
    app_main,
    base_user,
    mocker,
    auth_headers,
    tmp_path: Path,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    temp_pdf = tmp_path / "inject-fail.pdf"
    temp_pdf.write_bytes(b"%PDF-1.4\nfake")
    mocker.patch.object(app_main, "_write_upload_to_temp", return_value=temp_pdf)
    mocker.patch.object(app_main.fitz, "open", return_value=_FakePdfDoc(page_count=1))
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    mocker.patch.object(app_main, "inject_fields", side_effect=RuntimeError("inject failed"))
    cleanup_mock = mocker.patch.object(app_main, "_cleanup_paths", return_value=None)

    from fastapi.testclient import TestClient

    local_client = TestClient(app_main.app, raise_server_exceptions=False)
    response = local_client.post(
        "/api/forms/materialize",
        files={"pdf": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
        data={"fields": '[{"name":"f","x":1,"y":2,"width":3,"height":4}]'},
        headers=auth_headers,
    )

    assert response.status_code == 500
    cleanup_mock.assert_called_once()


def test_materialize_template_write_failure_cleans_temp_files_immediately(
    app_main,
    base_user,
    mocker,
    auth_headers,
    tmp_path: Path,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    temp_pdf = tmp_path / "template-write-fail.pdf"
    temp_pdf.write_bytes(b"%PDF-1.4\nfake")
    mocker.patch.object(app_main, "_write_upload_to_temp", return_value=temp_pdf)
    mocker.patch.object(app_main.fitz, "open", return_value=_FakePdfDoc(page_count=1))
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    cleanup_mock = mocker.patch.object(app_main, "_cleanup_paths", return_value=None)
    mocker.patch.object(Path, "write_text", side_effect=OSError("disk full"))

    from fastapi.testclient import TestClient

    local_client = TestClient(app_main.app, raise_server_exceptions=False)
    response = local_client.post(
        "/api/forms/materialize",
        files={"pdf": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
        data={"fields": '[{"name":"f","x":1,"y":2,"width":3,"height":4}]'},
        headers=auth_headers,
    )

    assert response.status_code == 500
    cleanup_mock.assert_called_once()


def test_materialize_output_temp_create_failure_cleans_temp_files_immediately(
    app_main,
    base_user,
    mocker,
    auth_headers,
    tmp_path: Path,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    temp_pdf = tmp_path / "output-create-fail.pdf"
    temp_pdf.write_bytes(b"%PDF-1.4\nfake")
    mocker.patch.object(app_main, "_write_upload_to_temp", return_value=temp_pdf)
    mocker.patch.object(app_main.fitz, "open", return_value=_FakePdfDoc(page_count=1))
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    cleanup_mock = mocker.patch.object(app_main, "_cleanup_paths", return_value=None)

    first_fd, first_name = app_main.tempfile.mkstemp(suffix=".json", dir=str(tmp_path))
    mocker.patch.object(
        app_main.tempfile,
        "mkstemp",
        side_effect=[(first_fd, first_name), OSError("no space left on device")],
    )

    from fastapi.testclient import TestClient

    local_client = TestClient(app_main.app, raise_server_exceptions=False)
    response = local_client.post(
        "/api/forms/materialize",
        files={"pdf": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
        data={"fields": '[{"name":"f","x":1,"y":2,"width":3,"height":4}]'},
        headers=auth_headers,
    )

    assert response.status_code == 500
    cleanup_mock.assert_called_once()


def test_register_fillable_page_limit_and_success(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_legacy_endpoints_enabled", return_value=True)
    mocker.patch.object(app_main, "_read_upload_bytes", return_value=b"%PDF-1.4\n")
    mocker.patch.object(app_main, "_get_pdf_page_count", return_value=20)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=5)
    response = client.post(
        "/api/register-fillable",
        files={"pdf": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
        headers=auth_headers,
    )
    assert response.status_code == 403

    mocker.patch.object(app_main, "_get_pdf_page_count", return_value=2)
    mocker.patch.object(app_main, "_store_session_entry", return_value=None)
    response = client.post(
        "/api/register-fillable",
        files={"pdf": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_register_fillable_rejects_non_pdf_and_empty_upload(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_legacy_endpoints_enabled", return_value=True)

    not_pdf = client.post(
        "/api/register-fillable",
        files={"pdf": ("x.txt", b"hello", "text/plain")},
        headers=auth_headers,
    )
    assert not_pdf.status_code == 400
    assert "Only PDF uploads are supported" in not_pdf.text

    mocker.patch.object(app_main, "_read_upload_bytes", return_value=b"")
    empty_pdf = client.post(
        "/api/register-fillable",
        files={"pdf": ("x.pdf", b"", "application/pdf")},
        headers=auth_headers,
    )
    assert empty_pdf.status_code == 400
    assert "Uploaded file is empty" in empty_pdf.text


def test_legacy_download_stream_headers_and_missing_pdf_path(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_legacy_endpoints_enabled", return_value=True)
    mocker.patch.object(
        app_main,
        "_get_session_entry",
        return_value={"source_pdf": "saved.pdf", "pdf_bytes": None, "pdf_path": "gs://forms/saved.pdf"},
    )
    mocker.patch.object(app_main, "stream_pdf", return_value=io.BytesIO(b"%PDF-1.4\n"))
    response = client.get(
        "/download/sess-1",
        headers={**auth_headers, "Origin": "https://app.example.com"},
    )
    assert response.status_code == 200
    assert "saved.pdf" in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "private, no-store"

    mocker.patch.object(
        app_main,
        "_get_session_entry",
        return_value={"source_pdf": "saved.pdf", "pdf_bytes": None, "pdf_path": None},
    )
    response = client.get("/download/sess-1", headers=auth_headers)
    assert response.status_code == 404
    assert "Session PDF not found" in response.text


def test_legacy_download_missing_storage_blob_returns_404(
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_legacy_endpoints_enabled", return_value=True)
    mocker.patch.object(
        app_main,
        "_get_session_entry",
        return_value={"source_pdf": "saved.pdf", "pdf_bytes": None, "pdf_path": "gs://forms/missing.pdf"},
    )
    mocker.patch.object(app_main, "stream_pdf", side_effect=FileNotFoundError("missing blob"))

    from fastapi.testclient import TestClient

    local_client = TestClient(app_main.app, raise_server_exceptions=False)
    response = local_client.get("/download/sess-1", headers=auth_headers)

    assert response.status_code == 404
    assert "Session PDF not found" in response.text


# ---------------------------------------------------------------------------
# Edge-case: materialize_form with fields as dict payload (dict-wrapping path)
# ---------------------------------------------------------------------------
# When the fields form param is a JSON object (dict) with a "fields" key, the
# endpoint should unwrap it and process the inner list.  This tests the
# isinstance(raw_payload, dict) branch in materialize_form.
def test_materialize_form_dict_fields_payload(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
    tmp_path,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    temp_pdf = tmp_path / "dict_fields.pdf"
    temp_pdf.write_bytes(b"%PDF-1.4\nfake")
    mocker.patch.object(app_main, "_write_upload_to_temp", return_value=temp_pdf)
    mocker.patch.object(app_main.fitz, "open", return_value=_FakePdfDoc(page_count=1))
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)

    def _inject(temp_path, template_path, output_path):
        output_path.write_bytes(b"%PDF-1.4\noutput")

    mocker.patch.object(app_main, "inject_fields", side_effect=_inject)

    # Pass fields as a dict wrapping the actual field list, which exercises the
    # isinstance(raw_payload, dict) branch.
    import json

    fields_dict = json.dumps({
        "fields": [{"name": "f", "x": 1, "y": 2, "width": 3, "height": 4}],
        "coordinateSystem": "originBottom",
    })
    response = client.post(
        "/api/forms/materialize",
        files={"pdf": ("form.pdf", b"%PDF-1.4\n", "application/pdf")},
        data={"fields": fields_dict},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert "-fillable" in response.headers["content-disposition"]
