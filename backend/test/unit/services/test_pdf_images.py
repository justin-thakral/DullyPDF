from __future__ import annotations

import io

import fitz
import pytest
from pypdf import PdfWriter

from backend.services.pdf_images import ImageFieldPayloadError, stamp_image_fields_into_pdf


ONE_BY_ONE_PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAA7EAAAOxAGVKw4b"
    "AAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII="
)


def _blank_pdf_bytes() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def test_stamp_image_fields_inserts_image_content() -> None:
    stamped = stamp_image_fields_into_pdf(
        _blank_pdf_bytes(),
        [
            {
                "type": "image",
                "page": 1,
                "rect": [10, 10, 50, 50],
                "imageDataUrl": ONE_BY_ONE_PNG_DATA_URL,
            }
        ],
    )

    with fitz.open(stream=stamped, filetype="pdf") as document:
        images = document[0].get_images(full=True)

    assert images


def test_stamp_image_fields_downloads_allowlisted_gcs_image_paths(mocker) -> None:
    image_bytes = io.BytesIO()
    # Reuse the same valid PNG payload that data-url tests use.
    import base64

    image_bytes.write(base64.b64decode(ONE_BY_ONE_PNG_DATA_URL.split(",", 1)[1]))
    download_mock = mocker.patch(
        "backend.services.pdf_images.download_storage_bytes",
        return_value=image_bytes.getvalue(),
    )

    stamped = stamp_image_fields_into_pdf(
        _blank_pdf_bytes(),
        [
            {
                "type": "image",
                "page": 1,
                "rect": [10, 10, 50, 50],
                "imagePath": "gs://forms/profile.png",
            }
        ],
    )

    with fitz.open(stream=stamped, filetype="pdf") as document:
        assert document[0].get_images(full=True)
    download_mock.assert_called_once_with("gs://forms/profile.png")


def test_stamp_image_fields_applies_grayscale_color_mode() -> None:
    stamped = stamp_image_fields_into_pdf(
        _blank_pdf_bytes(),
        [
            {
                "type": "image",
                "page": 1,
                "rect": [10, 10, 50, 50],
                "imageDataUrl": ONE_BY_ONE_PNG_DATA_URL,
                "imageColorMode": "grayscale",
            }
        ],
    )

    with fitz.open(stream=stamped, filetype="pdf") as document:
        image_xref = document[0].get_images(full=True)[0][0]
        pixmap = fitz.Pixmap(document, image_xref)
        assert pixmap.n == 1


def test_stamp_image_fields_rejects_malformed_data_urls() -> None:
    with pytest.raises(ImageFieldPayloadError, match="PNG or JPEG data URL"):
        stamp_image_fields_into_pdf(
            _blank_pdf_bytes(),
            [
                {
                    "type": "image",
                    "page": 1,
                    "rect": [10, 10, 50, 50],
                    "imageDataUrl": "data:text/plain;base64,SGVsbG8=",
                }
            ],
        )
