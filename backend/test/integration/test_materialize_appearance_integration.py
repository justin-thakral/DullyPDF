"""Integration coverage for materialized AcroForm appearance settings."""

from __future__ import annotations

import io
import json
from typing import Any

from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter

import backend.main as main
import backend.api.middleware.security as security_middleware
import backend.api.routes.forms as forms_routes
from backend.firebaseDB.firebase_service import RequestUser
from backend.services.acroform_calculation_import_service import analyze_acroform_calculation_fields


def _blank_pdf_bytes(*, width: float = 200, height: float = 200) -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=width, height=height)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _field_debug(pdf_bytes: bytes) -> dict[str, dict[str, object]]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    fields: dict[str, dict[str, object]] = {}
    for field_ref in acroform.get("/Fields", []):
        field = field_ref.get_object()
        appearance = field.get("/AP")
        stream = ""
        if appearance and "/N" in appearance:
            stream = appearance["/N"].get_object().get_data().decode("utf-8", "ignore")
        q_value = field.get("/Q")
        fields[str(field.get("/T"))] = {
            "da": str(field.get("/DA")) if field.get("/DA") is not None else "",
            "q": int(q_value) if q_value is not None else 0,
            "stream": stream,
        }
    return fields


def _acroform_fields(pdf_bytes: bytes) -> tuple[Any, dict[str, Any]]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    acroform = reader.trailer["/Root"]["/AcroForm"].get_object()
    fields = {
        str(field.get_object().get("/T")): field.get_object()
        for field in acroform.get("/Fields", [])
    }
    return acroform, fields


def _javascript_action(field: Any, action_key: str) -> str:
    return str(field["/AA"][action_key].get_object()["/JS"])


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


def test_materialize_editable_pdf_preserves_global_and_individual_text_alignment(mocker) -> None:
    client = TestClient(main.app)
    user = RequestUser(
        uid="uid-materialize-alignment",
        app_user_id="user-materialize-alignment",
        email="alignment@example.com",
        display_name="Alignment QA",
        role="base",
    )
    mocker.patch.object(security_middleware, "verify_token", return_value={"uid": user.uid})
    mocker.patch.object(forms_routes, "require_user", return_value=user)
    mocker.patch.object(forms_routes, "resolve_fillable_max_pages", return_value=10)

    payload = {
        "appearance": {"globalFieldAlignment": "center"},
        "fields": [
            {
                "name": "global_alignment",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 120, 40],
                "value": "Global",
            },
            {
                "name": "custom_alignment",
                "type": "text",
                "page": 1,
                "rect": [20, 50, 120, 70],
                "value": "Custom",
                "textAlign": "right",
            },
        ],
    }

    response = client.post(
        "/api/forms/materialize",
        files={"pdf": ("alignment.pdf", _blank_pdf_bytes(), "application/pdf")},
        data={"fields": json.dumps(payload), "exportMode": "editable"},
        headers={"Authorization": "Bearer integration-token"},
    )

    assert response.status_code == 200
    reader = PdfReader(io.BytesIO(response.content))
    fields = _field_debug(response.content)
    dully_metadata = json.loads(reader.metadata.get("/DullyPDFAppearance"))

    assert fields["global_alignment"]["q"] == 1
    assert fields["custom_alignment"]["q"] == 2
    assert "1 0 0 1 32.00" in fields["global_alignment"]["stream"]
    assert "1 0 0 1 60.00" in fields["custom_alignment"]["stream"]
    assert dully_metadata["appearance"]["globalFieldAlignment"] == "center"
    assert dully_metadata["fields"] == [
        {"name": "custom_alignment", "page": 1, "textAlign": "right", "type": "text"}
    ]


def test_materialize_editable_pdf_exports_calculation_actions_order_and_metadata(mocker) -> None:
    client = TestClient(main.app)
    user = RequestUser(
        uid="uid-materialize-calculations",
        app_user_id="user-materialize-calculations",
        email="calculations@example.com",
        display_name="Calculation QA",
        role="base",
    )
    mocker.patch.object(security_middleware, "verify_token", return_value={"uid": user.uid})
    mocker.patch.object(forms_routes, "require_user", return_value=user)
    mocker.patch.object(forms_routes, "resolve_fillable_max_pages", return_value=10)

    payload = {
        "fields": [
            {
                "id": "base",
                "name": "base_premium",
                "type": "text",
                "page": 1,
                "rect": [20, 20, 100, 40],
                "value": "12",
                "valueType": "integer",
                "calculation": {"role": "number_input", "valueType": "integer"},
            },
            {
                "id": "fee",
                "name": "policy_fee",
                "type": "text",
                "page": 1,
                "rect": [20, 50, 100, 70],
                "value": "3",
                "valueType": "integer",
                "calculation": {"role": "number_input", "valueType": "integer"},
            },
            {
                "id": "subtotal",
                "name": "premium_subtotal",
                "type": "text",
                "page": 1,
                "rect": [120, 20, 190, 40],
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
                "rect": [120, 50, 190, 70],
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
        ],
    }

    response = client.post(
        "/api/forms/materialize",
        files={"pdf": ("calculations.pdf", _blank_pdf_bytes(), "application/pdf")},
        data={"fields": json.dumps(payload), "exportMode": "editable"},
        headers={"Authorization": "Bearer integration-token"},
    )

    assert response.status_code == 200
    reader = PdfReader(io.BytesIO(response.content))
    acroform, fields = _acroform_fields(response.content)
    dully_metadata = json.loads(reader.metadata.get("/DullyPDFCalculations"))

    assert str(fields["premium_subtotal"]["/V"]) == "15"
    assert str(fields["premium_subtotal"]["/DV"]) == "15"
    assert "/AP" in fields["premium_subtotal"]
    assert str(fields["premium_total"]["/V"]) == "30"
    assert str(fields["premium_total"]["/DV"]) == "30"
    assert "/AP" in fields["premium_total"]

    assert set(fields["base_premium"]["/AA"].keys()) == {"/K", "/V", "/F"}
    assert "AFNumber_Keystroke(0" in _javascript_action(fields["base_premium"], "/K")
    assert "Math.floor(n) !== n" in _javascript_action(fields["base_premium"], "/V")
    assert int(fields["premium_subtotal"]["/Ff"]) & 1
    assert int(fields["premium_total"]["/Ff"]) & 1
    assert "dullyRead(\"base_premium\")" in _javascript_action(fields["premium_subtotal"], "/C")
    assert "dullyRead(\"premium_subtotal\")" in _javascript_action(fields["premium_total"], "/C")
    assert "AFNumber_Format(0" in _javascript_action(fields["premium_total"], "/F")

    ordered_names = [str(entry.get_object().get("/T")) for entry in acroform["/CO"]]
    assert ordered_names == ["premium_subtotal", "premium_total"]
    assert [field["name"] for field in dully_metadata["fields"]] == [
        "base_premium",
        "policy_fee",
        "premium_subtotal",
        "premium_total",
    ]

    imported = {record["name"]: record for record in analyze_acroform_calculation_fields(response.content)}
    assert imported["base_premium"]["calculation"]["role"] == "number_input"
    assert imported["premium_total"]["calculation"]["role"] == "calculated_output"
    assert imported["premium_total"]["calculation"]["imported"]["source"] == "dullypdf_metadata"
    assert imported["premium_total"]["calculation"]["formula"]["left"]["fieldId"] == "subtotal"
