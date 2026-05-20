from __future__ import annotations

from backend.services.app_only_field_materialization_service import (
    BARCODE_FIELD_NAME_MARKER,
    PDF417_FIELD_NAME_MARKER,
    QR_FIELD_NAME_MARKER,
    build_pdf417_scan_text,
    prepare_app_only_fields_for_materialization,
)


def test_prepare_app_only_fields_generates_dependency_barcode_image() -> None:
    fields = prepare_app_only_fields_for_materialization(
        [
            {
                "id": "member-id",
                "name": "Member ID",
                "type": "text",
                "page": 1,
                "rect": [10, 10, 80, 30],
                "value": "123456789",
            },
            {
                "id": "barcode-id",
                "name": "member_barcode",
                "type": "barcode",
                "page": 1,
                "rect": [10, 40, 120, 80],
                "barcodeSourceField": {"fieldId": "member-id", "fieldName": "Member ID"},
            },
        ],
        include_markers=True,
    )

    barcode = fields[1]
    marker = fields[2]
    assert barcode["value"] == "123456789"
    assert barcode["imageDataUrl"].startswith("data:image/png;base64,")
    assert barcode["imageMimeType"] == "image/png"
    assert barcode["appOnlyMarkerName"] == f"member_barcode{BARCODE_FIELD_NAME_MARKER}"
    assert marker["name"] == f"member_barcode{BARCODE_FIELD_NAME_MARKER}"
    assert marker["type"] == "text"
    assert marker["value"] is None


def test_prepare_app_only_fields_generates_pdf417_from_mapped_sources() -> None:
    fields = prepare_app_only_fields_for_materialization(
        [
            {"id": "first", "name": "first_name", "type": "text", "value": "Ada", "page": 1, "rect": [0, 0, 1, 1]},
            {"id": "last", "name": "last_name", "type": "text", "value": "Lovelace", "page": 1, "rect": [0, 0, 1, 1]},
            {"id": "dob", "name": "date_of_birth", "type": "text", "value": "1815-12-10", "page": 1, "rect": [0, 0, 1, 1]},
            {
                "id": "pdf417-id",
                "name": "license_pdf417",
                "type": "pdf417",
                "page": 1,
                "rect": [10, 40, 140, 90],
                "pdf417FieldMappings": {
                    "firstName": {"fieldId": "first", "fieldName": "first_name"},
                    "lastName": {"fieldId": "last", "fieldName": "last_name"},
                    "dob": {"fieldId": "dob", "fieldName": "date_of_birth"},
                },
            },
        ],
        include_markers=True,
    )

    pdf417 = fields[3]
    marker = fields[4]
    assert pdf417["pdf417Data"]["firstName"] == "Ada"
    assert pdf417["pdf417Data"]["lastName"] == "Lovelace"
    assert pdf417["pdf417Data"]["dob"] == "1815-12-10"
    assert "FIRST NAME: Ada" in pdf417["value"]
    assert pdf417["imageDataUrl"].startswith("data:image/png;base64,")
    assert marker["name"] == f"license_pdf417{PDF417_FIELD_NAME_MARKER}"


def test_prepare_app_only_fields_generates_dependency_qr_image() -> None:
    fields = prepare_app_only_fields_for_materialization(
        [
            {
                "id": "verification-url",
                "name": "Verification URL",
                "type": "text",
                "page": 1,
                "rect": [10, 10, 80, 30],
                "value": "https://example.com/verify/abc",
            },
            {
                "id": "qr-id",
                "name": "verification_qr",
                "type": "qr",
                "page": 1,
                "rect": [10, 40, 120, 150],
                "qrSourceField": {"fieldId": "verification-url", "fieldName": "Verification URL"},
            },
        ],
        include_markers=True,
    )

    qr = fields[1]
    marker = fields[2]
    assert qr["value"] == "https://example.com/verify/abc"
    assert qr["imageDataUrl"].startswith("data:image/png;base64,")
    assert qr["imageMimeType"] == "image/png"
    assert qr["appOnlyMarkerName"] == f"verification_qr{QR_FIELD_NAME_MARKER}"
    assert marker["name"] == f"verification_qr{QR_FIELD_NAME_MARKER}"
    assert marker["type"] == "text"
    assert marker["value"] is None


def test_prepare_app_only_fields_does_not_duplicate_existing_markers() -> None:
    marker_name = f"photo{PDF417_FIELD_NAME_MARKER}"
    fields = prepare_app_only_fields_for_materialization(
        [
            {
                "id": "pdf417-id",
                "name": "photo",
                "type": "pdf417",
                "page": 1,
                "rect": [10, 40, 140, 90],
                "value": "FIRST NAME: Ada",
                "appOnlyMarkerName": marker_name,
            },
            {
                "id": "pdf417-id_pdf417_marker",
                "name": marker_name,
                "type": "text",
                "page": 1,
                "rect": [10, 40, 140, 90],
                "value": None,
            },
        ],
        include_markers=True,
    )

    assert [field["name"] for field in fields].count(marker_name) == 1


def test_build_pdf417_scan_text_matches_frontend_label_order() -> None:
    assert build_pdf417_scan_text({"firstName": "Ada", "lastName": "Lovelace", "dob": "1815-12-10"}).splitlines()[:5] == [
        "FIRST NAME: Ada",
        "MIDDLE NAME: ",
        "LAST NAME: Lovelace",
        "NAME: Ada Lovelace",
        "STREET ADDRESS: ",
    ]
