from __future__ import annotations

import base64
import io
import json

import pytest
from PIL import Image

from backend.services.app_only_field_materialization_service import (
    APP_ONLY_MARKER_METADATA_PREFIX,
    BARCODE_9_DIGIT_FIELD_ASPECT_RATIO,
    BARCODE_FIELD_NAME_MARKER,
    PDF417_FIELD_NAME_MARKER,
    PHOTO_FIELD_NAME_MARKER,
    QR_FIELD_NAME_MARKER,
    build_pdf417_scan_text,
    generate_code128_png_data_url,
    prepare_app_only_fields_for_materialization,
)


def _marker_lines_and_metadata(marker_value: str) -> tuple[list[str], dict]:
    lines = marker_value.splitlines()
    assert lines[1].startswith(APP_ONLY_MARKER_METADATA_PREFIX)
    metadata = json.loads(lines[1][len(APP_ONLY_MARKER_METADATA_PREFIX) :])
    return lines, metadata


def test_prepare_app_only_fields_writes_image_path_setup_into_marker_metadata() -> None:
    fields = prepare_app_only_fields_for_materialization(
        [
            {
                "id": "photo-id",
                "name": "applicant_photo",
                "type": "image",
                "page": 1,
                "rect": [10, 10, 100, 90],
                "imagePath": "gs://bucket/applicant-photo.png",
                "imageName": "applicant-photo.png",
                "imageMimeType": "image/png",
                "imageColorMode": "grayscale",
            }
        ],
        include_markers=True,
    )

    image_field = fields[0]
    marker = fields[1]
    assert image_field["appOnlyMarkerName"] == f"applicant_photo{PHOTO_FIELD_NAME_MARKER}"
    marker_lines, metadata = _marker_lines_and_metadata(marker["value"])
    assert marker["name"] == f"applicant_photo{PHOTO_FIELD_NAME_MARKER}"
    assert marker_lines == ["CVTPF#@&", marker_lines[1], "applicant-photo.png", "(IMAGE)"]
    assert metadata["type"] == "image"
    assert metadata["imagePath"] == "gs://bucket/applicant-photo.png"
    assert metadata["imageColorMode"] == "grayscale"
    assert "imagePath" not in marker


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
    marker_lines, metadata = _marker_lines_and_metadata(marker["value"])
    assert marker_lines == ["CVTBC#@&", marker_lines[1], "123456789", "(1D)"]
    assert metadata["type"] == "barcode"
    assert metadata["barcodeSourceField"] == {"fieldId": "member-id", "fieldName": "Member ID"}


def test_prepare_app_only_fields_generates_from_barcode_classes() -> None:
    fields = prepare_app_only_fields_for_materialization(
        [
            {
                "id": "member-id",
                "name": "member_id",
                "type": "text",
                "page": 1,
                "rect": [10, 10, 80, 30],
                "value": "123456789",
            },
            {
                "id": "pdf417-id",
                "name": "license_pdf417",
                "type": "pdf417",
                "page": 1,
                "rect": [10, 40, 160, 100],
                "barcodeClasses": [
                    {"id": "name", "label": "Name", "mode": "manual", "manualValue": "Ada Lovelace"},
                    {
                        "id": "member",
                        "label": "Member ID",
                        "mode": "field",
                        "fieldRef": {"fieldId": "member-id", "fieldName": "member_id"},
                    },
                ],
            },
            {
                "id": "barcode-id",
                "name": "member_barcode",
                "type": "barcode",
                "page": 1,
                "rect": [10, 110, 160, 145],
                "barcodeClasses": [
                    {
                        "id": "member",
                        "label": "Member ID",
                        "mode": "field",
                        "fieldRef": {"fieldId": "member-id", "fieldName": "member_id"},
                    }
                ],
            },
            {
                "id": "qr-id",
                "name": "verification_qr",
                "type": "qr",
                "page": 1,
                "rect": [10, 150, 120, 260],
                "barcodeClasses": [
                    {"id": "url", "label": "URL", "mode": "manual", "manualValue": "https://example.com/verify"}
                ],
            },
        ],
        include_markers=False,
    )

    pdf417 = fields[1]
    barcode = fields[2]
    qr = fields[3]
    assert pdf417["value"].splitlines() == ["NAME: Ada Lovelace", "MEMBER ID: 123456789"]
    assert pdf417["imageDataUrl"].startswith("data:image/png;base64,")
    assert barcode["value"] == "123456789"
    assert barcode["imageDataUrl"].startswith("data:image/png;base64,")
    assert qr["value"] == "https://example.com/verify"
    assert qr["imageDataUrl"].startswith("data:image/png;base64,")


def test_generate_code128_uses_9_digit_barcode_aspect() -> None:
    data_url = generate_code128_png_data_url("123456789")
    image_bytes = base64.b64decode(data_url.split(",", 1)[1])

    with Image.open(io.BytesIO(image_bytes)) as image:
        width, height = image.size

    assert width / height == pytest.approx(BARCODE_9_DIGIT_FIELD_ASPECT_RATIO, abs=0.01)


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
    marker_lines, metadata = _marker_lines_and_metadata(marker["value"])
    assert marker_lines[0] == "CVTP4#@&"
    assert marker_lines[2].startswith("FIRST NAME: Ada")
    assert marker_lines[-1] == "(PDF417)"
    assert metadata["pdf417FieldMappings"]["firstName"] == {"fieldId": "first", "fieldName": "first_name"}


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
    marker_lines, metadata = _marker_lines_and_metadata(marker["value"])
    assert marker_lines == ["CVTQR#@&", marker_lines[1], "https://example.com/verify/abc", "(QR)"]
    assert metadata["type"] == "qr"
    assert metadata["qrSourceField"] == {"fieldId": "verification-url", "fieldName": "Verification URL"}


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


def test_prepare_app_only_fields_drops_existing_marker_widgets_for_flat_materialization() -> None:
    fields = prepare_app_only_fields_for_materialization(
        [
            {
                "id": "photo-id",
                "name": "photo",
                "type": "image",
                "page": 1,
                "rect": [10, 40, 140, 90],
                "imageName": "photo.png",
            },
            {
                "id": "photo-id_image_marker",
                "name": f"photo{PHOTO_FIELD_NAME_MARKER}",
                "type": "text",
                "page": 1,
                "rect": [10, 40, 140, 90],
                "value": "CVTPF#@&\nphoto.png\n(IMAGE)",
            },
        ],
        include_markers=False,
    )

    assert [field["name"] for field in fields] == ["photo"]


def test_build_pdf417_scan_text_matches_frontend_label_order() -> None:
    assert build_pdf417_scan_text({"firstName": "Ada", "lastName": "Lovelace", "dob": "1815-12-10"}).splitlines()[:5] == [
        "FIRST NAME: Ada",
        "MIDDLE NAME: ",
        "LAST NAME: Lovelace",
        "NAME: Ada Lovelace",
        "STREET ADDRESS: ",
    ]
