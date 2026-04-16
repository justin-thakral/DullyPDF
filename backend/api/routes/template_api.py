"""Authenticated owner endpoints for published API Fill templates."""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Response

from backend.api.schemas import TemplateApiEndpointPublishRequest
from backend.firebaseDB.group_database import get_group
from backend.firebaseDB.template_api_endpoint_database import (
    count_active_template_api_endpoints,
    create_template_api_endpoint_event,
    get_template_api_endpoint,
    get_template_api_monthly_usage,
    list_template_api_endpoints,
    list_template_api_endpoint_events,
    publish_or_republish_template_api_endpoint,
    rotate_template_api_endpoint_secret_atomic,
    revoke_template_api_endpoint_atomic,
    TemplateApiActiveEndpointLimitError,
    TemplateApiEndpointStatusError,
)
from backend.logging_config import get_logger
from backend.firebaseDB.template_database import get_template
from backend.firebaseDB.user_database import get_user_profile, normalize_role
from backend.services.auth_service import require_user
from backend.services.downgrade_retention_service import is_user_retention_template_locked
from backend.services.limits_service import (
    check_group_fill_quota,
    resolve_template_api_active_limit,
    resolve_template_api_max_pages,
    resolve_template_api_requests_monthly_limit,
)
from backend.services.saved_form_snapshot_service import load_saved_form_editor_snapshot
from backend.services.template_api_service import (
    build_group_template_api_schema,
    build_group_template_api_snapshot,
    build_template_api_key_prefix,
    build_template_api_schema,
    build_template_api_snapshot,
    generate_template_api_secret,
    group_template_api_pdf_count,
    group_template_api_total_page_count,
    hash_template_api_secret,
    is_group_template_api_snapshot,
)


router = APIRouter()
logger = get_logger(__name__)


def _apply_private_cache_headers(response: Response) -> None:
    response.headers["Cache-Control"] = "private, no-store"


def _serialize_endpoint(record) -> Dict[str, Any]:
    scope_type = (record.scope_type or "template")
    fill_path = (
        f"/api/v1/fill/{record.id}.zip"
        if scope_type == "group"
        else f"/api/v1/fill/{record.id}.pdf"
    )
    return {
        "id": record.id,
        "scopeType": scope_type,
        "templateId": record.template_id or None,
        "templateName": record.template_name,
        "groupId": record.group_id,
        "groupName": record.group_name,
        "status": record.status,
        "snapshotVersion": record.snapshot_version,
        "keyPrefix": record.key_prefix,
        "createdAt": record.created_at,
        "updatedAt": record.updated_at,
        "publishedAt": record.published_at,
        "lastUsedAt": record.last_used_at,
        "usageCount": record.usage_count,
        "currentUsageMonth": record.current_usage_month,
        "currentMonthUsageCount": record.current_month_usage_count,
        "authFailureCount": record.auth_failure_count,
        "validationFailureCount": record.validation_failure_count,
        "runtimeFailureCount": record.runtime_failure_count,
        "suspiciousFailureCount": record.suspicious_failure_count,
        "lastFailureAt": record.last_failure_at,
        "lastFailureReason": record.last_failure_reason,
        "auditEventCount": record.audit_event_count,
        "fillPath": fill_path,
        "schemaPath": f"/api/template-api-endpoints/{record.id}/schema",
    }


def _resolve_role_for_user(user) -> str:
    profile = get_user_profile(user.app_user_id)
    return normalize_role(profile.role if profile else user.role)


def _resolve_endpoint_page_count(record_snapshot: Optional[Dict[str, Any]]) -> int:
    """Page count for either a template snapshot or a group bundle."""

    if not isinstance(record_snapshot, dict):
        return 0
    if is_group_template_api_snapshot(record_snapshot):
        return group_template_api_total_page_count(record_snapshot)
    try:
        return max(0, int(record_snapshot.get("pageCount") or 0))
    except (TypeError, ValueError):
        return 0


def _build_owner_limit_summary(*, user_id: str, role: str, current_endpoint=None) -> Dict[str, Any]:
    monthly_usage = get_template_api_monthly_usage(user_id)
    active_count = count_active_template_api_endpoints(user_id)
    template_page_count = (
        _resolve_endpoint_page_count(current_endpoint.snapshot)
        if current_endpoint is not None
        else 0
    )
    return {
        "activeEndpointsMax": resolve_template_api_active_limit(role),
        "activeEndpointsUsed": active_count,
        "requestsPerMonthMax": resolve_template_api_requests_monthly_limit(role),
        "requestsThisMonth": monthly_usage.request_count if monthly_usage is not None else 0,
        "requestUsageMonth": monthly_usage.month_key if monthly_usage is not None else None,
        "maxPagesPerRequest": resolve_template_api_max_pages(role),
        "templatePageCount": template_page_count,
    }


def _build_owner_limit_summary_fallback(*, role: str, current_endpoint=None) -> Dict[str, Any]:
    template_page_count = (
        _resolve_endpoint_page_count(current_endpoint.snapshot)
        if current_endpoint is not None
        else 0
    )
    return {
        "activeEndpointsMax": resolve_template_api_active_limit(role),
        "activeEndpointsUsed": 1 if current_endpoint is not None and current_endpoint.status == "active" else 0,
        "requestsPerMonthMax": resolve_template_api_requests_monthly_limit(role),
        "requestsThisMonth": 0,
        "requestUsageMonth": current_endpoint.current_usage_month if current_endpoint is not None else None,
        "maxPagesPerRequest": resolve_template_api_max_pages(role),
        "templatePageCount": template_page_count,
    }


def _build_owner_limit_summary_best_effort(
    *,
    user_id: str,
    role: str,
    current_endpoint=None,
    active_endpoints_used: Optional[int] = None,
    request_usage_month: Optional[str] = None,
    fallback_endpoints_loader: Optional[Callable[[], list[Any]]] = None,
    log_label: str,
) -> Dict[str, Any]:
    try:
        return _build_owner_limit_summary(user_id=user_id, role=role, current_endpoint=current_endpoint)
    except Exception as exc:
        logger.warning(
            "Failed to load API Fill owner limits %s: %s",
            log_label,
            exc,
        )
        fallback_endpoints: list[Any] = []
        if fallback_endpoints_loader is not None:
            try:
                fallback_endpoints = list(fallback_endpoints_loader() or [])
            except Exception as loader_exc:
                logger.warning(
                    "Failed to load API Fill owner fallback endpoint context %s: %s",
                    log_label,
                    loader_exc,
                )
        fallback = _build_owner_limit_summary_fallback(role=role, current_endpoint=current_endpoint)
        if active_endpoints_used is None and fallback_endpoints:
            active_endpoints_used = sum(1 for record in fallback_endpoints if getattr(record, "status", None) == "active")
        if request_usage_month is None and fallback_endpoints:
            request_usage_month = next(
                (
                    str(getattr(record, "current_usage_month", "") or "").strip() or None
                    for record in fallback_endpoints
                    if str(getattr(record, "current_usage_month", "") or "").strip()
                ),
                None,
            )
        if active_endpoints_used is not None:
            fallback["activeEndpointsUsed"] = max(0, int(active_endpoints_used))
        if request_usage_month is not None:
            fallback["requestUsageMonth"] = request_usage_month
        return fallback


def _list_owner_recent_events_best_effort(*, endpoint_id: str, user_id: str) -> list[Dict[str, Any]]:
    try:
        return [
            _serialize_event(event)
            for event in list_template_api_endpoint_events(endpoint_id, user_id=user_id)
        ]
    except Exception as exc:
        logger.warning(
            "Failed to load API Fill owner recent events for endpoint %s: %s",
            endpoint_id,
            exc,
        )
        return []


def _build_event_summary(event_type: str, outcome: str) -> str:
    normalized_event = str(event_type or "").strip()
    normalized_outcome = str(outcome or "success").strip() or "success"
    mapping = {
        "published": "Endpoint published",
        "republished": "Snapshot republished",
        "rotated": "API key rotated",
        "revoked": "Endpoint revoked",
        "fill_succeeded": "PDF generated",
        "fill_validation_failed": "Invalid fill payload rejected",
        "fill_runtime_failed": "PDF generation failed",
        "fill_auth_failed": "Invalid API key rejected",
        "fill_rate_limited": "Rate limit blocked a request",
        "fill_plan_blocked": "Plan limits blocked a request",
        "fill_quota_blocked": "Plan quota blocked a request",
    }
    base = mapping.get(normalized_event, normalized_event.replace("_", " ").strip().title() or "Activity")
    if normalized_outcome == "error":
        return f"{base} with an error"
    if normalized_outcome == "denied":
        return f"{base} (denied)"
    return base


def _serialize_event(record) -> Dict[str, Any]:
    return {
        "id": record.id,
        "eventType": record.event_type,
        "outcome": record.outcome,
        "createdAt": record.created_at,
        "snapshotVersion": record.snapshot_version,
        "summary": _build_event_summary(record.event_type, record.outcome),
        "metadata": record.metadata,
    }


def _build_endpoint_schema_or_raise(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """Return the public JSON schema for either a template or group snapshot."""

    try:
        if is_group_template_api_snapshot(snapshot):
            return build_group_template_api_schema(snapshot)
        return build_template_api_schema(snapshot)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


def _build_owner_details_payload(record, *, role: str, include_schema: bool = True) -> Dict[str, Any]:
    snapshot = dict(record.snapshot or {})
    payload: Dict[str, Any] = {
        "endpoint": _serialize_endpoint(record),
        "limits": _build_owner_limit_summary_best_effort(
            user_id=record.user_id,
            role=role,
            current_endpoint=record,
            fallback_endpoints_loader=lambda: list_template_api_endpoints(record.user_id),
            log_label=f"for endpoint {record.id}",
        ),
        "recentEvents": _list_owner_recent_events_best_effort(endpoint_id=record.id, user_id=record.user_id),
    }
    if include_schema:
        if not snapshot:
            raise HTTPException(status_code=404, detail="API Fill snapshot is missing")
        payload["schema"] = _build_endpoint_schema_or_raise(snapshot)
    return payload


def _build_owner_mutation_payload(
    record,
    *,
    role: str,
    include_schema: bool = True,
    schema: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "endpoint": _serialize_endpoint(record),
    }
    payload["limits"] = _build_owner_limit_summary_best_effort(
        user_id=record.user_id,
        role=role,
        current_endpoint=record,
        fallback_endpoints_loader=lambda: list_template_api_endpoints(record.user_id),
        log_label=f"after lifecycle mutation for endpoint {record.id}",
    )
    payload["recentEvents"] = _list_owner_recent_events_best_effort(endpoint_id=record.id, user_id=record.user_id)
    if include_schema:
        if schema is not None:
            payload["schema"] = schema
        else:
            payload["schema"] = _build_endpoint_schema_or_raise(dict(record.snapshot or {}))
    return payload


def _resolve_template_or_404(template_id: str, user_id: str):
    template = get_template(template_id, user_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Saved form not found")
    if is_user_retention_template_locked(user_id, template.id):
        raise HTTPException(
            status_code=409,
            detail="This saved form is locked on the base plan. Upgrade before publishing or republishing API Fill for it.",
        )
    return template


def _build_snapshot_or_400(template, *, export_mode: str) -> Dict[str, Any]:
    try:
        return build_template_api_snapshot(template, export_mode=export_mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _resolve_group_or_404(group_id: str, user_id: str):
    group = get_group(group_id, user_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Workflow group not found")
    return group


def _build_group_template_sources_or_400(
    group,
    user_id: str,
) -> tuple[list[Any], list[Dict[str, Any]]]:
    """Load every template in ``group`` and produce the source dicts the
    canonical schema service expects.

    Reuses the same persistence path as Phase 2's ``GET /api/groups/{id}/canonical-schema``
    so a published API Fill group endpoint will see the exact same field shapes
    that Phase 2's preview surface shows the workspace.
    """

    template_records: list[Any] = []
    template_sources: list[Dict[str, Any]] = []
    for template_id in group.template_ids:
        template_record = get_template(template_id, user_id)
        if template_record is None:
            raise HTTPException(
                status_code=404,
                detail=f"Saved form {template_id!r} in this group is no longer available.",
            )
        if is_user_retention_template_locked(user_id, template_record.id):
            raise HTTPException(
                status_code=409,
                detail="One or more saved forms in this group are locked on the base plan. Upgrade before publishing API Fill for the group.",
            )
        editor_snapshot = load_saved_form_editor_snapshot(template_record.metadata)
        if not editor_snapshot:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Saved form {template_id!r} does not have an editor snapshot yet. "
                    "Open it in the workspace and save before publishing API Fill for this group."
                ),
            )
        fields = editor_snapshot.get("fields") if isinstance(editor_snapshot, dict) else None
        if not isinstance(fields, list) or not fields:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Saved form {template_id!r} has no fields detected yet. "
                    "Run field detection in the workspace before publishing API Fill for this group."
                ),
            )
        metadata = template_record.metadata if isinstance(template_record.metadata, dict) else {}
        fill_rules_root = metadata.get("fillRules") if isinstance(metadata.get("fillRules"), dict) else {}
        checkbox_rules_raw = (
            fill_rules_root.get("checkboxRules")
            if isinstance(fill_rules_root.get("checkboxRules"), list)
            else metadata.get("checkboxRules")
        )
        checkbox_rules = (
            [dict(entry) for entry in checkbox_rules_raw if isinstance(entry, dict)]
            if isinstance(checkbox_rules_raw, list)
            else []
        )
        try:
            page_count = int(editor_snapshot.get("pageCount") or 0) if isinstance(editor_snapshot, dict) else 0
        except (TypeError, ValueError):
            page_count = 0
        template_records.append(template_record)
        template_sources.append(
            {
                "templateId": template_record.id,
                "templateName": template_record.name or template_record.id,
                "fields": fields,
                "checkboxRules": checkbox_rules,
                "pageCount": max(0, page_count),
            }
        )
    return template_records, template_sources


def _build_group_snapshot_or_400(
    group,
    user_id: str,
) -> Dict[str, Any]:
    template_records, template_sources = _build_group_template_sources_or_400(group, user_id)
    try:
        return build_group_template_api_snapshot(
            group_id=group.id,
            template_records=template_records,
            template_sources=template_sources,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _resolve_endpoint_or_404(endpoint_id: str, user_id: str):
    record = get_template_api_endpoint(endpoint_id, user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="API Fill endpoint not found")
    return record


def _record_owner_event_best_effort(
    record,
    *,
    event_type: str,
    snapshot_version: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        create_template_api_endpoint_event(
            endpoint_id=record.id,
            user_id=record.user_id,
            template_id=record.template_id or (record.group_id or ""),
            event_type=event_type,
            snapshot_version=snapshot_version,
            metadata=metadata,
        )
    except Exception as exc:
        logger.warning(
            "Failed to record API Fill owner event %s for endpoint %s: %s",
            event_type,
            record.id,
            exc,
        )


@router.get("/api/template-api-endpoints")
async def list_owner_template_api_endpoints(
    response: Response,
    templateId: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """List API Fill endpoints owned by the current user."""
    _apply_private_cache_headers(response)
    user = require_user(authorization)
    endpoints = list_template_api_endpoints(user.app_user_id, template_id=templateId)
    role = _resolve_role_for_user(user)
    def _load_account_endpoints_for_fallback() -> list[Any]:
        if templateId:
            return list_template_api_endpoints(user.app_user_id)
        return endpoints

    return {
        "endpoints": [_serialize_endpoint(record) for record in endpoints],
        "limits": _build_owner_limit_summary_best_effort(
            user_id=user.app_user_id,
            role=role,
            fallback_endpoints_loader=_load_account_endpoints_for_fallback,
            log_label=f"for endpoint list user {user.app_user_id}",
        ),
    }


@router.post("/api/template-api-endpoints")
async def publish_template_api_endpoint(
    payload: TemplateApiEndpointPublishRequest,
    response: Response,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Publish or republish a saved form (or template group) as an API Fill endpoint."""
    _apply_private_cache_headers(response)
    user = require_user(authorization)
    role = _resolve_role_for_user(user)
    active_limit = resolve_template_api_active_limit(role)
    if active_limit <= 0:
        raise HTTPException(status_code=403, detail="API Fill is unavailable on the current plan.")
    max_pages = resolve_template_api_max_pages(role)

    if payload.scopeType == "group":
        group = _resolve_group_or_404(payload.groupId, user.app_user_id)
        snapshot = _build_group_snapshot_or_400(group, user.app_user_id)
        total_page_count = group_template_api_total_page_count(snapshot)
        if total_page_count > max_pages:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"API Fill group endpoints are limited to {max_pages} total pages across all "
                    f"templates on your plan (got {total_page_count})."
                ),
            )
        schema = build_group_template_api_schema(snapshot)
        secret = generate_template_api_secret()
        try:
            endpoint_record, created = publish_or_republish_template_api_endpoint(
                user_id=user.app_user_id,
                scope_type="group",
                group_id=group.id,
                group_name=group.name,
                template_id=None,
                template_name=None,
                snapshot=snapshot,
                active_limit=active_limit,
                key_prefix=build_template_api_key_prefix(secret),
                secret_hash=hash_template_api_secret(secret),
            )
        except TemplateApiActiveEndpointLimitError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail="Failed to publish API Fill group endpoint") from exc

        _record_owner_event_best_effort(
            endpoint_record,
            event_type="published" if created else "republished",
            snapshot_version=endpoint_record.snapshot_version,
            metadata={
                "scopeType": "group",
                "groupId": group.id,
                "templateCount": group_template_api_pdf_count(snapshot),
                "totalPageCount": total_page_count,
            },
        )
        return {
            "created": created,
            "secret": secret if created else None,
            **_build_owner_mutation_payload(endpoint_record, role=role, schema=schema),
        }

    template = _resolve_template_or_404(payload.templateId, user.app_user_id)
    snapshot = _build_snapshot_or_400(template, export_mode=payload.exportMode)
    template_page_count = max(0, int(snapshot.get("pageCount") or 0))
    if template_page_count > max_pages:
        raise HTTPException(
            status_code=403,
            detail=f"API Fill templates are limited to {max_pages} pages on your plan (got {template_page_count}).",
        )
    schema = build_template_api_schema(snapshot)
    secret = generate_template_api_secret()
    try:
        endpoint_record, created = publish_or_republish_template_api_endpoint(
            user_id=user.app_user_id,
            scope_type="template",
            template_id=template.id,
            template_name=template.name,
            snapshot=snapshot,
            active_limit=active_limit,
            key_prefix=build_template_api_key_prefix(secret),
            secret_hash=hash_template_api_secret(secret),
        )
    except TemplateApiActiveEndpointLimitError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to publish API Fill endpoint") from exc

    _record_owner_event_best_effort(
        endpoint_record,
        event_type="published" if created else "republished",
        snapshot_version=endpoint_record.snapshot_version,
        metadata={
            "scopeType": "template",
            "exportMode": snapshot.get("defaultExportMode"),
            "pageCount": snapshot.get("pageCount"),
        },
    )
    return {
        "created": created,
        "secret": secret if created else None,
        **_build_owner_mutation_payload(endpoint_record, role=role, schema=schema),
    }


@router.post("/api/template-api-endpoints/{endpoint_id}/rotate")
async def rotate_template_api_endpoint_secret(
    endpoint_id: str,
    response: Response,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Rotate the scoped secret for an active API Fill endpoint."""
    _apply_private_cache_headers(response)
    user = require_user(authorization)
    role = _resolve_role_for_user(user)
    record = _resolve_endpoint_or_404(endpoint_id, user.app_user_id)
    if record.status != "active":
        raise HTTPException(status_code=409, detail="Only active API Fill endpoints can rotate keys.")
    secret = generate_template_api_secret()
    try:
        updated = rotate_template_api_endpoint_secret_atomic(
            endpoint_id,
            user.app_user_id,
            key_prefix=build_template_api_key_prefix(secret),
            secret_hash=hash_template_api_secret(secret),
        )
    except TemplateApiEndpointStatusError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to rotate API Fill key")
    _record_owner_event_best_effort(
        updated,
        event_type="rotated",
        snapshot_version=updated.snapshot_version,
        metadata={"keyPrefix": updated.key_prefix},
    )
    return {
        "secret": secret,
        **_build_owner_mutation_payload(updated, role=role, include_schema=False),
    }


@router.post("/api/template-api-endpoints/{endpoint_id}/revoke")
async def revoke_template_api_endpoint(
    endpoint_id: str,
    response: Response,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Revoke an API Fill endpoint so it can no longer be used publicly."""
    _apply_private_cache_headers(response)
    user = require_user(authorization)
    role = _resolve_role_for_user(user)
    _resolve_endpoint_or_404(endpoint_id, user.app_user_id)
    record = revoke_template_api_endpoint_atomic(endpoint_id, user.app_user_id)
    if record is None:
        raise HTTPException(status_code=500, detail="Failed to revoke API Fill endpoint")
    _record_owner_event_best_effort(
        record,
        event_type="revoked",
        snapshot_version=record.snapshot_version,
    )
    return _build_owner_mutation_payload(record, role=role, include_schema=False)


@router.get("/api/template-api-endpoints/{endpoint_id}/schema")
async def get_template_api_endpoint_schema(
    endpoint_id: str,
    response: Response,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Return the published schema for one owner-controlled API Fill endpoint."""
    _apply_private_cache_headers(response)
    user = require_user(authorization)
    role = _resolve_role_for_user(user)
    record = _resolve_endpoint_or_404(endpoint_id, user.app_user_id)
    return _build_owner_details_payload(record, role=role)


@router.get("/api/template-api-endpoints/precheck")
async def precheck_template_api_quota(
    response: Response,
    pdfCount: int = Query(default=1, ge=1),
    pageCount: int = Query(default=0, ge=0),
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Phase 5: pre-validate a planned fill against the user's monthly + per-request limits.

    Account-scoped. Used by:
      * the workspace Search & Fill modal to display "you have X of Y monthly
        fills remaining" before the user clicks "Fill all N PDFs"
      * API Fill consumers building retry / batching logic so they can avoid
        hammering the public route with calls that would 429

    Query params:
        pdfCount: number of PDFs the planned fill would materialize (default 1).
                  For a group fill, this is the template count in the group.
        pageCount: total page count across all PDFs in the planned fill (default 0).
                   For a group fill, this is the sum across the bundle.

    Returns:
        ``{
            "allowed": bool,
            "fillsRemaining": int,
            "pdfCount": int,
            "monthlyLimit": int,
            "maxPagesPerRequest": int,
            "pageCountPerRequest": int,
            "reason": "fills_exhausted" | "pages_per_request" | None,
            "currentMonthUsage": int,
            "monthKey": str,
        }``

    Read-only — does not consume quota or modify state. The actual debit
    happens during materialization in ``record_template_api_endpoint_success``,
    so a precheck-allowed plan is guaranteed to fit *if no concurrent fill races
    in between*. Concurrent races still hit the atomic quota check inside the
    materialize transaction and surface as 429 — clients should treat the
    precheck as a UX hint, not a contract.
    """

    _apply_private_cache_headers(response)
    user = require_user(authorization)
    role = _resolve_role_for_user(user)
    monthly_limit = resolve_template_api_requests_monthly_limit(role)
    max_pages = resolve_template_api_max_pages(role)
    monthly_usage = get_template_api_monthly_usage(user.app_user_id)
    current_count = monthly_usage.request_count if monthly_usage is not None else 0
    month_key = monthly_usage.month_key if monthly_usage is not None else ""
    result = check_group_fill_quota(
        monthly_limit=monthly_limit,
        current_request_count=current_count,
        pdf_count=pdfCount,
        page_count_per_request=pageCount,
        max_pages_per_request=max_pages,
    )
    return {
        **result,
        "currentMonthUsage": current_count,
        "monthKey": month_key,
    }
