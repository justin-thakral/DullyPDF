"""Authenticated named group endpoints for saved templates."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Query

from backend.api.schemas import TemplateGroupCreateRequest, TemplateGroupUpdateRequest
from backend.firebaseDB.group_database import (
    create_group,
    delete_group,
    get_group,
    list_groups,
    normalize_group_name,
    update_group,
)
from backend.firebaseDB.template_api_endpoint_database import (
    revoke_template_api_endpoints_for_group,
)
from backend.logging_config import get_logger
from backend.firebaseDB.fill_link_database import (
    close_fill_link,
    close_fill_links_for_group,
    get_fill_link_for_group,
    update_fill_link,
)
from backend.firebaseDB.template_database import get_template, list_templates
from backend.services.auth_service import require_user
from backend.services.downgrade_retention_service import sync_user_downgrade_retention
from backend.services.group_schema_service import (
    build_group_canonical_schema_from_sources,
)
from backend.services.group_schema_types import GroupSchemaTypeConflictError
from backend.services.saved_form_snapshot_service import (
    load_saved_form_editor_snapshot,
)

router = APIRouter()
logger = get_logger(__name__)


def _locked_template_ids_from_summary(retention_summary: Optional[Dict[str, Any]]) -> set[str]:
    pending_ids = retention_summary.get("pendingDeleteTemplateIds") if isinstance(retention_summary, dict) else None
    if not isinstance(pending_ids, list):
        return set()
    return {
        str(template_id or "").strip()
        for template_id in pending_ids
        if str(template_id or "").strip()
    }


def _group_locked_template_ids(record, locked_template_ids: set[str]) -> List[str]:
    return [template_id for template_id in record.template_ids if template_id in locked_template_ids]


def _ensure_group_is_accessible(record, *, locked_template_ids: set[str], detail: str) -> None:
    if not _group_locked_template_ids(record, locked_template_ids):
        return
    raise HTTPException(status_code=409, detail=detail)


def _serialize_group(record, template_lookup: Dict[str, Any], *, locked_template_ids: set[str]) -> Dict[str, Any]:
    templates: List[Dict[str, Any]] = []
    group_locked_template_ids = _group_locked_template_ids(record, locked_template_ids)
    for template_id in record.template_ids:
        template = template_lookup.get(template_id)
        if not template:
            continue
        templates.append(
            {
                "id": template.id,
                "name": template.name or template.pdf_bucket_path or "Saved form",
                "createdAt": template.created_at,
                "accessStatus": "locked" if template.id in locked_template_ids else "accessible",
                "locked": template.id in locked_template_ids,
            }
        )
    templates.sort(key=lambda entry: (entry["name"].lower(), entry["id"]))
    return {
        "id": record.id,
        "name": record.name,
        "templateIds": [entry["id"] for entry in templates],
        "templateCount": len(templates),
        "templates": templates,
        "createdAt": record.created_at,
        "updatedAt": record.updated_at,
        "accessStatus": "locked" if group_locked_template_ids else "accessible",
        "locked": bool(group_locked_template_ids),
        "lockedTemplateIds": group_locked_template_ids,
    }


def _sync_group_fill_link_after_update(previous_group, next_group, user_id: str) -> None:
    existing_link = get_fill_link_for_group(next_group.id, user_id)
    if not existing_link:
        return

    if list(previous_group.template_ids) != list(next_group.template_ids):
        if existing_link.status == "active":
            close_fill_link(existing_link.id, user_id, closed_reason="group_updated")
        return

    if previous_group.name == next_group.name:
        return

    next_title = next_group.name if (existing_link.title or "").strip() == (previous_group.name or "").strip() else None
    update_fill_link(
        existing_link.id,
        user_id,
        group_name=next_group.name,
        title=next_title,
    )


@router.get("/api/groups")
async def list_owner_groups(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = require_user(authorization)
    retention_summary = sync_user_downgrade_retention(user.app_user_id, create_if_missing=True)
    locked_template_ids = _locked_template_ids_from_summary(retention_summary)
    templates = list_templates(user.app_user_id)
    template_lookup = {template.id: template for template in templates}
    groups = list_groups(user.app_user_id)
    return {"groups": [_serialize_group(group, template_lookup, locked_template_ids=locked_template_ids) for group in groups]}


@router.post("/api/groups")
async def create_owner_group(
    payload: TemplateGroupCreateRequest,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    user = require_user(authorization)
    retention_summary = sync_user_downgrade_retention(user.app_user_id, create_if_missing=True)
    locked_template_ids = _locked_template_ids_from_summary(retention_summary)
    templates = list_templates(user.app_user_id)
    template_lookup = {template.id: template for template in templates}
    missing = [template_id for template_id in payload.templateIds if template_id not in template_lookup]
    if missing:
        raise HTTPException(status_code=404, detail="One or more saved forms were not found")
    locked = [template_id for template_id in payload.templateIds if template_id in locked_template_ids]
    if locked:
        raise HTTPException(
            status_code=409,
            detail="This workflow group cannot include saved forms that are locked on the base plan.",
        )

    normalized_name = normalize_group_name(payload.name)
    existing = list_groups(user.app_user_id)
    if any(group.normalized_name == normalized_name for group in existing):
        raise HTTPException(status_code=409, detail="A group with this name already exists")

    group = create_group(
        user.app_user_id,
        name=payload.name,
        template_ids=payload.templateIds,
    )
    return {
        "success": True,
        "group": _serialize_group(group, template_lookup, locked_template_ids=locked_template_ids),
    }


@router.get("/api/groups/{group_id}")
async def get_owner_group(
    group_id: str,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    user = require_user(authorization)
    retention_summary = sync_user_downgrade_retention(user.app_user_id, create_if_missing=True)
    locked_template_ids = _locked_template_ids_from_summary(retention_summary)
    group = get_group(group_id, user.app_user_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _ensure_group_is_accessible(
        group,
        locked_template_ids=locked_template_ids,
        detail="This workflow group is locked because one or more saved forms are unavailable on the base plan.",
    )
    templates = list_templates(user.app_user_id)
    template_lookup = {template.id: template for template in templates}
    return {"group": _serialize_group(group, template_lookup, locked_template_ids=locked_template_ids)}


@router.patch("/api/groups/{group_id}")
async def update_owner_group(
    group_id: str,
    payload: TemplateGroupUpdateRequest,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    user = require_user(authorization)
    retention_summary = sync_user_downgrade_retention(user.app_user_id, create_if_missing=True)
    locked_template_ids = _locked_template_ids_from_summary(retention_summary)
    existing_group = get_group(group_id, user.app_user_id)
    if not existing_group:
        raise HTTPException(status_code=404, detail="Group not found")
    _ensure_group_is_accessible(
        existing_group,
        locked_template_ids=locked_template_ids,
        detail="This workflow group is locked because one or more saved forms are unavailable on the base plan.",
    )

    templates = list_templates(user.app_user_id)
    template_lookup = {template.id: template for template in templates}
    missing = [template_id for template_id in payload.templateIds if template_id not in template_lookup]
    if missing:
        raise HTTPException(status_code=404, detail="One or more saved forms were not found")
    locked = [template_id for template_id in payload.templateIds if template_id in locked_template_ids]
    if locked:
        raise HTTPException(
            status_code=409,
            detail="This workflow group cannot include saved forms that are locked on the base plan.",
        )

    normalized_name = normalize_group_name(payload.name)
    existing = list_groups(user.app_user_id)
    if any(group.id != group_id and group.normalized_name == normalized_name for group in existing):
        raise HTTPException(status_code=409, detail="A group with this name already exists")

    group = update_group(
        group_id,
        user.app_user_id,
        name=payload.name,
        template_ids=payload.templateIds,
    )
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _sync_group_fill_link_after_update(existing_group, group, user.app_user_id)
    return {
        "success": True,
        "group": _serialize_group(group, template_lookup, locked_template_ids=locked_template_ids),
    }


@router.delete("/api/groups/{group_id}")
async def delete_owner_group(
    group_id: str,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    user = require_user(authorization)
    retention_summary = sync_user_downgrade_retention(user.app_user_id, create_if_missing=True)
    locked_template_ids = _locked_template_ids_from_summary(retention_summary)
    existing_group = get_group(group_id, user.app_user_id)
    if not existing_group:
        raise HTTPException(status_code=404, detail="Group not found")
    _ensure_group_is_accessible(
        existing_group,
        locked_template_ids=locked_template_ids,
        detail="This workflow group is locked because one or more saved forms are unavailable on the base plan.",
    )
    close_fill_links_for_group(existing_group.id, user.app_user_id, closed_reason="group_deleted")
    # Revoke any group-scope template_api endpoints that target this group so
    # they don't become zombies (active status, counted against the plan cap,
    # always failing with 404 at fill time because the group doc is gone).
    try:
        revoke_template_api_endpoints_for_group(existing_group.id, user.app_user_id)
    except Exception as exc:
        logger.warning(
            "Failed to revoke template_api endpoints for deleted group=%s user=%s: %s",
            existing_group.id,
            user.app_user_id,
            exc,
        )
    deleted = delete_group(group_id, user.app_user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"success": True}


def _resolve_template_checkbox_rules(metadata: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Mirror the resolution order used by ``fill_link_download_service``.

    Looks for ``metadata['fillRules']['checkboxRules']`` first (the new
    persistence shape), then falls back to ``metadata['checkboxRules']`` for
    older saved forms. Returns an empty list when neither location yields a
    list of dicts.
    """

    if not isinstance(metadata, dict):
        return []
    fill_rules = metadata.get("fillRules") if isinstance(metadata.get("fillRules"), dict) else {}
    raw = fill_rules.get("checkboxRules") if isinstance(fill_rules.get("checkboxRules"), list) else metadata.get("checkboxRules")
    if not isinstance(raw, list):
        return []
    return [dict(entry) for entry in raw if isinstance(entry, dict)]


def _build_template_source_for_group(
    template_id: str,
    user_id: str,
) -> Optional[Dict[str, Any]]:
    """Load one template's editor snapshot and reshape into a canonical-schema source.

    Returns ``None`` when the template is missing, owned by another user, or
    has no editor snapshot persisted yet (e.g. an in-progress upload). Callers
    convert these into ``orphan_field`` warnings on the canonical schema so the
    user can see exactly which templates were skipped.
    """

    template = get_template(template_id, user_id)
    if template is None:
        return None
    snapshot = load_saved_form_editor_snapshot(template.metadata)
    if not snapshot:
        return None
    fields = snapshot.get("fields") if isinstance(snapshot, dict) else None
    if not isinstance(fields, list) or not fields:
        return None
    return {
        "templateId": template.id,
        "templateName": template.name or template.id,
        "fields": fields,
        "checkboxRules": _resolve_template_checkbox_rules(template.metadata),
    }


@router.get("/api/groups/{group_id}/canonical-schema")
async def get_owner_group_canonical_schema(
    group_id: str,
    strict: bool = Query(default=False),
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Return the canonical group schema for Search & Fill / API Fill / Fill By Link.

    The schema is the deduped union of every template field across the group,
    keyed by canonical field key (see :mod:`backend.services.group_schema_service`).
    Per-template bindings let downstream consumers project a single input
    record into a per-template fill payload.

    Query parameters:
        strict: when True, type collisions raise HTTP 422 with conflict
                details. When False (the default), collisions are surfaced as
                warnings on the response and resolved via the precedence map.

    Status codes:
        200 - schema returned (with warnings array, possibly empty).
        404 - group not found or not owned by the caller.
        422 - strict mode and at least one canonical type collision was found.
    """

    user = require_user(authorization)
    group = get_group(group_id, user.app_user_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    template_sources: List[Dict[str, Any]] = []
    skipped_template_ids: List[str] = []
    for template_id in group.template_ids:
        source = _build_template_source_for_group(template_id, user.app_user_id)
        if source is None:
            skipped_template_ids.append(template_id)
            continue
        template_sources.append(source)

    try:
        schema = build_group_canonical_schema_from_sources(
            template_sources,
            group_id=group.id,
            strict=strict,
        )
    except GroupSchemaTypeConflictError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": str(exc),
                "code": "group_schema_type_conflict",
                "canonicalKey": exc.canonical_key,
                "conflictingTypes": exc.conflicting_types,
            },
        ) from exc

    response: Dict[str, Any] = {
        "schema": schema,
        "warnings": list(schema.get("warnings", [])),
    }
    if skipped_template_ids:
        response["skippedTemplateIds"] = skipped_template_ids
    return response
