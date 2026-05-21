from __future__ import annotations

import io
import json

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, FloatObject, NameObject, TextStringObject


def _patch_auth(mocker, app_main, user) -> None:
    mocker.patch.object(app_main, "_verify_token", return_value={"uid": user.app_user_id})
    mocker.patch.object(app_main, "ensure_user", return_value=user)


def _blank_pdf_bytes(page_sizes: list[tuple[float, float]]) -> bytes:
    writer = PdfWriter()
    for width, height in page_sizes:
        writer.add_blank_page(width=width, height=height)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _fillable_pdf_bytes() -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    field = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/T"): TextStringObject("name_field"),
            NameObject("/Rect"): ArrayObject([FloatObject(20), FloatObject(150), FloatObject(140), FloatObject(170)]),
        }
    )
    field_ref = writer._add_object(field)  # pylint: disable=protected-access
    page[NameObject("/Annots")] = ArrayObject([field_ref])
    acroform = DictionaryObject({NameObject("/Fields"): ArrayObject([field_ref])})
    writer._root_object[NameObject("/AcroForm")] = writer._add_object(acroform)  # pylint: disable=protected-access
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _parented_fillable_pdf_bytes() -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    widget = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Rect"): ArrayObject([FloatObject(20), FloatObject(150), FloatObject(140), FloatObject(170)]),
        }
    )
    widget_ref = writer._add_object(widget)  # pylint: disable=protected-access
    parent = DictionaryObject(
        {
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/T"): TextStringObject("parent_name_field"),
            NameObject("/Kids"): ArrayObject([widget_ref]),
        }
    )
    parent_ref = writer._add_object(parent)  # pylint: disable=protected-access
    widget[NameObject("/Parent")] = parent_ref
    page[NameObject("/Annots")] = ArrayObject([widget_ref])
    acroform = DictionaryObject({NameObject("/Fields"): ArrayObject([parent_ref])})
    writer._root_object[NameObject("/AcroForm")] = writer._add_object(acroform)  # pylint: disable=protected-access
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _multi_widget_parented_fillable_pdf_bytes() -> bytes:
    writer = PdfWriter()
    kid_refs = ArrayObject()
    for _ in range(2):
        page = writer.add_blank_page(width=200, height=200)
        widget = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Annot"),
                NameObject("/Subtype"): NameObject("/Widget"),
                NameObject("/Rect"): ArrayObject([FloatObject(20), FloatObject(150), FloatObject(140), FloatObject(170)]),
            }
        )
        widget_ref = writer._add_object(widget)  # pylint: disable=protected-access
        kid_refs.append(widget_ref)
        page[NameObject("/Annots")] = ArrayObject([widget_ref])
    parent = DictionaryObject(
        {
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/T"): TextStringObject("shared_name_field"),
            NameObject("/Kids"): kid_refs,
        }
    )
    parent_ref = writer._add_object(parent)  # pylint: disable=protected-access
    for widget_ref in kid_refs:
        widget_ref.get_object()[NameObject("/Parent")] = parent_ref
    acroform = DictionaryObject({NameObject("/Fields"): ArrayObject([parent_ref])})
    writer._root_object[NameObject("/AcroForm")] = writer._add_object(acroform)  # pylint: disable=protected-access
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _page_rotations(pdf_bytes: bytes) -> list[int]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return [int(page.get("/Rotate", 0) or 0) for page in reader.pages]


def _acroform_field_names(pdf_bytes: bytes) -> list[str]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    acroform = reader.trailer["/Root"].get("/AcroForm")
    if not acroform:
        return []
    fields = acroform.get_object().get("/Fields", [])
    return [str(field_ref.get_object().get("/T") or "") for field_ref in fields]


def _acroform_field_kid_counts(pdf_bytes: bytes) -> list[int]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    acroform = reader.trailer["/Root"].get("/AcroForm")
    if not acroform:
        return []
    fields = acroform.get_object().get("/Fields", [])
    return [len(field_ref.get_object().get("/Kids", [])) for field_ref in fields]


def test_pdf_page_tools_rewrites_order_rotation_and_inserted_pages(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    source_pdf = _blank_pdf_bytes([(201, 301), (202, 302), (203, 303)])
    insert_pdf = _blank_pdf_bytes([(401, 501), (402, 502)])

    response = client.post(
        "/api/pdf/page-tools",
        files=[
            ("pdf", ("source.pdf", source_pdf, "application/pdf")),
            ("insertPdfs", ("insert.pdf", insert_pdf, "application/pdf")),
        ],
        data={
            "operations": json.dumps(
                {
                    "finalPages": [
                        {"source": "current", "page": 3, "rotate": 0},
                        {"source": "insert", "fileIndex": 0, "page": 2, "rotate": 90},
                        {"source": "current", "page": 1, "rotate": 180},
                    ]
                }
            )
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    reader = PdfReader(io.BytesIO(response.content))
    assert len(reader.pages) == 3
    assert _page_rotations(response.content) == [0, 90, 180]
    assert float(reader.pages[0].mediabox.width) == 203
    assert float(reader.pages[1].mediabox.width) == 402
    assert float(reader.pages[2].mediabox.width) == 201


def test_pdf_page_tools_copies_reused_inserted_pages_before_rotation(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    source_pdf = _blank_pdf_bytes([(200, 300)])
    insert_pdf = _blank_pdf_bytes([(400, 500)])

    response = client.post(
        "/api/pdf/page-tools",
        files=[
            ("pdf", ("source.pdf", source_pdf, "application/pdf")),
            ("insertPdfs", ("insert.pdf", insert_pdf, "application/pdf")),
        ],
        data={
            "operations": json.dumps(
                {
                    "finalPages": [
                        {"source": "insert", "fileIndex": 0, "page": 1, "rotate": 90},
                        {"source": "insert", "fileIndex": 0, "page": 1, "rotate": 0},
                    ]
                }
            )
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert _page_rotations(response.content) == [90, 0]


def test_pdf_page_tools_ignores_unreferenced_insert_uploads(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    source_pdf = _blank_pdf_bytes([(200, 300)])

    response = client.post(
        "/api/pdf/page-tools",
        files=[
            ("pdf", ("source.pdf", source_pdf, "application/pdf")),
            ("insertPdfs", ("unused.txt", b"not a pdf", "text/plain")),
        ],
        data={
            "operations": json.dumps(
                {
                    "finalPages": [
                        {"source": "current", "page": 1, "rotate": 0},
                    ]
                }
            )
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    reader = PdfReader(io.BytesIO(response.content))
    assert len(reader.pages) == 1
    assert float(reader.pages[0].mediabox.width) == 200


def test_pdf_page_tools_allows_sparse_referenced_insert_indexes(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    source_pdf = _blank_pdf_bytes([(200, 300)])
    insert_pdf = _blank_pdf_bytes([(400, 500)])

    response = client.post(
        "/api/pdf/page-tools",
        files=[
            ("pdf", ("source.pdf", source_pdf, "application/pdf")),
            ("insertPdfs", ("unused.txt", b"not a pdf", "text/plain")),
            ("insertPdfs", ("insert.pdf", insert_pdf, "application/pdf")),
        ],
        data={
            "operations": json.dumps(
                {
                    "finalPages": [
                        {"source": "insert", "fileIndex": 1, "page": 1, "rotate": 0},
                    ]
                }
            )
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    reader = PdfReader(io.BytesIO(response.content))
    assert len(reader.pages) == 1
    assert float(reader.pages[0].mediabox.width) == 400


def test_pdf_page_tools_rejects_duplicate_current_pages(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    source_pdf = _blank_pdf_bytes([(200, 300), (201, 301)])

    response = client.post(
        "/api/pdf/page-tools",
        files={"pdf": ("source.pdf", source_pdf, "application/pdf")},
        data={
            "operations": json.dumps(
                {
                    "finalPages": [
                        {"source": "current", "page": 1, "rotate": 0},
                        {"source": "current", "page": 1, "rotate": 90},
                    ]
                }
            )
        },
        headers=auth_headers,
    )

    assert response.status_code == 400
    assert "Current PDF pages cannot be duplicated" in response.text


def test_pdf_page_tools_rejects_fractional_page_and_rotation_values(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    source_pdf = _blank_pdf_bytes([(200, 300), (201, 301)])

    fractional_page = client.post(
        "/api/pdf/page-tools",
        files={"pdf": ("source.pdf", source_pdf, "application/pdf")},
        data={
            "operations": json.dumps(
                {
                    "finalPages": [
                        {"source": "current", "page": 1.5, "rotate": 0},
                    ]
                }
            )
        },
        headers=auth_headers,
    )
    fractional_rotation = client.post(
        "/api/pdf/page-tools",
        files={"pdf": ("source.pdf", source_pdf, "application/pdf")},
        data={
            "operations": json.dumps(
                {
                    "finalPages": [
                        {"source": "current", "page": 1, "rotate": 90.5},
                    ]
                }
            )
        },
        headers=auth_headers,
    )

    assert fractional_page.status_code == 400
    assert "Invalid page number" in fractional_page.text
    assert fractional_rotation.status_code == 400
    assert "Invalid page rotation" in fractional_rotation.text


def test_pdf_page_tools_reattaches_acroform_fields_after_rewrite(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    source_pdf = _fillable_pdf_bytes()

    response = client.post(
        "/api/pdf/page-tools",
        files={"pdf": ("source.pdf", source_pdf, "application/pdf")},
        data={
            "operations": json.dumps(
                {
                    "finalPages": [
                        {"source": "current", "page": 1, "rotate": 0},
                    ]
                }
            )
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert _acroform_field_names(response.content) == ["name_field"]


def test_pdf_page_tools_reattaches_parented_acroform_fields_after_rewrite(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    source_pdf = _parented_fillable_pdf_bytes()

    response = client.post(
        "/api/pdf/page-tools",
        files={"pdf": ("source.pdf", source_pdf, "application/pdf")},
        data={
            "operations": json.dumps(
                {
                    "finalPages": [
                        {"source": "current", "page": 1, "rotate": 0},
                    ]
                }
            )
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert _acroform_field_names(response.content) == ["parent_name_field"]


def test_pdf_page_tools_trims_parented_field_kids_to_retained_pages(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    source_pdf = _multi_widget_parented_fillable_pdf_bytes()

    response = client.post(
        "/api/pdf/page-tools",
        files={"pdf": ("source.pdf", source_pdf, "application/pdf")},
        data={
            "operations": json.dumps(
                {
                    "finalPages": [
                        {"source": "current", "page": 1, "rotate": 0},
                    ]
                }
            )
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    reader = PdfReader(io.BytesIO(response.content))
    assert len(reader.pages) == 1
    assert len(reader.pages[0].get("/Annots", [])) == 1
    assert _acroform_field_names(response.content) == ["shared_name_field"]
    assert _acroform_field_kid_counts(response.content) == [1]


def test_pdf_page_tools_strips_unmanaged_widget_fields_from_inserted_pages(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)

    response = client.post(
        "/api/pdf/page-tools",
        files=[
            ("pdf", ("source.pdf", _fillable_pdf_bytes(), "application/pdf")),
            ("insertPdfs", ("insert.pdf", _fillable_pdf_bytes(), "application/pdf")),
        ],
        data={
            "operations": json.dumps(
                {
                    "finalPages": [
                        {"source": "current", "page": 1, "rotate": 0},
                        {"source": "insert", "fileIndex": 0, "page": 1, "rotate": 0},
                    ]
                }
            )
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    reader = PdfReader(io.BytesIO(response.content))
    assert _acroform_field_names(response.content) == ["name_field"]
    assert len(reader.pages[0].get("/Annots", [])) == 1
    assert len(reader.pages[1].get("/Annots", [])) == 0


def test_pdf_page_tools_removes_stale_acroform_when_only_inserted_widgets_were_stripped(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    source_pdf = _blank_pdf_bytes([(200, 300)])

    response = client.post(
        "/api/pdf/page-tools",
        files=[
            ("pdf", ("source.pdf", source_pdf, "application/pdf")),
            ("insertPdfs", ("insert.pdf", _fillable_pdf_bytes(), "application/pdf")),
        ],
        data={
            "operations": json.dumps(
                {
                    "finalPages": [
                        {"source": "insert", "fileIndex": 0, "page": 1, "rotate": 0},
                    ]
                }
            )
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    reader = PdfReader(io.BytesIO(response.content))
    assert reader.trailer["/Root"].get("/AcroForm") is None
    assert len(reader.pages[0].get("/Annots", [])) == 0


def test_pdf_optimize_returns_pdf_and_size_headers(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    source_pdf = _blank_pdf_bytes([(200, 300), (201, 301)])

    response = client.post(
        "/api/pdf/optimize",
        files={"pdf": ("source.pdf", source_pdf, "application/pdf")},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert int(response.headers["X-DullyPDF-Original-Bytes"]) == len(source_pdf)
    assert int(response.headers["X-DullyPDF-Optimized-Bytes"]) == len(response.content)
    assert int(response.headers["X-DullyPDF-Saved-Bytes"]) >= 0
    assert len(PdfReader(io.BytesIO(response.content)).pages) == 2


def test_pdf_optimize_preserves_acroform_fields(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=10)
    source_pdf = _fillable_pdf_bytes()

    response = client.post(
        "/api/pdf/optimize",
        files={"pdf": ("source.pdf", source_pdf, "application/pdf")},
        headers=auth_headers,
    )

    assert response.status_code == 200
    reader = PdfReader(io.BytesIO(response.content))
    assert _acroform_field_names(response.content) == ["name_field"]
    assert len(reader.pages[0].get("/Annots", [])) == 1
