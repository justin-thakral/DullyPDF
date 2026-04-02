"""Unit tests for backend.ai.image_fill_pipeline."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any, Dict, List

import numpy as np
import pytest

from backend.ai import image_fill_pipeline


# ── _find_nearest_label ──────────────────────────────────────────

def test_find_nearest_label_returns_none_when_no_rect() -> None:
    assert image_fill_pipeline._find_nearest_label({}, [{"bbox": [0, 0, 10, 10], "text": "Name"}]) is None


def test_find_nearest_label_returns_none_when_no_labels() -> None:
    field = {"rect": [10, 10, 100, 30]}
    assert image_fill_pipeline._find_nearest_label(field, []) is None


def test_find_nearest_label_returns_overlapping_label() -> None:
    field = {"rect": [10, 10, 100, 30]}
    labels = [
        {"bbox": [50, 15, 80, 25], "text": "Overlapping"},
        {"bbox": [200, 200, 300, 220], "text": "Far Away"},
    ]
    assert image_fill_pipeline._find_nearest_label(field, labels) == "Overlapping"


def test_find_nearest_label_returns_closest_label() -> None:
    field = {"rect": [100, 100, 200, 120]}
    labels = [
        {"bbox": [10, 100, 90, 120], "text": "Close"},
        {"bbox": [300, 100, 400, 120], "text": "Farther"},
    ]
    assert image_fill_pipeline._find_nearest_label(field, labels) == "Close"


def test_find_nearest_label_returns_none_when_labels_too_far() -> None:
    field = {"rect": [10, 10, 30, 30]}
    labels = [{"bbox": [500, 500, 600, 520], "text": "Very Far"}]
    assert image_fill_pipeline._find_nearest_label(field, labels) is None


def test_find_nearest_label_ignores_malformed_label_bbox() -> None:
    field = {"rect": [10, 10, 100, 30]}
    labels = [
        {"bbox": [5], "text": "Bad"},
        {"bbox": None, "text": "None"},
        {"text": "No bbox"},
    ]
    assert image_fill_pipeline._find_nearest_label(field, labels) is None


def test_find_nearest_label_invalid_rect_shape() -> None:
    field = {"rect": [10, 20]}
    labels = [{"bbox": [10, 10, 50, 30], "text": "Label"}]
    assert image_fill_pipeline._find_nearest_label(field, labels) is None


# ── _build_field_schema_text ─────────────────────────────────────

def test_build_field_schema_text_basic() -> None:
    fields = [
        {"name": "first_name", "type": "text", "page": 1, "rect": [10, 10, 100, 30]},
        {"name": "date_of_birth", "type": "text", "page": 1, "rect": [10, 40, 100, 60]},
    ]
    labels_by_page: Dict[int, List[Dict[str, Any]]] = {
        1: [
            {"bbox": [10, 10, 90, 28], "text": "First Name"},
            {"bbox": [10, 40, 90, 58], "text": "DOB"},
        ]
    }
    text = image_fill_pipeline._build_field_schema_text(fields, labels_by_page)
    assert 'first_name' in text
    assert 'label="First Name"' in text
    assert 'date_of_birth' in text
    assert 'label="DOB"' in text


def test_build_field_schema_text_skips_unnamed_fields() -> None:
    fields = [
        {"name": "", "type": "text", "page": 1},
        {"name": "valid_field", "type": "text", "page": 1},
    ]
    text = image_fill_pipeline._build_field_schema_text(fields, {})
    assert "valid_field" in text
    lines = [line for line in text.strip().splitlines() if line.strip()]
    assert len(lines) == 1


def test_build_field_schema_text_includes_group_and_option() -> None:
    fields = [
        {
            "name": "i_sex_male",
            "type": "checkbox",
            "page": 1,
            "groupKey": "sex",
            "optionKey": "male",
        },
    ]
    text = image_fill_pipeline._build_field_schema_text(fields, {})
    assert "group=sex" in text
    assert "option=male" in text


def test_build_field_schema_text_no_label_when_no_labels_nearby() -> None:
    fields = [
        {"name": "city", "type": "text", "page": 2, "rect": [10, 10, 100, 30]},
    ]
    # No labels on page 2
    text = image_fill_pipeline._build_field_schema_text(fields, {1: [{"bbox": [10, 10, 90, 30], "text": "Wrong Page"}]})
    assert "city" in text
    assert "label=" not in text


# ── _encode_uploaded_image ───────────────────────────────────────

def test_encode_uploaded_image_routes_pdf(mocker) -> None:
    mock_encode_pdf = mocker.patch.object(
        image_fill_pipeline, "_encode_pdf_pages", return_value=["data:image/jpeg;base64,page1"]
    )
    result = image_fill_pipeline._encode_uploaded_image(b"pdf-bytes", "form.pdf")
    mock_encode_pdf.assert_called_once_with(b"pdf-bytes")
    assert result == ["data:image/jpeg;base64,page1"]


def test_encode_uploaded_image_routes_jpg(mocker) -> None:
    mock_encode_raw = mocker.patch.object(
        image_fill_pipeline, "_encode_raw_image", return_value="data:image/jpeg;base64,img"
    )
    result = image_fill_pipeline._encode_uploaded_image(b"img-bytes", "photo.jpg")
    mock_encode_raw.assert_called_once_with(b"img-bytes", "photo.jpg")
    assert result == ["data:image/jpeg;base64,img"]


def test_encode_uploaded_image_routes_pdf_case_insensitive(mocker) -> None:
    mock_encode_pdf = mocker.patch.object(
        image_fill_pipeline, "_encode_pdf_pages", return_value=["data:url"]
    )
    image_fill_pipeline._encode_uploaded_image(b"bytes", "FORM.PDF")
    mock_encode_pdf.assert_called_once()


# ── _encode_raw_image fallback ───────────────────────────────────

def test_encode_raw_image_fallback_for_undecodable_file() -> None:
    # Random bytes that cv2.imdecode will fail on
    result = image_fill_pipeline._encode_raw_image(b"not-an-image", "test.gif")
    assert result.startswith("data:image/gif;base64,")


def test_encode_raw_image_fallback_unknown_ext() -> None:
    result = image_fill_pipeline._encode_raw_image(b"not-an-image", "file")
    assert result.startswith("data:image/jpeg;base64,")


# ── run_image_fill validation ────────────────────────────────────

def test_run_image_fill_raises_on_no_files() -> None:
    with pytest.raises(ValueError, match="No files uploaded"):
        image_fill_pipeline.run_image_fill(
            uploaded_files=[],
            template_pdf_bytes=b"pdf",
            fields=[{"name": "field_1"}],
        )


def test_run_image_fill_raises_on_no_fields() -> None:
    with pytest.raises(ValueError, match="No fields defined"):
        image_fill_pipeline.run_image_fill(
            uploaded_files=[{"filename": "f.jpg", "bytes": b"img"}],
            template_pdf_bytes=b"pdf",
            fields=[],
        )


def test_run_image_fill_raises_on_no_named_fields(mocker) -> None:
    mocker.patch.object(image_fill_pipeline, "render_pdf_to_images", return_value=[])
    mocker.patch.object(image_fill_pipeline, "extract_labels", return_value={})
    with pytest.raises(ValueError, match="No named fields"):
        image_fill_pipeline.run_image_fill(
            uploaded_files=[{"filename": "f.jpg", "bytes": b"img"}],
            template_pdf_bytes=b"pdf",
            fields=[{"name": ""}],
        )


# ── run_image_fill end-to-end with mocked OpenAI ────────────────

def _make_fake_openai_response(fields_json: List[Dict[str, Any]]) -> Any:
    """Build a fake OpenAI ChatCompletion response."""
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content=json.dumps({"fields": fields_json})
                )
            )
        ],
        usage=SimpleNamespace(prompt_tokens=100, completion_tokens=50, total_tokens=150),
    )


def test_run_image_fill_returns_validated_fields(mocker) -> None:
    mocker.patch.object(image_fill_pipeline, "render_pdf_to_images", return_value=[])
    mocker.patch.object(image_fill_pipeline, "extract_labels", return_value={})
    mocker.patch.object(
        image_fill_pipeline, "_encode_uploaded_image", return_value=["data:image/jpeg;base64,abc"]
    )

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=lambda **kwargs: _make_fake_openai_response([
                    {"fieldName": "first_name", "value": "John", "confidence": 95},
                    {"fieldName": "last_name", "value": "Doe", "confidence": 88},
                    {"fieldName": "unknown_field", "value": "junk", "confidence": 10},
                ])
            )
        )
    )
    mocker.patch.object(image_fill_pipeline, "create_openai_client", return_value=fake_client)

    result = image_fill_pipeline.run_image_fill(
        uploaded_files=[{"filename": "id.jpg", "bytes": b"img-bytes"}],
        template_pdf_bytes=b"pdf-bytes",
        fields=[
            {"name": "first_name", "type": "text", "page": 1},
            {"name": "last_name", "type": "text", "page": 1},
        ],
    )

    assert len(result["fields"]) == 2
    assert result["fields"][0]["fieldName"] == "first_name"
    assert result["fields"][0]["value"] == "John"
    assert result["fields"][0]["confidence"] == 95
    assert result["fields"][1]["fieldName"] == "last_name"
    assert result["usage"]["totalTokens"] == 150


def test_run_image_fill_clamps_confidence(mocker) -> None:
    mocker.patch.object(image_fill_pipeline, "render_pdf_to_images", return_value=[])
    mocker.patch.object(image_fill_pipeline, "extract_labels", return_value={})
    mocker.patch.object(
        image_fill_pipeline, "_encode_uploaded_image", return_value=["data:image/jpeg;base64,abc"]
    )

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=lambda **kwargs: _make_fake_openai_response([
                    {"fieldName": "name", "value": "X", "confidence": 150},
                    {"fieldName": "age", "value": "25", "confidence": -10},
                    {"fieldName": "city", "value": "Y", "confidence": "invalid"},
                ])
            )
        )
    )
    mocker.patch.object(image_fill_pipeline, "create_openai_client", return_value=fake_client)

    result = image_fill_pipeline.run_image_fill(
        uploaded_files=[{"filename": "doc.png", "bytes": b"img"}],
        template_pdf_bytes=b"pdf",
        fields=[
            {"name": "name", "type": "text", "page": 1},
            {"name": "age", "type": "text", "page": 1},
            {"name": "city", "type": "text", "page": 1},
        ],
    )

    assert result["fields"][0]["confidence"] == 100
    assert result["fields"][1]["confidence"] == 0
    assert result["fields"][2]["confidence"] == 50


def test_run_image_fill_raises_on_invalid_json(mocker) -> None:
    mocker.patch.object(image_fill_pipeline, "render_pdf_to_images", return_value=[])
    mocker.patch.object(image_fill_pipeline, "extract_labels", return_value={})
    mocker.patch.object(
        image_fill_pipeline, "_encode_uploaded_image", return_value=["data:image/jpeg;base64,abc"]
    )

    fake_response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="not json at all"))],
        usage=None,
    )
    fake_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=lambda **kwargs: fake_response)
        )
    )
    mocker.patch.object(image_fill_pipeline, "create_openai_client", return_value=fake_client)

    with pytest.raises(ValueError, match="Failed to parse AI response"):
        image_fill_pipeline.run_image_fill(
            uploaded_files=[{"filename": "doc.jpg", "bytes": b"img"}],
            template_pdf_bytes=b"pdf",
            fields=[{"name": "field_1", "type": "text", "page": 1}],
        )


def test_run_image_fill_handles_empty_fields_response(mocker) -> None:
    mocker.patch.object(image_fill_pipeline, "render_pdf_to_images", return_value=[])
    mocker.patch.object(image_fill_pipeline, "extract_labels", return_value={})
    mocker.patch.object(
        image_fill_pipeline, "_encode_uploaded_image", return_value=["data:image/jpeg;base64,abc"]
    )

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=lambda **kwargs: _make_fake_openai_response([])
            )
        )
    )
    mocker.patch.object(image_fill_pipeline, "create_openai_client", return_value=fake_client)

    result = image_fill_pipeline.run_image_fill(
        uploaded_files=[{"filename": "doc.jpg", "bytes": b"img"}],
        template_pdf_bytes=b"pdf",
        fields=[{"name": "field_1", "type": "text", "page": 1}],
    )

    assert result["fields"] == []


def test_run_image_fill_handles_multiple_uploaded_files(mocker) -> None:
    mocker.patch.object(image_fill_pipeline, "render_pdf_to_images", return_value=[])
    mocker.patch.object(image_fill_pipeline, "extract_labels", return_value={})
    encoded_calls: List[tuple] = []

    def mock_encode(file_bytes, filename):
        encoded_calls.append((filename, len(file_bytes)))
        return [f"data:image/jpeg;base64,{filename}"]

    mocker.patch.object(image_fill_pipeline, "_encode_uploaded_image", side_effect=mock_encode)

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=lambda **kwargs: _make_fake_openai_response([
                    {"fieldName": "name", "value": "John", "confidence": 90},
                ])
            )
        )
    )
    mocker.patch.object(image_fill_pipeline, "create_openai_client", return_value=fake_client)

    result = image_fill_pipeline.run_image_fill(
        uploaded_files=[
            {"filename": "id_front.jpg", "bytes": b"front"},
            {"filename": "id_back.jpg", "bytes": b"back"},
            {"filename": "utility.pdf", "bytes": b"pdf"},
        ],
        template_pdf_bytes=b"pdf",
        fields=[{"name": "name", "type": "text", "page": 1}],
    )

    assert len(encoded_calls) == 3
    assert result["fields"][0]["value"] == "John"


def test_run_image_fill_no_usage_when_none(mocker) -> None:
    mocker.patch.object(image_fill_pipeline, "render_pdf_to_images", return_value=[])
    mocker.patch.object(image_fill_pipeline, "extract_labels", return_value={})
    mocker.patch.object(
        image_fill_pipeline, "_encode_uploaded_image", return_value=["data:image/jpeg;base64,abc"]
    )

    fake_response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=json.dumps({"fields": []}))
            )
        ],
        usage=None,
    )
    fake_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=lambda **kwargs: fake_response)
        )
    )
    mocker.patch.object(image_fill_pipeline, "create_openai_client", return_value=fake_client)

    result = image_fill_pipeline.run_image_fill(
        uploaded_files=[{"filename": "doc.jpg", "bytes": b"img"}],
        template_pdf_bytes=b"pdf",
        fields=[{"name": "field_1", "type": "text", "page": 1}],
    )

    assert result["usage"] == {}
