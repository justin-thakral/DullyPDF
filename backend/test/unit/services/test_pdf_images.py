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
