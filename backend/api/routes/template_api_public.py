"""Public API Fill routes for published saved-template endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import hashlib
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError

from backend.api.schemas import TemplateApiFillRequest
from backend.firebaseDB.template_api_endpoint_database import (
    create_template_api_endpoint_event,
    get_template_api_endpoint_public,
    get_template_api_endpoint_public_metadata,
    get_template_api_monthly_usage,
    record_template_api_endpoint_failure,
    record_template_api_endpoint_success,
    TemplateApiMonthlyLimitExceededError,
)
from backend.logging_config import get_logger
from backend.firebaseDB.user_database import get_user_profile, normalize_role
from backend.security.rate_limit import check_rate_limit
from backend.services.app_config import resolve_stream_cors_headers
from backend.services.contact_service import resolve_client_ip
from backend.services.downgrade_retention_service import (
    get_user_retention_locked_template_ids,
    is_user_retention_template_locked,
)
from backend.services.pdf_service import cleanup_paths
from backend.services.limits_service import (
    check_group_fill_quota,
    resolve_template_api_active_limit,
    resolve_template_api_max_pages,
    resolve_template_api_requests_monthly_limit,
)
from backend.services.template_api_service import (
    build_group_template_api_schema,
    build_template_api_key_prefix,
    build_template_api_schema,
    group_template_api_pdf_count,
    group_template_api_total_page_count,
    is_group_template_api_snapshot,
    materialize_group_template_api_snapshot,
    materialize_template_api_snapshot,
    parse_template_api_basic_secret,
    resolve_group_template_api_request_data,
    resolve_template_api_request_data,
    verify_template_api_secret,
)


router = APIRouter()
logger = get_logger(__name__)


def _resolve_public_rate_limits(prefix: str) -> tuple[int, int, int, int]:
    window_seconds = max(1, int(os.getenv(f"{prefix}_WINDOW_SECONDS", "60") or "60"))
    per_ip = max(1, int(os.getenv(f"{prefix}_PER_IP", "60") or "60"))
    per_endpoint = max(1, int(os.getenv(f"{prefix}_PER_ENDPOINT", "120") or "120"))
    global_limit = max(0, int(os.getenv(f"{prefix}_GLOBAL", "600") or "600"))
    return window_seconds, per_ip, per_endpoint, global_limit


def _check_public_rate_limits(
    *,
    scope: str,
    client_ip: str,
    window_seconds: int,
    per_ip: int,
    global_limit: int,
) -> bool:
    if global_limit > 0:
        global_allowed = check_rate_limit(
            f"{scope}:global",
            limit=global_limit,
            window_seconds=window_seconds,
            fail_closed=True,
        )
        if not global_allowed:
            return False
    return check_rate_limit(
        f"{scope}:{client_ip}",
        limit=per_ip,
        window_seconds=window_seconds,
        fail_closed=True,
    )


def _check_endpoint_rate_limit(
    *,
    scope: str,
    endpoint_id: str,
    window_seconds: int,
    per_endpoint: int,
) -> bool:
    return check_rate_limit(
        f"{scope}:endpoint:{endpoint_id}",
        limit=per_endpoint,
        window_seconds=window_seconds,
        fail_closed=True,
    )


def _unauthorized(*, record=None, lookup_record: bool = True) -> HTTPException:
    exc = HTTPException(
        status_code=401,
        detail="A valid API Fill key is required.",
        headers={"WWW-Authenticate": 'Basic realm="API Fill"'},
    )
    setattr(exc, "template_api_record", record)
    setattr(exc, "template_api_lookup_record", bool(lookup_record))
    return exc


def _serialize_public_endpoint(record) -> Dict[str, Any]:
    scope_type = (getattr(record, "scope_type", None) or "template")
    fill_path = (
        f"/api/v1/fill/{record.id}.zip"
        if scope_type == "group"
        else f"/api/v1/fill/{record.id}.pdf"
    )
    return {
        "id": record.id,
        "scopeType": scope_type,
        "templateName": record.template_name,
        "groupName": getattr(record, "group_name", None),
        "status": record.status,
        "snapshotVersion": record.snapshot_version,
        "fillPath": fill_path,
        "schemaPath": f"/api/v1/fill/{record.id}/schema",
    }


def _hash_client_ip(value: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def _record_event(record, *, event_type: str, outcome: str = "success", metadata: Optional[Dict[str, Any]] = None) -> None:
    try:
        create_template_api_endpoint_event(
            endpoint_id=record.id,
            user_id=record.user_id,
            template_id=getattr(record, "template_id", None) or (getattr(record, "group_id", None) or ""),
            event_type=event_type,
            outcome=outcome,
            snapshot_version=record.snapshot_version,
            metadata=metadata,
        )
    except Exception as exc:
        logger.warning(
            "Failed to record API Fill event %s for endpoint %s: %s",
            event_type,
            getattr(record, "id", ""),
            exc,
        )


def _record_failure_counters(
    endpoint_id: str,
    *,
    auth_failure: bool = False,
    validation_failure: bool = False,
    runtime_failure: bool = False,
    suspicious: bool = False,
    reason: Optional[str] = None,
) -> None:
    try:
        record_template_api_endpoint_failure(
            endpoint_id,
            auth_failure=auth_failure,
            validation_failure=validation_failure,
            runtime_failure=runtime_failure,
            suspicious=suspicious,
            reason=reason,
        )
    except Exception as exc:
        logger.warning(
            "Failed to record API Fill failure counters for endpoint %s: %s",
            endpoint_id,
            exc,
        )


def _record_auth_failure(
    endpoint_id: str,
    *,
    reason: str,
    client_ip: str,
    record=None,
    lookup_record: bool = True,
) -> None:
    if record is None and lookup_record:
        record = get_template_api_endpoint_public_metadata(endpoint_id)
    if record is None:
        return
    _record_failure_counters(
        endpoint_id,
        auth_failure=True,
        suspicious=True,
        reason=reason,
    )
    _record_event(
        record,
        event_type="fill_auth_failed",
        outcome="denied",
        metadata={"reason": reason, "clientIpHash": _hash_client_ip(client_ip)},
    )


def _handle_public_auth_failure(
    *,
    scope: str,
    endpoint_id: str,
    reason: str,
    client_ip: str,
    window_seconds: int,
    per_endpoint: int,
    record=None,
    lookup_record: bool = True,
) -> None:
    # Only known endpoints get their own auth-failure bucket. Otherwise an
    # attacker could spray random ids and force unbounded rate-limit documents
    # for endpoints that do not exist.
    if record is not None:
        allowed = _check_endpoint_rate_limit(
            scope=f"{scope}:auth_failures",
            endpoint_id=record.id,
            window_seconds=window_seconds,
            per_endpoint=per_endpoint,
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many API Fill authentication failures for this endpoint. Please wait and try again.",
            )
    _record_auth_failure(
        endpoint_id,
        reason=reason,
        client_ip=client_ip,
        record=record,
        lookup_record=lookup_record,
    )


def _resolve_owner_role(record) -> str:
    profile = get_user_profile(record.user_id)
    return normalize_role(profile.role if profile else None)


_MAX_FILL_REQUEST_BODY_BYTES = 65_536
_MAX_FAILURE_REASON_CHARS = 512


def _current_usage_month_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _parse_content_length(request: Request) -> int:
    raw_value = str(request.headers.get("content-length", "") or "").strip()
    if not raw_value:
        return 0
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid Content-Length header.") from exc
    if value < 0:
        raise HTTPException(status_code=400, detail="Invalid Content-Length header.")
    return value


def _enforce_json_content_type(request: Request) -> None:
    content_type = str(request.headers.get("content-type", "") or "")
    media_type = content_type.split(";", 1)[0].strip().lower()
    if media_type == "application/json" or media_type.endswith("+json"):
        return
    raise HTTPException(status_code=415, detail="API Fill requests must use application/json.")


async def _read_request_body_with_limit(request: Request, *, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        if not chunk:
            continue
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail="Request body too large.")
        chunks.append(chunk)
    return b"".join(chunks)


async def _parse_fill_request_payload(request: Request) -> TemplateApiFillRequest:
    body = await _read_request_body_with_limit(request, max_bytes=_MAX_FILL_REQUEST_BODY_BYTES)
    if not body.strip():
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.")
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.") from exc
    try:
        return TemplateApiFillRequest.model_validate(parsed)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=_summarize_request_validation_errors(exc)) from exc


def _stringify_failure_reason(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, (dict, list)):
        try:
            return json.dumps(detail, sort_keys=True)
        except TypeError:
            return str(detail)
    return str(detail)


def _truncate_failure_reason(reason: str) -> str:
    normalized = str(reason or "").strip()
    if len(normalized) <= _MAX_FAILURE_REASON_CHARS:
        return normalized
    return normalized[: _MAX_FAILURE_REASON_CHARS - 3].rstrip() + "..."


def _normalize_failure_reason_for_storage(detail: Any) -> str:
    return _truncate_failure_reason(_stringify_failure_reason(detail))


def _summarize_request_validation_errors(exc: ValidationError) -> list[dict[str, Any]]:
    summarized: list[dict[str, Any]] = []
    for error in exc.errors():
        summarized.append(
            {
                "loc": list(error.get("loc") or []),
                "msg": str(error.get("msg") or "Invalid request field."),
                "type": str(error.get("type") or "value_error"),
            }
        )
    return summarized or [{"loc": [], "msg": "Invalid request body.", "type": "value_error"}]


def _record_runtime_failure(record, *, reason: str, client_ip: str, payload: Optional[TemplateApiFillRequest] = None) -> None:
    normalized_reason = _truncate_failure_reason(reason)
    _record_failure_counters(
        record.id,
        runtime_failure=True,
        reason=normalized_reason,
    )
    _record_event(
        record,
        event_type="fill_runtime_failed",
        outcome="error",
        metadata={
            "reason": normalized_reason,
            "clientIpHash": _hash_client_ip(client_ip),
            "strict": bool(payload.strict) if payload is not None else False,
            "exportMode": payload.exportMode or record.snapshot.get("defaultExportMode") if payload and isinstance(record.snapshot, dict) else None,
        },
    )


def _enforce_runtime_plan_limits(
    record,
    snapshot: Dict[str, Any],
    *,
    pdf_count: int = 1,
    month_key: Optional[str] = None,
) -> int:
    """Pre-validate a planned fill against the owner's plan + monthly quota.

    Returns the monthly limit so the caller can pass it to
    ``record_template_api_endpoint_success`` for the atomic final check.

    Raises ``HTTPException(403)`` when the role can't use API Fill at all or
    the per-request page cap is exceeded. Raises ``HTTPException(429)`` when
    the pre-read monthly usage + ``pdf_count`` would exceed the limit — this
    saves the server from materializing a group zip that the atomic check
    inside ``record_template_api_endpoint_success`` would then reject.

    The atomic check inside the success transaction still runs as the source
    of truth for concurrent-race cases where another request eats the budget
    between this pre-check and the actual bookkeeping.
    """
    role = _resolve_owner_role(record)
    if resolve_template_api_active_limit(role) <= 0:
        raise HTTPException(status_code=403, detail="API Fill is unavailable on this account's current plan.")
    max_pages = resolve_template_api_max_pages(role)
    if is_group_template_api_snapshot(snapshot):
        page_count = group_template_api_total_page_count(snapshot)
    else:
        page_count = max(0, int(snapshot.get("pageCount") or 0))
    monthly_limit = resolve_template_api_requests_monthly_limit(role)
    if monthly_limit <= 0:
        raise HTTPException(status_code=403, detail="API Fill is unavailable on this account's current plan.")
    usage_record = get_template_api_monthly_usage(record.user_id, month_key=month_key)
    current_count = usage_record.request_count if usage_record is not None else 0
    quota_result = check_group_fill_quota(
        monthly_limit=monthly_limit,
        current_request_count=current_count,
        pdf_count=max(1, int(pdf_count or 1)),
        page_count_per_request=page_count,
        max_pages_per_request=max_pages,
    )
    if not quota_result["allowed"]:
        reason = quota_result.get("reason")
        if reason == "pages_per_request":
            raise HTTPException(
                status_code=403,
                detail=f"API Fill templates are limited to {max_pages} pages on this account's current plan.",
            )
        # reason == "fills_exhausted" → 429 so clients can retry next month
        raise HTTPException(
            status_code=429,
            detail="This account has reached its monthly API Fill request limit.",
        )
    return monthly_limit


def _record_plan_or_quota_block(
    record,
    *,
    exc: HTTPException,
    client_ip: str,
    payload: Optional[TemplateApiFillRequest] = None,
) -> None:
    reason = _normalize_failure_reason_for_storage(exc.detail)
    if exc.status_code >= 500:
        _record_runtime_failure(record, reason=reason, client_ip=client_ip, payload=payload)
        return
    event_type = "fill_quota_blocked" if exc.status_code == 429 else "fill_plan_blocked"
    metadata: Dict[str, Any] = {"reason": reason, "clientIpHash": _hash_client_ip(client_ip)}
    # Phase 5: surface group-fill scale on plan/quota block events so post-mortems
    # can distinguish "1 PDF blocked" from "an 8-PDF packet blocked".
    snapshot = getattr(record, "snapshot", None)
    if is_group_template_api_snapshot(snapshot):
        metadata["scopeType"] = "group"
        metadata["pdfCount"] = group_template_api_pdf_count(snapshot)
        metadata["totalPages"] = group_template_api_total_page_count(snapshot)
    _record_event(
        record,
        event_type=event_type,
        outcome="denied",
        metadata=metadata,
    )


def _template_api_endpoint_references_locked_template(record) -> bool:
    """True when a published template_api endpoint references any template that
    is currently locked by downgrade retention on the owner's account.

    Scope-aware:
      * ``template`` — checks ``record.template_id``
      * ``group``    — walks the bundle's ``templateSnapshots`` for any locked
        template id (equivalent to the fill-link public path's
        ``_fill_link_references_locked_templates`` helper).

    Without this, a downgraded user with locked templates can still serve
    filled PDFs via a frozen group endpoint because
    ``is_user_retention_template_locked`` treats a missing template_id
    (which all group endpoints have) as unlocked.
    """
    if record is None:
        return False
    locked_template_ids = get_user_retention_locked_template_ids(record.user_id)
    if not locked_template_ids:
        return False
    scope_type = str(getattr(record, "scope_type", None) or "template").strip().lower() or "template"
    if scope_type == "template":
        return bool(record.template_id and record.template_id in locked_template_ids)
    snapshot = record.snapshot if isinstance(record.snapshot, dict) else {}
    template_snapshots = snapshot.get("templateSnapshots")
    if not isinstance(template_snapshots, list):
        return False
    for entry in template_snapshots:
        if not isinstance(entry, dict):
            continue
        entry_template_id = str(entry.get("templateId") or "").strip()
        if entry_template_id and entry_template_id in locked_template_ids:
            return True
    return False


def _resolve_authenticated_endpoint(endpoint_id: str, authorization: Optional[str]):
    secret = parse_template_api_basic_secret(authorization)
    if not secret:
        raise _unauthorized(lookup_record=False)
    prefix = build_template_api_key_prefix(secret)
    metadata_record = get_template_api_endpoint_public_metadata(endpoint_id)
    if metadata_record is None:
        raise _unauthorized(lookup_record=False)
    if prefix and metadata_record.key_prefix and metadata_record.key_prefix != prefix:
        raise _unauthorized(record=metadata_record)
    if not metadata_record.secret_hash or not verify_template_api_secret(secret, metadata_record.secret_hash):
        raise _unauthorized(record=metadata_record)
    if metadata_record.status != "active":
        raise HTTPException(status_code=404, detail="API Fill endpoint not found.")
    record = get_template_api_endpoint_public(endpoint_id)
    if record is None:
        raise HTTPException(status_code=404, detail="API Fill endpoint not found.")
    if record.status != "active":
        raise HTTPException(status_code=404, detail="API Fill endpoint not found.")
    if _template_api_endpoint_references_locked_template(record):
        raise HTTPException(status_code=403, detail="API Fill endpoint is unavailable on this account's current plan.")
    snapshot = dict(record.snapshot or {})
    if not snapshot:
        raise HTTPException(status_code=404, detail="API Fill snapshot is missing.")
    return record, snapshot


def _build_public_schema_response(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if is_group_template_api_snapshot(snapshot):
            return build_group_template_api_schema(snapshot)
        return build_template_api_schema(snapshot)
    except ValueError as exc:
        raise HTTPException(
            status_code=500,
            detail="Published API Fill schema is invalid. Ask the template owner to republish the endpoint.",
        ) from exc


@router.get("/api/v1/fill/{endpoint_id}/schema")
async def get_public_template_api_schema(
    endpoint_id: str,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    window_seconds, per_ip, per_endpoint, global_limit = _resolve_public_rate_limits("SANDBOX_TEMPLATE_API_SCHEMA_RATE_LIMIT")
    client_ip = resolve_client_ip(request)
    allowed = _check_public_rate_limits(
        scope="template_api_schema",
        client_ip=client_ip,
        window_seconds=window_seconds,
        per_ip=per_ip,
        global_limit=global_limit,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many API Fill schema requests. Please wait and try again.")
    try:
        record, snapshot = _resolve_authenticated_endpoint(endpoint_id, authorization)
    except HTTPException as exc:
        if exc.status_code == 401:
            _handle_public_auth_failure(
                scope="template_api_schema",
                endpoint_id=endpoint_id,
                reason="schema_auth_failed",
                client_ip=client_ip,
                window_seconds=window_seconds,
                per_endpoint=per_endpoint,
                record=getattr(exc, "template_api_record", None),
                lookup_record=bool(getattr(exc, "template_api_lookup_record", True)),
            )
        raise
    if not _check_endpoint_rate_limit(
        scope="template_api_schema",
        endpoint_id=endpoint_id,
        window_seconds=window_seconds,
        per_endpoint=per_endpoint,
    ):
        _record_event(
            record,
            event_type="fill_rate_limited",
            outcome="denied",
            metadata={"route": "schema", "clientIpHash": _hash_client_ip(client_ip)},
        )
        raise HTTPException(status_code=429, detail="Too many API Fill schema requests for this endpoint. Please wait and try again.")
    response = {
        "endpoint": _serialize_public_endpoint(record),
        "schema": _build_public_schema_response(snapshot),
    }
    headers = resolve_stream_cors_headers(request.headers.get("origin"))
    headers["Cache-Control"] = "private, no-store"
    return JSONResponse(content=response, headers=headers)


@router.post("/api/v1/fill/{endpoint_id}.pdf")
async def fill_public_template_api_endpoint(
    endpoint_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(default=None),
):
    content_length = _parse_content_length(request)
    if content_length > _MAX_FILL_REQUEST_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request body too large.")
    window_seconds, per_ip, per_endpoint, global_limit = _resolve_public_rate_limits("SANDBOX_TEMPLATE_API_FILL_RATE_LIMIT")
    client_ip = resolve_client_ip(request)
    allowed = _check_public_rate_limits(
        scope="template_api_fill",
        client_ip=client_ip,
        window_seconds=window_seconds,
        per_ip=per_ip,
        global_limit=global_limit,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many API Fill requests. Please wait and try again.")
    try:
        record, snapshot = _resolve_authenticated_endpoint(endpoint_id, authorization)
    except HTTPException as exc:
        if exc.status_code == 401:
            _handle_public_auth_failure(
                scope="template_api_fill",
                endpoint_id=endpoint_id,
                reason="fill_auth_failed",
                client_ip=client_ip,
                window_seconds=window_seconds,
                per_endpoint=per_endpoint,
                record=getattr(exc, "template_api_record", None),
                lookup_record=bool(getattr(exc, "template_api_lookup_record", True)),
            )
        raise
    if not _check_endpoint_rate_limit(
        scope="template_api_fill",
        endpoint_id=endpoint_id,
        window_seconds=window_seconds,
        per_endpoint=per_endpoint,
    ):
        _record_event(
            record,
            event_type="fill_rate_limited",
            outcome="denied",
            metadata={"route": "fill", "clientIpHash": _hash_client_ip(client_ip)},
        )
        raise HTTPException(status_code=429, detail="Too many API Fill requests for this endpoint. Please wait and try again.")
    if is_group_template_api_snapshot(snapshot):
        _record_event(
            record,
            event_type="fill_validation_failed",
            outcome="error",
            metadata={"reason": "group_endpoint_requires_zip_route"},
        )
        raise HTTPException(
            status_code=409,
            detail=(
                "This endpoint is a group API Fill. POST to /api/v1/fill/{endpoint_id}.zip "
                "to receive a zip archive of the per-template PDFs."
            ),
        )
    _enforce_json_content_type(request)
    try:
        payload = await _parse_fill_request_payload(request)
    except HTTPException as exc:
        reason = _normalize_failure_reason_for_storage(exc.detail)
        _record_failure_counters(
            endpoint_id,
            validation_failure=True,
            reason=reason,
        )
        _record_event(
            record,
            event_type="fill_validation_failed",
            outcome="error",
            metadata={"reason": reason},
        )
        raise
    try:
        normalized_data = resolve_template_api_request_data(
            snapshot,
            payload.data,
            strict=bool(payload.strict),
        )
    except HTTPException as exc:
        reason = _normalize_failure_reason_for_storage(exc.detail)
        if exc.status_code >= 500:
            _record_runtime_failure(record, reason=reason, client_ip=client_ip, payload=payload)
            raise
        _record_failure_counters(
            endpoint_id,
            validation_failure=True,
            reason=reason,
        )
        _record_event(
            record,
            event_type="fill_validation_failed",
            outcome="error",
            metadata={"reason": reason, "strict": bool(payload.strict)},
        )
        raise

    usage_month_key = _current_usage_month_key()
    cleanup_targets = []
    try:
        monthly_limit = _enforce_runtime_plan_limits(
            record,
            snapshot,
            pdf_count=1,
            month_key=usage_month_key,
        )
        output_path, cleanup_targets, filename = materialize_template_api_snapshot(
            snapshot,
            data=normalized_data,
            export_mode=payload.exportMode,
            filename=payload.filename,
        )
    except FileNotFoundError as exc:
        _record_runtime_failure(record, reason=str(exc), client_ip=client_ip, payload=payload)
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        reason = _normalize_failure_reason_for_storage(str(exc))
        _record_failure_counters(
            endpoint_id,
            validation_failure=True,
            reason=reason,
        )
        _record_event(
            record,
            event_type="fill_validation_failed",
            outcome="error",
            metadata={"reason": reason, "strict": bool(payload.strict)},
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException as exc:
        _record_plan_or_quota_block(record, exc=exc, client_ip=client_ip, payload=payload)
        raise
    except Exception as exc:
        if cleanup_targets:
            cleanup_paths(cleanup_targets)
        _record_runtime_failure(record, reason="unexpected_runtime_error", client_ip=client_ip, payload=payload)
        raise HTTPException(status_code=500, detail="API Fill failed while generating the PDF.") from exc

    try:
        try:
            file_size = Path(output_path).stat().st_size
        except OSError:
            file_size = None
        updated_record = record_template_api_endpoint_success(
            record.id,
            month_key=usage_month_key,
            monthly_limit=monthly_limit,
            metadata={
                "exportMode": payload.exportMode or snapshot.get("defaultExportMode"),
                "strict": bool(payload.strict),
                "filenameProvided": bool(str(payload.filename or "").strip()),
                "clientIpHash": _hash_client_ip(client_ip),
                "responseBytes": file_size,
            },
        )
        if updated_record is None:
            raise RuntimeError("API Fill endpoint disappeared before success bookkeeping completed.")
    except TemplateApiMonthlyLimitExceededError as exc:
        cleanup_paths(cleanup_targets)
        quota_exc = HTTPException(status_code=429, detail=str(exc))
        _record_plan_or_quota_block(record, exc=quota_exc, client_ip=client_ip, payload=payload)
        raise quota_exc
    except Exception as exc:
        cleanup_paths(cleanup_targets)
        _record_runtime_failure(record, reason="success_bookkeeping_failed", client_ip=client_ip, payload=payload)
        raise HTTPException(status_code=500, detail="API Fill failed while finalizing the response.") from exc

    background_tasks.add_task(cleanup_paths, cleanup_targets)
    response = FileResponse(
        str(output_path),
        media_type="application/pdf",
        filename=filename,
        background=background_tasks,
    )
    response.headers.update(resolve_stream_cors_headers(request.headers.get("origin")))
    response.headers["Cache-Control"] = "private, no-store"
    return response


@router.post("/api/v1/fill/{endpoint_id}.zip")
async def fill_public_template_api_endpoint_group(
    endpoint_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(default=None),
):
    """Phase 4: group API Fill — JSON in, zip of per-template PDFs out.

    Mirrors the per-template ``.pdf`` route's auth, rate limit, plan limit,
    quota, and audit machinery exactly. Differences:

    * Snapshot must be a Phase 3 group bundle (``is_group_template_api_snapshot``).
    * Body validates against the canonical JSON schema (additionalProperties:
      false; required keys; enum values for radio groups).
    * Materialization loops the per-template fill primitive across every
      template in the bundle and zips the resulting PDFs.
    * Quota counts each materialized PDF as one fill against the user's
      monthly budget (D7).
    """

    content_length = _parse_content_length(request)
    if content_length > _MAX_FILL_REQUEST_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request body too large.")
    window_seconds, per_ip, per_endpoint, global_limit = _resolve_public_rate_limits("SANDBOX_TEMPLATE_API_FILL_RATE_LIMIT")
    client_ip = resolve_client_ip(request)
    allowed = _check_public_rate_limits(
        scope="template_api_fill",
        client_ip=client_ip,
        window_seconds=window_seconds,
        per_ip=per_ip,
        global_limit=global_limit,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many API Fill requests. Please wait and try again.")
    try:
        record, snapshot = _resolve_authenticated_endpoint(endpoint_id, authorization)
    except HTTPException as exc:
        if exc.status_code == 401:
            _handle_public_auth_failure(
                scope="template_api_fill",
                endpoint_id=endpoint_id,
                reason="fill_auth_failed",
                client_ip=client_ip,
                window_seconds=window_seconds,
                per_endpoint=per_endpoint,
                record=getattr(exc, "template_api_record", None),
                lookup_record=bool(getattr(exc, "template_api_lookup_record", True)),
            )
        raise
    if not _check_endpoint_rate_limit(
        scope="template_api_fill",
        endpoint_id=endpoint_id,
        window_seconds=window_seconds,
        per_endpoint=per_endpoint,
    ):
        _record_event(
            record,
            event_type="fill_rate_limited",
            outcome="denied",
            metadata={"route": "fill_zip", "clientIpHash": _hash_client_ip(client_ip)},
        )
        raise HTTPException(status_code=429, detail="Too many API Fill requests for this endpoint. Please wait and try again.")
    if not is_group_template_api_snapshot(snapshot):
        _record_event(
            record,
            event_type="fill_validation_failed",
            outcome="error",
            metadata={"reason": "template_endpoint_requires_pdf_route"},
        )
        raise HTTPException(
            status_code=409,
            detail=(
                "This endpoint is a single-template API Fill. POST to "
                "/api/v1/fill/{endpoint_id}.pdf to receive the PDF."
            ),
        )
    _enforce_json_content_type(request)
    try:
        payload = await _parse_fill_request_payload(request)
    except HTTPException as exc:
        reason = _normalize_failure_reason_for_storage(exc.detail)
        _record_failure_counters(
            endpoint_id,
            validation_failure=True,
            reason=reason,
        )
        _record_event(
            record,
            event_type="fill_validation_failed",
            outcome="error",
            metadata={"reason": reason},
        )
        raise
    try:
        normalized_data = resolve_group_template_api_request_data(
            snapshot,
            payload.data,
            strict=True,
        )
    except HTTPException as exc:
        reason = _normalize_failure_reason_for_storage(exc.detail)
        if exc.status_code >= 500:
            _record_runtime_failure(record, reason=reason, client_ip=client_ip, payload=payload)
            raise
        _record_failure_counters(
            endpoint_id,
            validation_failure=True,
            reason=reason,
        )
        _record_event(
            record,
            event_type="fill_validation_failed",
            outcome="error",
            metadata={"reason": reason, "strict": True, "scopeType": "group"},
        )
        raise

    pdf_count = group_template_api_pdf_count(snapshot)
    total_pages = group_template_api_total_page_count(snapshot)
    usage_month_key = _current_usage_month_key()
    cleanup_targets = []
    try:
        monthly_limit = _enforce_runtime_plan_limits(
            record,
            snapshot,
            pdf_count=pdf_count,
            month_key=usage_month_key,
        )
        zip_path, cleanup_targets, zip_filename = materialize_group_template_api_snapshot(
            snapshot,
            data=normalized_data,
            filename=payload.filename,
        )
    except FileNotFoundError as exc:
        _record_runtime_failure(record, reason=str(exc), client_ip=client_ip, payload=payload)
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        reason = _normalize_failure_reason_for_storage(str(exc))
        _record_failure_counters(
            endpoint_id,
            validation_failure=True,
            reason=reason,
        )
        _record_event(
            record,
            event_type="fill_validation_failed",
            outcome="error",
            metadata={"reason": reason, "scopeType": "group"},
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException as exc:
        _record_plan_or_quota_block(record, exc=exc, client_ip=client_ip, payload=payload)
        raise
    except Exception as exc:
        if cleanup_targets:
            cleanup_paths(cleanup_targets)
        _record_runtime_failure(record, reason="unexpected_runtime_error", client_ip=client_ip, payload=payload)
        raise HTTPException(status_code=500, detail="API Fill failed while generating the group packet.") from exc

    try:
        try:
            file_size = Path(zip_path).stat().st_size
        except OSError:
            file_size = None
        updated_record = record_template_api_endpoint_success(
            record.id,
            month_key=usage_month_key,
            monthly_limit=monthly_limit,
            count_increment=pdf_count,  # Phase 5 D7: per-PDF accounting for group fills.
            metadata={
                "scopeType": "group",
                "pdfCount": pdf_count,
                "templateCount": pdf_count,
                "totalPages": total_pages,
                "quotaIncrement": pdf_count,
                "filenameProvided": bool(str(payload.filename or "").strip()),
                "clientIpHash": _hash_client_ip(client_ip),
                "responseBytes": file_size,
            },
        )
        if updated_record is None:
            raise RuntimeError("API Fill endpoint disappeared before success bookkeeping completed.")
    except TemplateApiMonthlyLimitExceededError as exc:
        cleanup_paths(cleanup_targets)
        quota_exc = HTTPException(status_code=429, detail=str(exc))
        _record_plan_or_quota_block(record, exc=quota_exc, client_ip=client_ip, payload=payload)
        raise quota_exc
    except Exception as exc:
        cleanup_paths(cleanup_targets)
        _record_runtime_failure(record, reason="success_bookkeeping_failed", client_ip=client_ip, payload=payload)
        raise HTTPException(status_code=500, detail="API Fill failed while finalizing the response.") from exc

    background_tasks.add_task(cleanup_paths, cleanup_targets)
    response = FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename=zip_filename,
        background=background_tasks,
    )
    response.headers.update(resolve_stream_cors_headers(request.headers.get("origin")))
    response.headers["Cache-Control"] = "private, no-store"
    return response
