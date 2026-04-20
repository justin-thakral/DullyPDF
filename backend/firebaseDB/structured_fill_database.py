"""Firestore-backed accounting for Search & Fill (structured data) credits.

Search & Fill lets a user fill one or more PDFs from a row of structured data
(CSV, Excel, SQL, JSON, TXT). This module owns the three Firestore collections
that make that path billable and auditable:

* ``structured_fill_usage_counters`` — one doc per (user, month) storing the
  running monthly credit total. This is the source of truth the monthly hard
  cap is enforced against.
* ``structured_fill_events`` — one doc per committed fill. Used for support,
  reconciliation, and the ``npm run stats`` dashboard.
* ``structured_fill_request_guards`` — one doc per (user, requestId). Makes
  the commit path idempotent so browser retries, duplicate submits, and
  network jitter cannot double-charge a user.

The :func:`commit_structured_fill_usage` entry point bundles all three writes
into a single Firestore transaction so concurrent requests cannot race past
the monthly cap.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from firebase_admin import firestore as firebase_firestore

from backend.logging_config import get_logger
from backend.services.limits_service import resolve_structured_fill_monthly_limit
from backend.time_utils import now_iso
from .firebase_service import get_firestore_client
from .user_database import get_user_profile, normalize_role


logger = get_logger(__name__)

STRUCTURED_FILL_USAGE_COUNTERS_COLLECTION = "structured_fill_usage_counters"
STRUCTURED_FILL_EVENTS_COLLECTION = "structured_fill_events"
STRUCTURED_FILL_REQUEST_GUARDS_COLLECTION = "structured_fill_request_guards"

STRUCTURED_FILL_SOURCE_CATEGORY = "structured_data"
STRUCTURED_FILL_SOURCE_KINDS = frozenset({"csv", "excel", "sql", "json", "txt"})
STRUCTURED_FILL_SCOPE_TYPES = frozenset({"template", "group"})

STATUS_COMMITTED = "committed"
STATUS_REPLAYED = "replayed"
STATUS_REJECTED_NO_MATCH = "rejected_no_match"
STATUS_REJECTED_LIMIT = "rejected_limit"
STATUS_REJECTED_INVALID = "rejected_invalid"

_RECORD_LABEL_PREVIEW_MAX = 120
_SEARCH_QUERY_PREVIEW_MAX = 200
_DATA_SOURCE_LABEL_MAX = 200


class StructuredFillMonthlyLimitExceededError(RuntimeError):
    """Raised when a commit would push a user past their monthly cap."""


class StructuredFillInvalidRequestError(ValueError):
    """Raised when a commit payload fails validation before any Firestore write."""


@dataclass(frozen=True)
class StructuredFillMonthlyUsageRecord:
    id: str
    user_id: str
    month_key: str
    credit_count: int
    commit_count: int
    matched_pdf_count: int
    created_at: Optional[str]
    updated_at: Optional[str]


@dataclass(frozen=True)
class StructuredFillEventRecord:
    id: str
    user_id: str
    request_id: str
    usage_month_key: str
    status: str
    source_category: str
    source_kind: str
    scope_type: str
    scope_id: Optional[str]
    template_id: Optional[str]
    group_id: Optional[str]
    target_template_ids: List[str]
    matched_template_ids: List[str]
    count_increment: int
    match_count: int
    record_label_preview: Optional[str]
    record_fingerprint: Optional[str]
    data_source_label: Optional[str]
    workspace_saved_form_id: Optional[str]
    search_query_preview: Optional[str]
    reviewed_fill_context: Optional[Dict[str, Any]]
    created_at: Optional[str]
    updated_at: Optional[str]


@dataclass(frozen=True)
class StructuredFillCommitResult:
    status: str
    event_id: str
    request_id: str
    month_key: str
    count_increment: int
    current_month_usage: int
    fills_remaining: int
    monthly_limit: int


def _current_month_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _coerce_month_key(value: Any) -> Optional[str]:
    normalized = str(value or "").strip()
    if len(normalized) != 7:
        return None
    try:
        datetime.strptime(normalized, "%Y-%m")
    except ValueError:
        return None
    return normalized


def _sanitize_doc_id_component(value: Any) -> str:
    return str(value or "").strip().replace("/", "_")


def _coerce_int(value: Any, *, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_string_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    deduped: List[str] = []
    for entry in value:
        text = str(entry or "").strip()
        if not text or text in deduped:
            continue
        deduped.append(text)
    return deduped


def _coerce_optional_dict(value: Any) -> Optional[Dict[str, Any]]:
    return dict(value) if isinstance(value, dict) else None


def _truncate(value: Any, *, limit: int) -> Optional[str]:
    text = str(value or "").strip()
    if not text:
        return None
    if len(text) <= limit:
        return text
    return text[:limit]


def _usage_counter_doc_id(user_id: str, month_key: str) -> str:
    return f"{_sanitize_doc_id_component(user_id)}__{month_key}"


def _request_guard_doc_id(user_id: str, request_id: str) -> str:
    return f"{_sanitize_doc_id_component(user_id)}__{_sanitize_doc_id_component(request_id)}"


def _usage_counter_ref(client, user_id: str, month_key: str):
    return client.collection(STRUCTURED_FILL_USAGE_COUNTERS_COLLECTION).document(
        _usage_counter_doc_id(user_id, month_key)
    )


def _request_guard_ref(client, user_id: str, request_id: str):
    return client.collection(STRUCTURED_FILL_REQUEST_GUARDS_COLLECTION).document(
        _request_guard_doc_id(user_id, request_id)
    )


def _event_ref(client, *, event_id: Optional[str] = None):
    collection = client.collection(STRUCTURED_FILL_EVENTS_COLLECTION)
    if event_id:
        return collection.document(event_id)
    return collection.document(f"sfe_{uuid4().hex}")


def _serialize_usage_counter(doc) -> StructuredFillMonthlyUsageRecord:
    data = doc.to_dict() or {}
    month_key = _coerce_month_key(data.get("month_key")) or _current_month_key()
    return StructuredFillMonthlyUsageRecord(
        id=doc.id,
        user_id=str(data.get("user_id") or "").strip(),
        month_key=month_key,
        credit_count=max(0, _coerce_int(data.get("credit_count"))),
        commit_count=max(0, _coerce_int(data.get("commit_count"))),
        matched_pdf_count=max(0, _coerce_int(data.get("matched_pdf_count"))),
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
    )


def _serialize_event(doc) -> StructuredFillEventRecord:
    data = doc.to_dict() or {}
    return StructuredFillEventRecord(
        id=doc.id,
        user_id=str(data.get("user_id") or "").strip(),
        request_id=str(data.get("request_id") or "").strip(),
        usage_month_key=_coerce_month_key(data.get("usage_month_key")) or _current_month_key(),
        status=str(data.get("status") or "").strip(),
        source_category=str(data.get("source_category") or STRUCTURED_FILL_SOURCE_CATEGORY).strip()
        or STRUCTURED_FILL_SOURCE_CATEGORY,
        source_kind=str(data.get("source_kind") or "").strip(),
        scope_type=str(data.get("scope_type") or "template").strip() or "template",
        scope_id=(str(data.get("scope_id") or "").strip() or None),
        template_id=(str(data.get("template_id") or "").strip() or None),
        group_id=(str(data.get("group_id") or "").strip() or None),
        target_template_ids=_coerce_string_list(data.get("target_template_ids")),
        matched_template_ids=_coerce_string_list(data.get("matched_template_ids")),
        count_increment=max(0, _coerce_int(data.get("count_increment"))),
        match_count=max(0, _coerce_int(data.get("match_count"))),
        record_label_preview=(str(data.get("record_label_preview") or "").strip() or None),
        record_fingerprint=(str(data.get("record_fingerprint") or "").strip() or None),
        data_source_label=(str(data.get("data_source_label") or "").strip() or None),
        workspace_saved_form_id=(str(data.get("workspace_saved_form_id") or "").strip() or None),
        search_query_preview=(str(data.get("search_query_preview") or "").strip() or None),
        reviewed_fill_context=_coerce_optional_dict(data.get("reviewed_fill_context")),
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
    )


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------


def get_structured_fill_monthly_usage(
    user_id: str,
    *,
    month_key: Optional[str] = None,
) -> Optional[StructuredFillMonthlyUsageRecord]:
    normalized_user_id = str(user_id or "").strip()
    normalized_month_key = _coerce_month_key(month_key) or _current_month_key()
    if not normalized_user_id:
        return None
    client = get_firestore_client()
    snapshot = _usage_counter_ref(client, normalized_user_id, normalized_month_key).get()
    if not snapshot.exists:
        return None
    return _serialize_usage_counter(snapshot)


def resolve_structured_fill_monthly_limit_for_user(user_id: str) -> int:
    profile = get_user_profile(str(user_id or "").strip())
    role = normalize_role(profile.role if profile else None)
    return resolve_structured_fill_monthly_limit(role)


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------


def _validate_commit_inputs(
    *,
    user_id: str,
    request_id: str,
    source_category: str,
    source_kind: str,
    scope_type: str,
    template_id: Optional[str],
    group_id: Optional[str],
    target_template_ids: List[str],
    matched_template_ids: List[str],
    count_increment: int,
    match_count: int,
) -> None:
    if not user_id:
        raise StructuredFillInvalidRequestError("user_id is required")
    if not request_id:
        raise StructuredFillInvalidRequestError("requestId is required")
    if source_category != STRUCTURED_FILL_SOURCE_CATEGORY:
        raise StructuredFillInvalidRequestError(
            f"sourceCategory must be '{STRUCTURED_FILL_SOURCE_CATEGORY}'"
        )
    if source_kind not in STRUCTURED_FILL_SOURCE_KINDS:
        raise StructuredFillInvalidRequestError(
            f"sourceKind must be one of {sorted(STRUCTURED_FILL_SOURCE_KINDS)}"
        )
    if scope_type not in STRUCTURED_FILL_SCOPE_TYPES:
        raise StructuredFillInvalidRequestError("scopeType must be 'template' or 'group'")
    if scope_type == "template" and not template_id:
        raise StructuredFillInvalidRequestError("templateId is required when scopeType='template'")
    if scope_type == "group" and not group_id:
        raise StructuredFillInvalidRequestError("groupId is required when scopeType='group'")
    if count_increment < 0:
        raise StructuredFillInvalidRequestError("countIncrement cannot be negative")
    if match_count < 0:
        raise StructuredFillInvalidRequestError("matchCount cannot be negative")
    # No charge should ever exceed the number of matched PDFs in this commit.
    # The frontend resolves matched_template_ids; the backend trusts its length
    # as the ceiling for count_increment to guard against inflated increments.
    if matched_template_ids and count_increment > len(matched_template_ids):
        raise StructuredFillInvalidRequestError(
            "countIncrement cannot exceed the number of matched target templates"
        )
    # When count_increment > 0 the caller must supply at least one matched template —
    # a charge with no matches is a logic bug, not a policy decision.
    if count_increment > 0 and not matched_template_ids:
        raise StructuredFillInvalidRequestError(
            "matchedTemplateIds is required when countIncrement > 0"
        )
    # Close a bypass: a caller that sends match_count>0 together with
    # count_increment=0 would otherwise get a committed event with 0 charge
    # and a request_guard that permanently blocks the correct charge from
    # being applied on retry. The policy is "N matched PDFs charge N", so
    # match_count>0 MUST carry a matching count_increment. If the caller
    # really means "no-match", it must also zero match_count.
    if match_count > 0 and count_increment == 0:
        raise StructuredFillInvalidRequestError(
            "count_increment must equal match_count for a chargeable fill; "
            "send both zero for a no-match commit"
        )
    # Belt-and-suspenders: match_count should equal the number of matched
    # templates when both are provided. Prevent a silent undercount where
    # a caller supplies matched_template_ids=[a,b,c] but match_count=1.
    if matched_template_ids and match_count not in (0, len(matched_template_ids)):
        raise StructuredFillInvalidRequestError(
            "match_count must equal the number of matched_template_ids or be 0"
        )
    _ = target_template_ids  # Kept for payload completeness; no extra check needed here.


def _build_event_payload(
    *,
    user_id: str,
    request_id: str,
    month_key: str,
    status: str,
    source_category: str,
    source_kind: str,
    scope_type: str,
    scope_id: Optional[str],
    template_id: Optional[str],
    group_id: Optional[str],
    target_template_ids: List[str],
    matched_template_ids: List[str],
    count_increment: int,
    match_count: int,
    record_label_preview: Optional[str],
    record_fingerprint: Optional[str],
    data_source_label: Optional[str],
    workspace_saved_form_id: Optional[str],
    search_query_preview: Optional[str],
    reviewed_fill_context: Optional[Dict[str, Any]],
    timestamp: str,
) -> Dict[str, Any]:
    return {
        "user_id": user_id,
        "request_id": request_id,
        "usage_month_key": month_key,
        "status": status,
        "source_category": source_category,
        "source_kind": source_kind,
        "scope_type": scope_type,
        "scope_id": scope_id,
        "template_id": template_id,
        "group_id": group_id,
        "target_template_ids": list(target_template_ids),
        "matched_template_ids": list(matched_template_ids),
        "count_increment": int(count_increment),
        "match_count": int(match_count),
        "record_label_preview": record_label_preview,
        "record_fingerprint": record_fingerprint,
        "data_source_label": data_source_label,
        "workspace_saved_form_id": workspace_saved_form_id,
        "search_query_preview": search_query_preview,
        "reviewed_fill_context": (
            dict(reviewed_fill_context) if isinstance(reviewed_fill_context, dict) else None
        ),
        "created_at": timestamp,
        "updated_at": timestamp,
    }


def commit_structured_fill_usage(
    user_id: str,
    *,
    request_id: str,
    source_kind: str,
    scope_type: str,
    scope_id: Optional[str] = None,
    template_id: Optional[str] = None,
    group_id: Optional[str] = None,
    target_template_ids: Optional[List[str]] = None,
    matched_template_ids: Optional[List[str]] = None,
    count_increment: int = 0,
    match_count: int = 0,
    record_label_preview: Optional[str] = None,
    record_fingerprint: Optional[str] = None,
    data_source_label: Optional[str] = None,
    workspace_saved_form_id: Optional[str] = None,
    search_query_preview: Optional[str] = None,
    reviewed_fill_context: Optional[Dict[str, Any]] = None,
    source_category: str = STRUCTURED_FILL_SOURCE_CATEGORY,
    month_key: Optional[str] = None,
    monthly_limit: Optional[int] = None,
) -> StructuredFillCommitResult:
    """Commit a Search & Fill charge atomically.

    Writes one event, one request guard, and updates the monthly counter in a
    single transaction. If a request with the same ``(user_id, request_id)``
    has already been processed the original result is replayed with
    ``status='replayed'`` and no new charge is applied.

    Raises :class:`StructuredFillMonthlyLimitExceededError` if the commit would
    push monthly usage past ``monthly_limit``. In that case no documents are
    written and callers should surface a ``429``-style response to the client.
    """

    normalized_user_id = str(user_id or "").strip()
    normalized_request_id = str(request_id or "").strip()
    normalized_source_category = str(source_category or "").strip()
    normalized_source_kind = str(source_kind or "").strip().lower()
    normalized_scope_type = str(scope_type or "").strip().lower() or "template"
    normalized_template_id = (str(template_id or "").strip() or None)
    normalized_group_id = (str(group_id or "").strip() or None)
    normalized_scope_id = (str(scope_id or "").strip() or None) or (
        normalized_template_id if normalized_scope_type == "template" else normalized_group_id
    )
    normalized_targets = _coerce_string_list(target_template_ids)
    normalized_matched = _coerce_string_list(matched_template_ids)
    normalized_count_increment = max(0, _coerce_int(count_increment))
    normalized_match_count = max(0, _coerce_int(match_count))
    normalized_month_key = _coerce_month_key(month_key) or _current_month_key()
    normalized_label = _truncate(record_label_preview, limit=_RECORD_LABEL_PREVIEW_MAX)
    normalized_fingerprint = _truncate(record_fingerprint, limit=128)
    normalized_source_label = _truncate(data_source_label, limit=_DATA_SOURCE_LABEL_MAX)
    normalized_saved_form_id = (str(workspace_saved_form_id or "").strip() or None)
    normalized_query_preview = _truncate(search_query_preview, limit=_SEARCH_QUERY_PREVIEW_MAX)
    normalized_reviewed_context = _coerce_optional_dict(reviewed_fill_context)

    _validate_commit_inputs(
        user_id=normalized_user_id,
        request_id=normalized_request_id,
        source_category=normalized_source_category,
        source_kind=normalized_source_kind,
        scope_type=normalized_scope_type,
        template_id=normalized_template_id,
        group_id=normalized_group_id,
        target_template_ids=normalized_targets,
        matched_template_ids=normalized_matched,
        count_increment=normalized_count_increment,
        match_count=normalized_match_count,
    )

    resolved_limit = (
        int(monthly_limit)
        if monthly_limit is not None
        else resolve_structured_fill_monthly_limit_for_user(normalized_user_id)
    )

    if normalized_count_increment == 0:
        if normalized_match_count == 0:
            derived_status = STATUS_REJECTED_NO_MATCH
        else:
            derived_status = STATUS_COMMITTED
    else:
        derived_status = STATUS_COMMITTED

    client = get_firestore_client()
    usage_ref = _usage_counter_ref(client, normalized_user_id, normalized_month_key)
    guard_ref = _request_guard_ref(client, normalized_user_id, normalized_request_id)
    event_ref = _event_ref(client)

    transaction = client.transaction()

    @firebase_firestore.transactional
    def _commit(txn: firebase_firestore.Transaction) -> StructuredFillCommitResult:
        guard_snapshot = guard_ref.get(transaction=txn)
        if guard_snapshot.exists:
            guard_data = guard_snapshot.to_dict() or {}
            existing_event_id = str(guard_data.get("event_id") or "").strip()
            existing_month_key = (
                _coerce_month_key(guard_data.get("month_key")) or normalized_month_key
            )
            existing_increment = max(0, _coerce_int(guard_data.get("count_increment")))
            usage_snapshot = _usage_counter_ref(
                client, normalized_user_id, existing_month_key
            ).get(transaction=txn)
            usage_record = (
                _serialize_usage_counter(usage_snapshot) if usage_snapshot.exists else None
            )
            current_usage = usage_record.credit_count if usage_record is not None else 0
            return StructuredFillCommitResult(
                status=STATUS_REPLAYED,
                event_id=existing_event_id,
                request_id=normalized_request_id,
                month_key=existing_month_key,
                count_increment=existing_increment,
                current_month_usage=current_usage,
                fills_remaining=max(0, resolved_limit - current_usage),
                monthly_limit=resolved_limit,
            )

        usage_snapshot = usage_ref.get(transaction=txn)
        usage_record = (
            _serialize_usage_counter(usage_snapshot) if usage_snapshot.exists else None
        )
        current_usage = usage_record.credit_count if usage_record is not None else 0
        current_commits = usage_record.commit_count if usage_record is not None else 0
        current_matched = usage_record.matched_pdf_count if usage_record is not None else 0

        if derived_status == STATUS_COMMITTED and normalized_count_increment > 0:
            if resolved_limit <= 0 or current_usage + normalized_count_increment > resolved_limit:
                raise StructuredFillMonthlyLimitExceededError(
                    "Monthly Search & Fill credit limit reached."
                )

        timestamp = now_iso()
        charge_applied = (
            normalized_count_increment if derived_status == STATUS_COMMITTED else 0
        )
        event_payload = _build_event_payload(
            user_id=normalized_user_id,
            request_id=normalized_request_id,
            month_key=normalized_month_key,
            status=derived_status,
            source_category=normalized_source_category,
            source_kind=normalized_source_kind,
            scope_type=normalized_scope_type,
            scope_id=normalized_scope_id,
            template_id=normalized_template_id,
            group_id=normalized_group_id,
            target_template_ids=normalized_targets,
            matched_template_ids=normalized_matched,
            count_increment=charge_applied,
            match_count=normalized_match_count,
            record_label_preview=normalized_label,
            record_fingerprint=normalized_fingerprint,
            data_source_label=normalized_source_label,
            workspace_saved_form_id=normalized_saved_form_id,
            search_query_preview=normalized_query_preview,
            reviewed_fill_context=normalized_reviewed_context,
            timestamp=timestamp,
        )
        txn.set(event_ref, event_payload)

        guard_payload = {
            "user_id": normalized_user_id,
            "request_id": normalized_request_id,
            "event_id": event_ref.id,
            "month_key": normalized_month_key,
            "status": derived_status,
            "count_increment": charge_applied,
            "created_at": timestamp,
            "updated_at": timestamp,
            "expires_at": None,
        }
        txn.set(guard_ref, guard_payload)

        if charge_applied > 0:
            next_usage = current_usage + charge_applied
            next_commits = current_commits + 1
            next_matched = current_matched + max(0, len(normalized_matched))
            usage_payload = {
                "user_id": normalized_user_id,
                "month_key": normalized_month_key,
                "credit_count": next_usage,
                "commit_count": next_commits,
                "matched_pdf_count": next_matched,
                "created_at": (usage_record.created_at if usage_record is not None else timestamp)
                or timestamp,
                "updated_at": timestamp,
            }
            txn.set(usage_ref, usage_payload, merge=True)
            current_usage_out = next_usage
        else:
            current_usage_out = current_usage

        return StructuredFillCommitResult(
            status=derived_status,
            event_id=event_ref.id,
            request_id=normalized_request_id,
            month_key=normalized_month_key,
            count_increment=charge_applied,
            current_month_usage=current_usage_out,
            fills_remaining=max(0, resolved_limit - current_usage_out),
            monthly_limit=resolved_limit,
        )

    result = _commit(transaction)
    logger.info(
        "structured_fill commit user=%s event=%s status=%s charge=%d month=%s source=%s scope=%s",
        normalized_user_id,
        result.event_id,
        result.status,
        result.count_increment,
        result.month_key,
        normalized_source_kind,
        normalized_scope_type,
    )
    return result


def evaluate_structured_fill_precheck(
    user_id: str,
    *,
    pdf_count: int,
    source_kind: str,
) -> Dict[str, Any]:
    """UX-only preview: does a planned fill fit in the remaining monthly budget?

    Read-only — does not consume quota or write any documents. The actual debit
    happens inside :func:`commit_structured_fill_usage`, which has its own
    atomic re-check. A precheck-allowed plan can still be rejected by a
    concurrent commit that eats the remaining budget first.
    """

    normalized_user_id = str(user_id or "").strip()
    normalized_source_kind = str(source_kind or "").strip().lower()
    normalized_pdf_count = max(0, _coerce_int(pdf_count))
    if normalized_source_kind and normalized_source_kind not in STRUCTURED_FILL_SOURCE_KINDS:
        raise StructuredFillInvalidRequestError(
            f"sourceKind must be one of {sorted(STRUCTURED_FILL_SOURCE_KINDS)}"
        )
    monthly_limit = resolve_structured_fill_monthly_limit_for_user(normalized_user_id)
    usage = get_structured_fill_monthly_usage(normalized_user_id)
    current_usage = usage.credit_count if usage is not None else 0
    month_key = usage.month_key if usage is not None else _current_month_key()
    fills_remaining = max(0, monthly_limit - current_usage)
    allowed = monthly_limit > 0 and (current_usage + normalized_pdf_count) <= monthly_limit
    return {
        "allowed": allowed,
        "monthlyLimit": monthly_limit,
        "currentMonthUsage": current_usage,
        "fillsRemaining": fills_remaining,
        "monthKey": month_key,
        "sourceKind": normalized_source_kind or None,
        "sourceCategory": STRUCTURED_FILL_SOURCE_CATEGORY,
        "pdfCount": normalized_pdf_count,
    }
