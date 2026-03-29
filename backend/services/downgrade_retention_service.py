"""Downgrade retention planning and access-lock helpers.

The current product policy preserves saved forms on base downgrade and locks
access to every template beyond the oldest ``saved_forms_limit`` records. The
legacy field/function names still mention "retention" and "pending delete" for
frontend compatibility, but the runtime semantics in this module are now
lock-based rather than delete-based.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional

from backend.firebaseDB.fill_link_database import close_fill_link, list_fill_links, update_fill_link
from backend.firebaseDB.group_database import list_groups
from backend.firebaseDB.signing_database import list_signing_requests
from backend.firebaseDB.template_database import list_templates
from backend.firebaseDB.user_database import (
    DOWNGRADE_RETENTION_FIELD,
    ROLE_BASE,
    UserDowngradeRetentionRecord,
    clear_user_downgrade_retention,
    get_user_billing_record,
    get_user_downgrade_retention,
    get_user_profile,
    normalize_role,
    set_user_downgrade_retention,
)
from backend.services.billing_service import is_subscription_active
from backend.services.fill_link_scope_service import validate_fill_link_scope
from backend.services.limits_service import resolve_saved_forms_limit
from backend.services.signing_service import (
    SIGNING_STATUS_COMPLETED,
    SIGNING_STATUS_DRAFT,
    SIGNING_STATUS_INVALIDATED,
    SIGNING_STATUS_SENT,
)
from backend.time_utils import now_iso

# Phase 2 keeps the persisted field names stable but changes the semantics from
# purge-after-grace to deterministic access locking on the base plan.
DOWNGRADE_RETENTION_POLICY_VERSION = 2
DOWNGRADE_RETENTION_STATUS = "grace_period"
_HIGH_TIMESTAMP = "9999-12-31T23:59:59+00:00"


@dataclass(frozen=True)
class DowngradeRetentionComputation:
    state: Optional[UserDowngradeRetentionRecord]
    templates: list
    groups: list
    links: list
    affected_signing_requests: list
    pending_link_reasons: Dict[str, str]


@dataclass(frozen=True)
class DowngradeRetentionEligibility:
    should_apply: bool
    role: str
    has_active_subscription: bool


@dataclass(frozen=True)
class _RetentionLinkMutation:
    link_id: str
    user_id: str
    desired_status: str
    desired_closed_reason: Optional[str]
    original_status: str
    original_closed_reason: Optional[str]


class DowngradeRetentionInactiveError(RuntimeError):
    """Raised when a client tries to mutate a retention plan that no longer applies."""


def _sort_oldest_first(records: Iterable[object]) -> List[object]:
    return sorted(
        list(records),
        key=lambda record: (
            getattr(record, "created_at", None) or _HIGH_TIMESTAMP,
            getattr(record, "id", ""),
        ),
    )


def _dedupe_ids(values: Iterable[str]) -> List[str]:
    deduped: List[str] = []
    for value in values:
        normalized = str(value or "").strip()
        if not normalized or normalized in deduped:
            continue
        deduped.append(normalized)
    return deduped


def _resolve_retention_timestamps(existing: Optional[UserDowngradeRetentionRecord]) -> tuple[str, Optional[str]]:
    if existing and existing.downgraded_at:
        return existing.downgraded_at, None
    return now_iso(), None


def _parse_iso_timestamp(value: Optional[str]) -> Optional[datetime]:
    normalized = str(value or "").strip()
    if not normalized:
        return None
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _resolve_days_remaining(grace_ends_at: Optional[str]) -> int:
    if not str(grace_ends_at or "").strip():
        return 0
    deadline = _parse_iso_timestamp(grace_ends_at)
    if deadline is None:
        return 0
    remaining_seconds = (deadline - datetime.now(timezone.utc)).total_seconds()
    if remaining_seconds <= 0:
        return 0
    return max(1, int((remaining_seconds + 86399) // 86400))


def _retention_grace_has_expired(grace_ends_at: Optional[str]) -> bool:
    if not str(grace_ends_at or "").strip():
        return False
    deadline = _parse_iso_timestamp(grace_ends_at)
    if deadline is None:
        return False
    return deadline <= datetime.now(timezone.utc)


def _resolve_kept_template_ids(
    ordered_template_ids: List[str],
    keep_limit: int,
    preferred_keep_ids: Optional[Iterable[str]],
) -> List[str]:
    if keep_limit <= 0:
        return []
    preferred = _dedupe_ids(preferred_keep_ids or [])
    current_id_set = set(ordered_template_ids)
    retained = [template_id for template_id in preferred if template_id in current_id_set]
    for template_id in ordered_template_ids:
        if len(retained) >= keep_limit:
            break
        if template_id in retained:
            continue
        retained.append(template_id)
    return retained[:keep_limit]


def _link_depends_on_pending_template(record, pending_template_ids: set[str]) -> bool:
    if not pending_template_ids:
        return False
    if record.scope_type == "template":
        return bool(record.template_id and record.template_id in pending_template_ids)
    return any(template_id in pending_template_ids for template_id in record.template_ids)


def _is_downgrade_managed_link(record) -> bool:
    return str(getattr(record, "closed_reason", "") or "").strip().lower() in {
        "downgrade_retention",
        "template_access_locked",
        "downgrade_link_limit",
    }


def _resolve_link_plan(
    ordered_links: List[object],
    pending_template_ids: set[str],
) -> tuple[List[str], Dict[str, str]]:
    pending_link_ids: List[str] = []
    reasons: Dict[str, str] = {}
    for record in ordered_links:
        if _link_depends_on_pending_template(record, pending_template_ids):
            pending_link_ids.append(record.id)
            reasons[record.id] = "template_access_locked"
    return _dedupe_ids(pending_link_ids), reasons


def _resolve_current_base_saved_forms_limit() -> int:
    return max(1, resolve_saved_forms_limit(ROLE_BASE))


def _list_affected_signing_requests(user_id: str, pending_template_ids: Iterable[str]) -> List[object]:
    pending_template_id_set = {str(template_id or "").strip() for template_id in pending_template_ids if str(template_id or "").strip()}
    if not pending_template_id_set:
        return []
    return [
        record
        for record in list_signing_requests(user_id)
        if record.status != SIGNING_STATUS_INVALIDATED
        and record.source_template_id in pending_template_id_set
    ]


def _has_confirmed_active_subscription(
    *,
    subscription_id: object,
    subscription_status: object,
) -> bool:
    normalized_subscription_id = str(subscription_id or "").strip()
    if not normalized_subscription_id:
        return False
    return is_subscription_active(str(subscription_status or ""))


def _compute_retention(
    user_id: str,
    *,
    existing: Optional[UserDowngradeRetentionRecord],
    override_keep_ids: Optional[Iterable[str]] = None,
    billing_state_deferred: bool = False,
) -> DowngradeRetentionComputation:
    ordered_templates = _sort_oldest_first(list_templates(user_id))
    ordered_groups = list_groups(user_id)
    ordered_links = _sort_oldest_first(list_fill_links(user_id))

    saved_forms_limit = _resolve_current_base_saved_forms_limit()

    ordered_template_ids = [template.id for template in ordered_templates]
    keep_limit = min(saved_forms_limit, len(ordered_template_ids))
    preferred_keep_ids = override_keep_ids if override_keep_ids is not None else (existing.kept_template_ids if existing else [])
    kept_template_ids = _resolve_kept_template_ids(ordered_template_ids, keep_limit, preferred_keep_ids)
    pending_delete_template_ids = [
        template_id
        for template_id in ordered_template_ids
        if template_id not in set(kept_template_ids)
    ]
    pending_link_ids, pending_link_reasons = _resolve_link_plan(
        ordered_links,
        set(pending_delete_template_ids),
    )

    if not pending_delete_template_ids and not pending_link_ids:
        return DowngradeRetentionComputation(
            state=None,
            templates=ordered_templates,
            groups=ordered_groups,
            links=ordered_links,
            affected_signing_requests=[],
            pending_link_reasons=pending_link_reasons,
        )

    affected_signing_requests = _list_affected_signing_requests(user_id, pending_delete_template_ids)
    downgraded_at, grace_ends_at = _resolve_retention_timestamps(existing)
    state = UserDowngradeRetentionRecord(
        status=DOWNGRADE_RETENTION_STATUS,
        policy_version=DOWNGRADE_RETENTION_POLICY_VERSION,
        downgraded_at=downgraded_at,
        grace_ends_at=grace_ends_at,
        saved_forms_limit=max(1, saved_forms_limit),
        kept_template_ids=kept_template_ids,
        pending_delete_template_ids=pending_delete_template_ids,
        pending_delete_link_ids=pending_link_ids,
        billing_state_deferred=bool(billing_state_deferred),
        updated_at=existing.updated_at if existing else None,
    )
    return DowngradeRetentionComputation(
        state=state,
        templates=ordered_templates,
        groups=ordered_groups,
        links=ordered_links,
        affected_signing_requests=affected_signing_requests,
        pending_link_reasons=pending_link_reasons,
    )


def _resolve_retention_eligibility(user_id: str) -> DowngradeRetentionEligibility:
    """Re-check current entitlement before applying retention side effects."""
    profile = get_user_profile(user_id)
    role = normalize_role(profile.role if profile else None)
    billing_record = get_user_billing_record(user_id)
    has_active_subscription = bool(
        billing_record
        and _has_confirmed_active_subscription(
            subscription_id=billing_record.subscription_id,
            subscription_status=billing_record.subscription_status,
        )
    )
    return DowngradeRetentionEligibility(
        should_apply=role == ROLE_BASE and not has_active_subscription,
        role=role,
        has_active_subscription=has_active_subscription,
    )


def _persist_retention_state(user_id: str, state: Optional[UserDowngradeRetentionRecord]) -> None:
    if state is None:
        clear_user_downgrade_retention(user_id)
        return
    set_user_downgrade_retention(
        user_id,
        status=state.status,
        policy_version=state.policy_version,
        downgraded_at=state.downgraded_at,
        grace_ends_at=state.grace_ends_at,
        saved_forms_limit=state.saved_forms_limit,
        kept_template_ids=state.kept_template_ids,
        pending_delete_template_ids=state.pending_delete_template_ids,
        pending_delete_link_ids=state.pending_delete_link_ids,
        billing_state_deferred=state.billing_state_deferred,
    )


def _should_preserve_retention_during_deferred_billing_sync(
    existing_state: Optional[UserDowngradeRetentionRecord],
    *,
    role: str,
    has_active_subscription: bool,
) -> bool:
    return bool(
        existing_state
        and existing_state.billing_state_deferred
        and role == ROLE_BASE
        and has_active_subscription
    )


def _retention_is_blocked_by_current_account_state(
    user_id: str,
    *,
    user_doc_data: Optional[Dict[str, object]] = None,
    eligibility_override: Optional[DowngradeRetentionEligibility] = None,
    existing_state: Optional[UserDowngradeRetentionRecord] = None,
) -> bool:
    if eligibility_override is not None:
        return not eligibility_override.should_apply
    if isinstance(user_doc_data, dict):
        role = normalize_role(user_doc_data.get("role"))
        has_active_subscription = _has_confirmed_active_subscription(
            subscription_id=user_doc_data.get("stripe_subscription_id"),
            subscription_status=user_doc_data.get("stripe_subscription_status"),
        )
        if _should_preserve_retention_during_deferred_billing_sync(
            existing_state,
            role=role,
            has_active_subscription=has_active_subscription,
        ):
            # Preserve a grace plan only when it was explicitly marked as waiting
            # for a deferred billing-state write after cancellation.
            return False
        return role != ROLE_BASE or has_active_subscription

    eligibility = _resolve_retention_eligibility(user_id)
    if _should_preserve_retention_during_deferred_billing_sync(
        existing_state,
        role=eligibility.role,
        has_active_subscription=eligibility.has_active_subscription,
    ):
        return False
    return not eligibility.should_apply


def _resolve_next_billing_state_deferred(
    user_id: str,
    *,
    existing: Optional[UserDowngradeRetentionRecord],
    explicit_value: Optional[bool] = None,
) -> bool:
    if explicit_value is not None:
        return bool(explicit_value)
    if not existing or not existing.billing_state_deferred:
        return False
    eligibility = _resolve_retention_eligibility(user_id)
    return bool(eligibility.role == ROLE_BASE and eligibility.has_active_subscription)


def _coerce_positive_int(value: object, *, default: int = 1) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _retention_state_from_user_doc_data(user_doc_data: Optional[Dict[str, object]]) -> Optional[UserDowngradeRetentionRecord]:
    if not isinstance(user_doc_data, dict):
        return None
    raw = user_doc_data.get(DOWNGRADE_RETENTION_FIELD)
    if not isinstance(raw, dict):
        return None
    status = str(raw.get("status") or "").strip().lower()
    if not status:
        return None
    return UserDowngradeRetentionRecord(
        status=status,
        policy_version=_coerce_positive_int(raw.get("policy_version"), default=1),
        downgraded_at=str(raw.get("downgraded_at") or "").strip() or None,
        grace_ends_at=str(raw.get("grace_ends_at") or "").strip() or None,
        saved_forms_limit=_coerce_positive_int(raw.get("saved_forms_limit"), default=1),
        kept_template_ids=_dedupe_ids(raw.get("kept_template_ids") or []),
        pending_delete_template_ids=_dedupe_ids(raw.get("pending_delete_template_ids") or []),
        pending_delete_link_ids=_dedupe_ids(raw.get("pending_delete_link_ids") or []),
        billing_state_deferred=bool(raw.get("billing_state_deferred")),
        updated_at=str(raw.get("updated_at") or "").strip() or None,
    )


def _plan_retention_link_mutations(computation: DowngradeRetentionComputation) -> List[_RetentionLinkMutation]:
    pending_link_ids = set(computation.state.pending_delete_link_ids if computation.state else [])
    mutations: List[_RetentionLinkMutation] = []
    for record in computation.links:
        if record.id in pending_link_ids:
            desired_reason = "downgrade_retention"
            if record.status != "closed" or getattr(record, "closed_reason", None) != desired_reason:
                mutations.append(
                    _RetentionLinkMutation(
                        link_id=record.id,
                        user_id=record.user_id,
                        desired_status="closed",
                        desired_closed_reason=desired_reason,
                        original_status=record.status,
                        original_closed_reason=getattr(record, "closed_reason", None),
                    )
                )
            continue
        if record.status != "active" and _is_downgrade_managed_link(record):
            mutations.append(
                _RetentionLinkMutation(
                    link_id=record.id,
                    user_id=record.user_id,
                    desired_status="active",
                    desired_closed_reason=None,
                    original_status=record.status,
                    original_closed_reason=getattr(record, "closed_reason", None),
                )
            )
    return mutations


def _apply_link_mutation(mutation: _RetentionLinkMutation) -> None:
    if mutation.desired_status == "closed":
        close_fill_link(
            mutation.link_id,
            mutation.user_id,
            closed_reason=mutation.desired_closed_reason or "owner_closed",
        )
        return
    update_fill_link(
        mutation.link_id,
        mutation.user_id,
        status=mutation.desired_status,
        closed_reason=mutation.desired_closed_reason,
    )


def _rollback_retention_link_mutations(applied_mutations: List[_RetentionLinkMutation]) -> None:
    for mutation in reversed(applied_mutations):
        update_fill_link(
            mutation.link_id,
            mutation.user_id,
            status=mutation.original_status,
            closed_reason=mutation.original_closed_reason,
        )


def _commit_retention_state(user_id: str, computation: DowngradeRetentionComputation) -> None:
    applied_mutations: List[_RetentionLinkMutation] = []
    try:
        for mutation in _plan_retention_link_mutations(computation):
            _apply_link_mutation(mutation)
            applied_mutations.append(mutation)
        _persist_retention_state(user_id, computation.state)
    except Exception:
        if applied_mutations:
            try:
                _rollback_retention_link_mutations(applied_mutations)
            except Exception:
                pass
        raise


def _serialize_summary(computation: DowngradeRetentionComputation) -> Optional[Dict[str, object]]:
    state = computation.state
    if state is None:
        return None
    affected_signing_drafts = [
        record for record in computation.affected_signing_requests if record.status == SIGNING_STATUS_DRAFT
    ]
    retained_signing_requests = [
        record
        for record in computation.affected_signing_requests
        if record.status in {SIGNING_STATUS_SENT, SIGNING_STATUS_COMPLETED}
    ]
    completed_signing_requests = [
        record for record in computation.affected_signing_requests if record.status == SIGNING_STATUS_COMPLETED
    ]
    pending_template_id_set = set(state.pending_delete_template_ids)
    pending_link_id_set = set(state.pending_delete_link_ids)
    effective_closed_link_ids = {
        record.id
        for record in computation.links
        if record.status == "active"
        and record.id in pending_link_id_set
    }
    template_lookup = {template.id: template for template in computation.templates}
    accessible_template_ids = list(state.kept_template_ids)
    locked_template_ids = list(state.pending_delete_template_ids)
    locked_link_ids = list(state.pending_delete_link_ids)
    templates_payload: List[Dict[str, object]] = []
    for template in computation.templates:
        locked = template.id in pending_template_id_set
        templates_payload.append(
            {
                "id": template.id,
                "name": template.name or template.pdf_bucket_path or "Saved form",
                "createdAt": template.created_at,
                "updatedAt": template.updated_at,
                "status": "pending_delete" if locked else "kept",
                "accessStatus": "locked" if locked else "accessible",
                "locked": locked,
                "lockReason": "plan_locked" if locked else None,
            }
        )

    groups_payload: List[Dict[str, object]] = []
    for group in computation.groups:
        pending_group_templates = [template_id for template_id in group.template_ids if template_id in pending_template_id_set]
        if not pending_group_templates:
            continue
        groups_payload.append(
            {
                "id": group.id,
                "name": group.name,
                "templateCount": len(group.template_ids),
                "pendingTemplateCount": len(pending_group_templates),
                "willDelete": False,
                "lockedTemplateIds": pending_group_templates,
                "accessStatus": "locked" if pending_group_templates else "accessible",
                "locked": bool(pending_group_templates),
            }
        )

    links_payload: List[Dict[str, object]] = []
    for link in computation.links:
        if link.id not in pending_link_id_set:
            continue
        template_name = template_lookup.get(link.template_id).name if link.template_id and template_lookup.get(link.template_id) else link.template_name
        links_payload.append(
            {
                "id": link.id,
                "title": link.title or link.group_name or link.template_name or "Fill By Link",
                "scopeType": link.scope_type,
                "status": "closed" if link.id in effective_closed_link_ids else link.status,
                "templateId": link.template_id,
                "templateName": template_name,
                "groupId": link.group_id,
                "groupName": link.group_name,
                "createdAt": link.created_at,
                "updatedAt": link.updated_at,
                "pendingDeleteReason": computation.pending_link_reasons.get(link.id) or "template_access_locked",
                "accessStatus": "locked",
                "locked": True,
                "lockReason": "template_access_locked",
            }
        )

    return {
        "status": state.status,
        "policyVersion": state.policy_version,
        "downgradedAt": state.downgraded_at,
        "graceEndsAt": None,
        "daysRemaining": 0,
        "savedFormsLimit": state.saved_forms_limit,
        "keptTemplateIds": state.kept_template_ids,
        "pendingDeleteTemplateIds": state.pending_delete_template_ids,
        "pendingDeleteLinkIds": state.pending_delete_link_ids,
        "accessibleTemplateIds": accessible_template_ids,
        "lockedTemplateIds": locked_template_ids,
        "lockedLinkIds": locked_link_ids,
        "selectionMode": "oldest_created",
        "manualSelectionAllowed": False,
        "counts": {
            "keptTemplates": len(state.kept_template_ids),
            "pendingTemplates": len(state.pending_delete_template_ids),
            "accessibleTemplates": len(accessible_template_ids),
            "lockedTemplates": len(locked_template_ids),
            "affectedGroups": len(groups_payload),
            "pendingLinks": len(state.pending_delete_link_ids),
            "closedLinks": len(state.pending_delete_link_ids),
            "lockedLinks": len(locked_link_ids),
            "affectedSigningRequests": len(computation.affected_signing_requests),
            "affectedSigningDrafts": len(affected_signing_drafts),
            "retainedSigningRequests": len(retained_signing_requests),
            "completedSigningRequests": len(completed_signing_requests),
        },
        "templates": templates_payload,
        "groups": groups_payload,
        "links": links_payload,
    }


def restore_user_downgrade_managed_links(user_id: str) -> List[str]:
    """Reopen links that were auto-closed only because of downgrade retention.

    This is linear in the number of stored Fill By Link records for the user.
    Each candidate link is revalidated against its live scope before reopening
    so stale template/group references do not get reactivated.
    """
    restored_link_ids: List[str] = []
    for record in list_fill_links(user_id):
        if record.status == "active" or not _is_downgrade_managed_link(record):
            continue
        validation = validate_fill_link_scope(
            user_id,
            scope_type=record.scope_type,
            template_id=record.template_id,
            group_id=record.group_id,
            template_ids=record.template_ids,
        )
        if not validation.valid:
            continue
        updated = update_fill_link(
            record.id,
            user_id,
            status="active",
            closed_reason=None,
        )
        if updated is not None and updated.status == "active":
            restored_link_ids.append(record.id)
    return restored_link_ids


def _clear_stale_retention_state(user_id: str, existing_state: Optional[UserDowngradeRetentionRecord]) -> None:
    if existing_state is None:
        return
    restore_user_downgrade_managed_links(user_id)
    clear_user_downgrade_retention(user_id)


def apply_user_downgrade_retention(
    user_id: str,
    *,
    eligibility_override: Optional[DowngradeRetentionEligibility] = None,
    billing_state_deferred: bool = False,
) -> Optional[Dict[str, object]]:
    existing = get_user_downgrade_retention(user_id)
    if _retention_is_blocked_by_current_account_state(
        user_id,
        eligibility_override=eligibility_override,
        existing_state=existing,
    ):
        _clear_stale_retention_state(user_id, existing)
        return None
    computation = _compute_retention(
        user_id,
        existing=existing,
        billing_state_deferred=_resolve_next_billing_state_deferred(
            user_id,
            existing=existing,
            explicit_value=billing_state_deferred,
        ),
    )
    _commit_retention_state(user_id, computation)
    return _serialize_summary(computation)


def sync_user_downgrade_retention(
    user_id: str,
    *,
    create_if_missing: bool = False,
) -> Optional[Dict[str, object]]:
    existing = get_user_downgrade_retention(user_id)
    if _retention_is_blocked_by_current_account_state(user_id, existing_state=existing):
        _clear_stale_retention_state(user_id, existing)
        return None
    if not existing and not create_if_missing:
        return None
    computation = _compute_retention(
        user_id,
        existing=existing,
        billing_state_deferred=_resolve_next_billing_state_deferred(user_id, existing=existing),
    )
    _commit_retention_state(user_id, computation)
    return _serialize_summary(computation)


def get_user_retention_locked_template_ids(user_id: str) -> set[str]:
    retention_summary = sync_user_downgrade_retention(user_id, create_if_missing=True)
    pending_ids = retention_summary.get("pendingDeleteTemplateIds") if isinstance(retention_summary, dict) else None
    if not isinstance(pending_ids, list):
        return set()
    return {
        str(template_id).strip()
        for template_id in pending_ids
        if str(template_id or "").strip()
    }


def get_user_retention_pending_template_ids(user_id: str) -> set[str]:
    return get_user_retention_locked_template_ids(user_id)


def get_user_retention_accessible_template_ids(user_id: str) -> set[str]:
    retention_summary = sync_user_downgrade_retention(user_id, create_if_missing=True)
    kept_ids = retention_summary.get("keptTemplateIds") if isinstance(retention_summary, dict) else None
    if not isinstance(kept_ids, list):
        return set()
    return {
        str(template_id).strip()
        for template_id in kept_ids
        if str(template_id or "").strip()
    }


def is_user_retention_template_locked(user_id: str, template_id: Optional[str]) -> bool:
    normalized_template_id = str(template_id or "").strip()
    if not normalized_template_id:
        return False
    return normalized_template_id in get_user_retention_locked_template_ids(user_id)


def select_user_retained_templates(user_id: str, kept_template_ids: List[str]) -> Dict[str, object]:
    existing = get_user_downgrade_retention(user_id)
    if not existing:
        summary = sync_user_downgrade_retention(user_id, create_if_missing=True)
        return summary or {}
    if _retention_is_blocked_by_current_account_state(user_id, existing_state=existing):
        _clear_stale_retention_state(user_id, existing)
        raise DowngradeRetentionInactiveError(
            "Downgrade retention is no longer active for this account."
        )
    summary = sync_user_downgrade_retention(user_id, create_if_missing=True)
    return summary or {}


def delete_user_downgrade_retention_now(user_id: str) -> Dict[str, object]:
    existing = get_user_downgrade_retention(user_id)
    if _retention_is_blocked_by_current_account_state(user_id, existing_state=existing):
        _clear_stale_retention_state(user_id, existing)
        return {
            "deletedTemplateIds": [],
            "deletedLinkIds": [],
        }
    sync_user_downgrade_retention(user_id, create_if_missing=True)
    return {
        "deletedTemplateIds": [],
        "deletedLinkIds": [],
    }


def list_users_with_expired_downgrade_retention(*, as_of: Optional[datetime] = None) -> List[str]:
    return []
