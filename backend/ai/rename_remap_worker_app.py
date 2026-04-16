"""Combined Cloud Run worker for async OpenAI rename and schema mapping jobs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from backend.ai.openai_client import resolve_openai_worker_max_retries
from backend.ai.openai_usage import (
    build_openai_usage_summary,
    coerce_usage_events,
    is_insufficient_quota_error,
    merge_usage_events,
)
from backend.ai.rename_pipeline import run_openai_rename_on_pdf
from backend.ai.schema_mapping import (
    OPENAI_SCHEMA_MODEL,
    build_allowlist_payload,
    call_openai_schema_mapping_chunked,
    validate_payload_size,
)
from backend.api.schemas import TemplateOverlayField
from backend.env_utils import env_truthy, env_value, int_env
from backend.firebaseDB.firebase_service import RequestUser
from backend.firebaseDB.openai_job_database import (
    get_openai_job,
    update_openai_job,
)
from backend.firebaseDB.schema_database import get_schema
from backend.firebaseDB.template_database import get_template, list_templates
from backend.logging_config import get_logger
from backend.services.credit_refund_service import attempt_credit_refund
from backend.services.downgrade_retention_service import is_user_retention_template_locked
from backend.services.mapping_service import (
    apply_mapping_results_to_fields,
    build_combined_rename_mapping_payload,
    build_schema_mapping_payload,
    merge_schema_mapping_ai_responses,
    prepare_incremental_remap_ai_payload,
    template_fields_to_rename_fields,
)
from backend.ai.image_fill_pipeline import run_image_fill
from backend.services.pdf_service import get_pdf_page_count
from backend.services.task_auth_service import resolve_task_audiences, verify_internal_oidc_token
from backend.sessions.session_store import (
    get_session_entry as _get_session_entry,
    update_session_entry as _update_session_entry,
)
from backend.time_utils import now_iso

from .status import (
    OPENAI_JOB_STATUS_COMPLETE,
    OPENAI_JOB_STATUS_FAILED,
    OPENAI_JOB_STATUS_QUEUED,
    OPENAI_JOB_STATUS_RUNNING,
    OPENAI_JOB_TYPE_IMAGE_FILL,
    OPENAI_JOB_TYPE_RENAME_REMAP,
)


def _is_prod() -> bool:
    return env_value("ENV").lower() in {"prod", "production"}


logger = get_logger(__name__)


def _allow_unauthenticated() -> bool:
    if not env_truthy("OPENAI_RENAME_REMAP_ALLOW_UNAUTHENTICATED"):
        return False
    if _is_prod():
        logger.warning("OPENAI_RENAME_REMAP_ALLOW_UNAUTHENTICATED is ignored in prod.")
        return False
    env_name = env_value("ENV").lower()
    if env_name not in {"dev", "development", "local", "test"}:
        logger.warning(
            "OPENAI_RENAME_REMAP_ALLOW_UNAUTHENTICATED is ignored for ENV=%s.",
            env_name or "unset",
        )
        return False
    return True


_ALLOW_UNAUTHENTICATED = _allow_unauthenticated()

app = FastAPI(title="DullyPDF OpenAI Rename+Remap Worker")


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _parse_retry_count(raw: Optional[str]) -> int:
    if raw is None:
        return 0
    try:
        value = int(str(raw).strip())
    except ValueError:
        return 0
    return max(0, value)


def _max_task_attempts() -> Optional[int]:
    value = int_env("OPENAI_RENAME_REMAP_TASKS_MAX_ATTEMPTS", int_env("OPENAI_TASKS_MAX_ATTEMPTS", 0))
    return value if value > 0 else None


def _should_finalize_failure(retry_count: int) -> bool:
    max_attempts = _max_task_attempts()
    if not max_attempts:
        return False
    return retry_count >= max_attempts - 1


def _retry_headers() -> Dict[str, str]:
    retry_after = int_env("OPENAI_RENAME_REMAP_RETRY_AFTER_SECONDS", int_env("OPENAI_TASK_RETRY_AFTER_SECONDS", 5))
    headers = {"X-Dully-Retry": "true"}
    if retry_after > 0:
        headers["Retry-After"] = str(retry_after)
    return headers


def _worker_openai_max_retries() -> int:
    return resolve_openai_worker_max_retries()


def _require_internal_auth(authorization: Optional[str]) -> Dict[str, Any]:
    if _ALLOW_UNAUTHENTICATED:
        return {}
    raw = (authorization or "").strip()
    if not raw.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing rename/remap worker auth token")
    token = raw.split(" ", 1)[1].strip()
    decoded = verify_internal_oidc_token(
        token,
        audiences=resolve_task_audiences(
            audience_envs=[
                "OPENAI_RENAME_REMAP_TASKS_AUDIENCE",
            ],
            service_url_envs=[
                "OPENAI_RENAME_REMAP_SERVICE_URL",
            ],
        ),
        missing_audience_detail="Rename/remap worker audience is not configured",
        invalid_token_detail="Invalid rename/remap worker auth token",
    )

    allowed_email = env_value("OPENAI_RENAME_REMAP_CALLER_SERVICE_ACCOUNT")
    if _is_prod() and not allowed_email:
        raise HTTPException(status_code=500, detail="Rename/remap worker caller service account is not configured")
    if allowed_email and decoded.get("email") != allowed_email:
        raise HTTPException(status_code=403, detail="Rename/remap worker caller not allowed")
    return decoded


def _parse_template_fields(raw_fields: Optional[List[Dict[str, Any]]]) -> List[TemplateOverlayField]:
    parsed: List[TemplateOverlayField] = []
    for raw in raw_fields or []:
        try:
            parsed.append(TemplateOverlayField.model_validate(raw))
        except Exception:
            continue
    return parsed


def _ensure_template_ai_accessible(user_id: str, template_id: Optional[str]) -> None:
    normalized_template_id = str(template_id or "").strip()
    if not normalized_template_id:
        return
    if is_user_retention_template_locked(user_id, normalized_template_id):
        raise HTTPException(
            status_code=409,
            detail="This saved form is locked on the base plan. Upgrade to access it again.",
        )


def _resolve_session_source_template_id(
    *,
    user_id: str,
    session_id: str,
    session_entry: Dict[str, Any],
) -> Optional[str]:
    normalized_template_id = str(session_entry.get("source_template_id") or "").strip()
    if normalized_template_id:
        return normalized_template_id
    pdf_path = str(session_entry.get("pdf_path") or "").strip()
    if not pdf_path:
        return None
    matching_template_ids = [
        template.id
        for template in list_templates(user_id)
        if str(getattr(template, "pdf_bucket_path", "") or "").strip() == pdf_path
    ]
    if len(matching_template_ids) != 1:
        return None
    resolved_template_id = matching_template_ids[0]
    session_entry["source_template_id"] = resolved_template_id
    _update_session_entry(session_id, session_entry)
    return resolved_template_id


def _ensure_session_ai_accessible(
    *,
    user_id: str,
    session_id: str,
    session_entry: Dict[str, Any],
) -> None:
    source_template_id = _resolve_session_source_template_id(
        user_id=user_id,
        session_id=session_id,
        session_entry=session_entry,
    )
    if source_template_id:
        _ensure_template_ai_accessible(user_id, source_template_id)


def _reject_job_request(job_id: str, message: str, *, source: str) -> Dict[str, Any]:
    job = get_openai_job(job_id)
    job_status = str((job or {}).get("status") or "").strip().lower()
    if job and job_status not in {OPENAI_JOB_STATUS_COMPLETE, OPENAI_JOB_STATUS_FAILED}:
        _refund_stored_job(job, job_id=job_id, source=source)
        update_openai_job(
            job_id=job_id,
            status=OPENAI_JOB_STATUS_FAILED,
            error=message,
            completed_at=now_iso(),
        )
    return {
        "jobId": job_id,
        "status": OPENAI_JOB_STATUS_FAILED,
        "error": message,
    }


def _refund_stored_job(job: Dict[str, Any], *, job_id: str, source: str) -> None:
    if not bool(job.get("credits_charged")):
        return
    user_id = str(job.get("user_id") or "").strip()
    if not user_id:
        return
    try:
        credits = int(job.get("credits") or 0)
    except (TypeError, ValueError):
        credits = 0
    if credits <= 0:
        return
    credit_breakdown = job.get("credit_breakdown") if isinstance(job.get("credit_breakdown"), dict) else None
    attempt_credit_refund(
        user_id=user_id,
        role=str(job.get("user_role") or "").strip() or None,
        credits=credits,
        source=source,
        request_id=str(job.get("request_id") or "").strip() or job_id,
        job_id=job_id,
        credit_breakdown=credit_breakdown,
    )


def _finish_failure(
    *,
    job_id: str,
    user_id: str,
    user_role: Optional[str],
    credits: int,
    credits_charged: bool,
    request_id: Optional[str],
    credit_breakdown: Optional[Dict[str, int]],
    message: str,
    source: str,
    openai_usage_events: Optional[List[Dict[str, Any]]] = None,
    openai_usage_summary: Optional[Dict[str, Any]] = None,
    attempt_count: Optional[int] = None,
) -> Dict[str, Any]:
    if credits_charged and credits > 0:
        attempt_credit_refund(
            user_id=user_id,
            role=user_role,
            credits=credits,
            source=source,
            request_id=request_id,
            job_id=job_id,
            credit_breakdown=credit_breakdown,
        )
    result_payload: Dict[str, Any] = {}
    if isinstance(openai_usage_summary, dict):
        result_payload["openaiUsage"] = openai_usage_summary
    if isinstance(openai_usage_events, list):
        result_payload["openaiUsageEvents"] = openai_usage_events
    update_openai_job(
        job_id=job_id,
        status=OPENAI_JOB_STATUS_FAILED,
        error=message,
        result=result_payload or None,
        completed_at=now_iso(),
        openai_usage_summary=openai_usage_summary,
        openai_usage_events=openai_usage_events,
        attempt_count=attempt_count,
    )
    response: Dict[str, Any] = {
        "jobId": job_id,
        "status": OPENAI_JOB_STATUS_FAILED,
        "error": message,
    }
    if isinstance(openai_usage_summary, dict):
        response["openaiUsage"] = openai_usage_summary
    return response


# ---------------------------------------------------------------------------
# Rename job models + handler
# ---------------------------------------------------------------------------


class RenameJobRequest(BaseModel):
    jobId: str = Field(..., min_length=1)
    requestId: Optional[str] = None
    sessionId: str = Field(..., min_length=1)
    schemaId: Optional[str] = None
    templateFields: Optional[List[Dict[str, Any]]] = None
    userId: str = Field(..., min_length=1)
    userRole: Optional[str] = None
    credits: int = 0
    creditsCharged: bool = False
    creditBreakdown: Optional[Dict[str, int]] = None


def _bind_rename_payload_to_job(payload: RenameJobRequest, job: Dict[str, Any]) -> RenameJobRequest:
    trusted_user_id = str(job.get("user_id") or "").strip()
    if not trusted_user_id:
        raise ValueError("Rename job metadata is incomplete")
    if payload.userId != trusted_user_id:
        raise ValueError("Rename job user mismatch")

    stored_session_id = str(job.get("session_id") or "").strip()
    if stored_session_id and payload.sessionId != stored_session_id:
        raise ValueError("Rename job session mismatch")

    stored_schema_id = str(job.get("schema_id") or "").strip() or None
    if stored_schema_id and payload.schemaId and payload.schemaId != stored_schema_id:
        raise ValueError("Rename job schema mismatch")

    stored_credit_breakdown = job.get("credit_breakdown")
    if not isinstance(stored_credit_breakdown, dict):
        stored_credit_breakdown = payload.creditBreakdown

    return payload.model_copy(
        update={
            "requestId": str(job.get("request_id") or "").strip() or payload.requestId or payload.jobId,
            "sessionId": stored_session_id or payload.sessionId,
            "schemaId": stored_schema_id or payload.schemaId,
            "userId": trusted_user_id,
            "userRole": str(job.get("user_role") or "").strip() or payload.userRole,
            "credits": int(job.get("credits") or payload.credits or 0),
            "creditsCharged": bool(job.get("credits_charged")) if "credits_charged" in job else payload.creditsCharged,
            "creditBreakdown": stored_credit_breakdown,
        }
    )


@app.post("/internal/rename")
async def run_rename_job(
    payload: RenameJobRequest,
    authorization: Optional[str] = Header(default=None),
    x_cloud_tasks_taskretrycount: Optional[str] = Header(
        default=None,
        alias="X-CloudTasks-TaskRetryCount",
    ),
) -> Dict[str, Any]:
    try:
        _require_internal_auth(authorization)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else "Rename worker request rejected"
        logger.warning("Rename job %s rejected before start: %s", payload.jobId, detail)
        raise

    job = get_openai_job(payload.jobId)
    if not job:
        logger.warning("Rename job %s rejected: metadata not found", payload.jobId)
        return _reject_job_request(payload.jobId, "Rename job metadata not found", source="rename.worker")

    status = str(job.get("status") or "").strip().lower()
    if status == OPENAI_JOB_STATUS_COMPLETE:
        return {"jobId": payload.jobId, "status": OPENAI_JOB_STATUS_COMPLETE}
    if status == OPENAI_JOB_STATUS_FAILED:
        return {
            "jobId": payload.jobId,
            "status": OPENAI_JOB_STATUS_FAILED,
            "error": job.get("error") or "Rename job failed",
        }

    try:
        payload = _bind_rename_payload_to_job(payload, job)
    except ValueError as exc:
        logger.warning("Rename job %s rejected: %s", payload.jobId, exc)
        return _reject_job_request(payload.jobId, str(exc), source="rename.worker")

    retry_count = _parse_retry_count(x_cloud_tasks_taskretrycount)
    attempt_count = retry_count + 1
    usage_events = coerce_usage_events(job.get("openai_usage_events"))
    usage_summary = (
        dict(job.get("openai_usage_summary"))
        if isinstance(job.get("openai_usage_summary"), dict)
        else build_openai_usage_summary(usage_events)
    )

    update_openai_job(
        job_id=payload.jobId,
        status=OPENAI_JOB_STATUS_RUNNING,
        error="",
        started_at=now_iso(),
        openai_usage_summary=usage_summary,
        openai_usage_events=usage_events,
        attempt_count=attempt_count,
    )

    def _fail_rename(message: str) -> Dict[str, Any]:
        return _finish_failure(
            job_id=payload.jobId,
            user_id=payload.userId,
            user_role=payload.userRole,
            credits=payload.credits,
            credits_charged=payload.creditsCharged,
            request_id=payload.requestId,
            credit_breakdown=payload.creditBreakdown,
            message=message,
            source="rename.worker",
            openai_usage_events=usage_events,
            openai_usage_summary=usage_summary,
            attempt_count=attempt_count,
        )

    try:
        user = RequestUser(
            uid=payload.userId,
            app_user_id=payload.userId,
            role=payload.userRole,
        )
        entry = _get_session_entry(
            payload.sessionId,
            user,
            include_result=True,
            include_renames=False,
            include_checkbox_rules=False,
            force_l2=True,
        )
        _ensure_session_ai_accessible(
            user_id=payload.userId,
            session_id=payload.sessionId,
            session_entry=entry,
        )
        pdf_bytes = entry.get("pdf_bytes")
        if not pdf_bytes:
            raise HTTPException(status_code=404, detail="Session PDF not found")

        parsed_template_fields = _parse_template_fields(payload.templateFields)
        rename_fields: List[Dict[str, Any]]
        if parsed_template_fields:
            rename_fields = template_fields_to_rename_fields(parsed_template_fields)
        else:
            rename_fields = list(entry.get("fields") or [])
        if not rename_fields:
            raise HTTPException(status_code=400, detail="No fields available for rename")

        schema_id = payload.schemaId or (job.get("schema_id") or None)
        database_fields: Optional[List[str]] = None
        if schema_id:
            schema = get_schema(schema_id, payload.userId)
            if not schema:
                raise HTTPException(status_code=404, detail="Schema not found")
            allowlist = build_allowlist_payload(schema.fields, [])
            schema_fields = allowlist.get("schemaFields") or []
            if not schema_fields:
                raise HTTPException(status_code=400, detail="Schema fields are required for rename")
            try:
                validate_payload_size(allowlist)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            database_fields = [field.get("name") for field in schema_fields if field.get("name")]

        page_count = entry.get("page_count") or get_pdf_page_count(pdf_bytes)
        rename_report, renamed_fields = run_openai_rename_on_pdf(
            pdf_bytes=pdf_bytes,
            pdf_name=entry.get("source_pdf") or "document.pdf",
            fields=rename_fields,
            database_fields=database_fields,
            detector_candidates_by_page=(entry.get("result") or {}).get("detectorCandidatesByPage"),
            openai_max_retries=_worker_openai_max_retries(),
        )
        attempt_usage_events = coerce_usage_events(rename_report.get("usageByPage"))
        usage_events = merge_usage_events(
            usage_events,
            attempt_usage_events,
            attempt=attempt_count,
        )
        report_model = rename_report.get("model")
        usage_summary = build_openai_usage_summary(
            usage_events,
            model=report_model if isinstance(report_model, str) else None,
        )

        checkbox_rules = rename_report.get("checkboxRules") or []
        entry["fields"] = renamed_fields
        entry["renames"] = rename_report
        entry["checkboxRules"] = checkbox_rules
        entry.pop("checkboxHints", None)
        entry["textTransformRules"] = []
        entry["page_count"] = page_count
        _update_session_entry(
            payload.sessionId,
            entry,
            persist_fields=True,
            persist_renames=True,
            persist_checkbox_rules=True,
            persist_text_transform_rules=True,
        )

        resolved_request_id = (
            payload.requestId
            or str(job.get("request_id") or "").strip()
            or payload.jobId
        )
        result = {
            "success": True,
            "requestId": resolved_request_id,
            "sessionId": payload.sessionId,
            "schemaId": schema_id,
            "renames": rename_report,
            "fields": renamed_fields,
            "checkboxRules": checkbox_rules,
            "openaiUsage": usage_summary,
            "openaiUsageEvents": usage_events,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }
        update_openai_job(
            job_id=payload.jobId,
            status=OPENAI_JOB_STATUS_COMPLETE,
            error="",
            result=result,
            completed_at=now_iso(),
            openai_usage_summary=usage_summary,
            openai_usage_events=usage_events,
            attempt_count=attempt_count,
        )
        return {
            "jobId": payload.jobId,
            "status": OPENAI_JOB_STATUS_COMPLETE,
            "fieldCount": len(renamed_fields),
            "openaiUsage": usage_summary,
        }
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else "Rename job rejected"
        if exc.status_code < 500 or _should_finalize_failure(retry_count):
            logger.warning("Rename job %s failed: %s", payload.jobId, detail)
            return _fail_rename(str(detail))
        raise HTTPException(
            status_code=500,
            detail="Rename worker failed; retrying",
            headers=_retry_headers(),
        ) from exc
    except Exception as exc:
        if is_insufficient_quota_error(exc):
            message = f"OpenAI insufficient_quota: {exc}"
            logger.warning("Rename job %s terminal failure: %s", payload.jobId, message)
            return _fail_rename(message)
        logger.exception("Rename job %s failed: %s", payload.jobId, exc)
        if _should_finalize_failure(retry_count):
            message = f"Rename failed after {retry_count + 1} attempts: {exc}"
            return _fail_rename(message)
        raise HTTPException(
            status_code=500,
            detail="Rename worker failed; retrying",
            headers=_retry_headers(),
        ) from exc


# ---------------------------------------------------------------------------
# Remap job models + handler
# ---------------------------------------------------------------------------


class RemapJobRequest(BaseModel):
    jobId: str = Field(..., min_length=1)
    requestId: Optional[str] = None
    schemaId: str = Field(..., min_length=1)
    templateId: Optional[str] = None
    sessionId: Optional[str] = None
    templateFields: List[Dict[str, Any]]
    userId: str = Field(..., min_length=1)
    userRole: Optional[str] = None
    credits: int = 0
    creditsCharged: bool = False
    creditBreakdown: Optional[Dict[str, int]] = None


class RenameRemapJobRequest(BaseModel):
    jobId: str = Field(..., min_length=1)
    requestId: Optional[str] = None
    sessionId: str = Field(..., min_length=1)
    schemaId: str = Field(..., min_length=1)
    templateFields: Optional[List[Dict[str, Any]]] = None
    userId: str = Field(..., min_length=1)
    userRole: Optional[str] = None
    credits: int = 0
    creditsCharged: bool = False
    creditBreakdown: Optional[Dict[str, int]] = None


def _bind_rename_remap_payload_to_job(
    payload: RenameRemapJobRequest,
    job: Dict[str, Any],
) -> RenameRemapJobRequest:
    trusted_user_id = str(job.get("user_id") or "").strip()
    if not trusted_user_id:
        raise ValueError("Rename + Remap job metadata is incomplete")
    if payload.userId != trusted_user_id:
        raise ValueError("Rename + Remap job user mismatch")

    stored_session_id = str(job.get("session_id") or "").strip()
    if stored_session_id and payload.sessionId != stored_session_id:
        raise ValueError("Rename + Remap job session mismatch")

    stored_schema_id = str(job.get("schema_id") or "").strip()
    if not stored_schema_id:
        raise ValueError("Rename + Remap job metadata is incomplete")
    if payload.schemaId != stored_schema_id:
        raise ValueError("Rename + Remap job schema mismatch")

    stored_credit_breakdown = job.get("credit_breakdown")
    if not isinstance(stored_credit_breakdown, dict):
        stored_credit_breakdown = payload.creditBreakdown

    return payload.model_copy(
        update={
            "requestId": str(job.get("request_id") or "").strip() or payload.requestId or payload.jobId,
            "sessionId": stored_session_id or payload.sessionId,
            "schemaId": stored_schema_id,
            "userId": trusted_user_id,
            "userRole": str(job.get("user_role") or "").strip() or payload.userRole,
            "credits": int(job.get("credits") or payload.credits or 0),
            "creditsCharged": bool(job.get("credits_charged")) if "credits_charged" in job else payload.creditsCharged,
            "creditBreakdown": stored_credit_breakdown,
        }
    )


@app.post("/internal/rename-remap")
async def run_rename_remap_job(
    payload: RenameRemapJobRequest,
    authorization: Optional[str] = Header(default=None),
    x_cloud_tasks_taskretrycount: Optional[str] = Header(
        default=None,
        alias="X-CloudTasks-TaskRetryCount",
    ),
) -> Dict[str, Any]:
    try:
        _require_internal_auth(authorization)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else "Rename + Remap worker request rejected"
        logger.warning("Rename + Remap job %s rejected before start: %s", payload.jobId, detail)
        raise

    job = get_openai_job(payload.jobId)
    if not job:
        logger.warning("Rename + Remap job %s rejected: metadata not found", payload.jobId)
        return _reject_job_request(payload.jobId, "Rename + Remap job metadata not found", source="rename_remap.worker")

    status = str(job.get("status") or "").strip().lower()
    if status == OPENAI_JOB_STATUS_COMPLETE:
        return {"jobId": payload.jobId, "status": OPENAI_JOB_STATUS_COMPLETE}
    if status == OPENAI_JOB_STATUS_FAILED:
        return {
            "jobId": payload.jobId,
            "status": OPENAI_JOB_STATUS_FAILED,
            "error": job.get("error") or "Rename + Remap job failed",
        }

    if str(job.get("job_type") or "").strip() != OPENAI_JOB_TYPE_RENAME_REMAP:
        logger.warning("Rename + Remap job %s rejected: unexpected job type", payload.jobId)
        return _reject_job_request(payload.jobId, "Rename + Remap job type mismatch", source="rename_remap.worker")

    try:
        payload = _bind_rename_remap_payload_to_job(payload, job)
    except ValueError as exc:
        logger.warning("Rename + Remap job %s rejected: %s", payload.jobId, exc)
        return _reject_job_request(payload.jobId, str(exc), source="rename_remap.worker")

    retry_count = _parse_retry_count(x_cloud_tasks_taskretrycount)
    attempt_count = retry_count + 1
    usage_events = coerce_usage_events(job.get("openai_usage_events"))
    usage_summary = (
        dict(job.get("openai_usage_summary"))
        if isinstance(job.get("openai_usage_summary"), dict)
        else build_openai_usage_summary(usage_events)
    )

    update_openai_job(
        job_id=payload.jobId,
        status=OPENAI_JOB_STATUS_RUNNING,
        error="",
        started_at=now_iso(),
        openai_usage_summary=usage_summary,
        openai_usage_events=usage_events,
        attempt_count=attempt_count,
    )

    def _fail_rename_remap(message: str) -> Dict[str, Any]:
        return _finish_failure(
            job_id=payload.jobId,
            user_id=payload.userId,
            user_role=payload.userRole,
            credits=payload.credits,
            credits_charged=payload.creditsCharged,
            request_id=payload.requestId,
            credit_breakdown=payload.creditBreakdown,
            message=message,
            source="rename_remap.worker",
            openai_usage_events=usage_events,
            openai_usage_summary=usage_summary,
            attempt_count=attempt_count,
        )

    try:
        user = RequestUser(
            uid=payload.userId,
            app_user_id=payload.userId,
            role=payload.userRole,
        )
        entry = _get_session_entry(
            payload.sessionId,
            user,
            include_result=True,
            include_renames=False,
            include_checkbox_rules=False,
            force_l2=True,
        )
        _ensure_session_ai_accessible(
            user_id=payload.userId,
            session_id=payload.sessionId,
            session_entry=entry,
        )
        pdf_bytes = entry.get("pdf_bytes")
        if not pdf_bytes:
            raise HTTPException(status_code=404, detail="Session PDF not found")

        parsed_template_fields = _parse_template_fields(payload.templateFields)
        rename_fields: List[Dict[str, Any]]
        if parsed_template_fields:
            rename_fields = template_fields_to_rename_fields(parsed_template_fields)
        else:
            rename_fields = list(entry.get("fields") or [])
        if not rename_fields:
            raise HTTPException(status_code=400, detail="No fields available for rename")

        schema = get_schema(payload.schemaId, payload.userId)
        if not schema:
            raise HTTPException(status_code=404, detail="Schema not found")
        allowlist = build_allowlist_payload(schema.fields, [])
        schema_fields = allowlist.get("schemaFields") or []
        if not schema_fields:
            raise HTTPException(status_code=400, detail="Schema fields are required for rename")
        try:
            validate_payload_size(allowlist)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        database_fields = [field.get("name") for field in schema_fields if field.get("name")]

        page_count = entry.get("page_count") or get_pdf_page_count(pdf_bytes)
        rename_report, renamed_fields = run_openai_rename_on_pdf(
            pdf_bytes=pdf_bytes,
            pdf_name=entry.get("source_pdf") or "document.pdf",
            fields=rename_fields,
            database_fields=database_fields,
            detector_candidates_by_page=(entry.get("result") or {}).get("detectorCandidatesByPage"),
            openai_max_retries=_worker_openai_max_retries(),
        )
        attempt_usage_events = coerce_usage_events(rename_report.get("usageByPage"))
        usage_events = merge_usage_events(
            usage_events,
            attempt_usage_events,
            attempt=attempt_count,
        )
        report_model = rename_report.get("model")
        usage_summary = build_openai_usage_summary(
            usage_events,
            model=report_model if isinstance(report_model, str) else None,
        )

        mapping_results = build_combined_rename_mapping_payload(
            schema.fields,
            renamed_fields,
            checkbox_rules=rename_report.get("checkboxRules") or [],
        )
        final_fields = apply_mapping_results_to_fields(renamed_fields, mapping_results)
        checkbox_rules = list(mapping_results.get("checkboxRules") or [])
        text_transform_rules = list(mapping_results.get("textTransformRules") or [])
        entry["fields"] = final_fields
        entry["renames"] = rename_report
        entry["checkboxRules"] = checkbox_rules
        entry.pop("checkboxHints", None)
        entry["textTransformRules"] = text_transform_rules
        entry["page_count"] = page_count
        _update_session_entry(
            payload.sessionId,
            entry,
            persist_fields=True,
            persist_renames=True,
            persist_checkbox_rules=True,
            persist_text_transform_rules=True,
        )

        resolved_request_id = (
            payload.requestId
            or str(job.get("request_id") or "").strip()
            or payload.jobId
        )
        result = {
            "success": True,
            "requestId": resolved_request_id,
            "sessionId": payload.sessionId,
            "schemaId": payload.schemaId,
            "renames": rename_report,
            "fields": final_fields,
            "checkboxRules": checkbox_rules,
            "mappingResults": mapping_results,
            "openaiUsage": usage_summary,
            "openaiUsageEvents": usage_events,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }
        update_openai_job(
            job_id=payload.jobId,
            status=OPENAI_JOB_STATUS_COMPLETE,
            error="",
            result=result,
            completed_at=now_iso(),
            openai_usage_summary=usage_summary,
            openai_usage_events=usage_events,
            attempt_count=attempt_count,
        )
        return {
            "jobId": payload.jobId,
            "status": OPENAI_JOB_STATUS_COMPLETE,
            "fieldCount": len(final_fields),
            "mappingCount": len(mapping_results.get("mappings") or []),
            "openaiUsage": usage_summary,
        }
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else "Rename + Remap job rejected"
        if exc.status_code < 500 or _should_finalize_failure(retry_count):
            logger.warning("Rename + Remap job %s failed: %s", payload.jobId, detail)
            return _fail_rename_remap(str(detail))
        raise HTTPException(
            status_code=500,
            detail="Rename + Remap worker failed; retrying",
            headers=_retry_headers(),
        ) from exc
    except Exception as exc:
        if is_insufficient_quota_error(exc):
            message = f"OpenAI insufficient_quota: {exc}"
            logger.warning("Rename + Remap job %s terminal failure: %s", payload.jobId, message)
            return _fail_rename_remap(message)
        logger.exception("Rename + Remap job %s failed: %s", payload.jobId, exc)
        if _should_finalize_failure(retry_count):
            message = f"Rename + Remap failed after {retry_count + 1} attempts: {exc}"
            return _fail_rename_remap(message)
        raise HTTPException(
            status_code=500,
            detail="Rename + Remap worker failed; retrying",
            headers=_retry_headers(),
        ) from exc


def _bind_remap_payload_to_job(payload: RemapJobRequest, job: Dict[str, Any]) -> RemapJobRequest:
    trusted_user_id = str(job.get("user_id") or "").strip()
    if not trusted_user_id:
        raise ValueError("Schema mapping job metadata is incomplete")
    if payload.userId != trusted_user_id:
        raise ValueError("Schema mapping job user mismatch")

    stored_schema_id = str(job.get("schema_id") or "").strip()
    if not stored_schema_id:
        raise ValueError("Schema mapping job metadata is incomplete")
    if payload.schemaId != stored_schema_id:
        raise ValueError("Schema mapping job schema mismatch")

    stored_session_id = str(job.get("session_id") or "").strip() or None
    if stored_session_id and payload.sessionId and payload.sessionId != stored_session_id:
        raise ValueError("Schema mapping job session mismatch")

    stored_template_id = str(job.get("template_id") or "").strip() or None
    if stored_template_id and payload.templateId and payload.templateId != stored_template_id:
        raise ValueError("Schema mapping job template mismatch")

    stored_credit_breakdown = job.get("credit_breakdown")
    if not isinstance(stored_credit_breakdown, dict):
        stored_credit_breakdown = payload.creditBreakdown

    return payload.model_copy(
        update={
            "requestId": str(job.get("request_id") or "").strip() or payload.requestId or payload.jobId,
            "schemaId": stored_schema_id,
            "templateId": stored_template_id or payload.templateId,
            "sessionId": stored_session_id or payload.sessionId,
            "userId": trusted_user_id,
            "userRole": str(job.get("user_role") or "").strip() or payload.userRole,
            "credits": int(job.get("credits") or payload.credits or 0),
            "creditsCharged": bool(job.get("credits_charged")) if "credits_charged" in job else payload.creditsCharged,
            "creditBreakdown": stored_credit_breakdown,
        }
    )


@app.post("/internal/remap")
async def run_remap_job(
    payload: RemapJobRequest,
    authorization: Optional[str] = Header(default=None),
    x_cloud_tasks_taskretrycount: Optional[str] = Header(
        default=None,
        alias="X-CloudTasks-TaskRetryCount",
    ),
) -> Dict[str, Any]:
    try:
        _require_internal_auth(authorization)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else "Schema mapping worker request rejected"
        logger.warning("Schema mapping job %s rejected before start: %s", payload.jobId, detail)
        raise

    job = get_openai_job(payload.jobId)
    if not job:
        logger.warning("Schema mapping job %s rejected: metadata not found", payload.jobId)
        return _reject_job_request(payload.jobId, "Schema mapping job metadata not found", source="remap.worker")

    status = str(job.get("status") or "").strip().lower()
    if status == OPENAI_JOB_STATUS_COMPLETE:
        return {"jobId": payload.jobId, "status": OPENAI_JOB_STATUS_COMPLETE}
    if status == OPENAI_JOB_STATUS_FAILED:
        return {
            "jobId": payload.jobId,
            "status": OPENAI_JOB_STATUS_FAILED,
            "error": job.get("error") or "Schema mapping job failed",
        }

    try:
        payload = _bind_remap_payload_to_job(payload, job)
    except ValueError as exc:
        logger.warning("Schema mapping job %s rejected: %s", payload.jobId, exc)
        return _reject_job_request(payload.jobId, str(exc), source="remap.worker")

    retry_count = _parse_retry_count(x_cloud_tasks_taskretrycount)
    attempt_count = retry_count + 1
    usage_events = coerce_usage_events(job.get("openai_usage_events"))
    usage_summary = (
        dict(job.get("openai_usage_summary"))
        if isinstance(job.get("openai_usage_summary"), dict)
        else build_openai_usage_summary(usage_events)
    )

    update_openai_job(
        job_id=payload.jobId,
        status=OPENAI_JOB_STATUS_RUNNING,
        error="",
        started_at=now_iso(),
        openai_usage_summary=usage_summary,
        openai_usage_events=usage_events,
        attempt_count=attempt_count,
    )

    def _fail_remap(message: str) -> Dict[str, Any]:
        return _finish_failure(
            job_id=payload.jobId,
            user_id=payload.userId,
            user_role=payload.userRole,
            credits=payload.credits,
            credits_charged=payload.creditsCharged,
            request_id=payload.requestId,
            credit_breakdown=payload.creditBreakdown,
            message=message,
            source="remap.worker",
            openai_usage_events=usage_events,
            openai_usage_summary=usage_summary,
            attempt_count=attempt_count,
        )

    try:
        schema = get_schema(payload.schemaId, payload.userId)
        if not schema:
            raise HTTPException(status_code=404, detail="Schema not found")

        if payload.templateId:
            _ensure_template_ai_accessible(payload.userId, payload.templateId)
            template = get_template(payload.templateId, payload.userId)
            if not template:
                raise HTTPException(status_code=403, detail="Template access denied")
        elif not payload.sessionId:
            raise HTTPException(status_code=400, detail="sessionId or templateId is required")

        parsed_template_fields = _parse_template_fields(payload.templateFields or [])
        if not parsed_template_fields:
            raise HTTPException(status_code=400, detail="templateFields is required")
        template_fields = [field.model_dump() for field in parsed_template_fields]

        allowlist_payload = build_allowlist_payload(schema.fields, template_fields)
        template_tags = allowlist_payload.get("templateTags") or []
        if not template_tags:
            raise HTTPException(status_code=400, detail="No valid template tags provided")

        session_entry = None
        if payload.sessionId:
            user = RequestUser(
                uid=payload.userId,
                app_user_id=payload.userId,
                role=payload.userRole,
            )
            session_entry = _get_session_entry(
                payload.sessionId,
                user,
                include_pdf_bytes=False,
                include_fields=False,
                include_result=False,
                include_renames=False,
                include_checkbox_rules=False,
            )
            _ensure_session_ai_accessible(
                user_id=payload.userId,
                session_id=payload.sessionId,
                session_entry=session_entry,
            )

        remap_seed_response, remap_openai_payload = prepare_incremental_remap_ai_payload(
            allowlist_payload.get("schemaFields") or [],
            allowlist_payload.get("templateTags") or [],
        )
        if remap_openai_payload is None:
            logger.info(
                "Schema remap job %s resolved locally without OpenAI (schema=%s tags=%s local_matches=%s)",
                payload.jobId,
                len(allowlist_payload.get("schemaFields") or []),
                len(allowlist_payload.get("templateTags") or []),
                len(remap_seed_response.get("mappings") or []),
            )
        else:
            logger.info(
                "Schema remap job %s pre-resolved %s tags locally and sent %s tags to OpenAI",
                payload.jobId,
                len(remap_seed_response.get("mappings") or []),
                len(remap_openai_payload.get("templateTags") or []),
            )

        attempt_usage_events: List[Dict[str, Any]] = []
        openai_response: Dict[str, Any] | None = None
        if remap_openai_payload is not None:
            openai_response = call_openai_schema_mapping_chunked(
                remap_openai_payload,
                usage_collector=attempt_usage_events,
                openai_max_retries=_worker_openai_max_retries(),
            )
        ai_response = merge_schema_mapping_ai_responses(remap_seed_response, openai_response)
        usage_events = merge_usage_events(
            usage_events,
            attempt_usage_events,
            attempt=attempt_count,
        )
        usage_summary = build_openai_usage_summary(usage_events, model=OPENAI_SCHEMA_MODEL)
        mapping_results = build_schema_mapping_payload(
            allowlist_payload.get("schemaFields") or [],
            allowlist_payload.get("templateTags") or [],
            ai_response,
        )

        if session_entry and payload.sessionId:
            persist_rules = False
            persist_text_rules = False
            if isinstance(mapping_results, dict):
                checkbox_rules = list(mapping_results.get("checkboxRules") or [])
                session_entry["checkboxRules"] = checkbox_rules
                persist_rules = True
                session_entry.pop("checkboxHints", None)
                text_transform_rules = list(mapping_results.get("textTransformRules") or [])
                session_entry["textTransformRules"] = text_transform_rules
                persist_text_rules = True
            _update_session_entry(
                payload.sessionId,
                session_entry,
                persist_checkbox_rules=persist_rules,
                persist_text_transform_rules=persist_text_rules,
            )

        resolved_request_id = (
            payload.requestId
            or str(job.get("request_id") or "").strip()
            or payload.jobId
        )
        result = {
            "success": True,
            "requestId": resolved_request_id,
            "schemaId": schema.id,
            "mappingResults": mapping_results,
            "openaiUsage": usage_summary,
            "openaiUsageEvents": usage_events,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }
        update_openai_job(
            job_id=payload.jobId,
            status=OPENAI_JOB_STATUS_COMPLETE,
            error="",
            result=result,
            completed_at=now_iso(),
            openai_usage_summary=usage_summary,
            openai_usage_events=usage_events,
            attempt_count=attempt_count,
        )
        return {
            "jobId": payload.jobId,
            "status": OPENAI_JOB_STATUS_COMPLETE,
            "mappingCount": len(mapping_results.get("mappings") or []),
            "openaiUsage": usage_summary,
        }
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else "Schema mapping job rejected"
        if exc.status_code < 500 or _should_finalize_failure(retry_count):
            logger.warning("Schema mapping job %s failed: %s", payload.jobId, detail)
            return _fail_remap(str(detail))
        raise HTTPException(
            status_code=500,
            detail="Schema mapping worker failed; retrying",
            headers=_retry_headers(),
        ) from exc
    except ValueError as exc:
        if _should_finalize_failure(retry_count):
            return _fail_remap(str(exc))
        raise HTTPException(
            status_code=500,
            detail="Schema mapping worker failed; retrying",
            headers=_retry_headers(),
        ) from exc
    except Exception as exc:
        if is_insufficient_quota_error(exc):
            message = f"OpenAI insufficient_quota: {exc}"
            logger.warning("Schema mapping job %s terminal failure: %s", payload.jobId, message)
            return _fail_remap(message)
        logger.exception("Schema mapping job %s failed: %s", payload.jobId, exc)
        if _should_finalize_failure(retry_count):
            message = f"Schema mapping failed after {retry_count + 1} attempts: {exc}"
            return _fail_remap(message)
        raise HTTPException(
            status_code=500,
            detail="Schema mapping worker failed; retrying",
            headers=_retry_headers(),
        ) from exc


# ---------------------------------------------------------------------------
# Image fill job models + handler
# ---------------------------------------------------------------------------


class ImageFillJobRequest(BaseModel):
    jobId: str = Field(..., min_length=1)
    sessionId: str = Field(..., min_length=1)
    userId: str = Field(..., min_length=1)
    userRole: Optional[str] = None
    fields: List[Dict[str, Any]]
    gcsFileUris: List[str] = Field(..., min_length=1)
    credits: int = 0
    creditsCharged: bool = False
    creditBreakdown: Optional[Dict[str, int]] = None


def _bind_image_fill_payload_to_job(
    payload: ImageFillJobRequest,
    job: Dict[str, Any],
) -> ImageFillJobRequest:
    trusted_user_id = str(job.get("user_id") or "").strip()
    if not trusted_user_id:
        raise ValueError("Image fill job metadata is incomplete")
    if payload.userId != trusted_user_id:
        raise ValueError("Image fill job user mismatch")

    stored_session_id = str(job.get("session_id") or "").strip()
    if stored_session_id and payload.sessionId != stored_session_id:
        raise ValueError("Image fill job session mismatch")

    stored_credit_breakdown = job.get("credit_breakdown")
    if not isinstance(stored_credit_breakdown, dict):
        stored_credit_breakdown = payload.creditBreakdown

    return payload.model_copy(
        update={
            "sessionId": stored_session_id or payload.sessionId,
            "userId": trusted_user_id,
            "userRole": str(job.get("user_role") or "").strip() or payload.userRole,
            "credits": int(job.get("credits") or payload.credits or 0),
            "creditsCharged": bool(job.get("credits_charged")) if "credits_charged" in job else payload.creditsCharged,
            "creditBreakdown": stored_credit_breakdown,
        },
    )


def _download_gcs_files(gcs_uris: List[str]) -> List[Dict[str, Any]]:
    """Download files from GCS URIs and return as list of {filename, bytes}."""
    from google.cloud import storage as gcs_storage

    client = gcs_storage.Client()
    files: List[Dict[str, Any]] = []
    for uri in gcs_uris:
        if not uri.startswith("gs://"):
            raise ValueError(f"Invalid GCS URI: {uri}")
        path = uri[5:]
        bucket_name, _, blob_name = path.partition("/")
        if not bucket_name or not blob_name:
            raise ValueError(f"Invalid GCS URI: {uri}")
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        data = blob.download_as_bytes()
        filename = blob_name.rsplit("/", 1)[-1] if "/" in blob_name else blob_name
        files.append({"filename": filename, "bytes": data})
    return files


@app.post("/internal/image-fill")
async def run_image_fill_job(
    payload: ImageFillJobRequest,
    authorization: Optional[str] = Header(default=None),
    x_cloud_tasks_taskretrycount: Optional[str] = Header(
        default=None,
        alias="X-CloudTasks-TaskRetryCount",
    ),
) -> Dict[str, Any]:
    try:
        _require_internal_auth(authorization)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else "Image fill worker request rejected"
        logger.warning("Image fill job %s rejected before start: %s", payload.jobId, detail)
        raise

    job = get_openai_job(payload.jobId)
    if not job:
        logger.warning("Image fill job %s rejected: metadata not found", payload.jobId)
        return _reject_job_request(payload.jobId, "Image fill job metadata not found", source="image_fill.worker")

    status = str(job.get("status") or "").strip().lower()
    if status == OPENAI_JOB_STATUS_COMPLETE:
        return {"jobId": payload.jobId, "status": OPENAI_JOB_STATUS_COMPLETE}
    if status == OPENAI_JOB_STATUS_FAILED:
        return {
            "jobId": payload.jobId,
            "status": OPENAI_JOB_STATUS_FAILED,
            "error": job.get("error") or "Image fill job failed",
        }

    try:
        payload = _bind_image_fill_payload_to_job(payload, job)
    except ValueError as exc:
        logger.warning("Image fill job %s rejected: %s", payload.jobId, exc)
        return _reject_job_request(payload.jobId, str(exc), source="image_fill.worker")

    retry_count = _parse_retry_count(x_cloud_tasks_taskretrycount)
    attempt_count = retry_count + 1

    update_openai_job(
        job_id=payload.jobId,
        status=OPENAI_JOB_STATUS_RUNNING,
        error="",
        started_at=now_iso(),
        attempt_count=attempt_count,
    )

    def _fail_image_fill(message: str) -> Dict[str, Any]:
        return _finish_failure(
            job_id=payload.jobId,
            user_id=payload.userId,
            user_role=payload.userRole,
            credits=payload.credits,
            credits_charged=payload.creditsCharged,
            request_id=payload.jobId,
            credit_breakdown=payload.creditBreakdown,
            message=message,
            source="image_fill.worker",
            attempt_count=attempt_count,
        )

    try:
        user = RequestUser(
            uid=payload.userId,
            app_user_id=payload.userId,
            role=payload.userRole,
        )
        entry = _get_session_entry(
            payload.sessionId,
            user,
            include_result=True,
            include_renames=False,
            include_checkbox_rules=False,
            force_l2=True,
        )
        pdf_bytes = entry.get("pdf_bytes")
        if not pdf_bytes:
            raise HTTPException(status_code=404, detail="Session PDF not found")

        uploaded_files = _download_gcs_files(payload.gcsFileUris)

        result = run_image_fill(
            uploaded_files=uploaded_files,
            template_pdf_bytes=pdf_bytes,
            fields=payload.fields,
        )

        credit_pricing = job.get("credit_pricing")
        job_result = {
            "success": True,
            "fields": result.get("fields", []),
            "usage": result.get("usage", {}),
            "creditPricing": credit_pricing if isinstance(credit_pricing, dict) else {},
        }
        update_openai_job(
            job_id=payload.jobId,
            status=OPENAI_JOB_STATUS_COMPLETE,
            error="",
            result=job_result,
            completed_at=now_iso(),
            attempt_count=attempt_count,
        )
        return {
            "jobId": payload.jobId,
            "status": OPENAI_JOB_STATUS_COMPLETE,
            "fieldCount": len(result.get("fields", [])),
        }
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else "Image fill job rejected"
        if exc.status_code < 500 or _should_finalize_failure(retry_count):
            logger.warning("Image fill job %s failed: %s", payload.jobId, detail)
            return _fail_image_fill(str(detail))
        raise HTTPException(
            status_code=500,
            detail="Image fill worker failed; retrying",
            headers=_retry_headers(),
        ) from exc
    except Exception as exc:
        if is_insufficient_quota_error(exc):
            message = f"OpenAI insufficient_quota: {exc}"
            logger.warning("Image fill job %s terminal failure: %s", payload.jobId, message)
            return _fail_image_fill(message)
        logger.exception("Image fill job %s failed: %s", payload.jobId, exc)
        if _should_finalize_failure(retry_count):
            message = f"Image fill failed after {retry_count + 1} attempts: {exc}"
            return _fail_image_fill(message)
        raise HTTPException(
            status_code=500,
            detail="Image fill worker failed; retrying",
            headers=_retry_headers(),
        ) from exc


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}
