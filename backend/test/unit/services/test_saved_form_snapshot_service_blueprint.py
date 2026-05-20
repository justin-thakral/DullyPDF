"""Unit coverage for saved-form editor snapshot helpers."""

from __future__ import annotations

from backend.services import saved_form_snapshot_service as snapshot_service


def _snapshot_payload() -> dict:
    return {
        "version": 1,
        "pageCount": 1,
        "pageSizes": {
            "1": {"width": 612, "height": 792},
        },
        "fields": [{
            "id": "field-1",
            "name": "full_name",
            "type": "text",
            "page": 1,
            "rect": {"x": 10, "y": 12, "width": 110, "height": 18},
            "value": None,
            "fontName": "global",
            "fontSize": 12,
            "textAlign": "right",
        }],
        "appearance": {
            "globalFieldFont": "Times-Roman",
            "globalFieldFontSize": 14,
            "globalFieldFontColor": "#112233",
            "globalFieldAlignment": "center",
        },
        "hasRenamedFields": True,
        "hasMappedSchema": False,
    }


def test_normalize_saved_form_editor_snapshot_payload_accepts_valid_payload() -> None:
    normalized = snapshot_service.normalize_saved_form_editor_snapshot_payload(_snapshot_payload())

    assert normalized["version"] == snapshot_service.SAVED_FORM_EDITOR_SNAPSHOT_VERSION
    assert normalized["pageCount"] == 1
    assert normalized["pageSizes"]["1"]["width"] == 612
    assert normalized["appearance"]["globalFieldFont"] == "Times-Roman"
    assert normalized["appearance"]["globalFieldFontSize"] == 14.0
    assert normalized["appearance"]["globalFieldFontColor"] == "#112233"
    assert normalized["appearance"]["globalFieldAlignment"] == "center"
    assert normalized["fields"][0]["name"] == "full_name"
    assert normalized["fields"][0]["fontName"] == "global"
    assert normalized["fields"][0]["fontSize"] == 12.0
    assert normalized["fields"][0]["textAlign"] == "right"
    assert normalized["hasRenamedFields"] is True


def test_normalize_saved_form_editor_snapshot_payload_preserves_app_only_fields() -> None:
    payload = _snapshot_payload()
    payload["fields"] = [
        {
            "id": "image-1",
            "name": "profile_photo",
            "type": "image",
            "page": 1,
            "rect": {"x": 10, "y": 12, "width": 120, "height": 80},
            "value": None,
            "imageDataUrl": "data:image/png;base64,abc",
            "imageMimeType": "image/png",
            "imageName": "profile.png",
        },
        {
            "id": "pdf417-1",
            "name": "license_pdf417",
            "type": "pdf417",
            "page": 1,
            "rect": {"x": 10, "y": 120, "width": 220, "height": 78},
            "value": None,
            "pdf417Name": "Ada Lovelace",
            "pdf417Dob": "1815-12-10",
            "pdf417Data": {
                "firstName": "Ada",
                "lastName": "Lovelace",
                "dob": "1815-12-10",
                "customerId": "AL-1",
            },
            "pdf417FieldMappings": {
                "firstName": {"fieldId": "source-first", "fieldName": "First Name"},
                "dob": {"fieldId": "source-dob", "fieldName": "DOB"},
            },
        },
        {
            "id": "barcode-1",
            "name": "member_barcode",
            "type": "barcode",
            "page": 1,
            "rect": {"x": 10, "y": 220, "width": 220, "height": 52},
            "value": "123456789",
            "barcodeSourceField": {"fieldId": "source-id", "fieldName": "Member ID"},
        },
        {
            "id": "qr-1",
            "name": "verification_qr",
            "type": "qr",
            "page": 1,
            "rect": {"x": 10, "y": 290, "width": 110, "height": 110},
            "value": "https://example.com/verify/abc",
            "qrSourceField": {"fieldId": "source-url", "fieldName": "Verification URL"},
        },
    ]

    normalized = snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)

    assert normalized["fields"][0]["type"] == "image"
    assert normalized["fields"][0]["imageDataUrl"] == "data:image/png;base64,abc"
    assert normalized["fields"][0]["imageMimeType"] == "image/png"
    assert normalized["fields"][0]["imageName"] == "profile.png"
    assert normalized["fields"][1]["type"] == "pdf417"
    assert normalized["fields"][1]["pdf417Name"] == "Ada Lovelace"
    assert normalized["fields"][1]["pdf417Dob"] == "1815-12-10"
    assert normalized["fields"][1]["pdf417Data"]["customerId"] == "AL-1"
    assert normalized["fields"][1]["pdf417FieldMappings"]["firstName"] == {
        "fieldId": "source-first",
        "fieldName": "First Name",
    }
    assert normalized["fields"][1]["pdf417FieldMappings"]["dob"] == {
        "fieldId": "source-dob",
        "fieldName": "DOB",
    }
    assert normalized["fields"][2]["type"] == "barcode"
    assert normalized["fields"][2]["value"] == "123456789"
    assert normalized["fields"][2]["barcodeSourceField"] == {
        "fieldId": "source-id",
        "fieldName": "Member ID",
    }
    assert normalized["fields"][3]["type"] == "qr"
    assert normalized["fields"][3]["value"] == "https://example.com/verify/abc"
    assert normalized["fields"][3]["qrSourceField"] == {
        "fieldId": "source-url",
        "fieldName": "Verification URL",
    }


def test_normalize_saved_form_editor_snapshot_payload_preserves_calculation_metadata() -> None:
    payload = _snapshot_payload()
    payload["fields"][0].update({
        "readOnly": True,
        "required": "true",
        "valueType": "integer",
        "calculation": {
            "role": "calculated_output",
            "valueType": "integer",
            "formula": {
                "kind": "binary",
                "op": "+",
                "left": {"kind": "field", "fieldId": "subtotal"},
                "right": {"kind": "constant", "value": 5},
            },
            "dependencies": ["subtotal"],
            "output": {"valueType": "integer", "rounding": "round"},
        },
    })

    normalized = snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)

    field = normalized["fields"][0]
    assert field["readOnly"] is True
    assert field["required"] is True
    assert field["valueType"] == "integer"
    assert field["calculation"]["role"] == "calculated_output"
    assert field["calculation"]["dependencies"] == ["subtotal"]
    assert field["calculation"]["formula"]["op"] == "+"
    assert field["calculation"]["output"]["rounding"] == "round"


def test_normalize_saved_form_editor_snapshot_payload_rejects_bad_calculation_metadata() -> None:
    payload = _snapshot_payload()
    payload["fields"][0]["calculation"] = {
        "role": "calculated_output",
        "valueType": "integer",
        "formula": {"kind": "binary", "op": "%"},
    }

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "formula binary operator must be one of +, -, *, /"
    else:
        raise AssertionError("Expected ValueError for invalid formula operator")

    payload = _snapshot_payload()
    payload["fields"][0]["type"] = "checkbox"
    payload["fields"][0]["valueType"] = "integer"

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "field valueType is only supported on text fields"
    else:
        raise AssertionError("Expected ValueError for numeric metadata on checkbox")


def test_normalize_saved_form_editor_snapshot_payload_rejects_missing_page_size() -> None:
    payload = _snapshot_payload()
    payload["pageSizes"] = {}

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "pageSizes missing entry for page 1"
    else:
        raise AssertionError("Expected ValueError for missing page size")


def test_normalize_saved_form_editor_snapshot_payload_rejects_invalid_font_metadata() -> None:
    payload = _snapshot_payload()
    payload["appearance"] = {"globalFieldFont": "ComicSans"}

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "appearance.globalFieldFont must be default or a supported PDF text font"
    else:
        raise AssertionError("Expected ValueError for invalid global font")

    payload = _snapshot_payload()
    payload["appearance"] = {"globalFieldFont": "Symbol"}

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "appearance.globalFieldFont must be default or a supported PDF text font"
    else:
        raise AssertionError("Expected ValueError for symbol global font")

    payload = _snapshot_payload()
    payload["fields"][0]["fontName"] = "ComicSans"

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "field fontName must be a supported PDF text font or global"
    else:
        raise AssertionError("Expected ValueError for invalid field font")

    payload = _snapshot_payload()
    payload["fields"][0]["fontName"] = "ZapfDingbats"

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "field fontName must be a supported PDF text font or global"
    else:
        raise AssertionError("Expected ValueError for dingbats field font")

    payload = _snapshot_payload()
    payload["appearance"] = {"globalFieldFontSize": 100}

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "appearance.globalFieldFontSize must be auto or a font size from 4 to 72"
    else:
        raise AssertionError("Expected ValueError for invalid global font size")

    payload = _snapshot_payload()
    payload["fields"][0]["fontSize"] = 100

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "field fontSize must be global, auto, or a font size from 4 to 72"
    else:
        raise AssertionError("Expected ValueError for invalid field font size")

    payload = _snapshot_payload()
    payload["appearance"] = {"globalFieldFontColor": "not-a-color"}

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "appearance.globalFieldFontColor must be a #rrggbb color"
    else:
        raise AssertionError("Expected ValueError for invalid global font color")

    payload = _snapshot_payload()
    payload["fields"][0]["fontColor"] = "not-a-color"

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "field fontColor must be global or a #rrggbb color"
    else:
        raise AssertionError("Expected ValueError for invalid field font color")

    payload = _snapshot_payload()
    payload["appearance"] = {"globalFieldAlignment": "justify"}

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "appearance.globalFieldAlignment must be left, center, or right"
    else:
        raise AssertionError("Expected ValueError for invalid global alignment")

    payload = _snapshot_payload()
    payload["fields"][0]["textAlign"] = "justify"

    try:
        snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)
    except ValueError as exc:
        assert str(exc) == "field textAlign must be global, left, center, or right"
    else:
        raise AssertionError("Expected ValueError for invalid field alignment")


def test_normalize_saved_form_editor_snapshot_payload_defaults_missing_appearance() -> None:
    payload = _snapshot_payload()
    payload.pop("appearance")

    normalized = snapshot_service.normalize_saved_form_editor_snapshot_payload(payload)

    assert normalized["appearance"] == {
        "globalFieldFont": "default",
        "globalFieldFontSize": "auto",
        "globalFieldFontColor": "#000000",
        "globalFieldAlignment": "left",
    }


def test_load_saved_form_editor_snapshot_returns_none_when_storage_download_fails(mocker) -> None:
    download_mock = mocker.patch.object(
        snapshot_service,
        "download_saved_form_snapshot_json",
        side_effect=FileNotFoundError("missing"),
    )

    result = snapshot_service.load_saved_form_editor_snapshot({
        "editorSnapshot": {"version": 1, "path": "gs://sessions/snapshot.json"},
    })

    assert result is None
    download_mock.assert_called_once_with("gs://sessions/snapshot.json")


def test_upload_saved_form_editor_snapshot_builds_manifest(mocker) -> None:
    upload_mock = mocker.patch.object(
        snapshot_service,
        "upload_saved_form_snapshot_json",
        return_value="gs://sessions/new-snapshot.json",
    )

    bucket_path, manifest = snapshot_service.upload_saved_form_editor_snapshot(
        user_id="user-1",
        form_id="tpl-1",
        timestamp_ms=123,
        snapshot=_snapshot_payload(),
    )

    assert bucket_path == "gs://sessions/new-snapshot.json"
    assert manifest["version"] == snapshot_service.SAVED_FORM_EDITOR_SNAPSHOT_VERSION
    assert manifest["path"] == "gs://sessions/new-snapshot.json"
    assert manifest["fieldCount"] == 1
    upload_mock.assert_called_once_with(
        _snapshot_payload(),
        "users/user-1/saved-form-snapshots/123-tpl-1.json",
    )
