"""Fillable/template session endpoints."""

from __future__ import annotations

import json
import io
import os
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
import fitz
import uuid
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject

from backend.detection.status import DETECTION_STATUS_COMPLETE
from backend.fieldDetecting.rename_pipeline.combinedSrc.form_filler import inject_fields
from backend.firebaseDB.pdf_download_database import (
    PdfDownloadMonthlyLimitExceededError,
    commit_pdf_download_usage,
    record_pdf_download_event,
)
from backend.logging_config import get_logger
from backend.sessions.session_store import store_session_entry as _store_session_entry
from backend.time_utils import now_iso
from backend.services.app_config import resolve_stream_cors_headers
from backend.services.auth_service import require_user
from backend.services.limits_service import resolve_detect_max_pages, resolve_fillable_max_pages
from backend.services.acroform_calculation_import_service import enrich_fields_with_acroform_calculation_metadata
from backend.services.app_only_field_materialization_service import prepare_app_only_fields_for_materialization
from backend.services.calculation_field_service import materialize_calculated_fields
from backend.services.pdf_export_service import flatten_pdf_form_widgets
from backend.services.pdf_images import ImageFieldPayloadError, stamp_image_fields_into_pdf
from backend.services.pdf_service import (
    cleanup_paths,
    coerce_field_payloads,
    normalize_field_appearance_payload,
    read_upload_bytes,
    resolve_upload_limit,
    safe_pdf_download_filename,
    sha256_hex_for_bytes,
    validate_pdf_for_detection,
    write_upload_to_temp,
)

router = APIRouter()
logger = get_logger(__name__)

DOWNLOAD_USAGE_CONTEXTS = frozenset({"workspace_download", "workspace_group_download"})


@dataclass(frozen=True)
class GeneratedFormPdf:
    output_path: Path
    cleanup_targets: List[Path]
    filename: str
    export_mode: str
    page_count: int
    field_count: int


def _validate_pdf_upload_name(upload: UploadFile, default_name: str = "upload.pdf") -> str:
    filename = upload.filename or default_name
    content_type = (upload.content_type or "").lower()
    if not filename.lower().endswith(".pdf") and content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported")
    return filename


def _record_download_event_if_requested(
    *,
    user_id: str,
    usage_context: Optional[str],
    export_mode: str,
    page_count: int,
    field_count: int,
) -> None:
    """Record only explicit user download materializations for stats."""
    source = str(usage_context or "").strip()
    if source not in DOWNLOAD_USAGE_CONTEXTS:
        return
    try:
        record_pdf_download_event(
            user_id=user_id,
            source=source,
            export_mode=export_mode,
            pdf_count=1,
            metadata={
                "pageCount": max(0, int(page_count or 0)),
                "fieldCount": max(0, int(field_count or 0)),
            },
        )
    except Exception as exc:
        logger.warning(
            "Failed to record PDF download event user=%s source=%s error=%s",
            user_id,
            source,
            exc,
        )


def _parse_page_tool_integer(value: Any, detail: str, *, default: Optional[int] = None) -> int:
    if value is None:
        if default is not None:
            return default
        raise HTTPException(status_code=400, detail=detail)
    if isinstance(value, bool):
        raise HTTPException(status_code=400, detail=detail)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value.is_integer():
            return int(value)
        raise HTTPException(status_code=400, detail=detail)
    if isinstance(value, str):
        text = value.strip()
        sign = text[:1]
        digits = text[1:] if sign in {"-", "+"} else text
        if digits.isdigit():
            return int(text)
    raise HTTPException(status_code=400, detail=detail)


def _parse_page_tool_rotation(value: Any) -> int:
    rotation = _parse_page_tool_integer(value, "Invalid page rotation", default=0)
    normalized = rotation % 360
    if normalized not in {0, 90, 180, 270}:
        raise HTTPException(status_code=400, detail="Page rotation must be 0, 90, 180, or 270 degrees")
    return normalized


def _coerce_page_tool_final_pages(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise HTTPException(status_code=400, detail="Page operation payload must include finalPages")
    final_pages: List[Dict[str, Any]] = []
    for entry in value:
        if not isinstance(entry, dict):
            raise HTTPException(status_code=400, detail="Invalid page operation entry")
        source = str(entry.get("source") or "").strip().lower()
        if source not in {"current", "insert"}:
            raise HTTPException(status_code=400, detail="Invalid page source")
        page = _parse_page_tool_integer(entry.get("page"), "Invalid page number")
        normalized: Dict[str, Any] = {
            "source": source,
            "page": page,
            "rotate": _parse_page_tool_rotation(entry.get("rotate")),
        }
        if source == "insert":
            normalized["fileIndex"] = _parse_page_tool_integer(entry.get("fileIndex"), "Invalid inserted PDF index")
        final_pages.append(normalized)
    return final_pages


def _optimize_pdf_bytes(pdf_bytes: bytes) -> bytes:
    """Rewrite the PDF with lossless cleanup and stream compression."""
    output = io.BytesIO()
    try:
        with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
            doc.save(
                output,
                garbage=4,
                clean=True,
                deflate=True,
                deflate_images=True,
                deflate_fonts=True,
                use_objstms=1,
                compression_effort=9,
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to optimize PDF") from exc
    optimized = output.getvalue()
    return optimized or pdf_bytes


def _page_has_widget_annotations(page: Any) -> bool:
    annotations = page.get("/Annots", [])
    for annotation_ref in annotations:
        try:
            annotation = annotation_ref.get_object()
        except Exception:
            continue
        if annotation.get("/Subtype") == "/Widget":
            return True
    return False


def _remove_widget_annotations(page: Any) -> None:
    annotations = page.get("/Annots", [])
    if not annotations:
        return
    kept_annotations = ArrayObject()
    for annotation_ref in annotations:
        try:
            annotation = annotation_ref.get_object()
        except Exception:
            kept_annotations.append(annotation_ref)
            continue
        if annotation.get("/Subtype") != "/Widget":
            kept_annotations.append(annotation_ref)
    if kept_annotations:
        page[NameObject("/Annots")] = kept_annotations
    else:
        page.pop(NameObject("/Annots"), None)


def _reattach_widget_fields(writer: PdfWriter) -> bool:
    field_refs: List[Any] = []
    parent_kids: List[tuple[Any, ArrayObject]] = []
    for page in writer.pages:
        annotations = page.get("/Annots", [])
        for annotation_ref in annotations:
            try:
                annotation = annotation_ref.get_object()
            except Exception:
                continue
            if annotation.get("/Subtype") != "/Widget":
                continue
            field_ref = annotation_ref if annotation.get("/FT") else None
            if field_ref is None:
                try:
                    parent_ref = annotation.raw_get("/Parent")
                    parent = parent_ref.get_object()
                except Exception:
                    parent_ref = None
                    parent = None
                if parent is not None and parent.get("/FT"):
                    field_ref = parent_ref
                    for existing_parent_ref, kids in parent_kids:
                        if existing_parent_ref == parent_ref:
                            if annotation_ref not in kids:
                                kids.append(annotation_ref)
                            break
                    else:
                        parent_kids.append((parent_ref, ArrayObject([annotation_ref])))
            if field_ref is not None and field_ref not in field_refs:
                field_refs.append(field_ref)

    try:
        acroform = writer._root_object.get("/AcroForm")  # pylint: disable=protected-access
        acroform = acroform.get_object() if hasattr(acroform, "get_object") else acroform
    except Exception:
        acroform = None
    if not isinstance(acroform, DictionaryObject):
        acroform = DictionaryObject()
        writer._root_object[NameObject("/AcroForm")] = acroform  # pylint: disable=protected-access
    if not field_refs:
        writer._root_object.pop(NameObject("/AcroForm"), None)  # pylint: disable=protected-access
        return False

    fields = ArrayObject()
    acroform[NameObject("/Fields")] = fields
    for field_ref in field_refs:
        fields.append(field_ref)
    for parent_ref, kids in parent_kids:
        try:
            parent_ref.get_object()[NameObject("/Kids")] = kids
        except Exception:
            continue
    calculation_order = acroform.get("/CO")
    if isinstance(calculation_order, ArrayObject):
        acroform[NameObject("/CO")] = ArrayObject([field_ref for field_ref in calculation_order if field_ref in field_refs])
    return bool(fields)


def _fields_for_template_session_response(fields: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    """Return backend-normalized fields in the UI's origin-top rectangle shape."""
    response_fields: list[Dict[str, Any]] = []
    for field in fields:
        payload = dict(field)
        rect = payload.get("rect")
        if isinstance(rect, (list, tuple)) and len(rect) == 4:
            try:
                x1, y1, x2, y2 = [float(value) for value in rect]
                payload["rect"] = {
                    "x": x1,
                    "y": y1,
                    "width": x2 - x1,
                    "height": y2 - y1,
                }
            except (TypeError, ValueError):
                pass
        response_fields.append(payload)
    return response_fields


def _parse_materialize_fields_payload(fields: str) -> tuple[Dict[str, Any], List[Any]]:
    try:
        raw_payload = json.loads(fields)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid fields payload") from exc

    if isinstance(raw_payload, dict):
        return dict(raw_payload), list(raw_payload.get("fields") or [])
    if isinstance(raw_payload, list):
        return {}, list(raw_payload)
    raise HTTPException(status_code=400, detail="Invalid fields payload")


def _normalize_materialize_export_mode(export_mode: str) -> str:
    normalized = str(export_mode or "editable").strip().lower()
    if normalized not in {"editable", "flat"}:
        raise HTTPException(status_code=400, detail="Invalid export mode")
    return normalized


def _materialize_form_pdf_to_path(
    *,
    pdf: UploadFile,
    fields: str,
    export_mode: str,
    user_role: Optional[str],
) -> GeneratedFormPdf:
    filename = pdf.filename or "form.pdf"
    content_type = (pdf.content_type or "").lower()
    if not filename.lower().endswith(".pdf") and content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported")

    template, raw_fields = _parse_materialize_fields_payload(fields)
    normalized_export_mode = _normalize_materialize_export_mode(export_mode)

    max_mb, max_bytes = resolve_upload_limit()
    temp_path = write_upload_to_temp(
        pdf,
        max_bytes=max_bytes,
        limit_message=f"PDF exceeds {max_mb}MB upload limit",
    )
    try:
        with fitz.open(str(temp_path)) as doc:
            page_count = max(1, int(doc.page_count))
    except Exception as exc:
        cleanup_paths([temp_path])
        raise HTTPException(status_code=400, detail="Invalid PDF upload") from exc
    max_pages = resolve_fillable_max_pages(user_role)
    if page_count > max_pages:
        cleanup_paths([temp_path])
        raise HTTPException(
            status_code=403,
            detail=f"Fillable upload limited to {max_pages} pages for your tier (got {page_count}).",
        )

    output_suffix = "flat" if normalized_export_mode == "flat" else "fillable"

    if not raw_fields and normalized_export_mode == "editable":
        return GeneratedFormPdf(
            output_path=temp_path,
            cleanup_targets=[temp_path],
            filename=safe_pdf_download_filename(filename, "form"),
            export_mode=normalized_export_mode,
            page_count=page_count,
            field_count=0,
        )

    if not raw_fields:
        cleanup_targets = [temp_path]
        try:
            output_fd, output_name = tempfile.mkstemp(suffix=".pdf")
            os.close(output_fd)
            output_path = Path(output_name)
            cleanup_targets.append(output_path)
            output_path.write_bytes(flatten_pdf_form_widgets(temp_path.read_bytes()))
        except Exception as exc:
            cleanup_paths(cleanup_targets)
            raise HTTPException(status_code=500, detail="Failed to generate flat PDF") from exc
        stem = os.path.splitext(filename)[0] or "form"
        return GeneratedFormPdf(
            output_path=output_path,
            cleanup_targets=cleanup_targets,
            filename=safe_pdf_download_filename(f"{stem}-{output_suffix}", "form"),
            export_mode=normalized_export_mode,
            page_count=page_count,
            field_count=0,
        )

    template.setdefault("coordinateSystem", "originTop")
    template["appearance"] = normalize_field_appearance_payload(template.get("appearance"))
    template["renderTextAppearanceStreams"] = True
    template["includeDullyPdfAppOnlyMetadata"] = normalized_export_mode == "editable"
    try:
        calculated_fields = materialize_calculated_fields(coerce_field_payloads(raw_fields))
        template["fields"] = prepare_app_only_fields_for_materialization(
            calculated_fields,
            include_markers=normalized_export_mode == "editable",
        )
    except ValueError as exc:
        cleanup_paths([temp_path])
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    template_fd, template_name = tempfile.mkstemp(suffix=".json")
    os.close(template_fd)
    template_path = Path(template_name)
    cleanup_targets = [temp_path, template_path]

    try:
        output_fd, output_name = tempfile.mkstemp(suffix=".pdf")
        os.close(output_fd)
        output_path = Path(output_name)
        cleanup_targets.append(output_path)
        template_path.write_text(json.dumps(template), encoding="utf-8")
        inject_fields(temp_path, template_path, output_path)
        if normalized_export_mode == "flat":
            output_path.write_bytes(stamp_image_fields_into_pdf(output_path.read_bytes(), template["fields"]))
            output_path.write_bytes(flatten_pdf_form_widgets(output_path.read_bytes()))
    except ImageFieldPayloadError as exc:
        cleanup_paths(cleanup_targets)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        cleanup_paths(cleanup_targets)
        detail = "Failed to generate flat PDF" if normalized_export_mode == "flat" else "Failed to generate fillable PDF"
        raise HTTPException(status_code=500, detail=detail) from exc

    stem = os.path.splitext(filename)[0] or "form"
    return GeneratedFormPdf(
        output_path=output_path,
        cleanup_targets=cleanup_targets,
        filename=safe_pdf_download_filename(f"{stem}-{output_suffix}", "form"),
        export_mode=normalized_export_mode,
        page_count=page_count,
        field_count=len(raw_fields),
    )


def _pdf_download_limit_http_exception(exc: PdfDownloadMonthlyLimitExceededError) -> HTTPException:
    return HTTPException(status_code=429, detail=exc.to_api_detail())


def _add_download_usage_headers(response: Response, usage_result) -> None:
    response.headers["X-DullyPDF-Download-Usage-Month"] = usage_result.month_key
    response.headers["X-DullyPDF-Download-Count"] = str(usage_result.current_month_usage)
    if usage_result.monthly_limit is not None:
        response.headers["X-DullyPDF-Download-Limit"] = str(usage_result.monthly_limit)
    if usage_result.downloads_remaining is not None:
        response.headers["X-DullyPDF-Download-Remaining"] = str(usage_result.downloads_remaining)


def _safe_zip_download_filename(name: Optional[str]) -> str:
    pdf_name = safe_pdf_download_filename(name or "group", "group")
    stem = pdf_name[:-4] if pdf_name.lower().endswith(".pdf") else pdf_name
    return f"{stem}.zip"


@router.post("/api/pdf/page-count")
async def get_pdf_page_count(
    pdf: UploadFile = File(...),
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Validate a PDF upload and return its page count for workspace preflight checks."""
    user = require_user(authorization)
    if not pdf:
        raise HTTPException(status_code=400, detail="Missing PDF upload")

    source_pdf = pdf.filename or "upload.pdf"
    content_type = (pdf.content_type or "").lower()
    if not source_pdf.lower().endswith(".pdf") and content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported")

    max_mb, max_bytes = resolve_upload_limit()
    pdf_bytes = await read_upload_bytes(
        pdf,
        max_bytes=max_bytes,
        limit_message=f"PDF exceeds {max_mb}MB upload limit",
    )
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    validation = validate_pdf_for_detection(pdf_bytes)
    detect_max_pages = resolve_detect_max_pages(user.role)
    return {
        "success": True,
        "pageCount": validation.page_count,
        "detectMaxPages": detect_max_pages,
        "withinDetectLimit": validation.page_count <= detect_max_pages,
    }


@router.post("/api/pdf/page-tools")
async def apply_pdf_page_tools(
    request: Request,
    pdf: UploadFile = File(...),
    operations: str = Form(...),
    insertPdfs: Optional[List[UploadFile]] = File(default=None),
    authorization: Optional[str] = Header(default=None),
) -> Response:
    """Rewrite page order, rotation, deletion, and inserted pages for the active PDF."""
    user = require_user(authorization)
    if not pdf:
        raise HTTPException(status_code=400, detail="Missing PDF upload")
    source_filename = _validate_pdf_upload_name(pdf)

    try:
        operations_payload = json.loads(operations)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid page operation payload") from exc
    if not isinstance(operations_payload, dict):
        raise HTTPException(status_code=400, detail="Invalid page operation payload")
    final_pages = _coerce_page_tool_final_pages(operations_payload.get("finalPages"))

    max_pages = resolve_fillable_max_pages(user.role)
    if len(final_pages) > max_pages:
        raise HTTPException(
            status_code=403,
            detail=f"PDF tools are limited to {max_pages} pages for your tier (got {len(final_pages)}).",
        )

    max_mb, max_bytes = resolve_upload_limit()
    source_bytes = await read_upload_bytes(
        pdf,
        max_bytes=max_bytes,
        limit_message=f"PDF exceeds {max_mb}MB upload limit",
    )
    source_validation = validate_pdf_for_detection(source_bytes)
    source_reader = PdfReader(io.BytesIO(source_validation.pdf_bytes))

    inserted_uploads = list(insertPdfs or [])
    referenced_insert_indexes = sorted({
        int(entry["fileIndex"])
        for entry in final_pages
        if entry["source"] == "insert"
    })
    for file_index in referenced_insert_indexes:
        if file_index < 0 or file_index >= len(inserted_uploads):
            raise HTTPException(status_code=400, detail="Inserted PDF index is out of range")

    inserted_readers: Dict[int, PdfReader] = {}
    inserted_page_counts: Dict[int, int] = {}
    for file_index in referenced_insert_indexes:
        upload = inserted_uploads[file_index]
        _validate_pdf_upload_name(upload, default_name="insert.pdf")
        inserted_bytes = await read_upload_bytes(
            upload,
            max_bytes=max_bytes,
            limit_message=f"Inserted PDF exceeds {max_mb}MB upload limit",
        )
        validation = validate_pdf_for_detection(inserted_bytes)
        inserted_readers[file_index] = PdfReader(io.BytesIO(validation.pdf_bytes))
        inserted_page_counts[file_index] = validation.page_count

    seen_current_pages: set[int] = set()
    for entry in final_pages:
        page_number = int(entry["page"])
        if entry["source"] == "current":
            if page_number < 1 or page_number > source_validation.page_count:
                raise HTTPException(status_code=400, detail="Current PDF page number is out of range")
            if page_number in seen_current_pages:
                raise HTTPException(status_code=400, detail="Current PDF pages cannot be duplicated in one operation")
            seen_current_pages.add(page_number)
            continue

        file_index = int(entry["fileIndex"])
        if page_number < 1 or page_number > inserted_page_counts[file_index]:
            raise HTTPException(status_code=400, detail="Inserted PDF page number is out of range")

    writer = PdfWriter()
    try:
        metadata = source_reader.metadata
    except Exception:
        metadata = None
    if metadata:
        try:
            writer.add_metadata(metadata)
        except Exception:
            pass

    for entry in final_pages:
        if entry["source"] == "current":
            reader = source_reader
        else:
            reader = inserted_readers[int(entry["fileIndex"])]
        writer.append(reader, pages=[int(entry["page"]) - 1], import_outline=False)
        if entry["source"] == "insert":
            _remove_widget_annotations(writer.pages[-1])
        rotation = int(entry["rotate"])
        if rotation:
            writer.pages[-1].rotate(rotation)

    # Page rewriting can orphan widget annotations from the document AcroForm
    # in some PDFs. The repair pass is O(page_count + annotation_count), strips
    # stale fields from deleted/inserted pages, and preserves current-page widgets.
    if any(_page_has_widget_annotations(page) for page in writer.pages):
        try:
            writer.reattach_fields()
        except Exception:
            pass
    try:
        has_fields = _reattach_widget_fields(writer)
        if has_fields:
            writer.set_need_appearances_writer(True)
    except Exception:
        pass

    output = io.BytesIO()
    try:
        writer.write(output)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to rewrite PDF pages") from exc

    stem = os.path.splitext(source_filename)[0] or "document"
    filename = safe_pdf_download_filename(f"{stem}-pages", "document")
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "private, no-store",
    }
    headers.update(resolve_stream_cors_headers(request.headers.get("origin")))
    return Response(content=output.getvalue(), media_type="application/pdf", headers=headers)


@router.post("/api/pdf/optimize")
async def optimize_pdf(
    request: Request,
    pdf: UploadFile = File(...),
    authorization: Optional[str] = Header(default=None),
) -> Response:
    """Apply lossless PDF cleanup and compression to the active source PDF."""
    user = require_user(authorization)
    if not pdf:
        raise HTTPException(status_code=400, detail="Missing PDF upload")
    source_filename = _validate_pdf_upload_name(pdf)

    max_mb, max_bytes = resolve_upload_limit()
    source_bytes = await read_upload_bytes(
        pdf,
        max_bytes=max_bytes,
        limit_message=f"PDF exceeds {max_mb}MB upload limit",
    )
    validation = validate_pdf_for_detection(source_bytes)
    max_pages = resolve_fillable_max_pages(user.role)
    if validation.page_count > max_pages:
        raise HTTPException(
            status_code=403,
            detail=f"PDF tools are limited to {max_pages} pages for your tier (got {validation.page_count}).",
        )

    optimized_bytes = _optimize_pdf_bytes(validation.pdf_bytes)
    if len(optimized_bytes) >= len(validation.pdf_bytes):
        optimized_bytes = validation.pdf_bytes

    stem = os.path.splitext(source_filename)[0] or "document"
    filename = safe_pdf_download_filename(f"{stem}-optimized", "document")
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "private, no-store",
        "X-DullyPDF-Original-Bytes": str(len(validation.pdf_bytes)),
        "X-DullyPDF-Optimized-Bytes": str(len(optimized_bytes)),
        "X-DullyPDF-Saved-Bytes": str(max(0, len(validation.pdf_bytes) - len(optimized_bytes))),
    }
    headers.update(resolve_stream_cors_headers(request.headers.get("origin")))
    return Response(content=optimized_bytes, media_type="application/pdf", headers=headers)


@router.post("/api/forms/download")
async def download_materialized_form(
    background_tasks: BackgroundTasks,
    request: Request,
    pdf: UploadFile = File(...),
    fields: str = Form(...),
    exportMode: str = Form("editable"),
    downloadRequestId: str = Form(...),
    authorization: Optional[str] = Header(default=None),
):
    """Materialize a user-triggered workspace PDF download and consume monthly quota."""
    user = require_user(authorization)
    if not pdf:
        raise HTTPException(status_code=400, detail="No PDF file uploaded")
    generated = _materialize_form_pdf_to_path(
        pdf=pdf,
        fields=fields,
        export_mode=exportMode,
        user_role=user.role,
    )
    try:
        usage_result = commit_pdf_download_usage(
            user_id=user.app_user_id,
            role=user.role,
            request_id=downloadRequestId,
            source="workspace_download",
            export_mode=generated.export_mode,
            pdf_count=1,
            page_count=generated.page_count,
            field_count=generated.field_count,
        )
    except PdfDownloadMonthlyLimitExceededError as exc:
        cleanup_paths(generated.cleanup_targets)
        raise _pdf_download_limit_http_exception(exc) from exc
    except ValueError as exc:
        cleanup_paths(generated.cleanup_targets)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        cleanup_paths(generated.cleanup_targets)
        raise HTTPException(status_code=500, detail="Failed to record PDF download usage.") from exc

    background_tasks.add_task(cleanup_paths, generated.cleanup_targets)
    response = FileResponse(
        str(generated.output_path),
        media_type="application/pdf",
        filename=generated.filename,
        background=background_tasks,
    )
    response.headers.update(resolve_stream_cors_headers(request.headers.get("origin")))
    response.headers["Cache-Control"] = "private, no-store"
    _add_download_usage_headers(response, usage_result)
    return response


@router.post("/api/forms/group-download")
async def download_materialized_group(
    background_tasks: BackgroundTasks,
    request: Request,
    payload: str = Form(...),
    pdfs: List[UploadFile] = File(...),
    authorization: Optional[str] = Header(default=None),
):
    """Materialize a group ZIP download and consume quota for each contained PDF."""
    user = require_user(authorization)
    try:
        group_payload = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid group download payload") from exc
    if not isinstance(group_payload, dict):
        raise HTTPException(status_code=400, detail="Invalid group download payload")
    download_request_id = str(group_payload.get("downloadRequestId") or "").strip()
    if not download_request_id:
        raise HTTPException(status_code=400, detail="downloadRequestId is required")
    items = group_payload.get("items")
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="Group download payload must include items")
    pdf_uploads = list(pdfs or [])
    if not pdf_uploads:
        raise HTTPException(status_code=400, detail="Group download requires at least one PDF")

    cleanup_targets: List[Path] = []
    archive_entries: List[tuple[str, Path]] = []
    used_names: set[str] = set()
    total_pages = 0
    total_fields = 0

    try:
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                raise HTTPException(status_code=400, detail="Invalid group download item")
            try:
                file_index = int(item.get("fileIndex", index))
            except (TypeError, ValueError) as exc:
                raise HTTPException(status_code=400, detail="Invalid group download file index") from exc
            if file_index < 0 or file_index >= len(pdf_uploads):
                raise HTTPException(status_code=400, detail="Group download file index is out of range")
            fields_payload = item.get("fields")
            if isinstance(fields_payload, str):
                fields_json = fields_payload
            elif isinstance(fields_payload, dict):
                fields_json = json.dumps(fields_payload)
            elif isinstance(fields_payload, list):
                item_appearance = (
                    {"appearance": item["appearance"]}
                    if isinstance(item.get("appearance"), dict)
                    else {}
                )
                fields_json = json.dumps({"fields": fields_payload, **item_appearance})
            else:
                raise HTTPException(status_code=400, detail="Invalid group download fields payload")
            if isinstance(fields_payload, dict) and isinstance(item.get("appearance"), dict):
                parsed_fields_payload = dict(fields_payload)
                parsed_fields_payload.setdefault("appearance", item.get("appearance"))
                fields_json = json.dumps(parsed_fields_payload)

            generated = _materialize_form_pdf_to_path(
                pdf=pdf_uploads[file_index],
                fields=fields_json,
                export_mode=str(item.get("exportMode") or "editable"),
                user_role=user.role,
            )
            cleanup_targets.extend(generated.cleanup_targets)
            total_pages += generated.page_count
            total_fields += generated.field_count
            archive_name = safe_pdf_download_filename(str(item.get("filename") or generated.filename), "form")
            if archive_name in used_names:
                stem = archive_name[:-4] if archive_name.lower().endswith(".pdf") else archive_name
                suffix = 2
                while f"{stem}-{suffix}.pdf" in used_names:
                    suffix += 1
                archive_name = f"{stem}-{suffix}.pdf"
            used_names.add(archive_name)
            archive_entries.append((archive_name, generated.output_path))

        zip_fd, zip_name = tempfile.mkstemp(suffix=".zip")
        os.close(zip_fd)
        zip_path = Path(zip_name)
        cleanup_targets.append(zip_path)
        with zipfile.ZipFile(zip_path, mode="w", compression=zipfile.ZIP_STORED) as archive:
            for archive_name, output_path in archive_entries:
                archive.write(output_path, arcname=archive_name)

        try:
            usage_result = commit_pdf_download_usage(
                user_id=user.app_user_id,
                role=user.role,
                request_id=download_request_id,
                source="workspace_group_download",
                export_mode="zip",
                pdf_count=len(archive_entries),
                page_count=total_pages,
                field_count=total_fields,
                metadata={
                    "groupId": str(group_payload.get("groupId") or "").strip() or None,
                    "groupName": str(group_payload.get("groupName") or "").strip() or None,
                },
            )
        except PdfDownloadMonthlyLimitExceededError as exc:
            raise _pdf_download_limit_http_exception(exc) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail="Failed to record PDF download usage.") from exc
    except HTTPException:
        cleanup_paths(cleanup_targets)
        raise
    except Exception as exc:
        cleanup_paths(cleanup_targets)
        raise HTTPException(status_code=500, detail="Failed to generate group PDF download.") from exc

    background_tasks.add_task(cleanup_paths, cleanup_targets)
    response = FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename=_safe_zip_download_filename(str(group_payload.get("groupName") or "group")),
        background=background_tasks,
    )
    response.headers.update(resolve_stream_cors_headers(request.headers.get("origin")))
    response.headers["Cache-Control"] = "private, no-store"
    _add_download_usage_headers(response, usage_result)
    return response


@router.post("/api/forms/materialize")
async def materialize_form(
    background_tasks: BackgroundTasks,
    request: Request,
    pdf: UploadFile = File(...),
    fields: str = Form(...),
    exportMode: str = Form("editable"),
    usageContext: Optional[str] = Form(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Inject fields into a PDF and return either an editable or flat download."""
    user = require_user(authorization)
    if not pdf:
        raise HTTPException(status_code=400, detail="No PDF file uploaded")
    generated = _materialize_form_pdf_to_path(
        pdf=pdf,
        fields=fields,
        export_mode=exportMode,
        user_role=user.role,
    )
    background_tasks.add_task(cleanup_paths, generated.cleanup_targets)
    response = FileResponse(
        str(generated.output_path),
        media_type="application/pdf",
        filename=generated.filename,
        background=background_tasks,
    )
    response.headers.update(resolve_stream_cors_headers(request.headers.get("origin")))
    response.headers["Cache-Control"] = "private, no-store"
    _record_download_event_if_requested(
        user_id=user.app_user_id,
        usage_context=usageContext,
        export_mode=generated.export_mode,
        page_count=generated.page_count,
        field_count=generated.field_count,
    )
    return response


@router.post("/api/templates/session")
async def create_template_session(
    pdf: UploadFile = File(...),
    fields: str = Form(...),
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Create a session for a fillable template upload so OpenAI rename/mapping can run."""
    user = require_user(authorization)
    if not pdf:
        raise HTTPException(status_code=400, detail="Missing PDF upload")

    source_pdf = pdf.filename or "upload.pdf"
    content_type = (pdf.content_type or "").lower()
    if not source_pdf.lower().endswith(".pdf") and content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported")

    try:
        raw_payload = json.loads(fields)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid fields payload") from exc

    if isinstance(raw_payload, dict):
        raw_fields = list(raw_payload.get("fields") or [])
    elif isinstance(raw_payload, list):
        raw_fields = list(raw_payload)
    else:
        raise HTTPException(status_code=400, detail="Invalid fields payload")

    try:
        template_fields = coerce_field_payloads(raw_fields)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not template_fields:
        raise HTTPException(status_code=400, detail="No fields provided for template session")

    max_mb, max_bytes = resolve_upload_limit()
    pdf_bytes = await read_upload_bytes(
        pdf,
        max_bytes=max_bytes,
        limit_message=f"PDF exceeds {max_mb}MB upload limit",
    )
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    source_pdf_sha256 = sha256_hex_for_bytes(pdf_bytes)

    validation = validate_pdf_for_detection(pdf_bytes)
    max_pages = resolve_fillable_max_pages(user.role)
    if validation.page_count > max_pages:
        raise HTTPException(
            status_code=403,
            detail=f"Fillable upload limited to {max_pages} pages for your tier (got {validation.page_count}).",
        )
    template_fields = enrich_fields_with_acroform_calculation_metadata(template_fields, validation.pdf_bytes)
    session_id = str(uuid.uuid4())
    entry: Dict[str, Any] = {
        "user_id": user.app_user_id,
        "source_pdf": source_pdf,
        "source_pdf_sha256": source_pdf_sha256,
        "pdf_bytes": validation.pdf_bytes,
        "fields": template_fields,
        "page_count": validation.page_count,
        "detection_status": DETECTION_STATUS_COMPLETE,
        "detection_completed_at": now_iso(),
    }
    _store_session_entry(
        session_id,
        entry,
        persist_pdf=True,
        persist_fields=True,
        persist_result=False,
    )
    return {
        "success": True,
        "sessionId": session_id,
        "fieldCount": len(template_fields),
        "pageCount": validation.page_count,
        "fields": _fields_for_template_session_response(template_fields),
    }
