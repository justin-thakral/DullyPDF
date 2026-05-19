"""Integration coverage for materialized AcroForm appearance settings."""

from __future__ import annotations

import io
import json

from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter

import backend.main as main
import backend.api.middleware.security as security_middleware
import backend.api.routes.forms as forms_routes
from backend.firebaseDB.firebase_service import RequestUser


def _blank_pdf_bytes(*, width: float = 200, height: float = 200) -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=width, height=height)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _field_debug(pdf_bytes: bytes) -> dict[str, dict[str, str]]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    fields: dict[str, dict[str, str]] = {}
    for field_ref in acroform.get("/Fields", []):
        field = field_ref.get_object()
        appearance = field.get("/AP")
        stream = ""
        if appearance and "/N" in appearance:
            stream = appearance["/N"].get_object().get_data().decode("utf-8", "ignore")
        fields[str(field.get("/T"))] = {
            "da": str(field.get("/DA")) if field.get("/DA") is not None else "",
            "stream": stream,
        }
    return fields


def test_materialize_editable_pdf_preserves_global_and_individual_font_colors(mocker) -> None:
    client = TestClient(main.app)
    user = RequestUser(
        uid="uid-materialize-colors",
        app_user_id="user-materialize-colors",
        email="colors@example.com",
        display_name="Color QA",
        role="base",
    )
    mocker.patch.object(security_middleware, "verify_token", return_value={"uid": user.uid})
    mocker.patch.object(forms_routes, "require_user", return_value=user)
    mocker.patch.object(forms_routes, "resolve_fillable_max_pages", return_value=10)

    payload = {
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

    response = client.post(
        "/api/forms/materialize",
        files={"pdf": ("colors.pdf", _blank_pdf_bytes(), "application/pdf")},
        data={"fields": json.dumps(payload), "exportMode": "editable"},
        headers={"Authorization": "Bearer integration-token"},
    )

    assert response.status_code == 200
    reader = PdfReader(io.BytesIO(response.content))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    fields = _field_debug(response.content)
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
