"""Pipeline for extracting form field values from uploaded images/documents using OpenAI vision."""

from __future__ import annotations

import base64
import io
import json
import os
from typing import Any, Dict, List, Optional

import cv2
import fitz
import numpy as np

from backend.ai.openai_client import create_openai_client
from backend.fieldDetecting.rename_pipeline.combinedSrc.extract_labels import extract_labels
from backend.fieldDetecting.rename_pipeline.combinedSrc.render_pdf import render_pdf_to_images
from backend.fieldDetecting.rename_pipeline.combinedSrc.vision_utils import image_bgr_to_data_url
from backend.logging_config import get_logger

logger = get_logger(__name__)

DEFAULT_IMAGE_FILL_MODEL = os.getenv("SANDBOX_IMAGE_FILL_MODEL", "gpt-5-mini")

_SYSTEM_PROMPT = """\
You are a document data extraction assistant. You will receive:
1. One or more images of documents uploaded by a user (IDs, bills, pay stubs, medical records, etc.)
2. A PDF form's field schema with field names, types, constraints, and the label text printed next to each field on the form.

Your job: extract information from the uploaded documents that matches the form fields. Return ONLY fields where you found matching information.

Return JSON:
{
  "fields": [
    { "fieldName": "exact_field_name_from_schema", "value": "extracted_value", "confidence": 0-100 }
  ]
}

Rules:
- Match by semantic meaning, not exact string match.
- Use the "label" to understand what each field actually asks for.
- confidence should reflect how certain you are the value is correct.
- For checkbox fields, return "true" or "false".
- For radio fields, return one of the allowed option values exactly.
- For checkbox groups, return values for each relevant option.
- Omit fields where no information was found in the documents.
- If a value is partially visible or ambiguous, include it with lower confidence.
- Do not fabricate information not present in the documents.
- fieldName must exactly match one of the field names in the schema.
"""


def _encode_uploaded_image(file_bytes: bytes, filename: str) -> List[str]:
    """Encode an uploaded file to base64 data URLs. PDFs are rendered page-by-page."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return _encode_pdf_pages(file_bytes)
    return [_encode_raw_image(file_bytes, filename)]


def _encode_raw_image(file_bytes: bytes, filename: str) -> str:
    """Encode a raw image file (jpg, png, etc.) to a data URL."""
    arr = np.frombuffer(file_bytes, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        # Fallback: send as raw base64 with guessed mime
        b64 = base64.b64encode(file_bytes).decode("ascii")
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpeg"
        mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                    "gif": "image/gif", "webp": "image/webp", "bmp": "image/bmp"}
        mime = mime_map.get(ext, "image/jpeg")
        return f"data:{mime};base64,{b64}"
    return image_bgr_to_data_url(image)


def _encode_pdf_pages(file_bytes: bytes) -> List[str]:
    """Render each page of a PDF to an image data URL."""
    data_urls: List[str] = []
    with fitz.open(stream=io.BytesIO(file_bytes), filetype="pdf") as doc:
        for page_index in range(len(doc)):
            page = doc.load_page(page_index)
            scale = 200.0 / 72.0  # 200 DPI
            matrix = fitz.Matrix(scale, scale)
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            image = np.frombuffer(pixmap.samples, dtype=np.uint8)
            image = image.reshape(pixmap.height, pixmap.width, pixmap.n)
            if pixmap.n == 4:
                image = cv2.cvtColor(image, cv2.COLOR_RGBA2RGB)
            elif pixmap.n == 1:
                image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
            data_urls.append(image_bgr_to_data_url(image))
    return data_urls


def _find_nearest_label(
    field: Dict[str, Any],
    labels: List[Dict[str, Any]],
) -> Optional[str]:
    """Find the nearest label text to a field based on spatial proximity."""
    rect = field.get("rect")
    if not rect or not isinstance(rect, list) or len(rect) != 4:
        return None
    if not labels:
        return None

    fx1, fy1, fx2, fy2 = [float(v) for v in rect]
    best_label = None
    best_dist = float("inf")

    for label in labels:
        bbox = label.get("bbox")
        if not bbox or not isinstance(bbox, list) or len(bbox) != 4:
            continue
        lx1, ly1, lx2, ly2 = [float(v) for v in bbox]

        # Check overlap
        if not (fx2 <= lx1 or fx1 >= lx2 or fy2 <= ly1 or fy1 >= ly2):
            return str(label.get("text", "")).strip()

        # Compute distance
        dx = max(lx1 - fx2, fx1 - lx2, 0.0)
        dy = max(ly1 - fy2, fy1 - ly2, 0.0)
        dist = (dx * dx + dy * dy) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best_label = str(label.get("text", "")).strip()

    # Only use labels within reasonable proximity
    if best_dist > 100.0:
        return None
    return best_label


def _build_field_schema_text(
    fields: List[Dict[str, Any]],
    labels_by_page: Dict[int, List[Dict[str, Any]]],
) -> str:
    """Build the field schema text block for the prompt."""
    lines: List[str] = []
    for field in fields:
        name = str(field.get("name") or "").strip()
        if not name:
            continue
        field_type = str(field.get("type") or "text").strip()
        page = int(field.get("page") or 1)

        # Find nearest label
        page_labels = labels_by_page.get(page, [])
        label = _find_nearest_label(field, page_labels)

        parts = [f"- {name} (type={field_type}"]
        if label:
            parts.append(f', label="{label}"')

        # Add allowed values for radio/checkbox groups
        group_key = str(field.get("groupKey") or "").strip()
        option_key = str(field.get("optionKey") or "").strip()
        if group_key:
            parts.append(f", group={group_key}")
        if option_key:
            parts.append(f", option={option_key}")

        parts.append(")")
        lines.append("".join(parts))

    return "\n".join(lines)


def run_image_fill(
    *,
    uploaded_files: List[Dict[str, Any]],
    template_pdf_bytes: bytes,
    fields: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Extract field values from uploaded images/documents using OpenAI vision.

    Args:
        uploaded_files: List of dicts with 'filename' and 'bytes' keys.
        template_pdf_bytes: The template PDF bytes (for label extraction).
        fields: Current template field definitions.

    Returns:
        Dict with 'fields' list of extracted values and 'usage' info.
    """
    if not uploaded_files:
        raise ValueError("No files uploaded")
    if not fields:
        raise ValueError("No fields defined on template")

    # Step 1: Extract labels from template PDF for field context
    rendered_pages = render_pdf_to_images(template_pdf_bytes)
    labels_by_page = extract_labels(template_pdf_bytes, rendered_pages)

    # Step 2: Build field schema with label context
    schema_text = _build_field_schema_text(fields, labels_by_page)
    if not schema_text.strip():
        raise ValueError("No named fields found on template")

    # Step 3: Encode all uploaded files to image data URLs
    image_data_urls: List[str] = []
    for uploaded in uploaded_files:
        filename = str(uploaded.get("filename") or "file")
        file_bytes = uploaded["bytes"]
        data_urls = _encode_uploaded_image(file_bytes, filename)
        image_data_urls.extend(data_urls)

    if not image_data_urls:
        raise ValueError("Could not process any uploaded files")

    # Step 4: Build OpenAI request
    user_content: List[Dict[str, Any]] = []
    for data_url in image_data_urls:
        user_content.append({
            "type": "image_url",
            "image_url": {"url": data_url, "detail": "high"},
        })
    user_content.append({
        "type": "text",
        "text": (
            "Field schema for the form being filled:\n\n"
            f"{schema_text}\n\n"
            "Extract matching information from the uploaded documents and return JSON."
        ),
    })

    # Step 5: Call OpenAI
    model = os.getenv("SANDBOX_IMAGE_FILL_MODEL", DEFAULT_IMAGE_FILL_MODEL)
    client = create_openai_client()

    logger.info(
        "Calling OpenAI image fill: model=%s, images=%d, fields=%d",
        model,
        len(image_data_urls),
        len(fields),
    )

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
    )

    # Step 6: Parse response
    raw_text = (response.choices[0].message.content or "").strip()
    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error("Failed to parse OpenAI image fill response: %s", raw_text[:500])
        raise ValueError("Failed to parse AI response")

    extracted_fields = parsed.get("fields") or []

    # Validate field names against the template schema
    valid_names = {str(f.get("name") or "").strip() for f in fields if f.get("name")}
    validated: List[Dict[str, Any]] = []
    for ef in extracted_fields:
        field_name = str(ef.get("fieldName") or "").strip()
        if field_name not in valid_names:
            logger.debug("Skipping unrecognized field name from AI: %s", field_name)
            continue
        confidence = ef.get("confidence", 50)
        try:
            confidence = int(float(confidence))
        except (TypeError, ValueError):
            confidence = 50
        confidence = max(0, min(100, confidence))
        validated.append({
            "fieldName": field_name,
            "value": str(ef.get("value") or ""),
            "confidence": confidence,
        })

    usage_info = {}
    if response.usage:
        usage_info = {
            "promptTokens": response.usage.prompt_tokens,
            "completionTokens": response.usage.completion_tokens,
            "totalTokens": response.usage.total_tokens,
        }

    return {
        "fields": validated,
        "usage": usage_info,
    }
