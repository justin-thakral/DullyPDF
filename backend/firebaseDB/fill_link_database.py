"""Firestore-backed Fill By Link metadata and respondent submissions."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
from typing import Any, Dict, List, Optional

from firebase_admin import firestore as firebase_firestore

from backend.logging_config import get_logger
from backend.services.limits_service import resolve_fill_link_responses_monthly_limit
from backend.services.fill_links_service import (
    allow_legacy_fill_link_public_tokens,
    parse_fill_link_public_token,
)
from backend.time_utils import now_iso
from .user_database import get_user_profile, normalize_role
from .firestore_query_utils import where_equals
from .firebase_service import get_firestore_client


logger = get_logger(__name__)

FILL_LINKS_COLLECTION = "fill_links"
FILL_LINK_RESPONSES_COLLECTION = "fill_link_responses"
FILL_LINK_USAGE_COUNTERS_COLLECTION = "fill_link_usage_counters"


@dataclass(frozen=True)
class FillLinkRecord:
    id: str
    user_id: str
    scope_type: str
    template_id: Optional[str]
    template_name: Optional[str]
    group_id: Optional[str]
    group_name: Optional[str]
    template_ids: List[str]
    title: Optional[str]
    public_token: Optional[str]
    status: str
    closed_reason: Optional[str]
    response_count: int
    questions: List[Dict[str, Any]]
    require_all_fields: bool
    web_form_config: Optional[Dict[str, Any]]
    signing_config: Optional[Dict[str, Any]]
    created_at: Optional[str]
    updated_at: Optional[str]
    published_at: Optional[str]
    closed_at: Optional[str]
    respondent_pdf_download_enabled: bool = False
    respondent_pdf_snapshot: Optional[Dict[str, Any]] = None
    canonical_schema_snapshot: Optional[Dict[str, Any]] = None


@dataclass(frozen=True)
class FillLinkResponseRecord:
    id: str
    link_id: str
    user_id: str
    scope_type: str
    template_id: Optional[str]
    group_id: Optional[str]
    attempt_id: Optional[str]
    respondent_label: str
    respondent_secondary_label: Optional[str]
    answers: Dict[str, Any]
    search_text: str
    submitted_at: Optional[str]
    respondent_pdf_snapshot: Optional[Dict[str, Any]] = None
    signing_request_id: Optional[str] = None
    signing_linked_at: Optional[str] = None


@dataclass(frozen=True)
class FillLinkSubmissionResult:
    status: str
    link: Optional[FillLinkRecord]
    response: Optional[FillLinkResponseRecord]


@dataclass(frozen=True)
class FillLinkMonthlyUsageRecord:
    id: str
    user_id: str
    month_key: str
    response_count: int
    created_at: Optional[str]
    updated_at: Optional[str]


def _coerce_dict_list(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [entry for entry in value if isinstance(entry, dict)]


def _coerce_optional_dict(value: Any) -> Optional[Dict[str, Any]]:
    return dict(value) if isinstance(value, dict) else None


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


def _coerce_int(value: Any, *, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _sanitize_doc_id_component(value: Any) -> str:
    return str(value or "").strip().replace("/", "_")


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


def _fill_link_scope_doc_id(
    *,
    user_id: str,
    scope_type: str,
    template_id: Optional[str] = None,
    group_id: Optional[str] = None,
) -> str:
    scope_id = template_id if scope_type == "template" else group_id
    return f"{_sanitize_doc_id_component(user_id)}__{_sanitize_doc_id_component(scope_type)}__{_sanitize_doc_id_component(scope_id)}"


def _build_fill_link_usage_counter_id(user_id: str, month_key: str) -> str:
    return f"{_sanitize_doc_id_component(user_id)}__{month_key}"


def _fill_link_usage_counter_doc_ref(user_id: str, month_key: str, client):
    return client.collection(FILL_LINK_USAGE_COUNTERS_COLLECTION).document(
        _build_fill_link_usage_counter_id(user_id, month_key)
    )


def _fill_link_response_doc_ref(
    *,
    link_id: str,
    attempt_id: Optional[str],
    client,
):
    collection = client.collection(FILL_LINK_RESPONSES_COLLECTION)
    normalized_attempt_id = str(attempt_id or "").strip() or None
    if not normalized_attempt_id:
        return collection.document()
    digest = hashlib.sha256(f"{link_id}:{normalized_attempt_id}".encode("utf-8")).hexdigest()
    return collection.document(f"attempt_{digest}")


def _serialize_fill_link(doc) -> FillLinkRecord:
    data = doc.to_dict() or {}
    scope_type = str(data.get("scope_type") or "template").strip() or "template"
    template_id = str(data.get("template_id") or "").strip() or None
    template_ids = _coerce_string_list(data.get("template_ids"))
    if template_id and template_id not in template_ids:
        template_ids = [template_id, *template_ids]
    return FillLinkRecord(
        id=doc.id,
        user_id=str(data.get("user_id") or "").strip(),
        scope_type=scope_type,
        template_id=template_id,
        template_name=(str(data.get("template_name") or "").strip() or None),
        group_id=(str(data.get("group_id") or "").strip() or None),
        group_name=(str(data.get("group_name") or "").strip() or None),
        template_ids=template_ids,
        title=(str(data.get("title") or "").strip() or None),
        public_token=(str(data.get("public_token") or "").strip() or None),
        status=str(data.get("status") or "closed").strip() or "closed",
        closed_reason=(str(data.get("closed_reason") or "").strip() or None),
        response_count=max(0, _coerce_int(data.get("response_count"), default=0)),
        questions=_coerce_dict_list(data.get("questions")),
        require_all_fields=bool(data.get("require_all_fields")),
        web_form_config=_coerce_optional_dict(data.get("web_form_config")),
        signing_config=_coerce_optional_dict(data.get("signing_config")),
        respondent_pdf_download_enabled=bool(data.get("respondent_pdf_download_enabled")),
        respondent_pdf_snapshot=_coerce_optional_dict(data.get("respondent_pdf_snapshot")),
        canonical_schema_snapshot=_coerce_optional_dict(data.get("canonical_schema_snapshot")),
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
        published_at=data.get("published_at"),
        closed_at=data.get("closed_at"),
    )


def _serialize_fill_link_response(doc) -> FillLinkResponseRecord:
    data = doc.to_dict() or {}
    answers = data.get("answers")
    return FillLinkResponseRecord(
        id=doc.id,
        link_id=str(data.get("link_id") or "").strip(),
        user_id=str(data.get("user_id") or "").strip(),
        scope_type=str(data.get("scope_type") or "template").strip() or "template",
        template_id=(str(data.get("template_id") or "").strip() or None),
        group_id=(str(data.get("group_id") or "").strip() or None),
        attempt_id=(str(data.get("attempt_id") or "").strip() or None),
        respondent_label=str(data.get("respondent_label") or "Response").strip() or "Response",
        respondent_secondary_label=(str(data.get("respondent_secondary_label") or "").strip() or None),
        answers=answers if isinstance(answers, dict) else {},
        search_text=str(data.get("search_text") or "").strip().lower(),
        submitted_at=data.get("submitted_at"),
        respondent_pdf_snapshot=_coerce_optional_dict(data.get("respondent_pdf_snapshot")),
        signing_request_id=(str(data.get("signing_request_id") or "").strip() or None),
        signing_linked_at=(str(data.get("signing_linked_at") or "").strip() or None),
    )


def _serialize_fill_link_usage_counter(doc) -> FillLinkMonthlyUsageRecord:
    data = doc.to_dict() or {}
    month_key = _coerce_month_key(data.get("month_key")) or _current_month_key()
    return FillLinkMonthlyUsageRecord(
        id=doc.id,
        user_id=str(data.get("user_id") or "").strip(),
        month_key=month_key,
        response_count=max(0, _coerce_int(data.get("response_count"), default=0)),
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
    )


def get_fill_link_monthly_usage(user_id: str, *, month_key: Optional[str] = None) -> Optional[FillLinkMonthlyUsageRecord]:
    normalized_user_id = str(user_id or "").strip()
    normalized_month_key = _coerce_month_key(month_key) or _current_month_key()
    if not normalized_user_id:
        return None
    client = get_firestore_client()
    snapshot = _fill_link_usage_counter_doc_ref(normalized_user_id, normalized_month_key, client).get()
    if not snapshot.exists:
        return None
    return _serialize_fill_link_usage_counter(snapshot)


def _resolve_fill_link_monthly_limit_for_user(user_id: str) -> int:
    profile = get_user_profile(str(user_id or "").strip())
    role = normalize_role(profile.role if profile else None)
    return resolve_fill_link_responses_monthly_limit(role)


def list_fill_links(
    user_id: str,
    *,
    template_id: Optional[str] = None,
    group_id: Optional[str] = None,
    scope_type: Optional[str] = None,
) -> List[FillLinkRecord]:
    if not user_id:
        return []
    client = get_firestore_client()
    snapshot = where_equals(client.collection(FILL_LINKS_COLLECTION), "user_id", user_id).get()
    records = [_serialize_fill_link(doc) for doc in snapshot]
    if template_id:
        records = [record for record in records if record.template_id == template_id]
    if group_id:
        records = [record for record in records if record.group_id == group_id]
    if scope_type:
        normalized_scope = str(scope_type or "").strip().lower()
        records = [record for record in records if record.scope_type == normalized_scope]
    records.sort(key=lambda record: record.updated_at or record.created_at or "", reverse=True)
    return records


def get_fill_link(link_id: str, user_id: str) -> Optional[FillLinkRecord]:
    if not link_id or not user_id:
        return None
    client = get_firestore_client()
    doc_ref = client.collection(FILL_LINKS_COLLECTION).document(link_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        return None
    record = _serialize_fill_link(snapshot)
    if record.user_id != user_id:
        return None
    return record


def get_fill_link_for_template(template_id: str, user_id: str) -> Optional[FillLinkRecord]:
    records = list_fill_links(user_id, template_id=template_id, scope_type="template")
    return records[0] if records else None


def get_fill_link_for_group(group_id: str, user_id: str) -> Optional[FillLinkRecord]:
    records = list_fill_links(user_id, group_id=group_id, scope_type="group")
    return records[0] if records else None


def _get_fill_link_doc_ref_by_public_token(public_token: str, client=None):
    normalized_token = str(public_token or "").strip()
    if not normalized_token:
        return None
    firestore_client = client or get_firestore_client()
    signed_link_id = parse_fill_link_public_token(normalized_token)
    if signed_link_id:
        doc_ref = firestore_client.collection(FILL_LINKS_COLLECTION).document(signed_link_id)
        snapshot = doc_ref.get()
        if snapshot.exists:
            return doc_ref
        return None
    if not allow_legacy_fill_link_public_tokens():
        return None
    exact_match_snapshot = where_equals(
        firestore_client.collection(FILL_LINKS_COLLECTION),
        "public_token",
        normalized_token,
    ).get()
    exact_match_docs = [doc for doc in exact_match_snapshot]
    if exact_match_docs:
        exact_match_docs.sort(key=lambda doc: (doc.to_dict() or {}).get("created_at") or "", reverse=True)
        return firestore_client.collection(FILL_LINKS_COLLECTION).document(exact_match_docs[0].id)
    return None


def get_fill_link_by_public_token(public_token: str) -> Optional[FillLinkRecord]:
    if not public_token:
        return None
    client = get_firestore_client()
    doc_ref = _get_fill_link_doc_ref_by_public_token(public_token, client=client)
    if doc_ref is None:
        return None
    snapshot = doc_ref.get()
    if not snapshot.exists:
        return None
    return _serialize_fill_link(snapshot)

def create_or_update_fill_link(
    user_id: str,
    *,
    template_id: Optional[str] = None,
    template_name: Optional[str],
    title: Optional[str],
    questions: List[Dict[str, Any]],
    require_all_fields: bool,
    web_form_config: Optional[Dict[str, Any]] = None,
    signing_config: Optional[Dict[str, Any]] = None,
    respondent_pdf_download_enabled: bool = False,
    respondent_pdf_snapshot: Optional[Dict[str, Any]] = None,
    canonical_schema_snapshot: Optional[Dict[str, Any]] = None,
    status: str = "active",
    closed_reason: Optional[str] = None,
    scope_type: str = "template",
    group_id: Optional[str] = None,
    group_name: Optional[str] = None,
    template_ids: Optional[List[str]] = None,
) -> FillLinkRecord:
    if not user_id:
        raise ValueError("user_id is required")
    normalized_scope = str(scope_type or "template").strip().lower() or "template"
    cleaned_template_id = str(template_id or "").strip() or None
    cleaned_group_id = str(group_id or "").strip() or None
    deduped_template_ids = _coerce_string_list(template_ids)
    if normalized_scope not in {"template", "group"}:
        raise ValueError("scope_type must be template or group")
    if normalized_scope == "template":
        if not cleaned_template_id:
            raise ValueError("template_id is required")
        if cleaned_template_id not in deduped_template_ids:
            deduped_template_ids = [cleaned_template_id, *deduped_template_ids]
    else:
        if not cleaned_group_id:
            raise ValueError("group_id is required")
        if not deduped_template_ids:
            raise ValueError("template_ids are required")
    if not questions:
        raise ValueError("questions are required")

    client = get_firestore_client()
    existing = (
        get_fill_link_for_template(cleaned_template_id, user_id)
        if normalized_scope == "template"
        else get_fill_link_for_group(cleaned_group_id, user_id)
    )
    doc_ref = client.collection(FILL_LINKS_COLLECTION).document(
        existing.id
        if existing
        else _fill_link_scope_doc_id(
            user_id=user_id,
            scope_type=normalized_scope,
            template_id=cleaned_template_id,
            group_id=cleaned_group_id,
        )
    )
    transaction = client.transaction()

    @firebase_firestore.transactional
    def _upsert(txn: firebase_firestore.Transaction) -> None:
        snapshot = doc_ref.get(transaction=txn)
        current = _serialize_fill_link(snapshot) if snapshot.exists else None
        timestamp = now_iso()
        payload: Dict[str, Any] = {
            "user_id": user_id,
            "scope_type": normalized_scope,
            "template_id": cleaned_template_id,
            "template_name": (template_name or "").strip() or None,
            "group_id": cleaned_group_id,
            "group_name": (group_name or "").strip() or None,
            "template_ids": deduped_template_ids,
            "title": (title or "").strip() or None,
            "status": (status or "active").strip() or "active",
            "closed_reason": (closed_reason or "").strip() or None,
            "questions": questions,
            "require_all_fields": bool(require_all_fields),
            "web_form_config": dict(web_form_config) if isinstance(web_form_config, dict) else None,
            "signing_config": dict(signing_config) if isinstance(signing_config, dict) else None,
            "respondent_pdf_download_enabled": bool(respondent_pdf_download_enabled),
            "respondent_pdf_snapshot": (
                dict(respondent_pdf_snapshot)
                if isinstance(respondent_pdf_snapshot, dict)
                else None
            ),
            "canonical_schema_snapshot": (
                dict(canonical_schema_snapshot)
                if isinstance(canonical_schema_snapshot, dict)
                else None
            ),
            "updated_at": timestamp,
        }
        next_is_active = payload["status"] == "active"

        if current:
            if next_is_active:
                payload["public_token"] = None
                payload["published_at"] = current.published_at or timestamp
                payload["closed_at"] = None
            else:
                payload["public_token"] = None
                payload["closed_at"] = current.closed_at or timestamp
            txn.set(doc_ref, payload, merge=True)
        else:
            payload["public_token"] = None
            payload["response_count"] = 0
            payload["created_at"] = timestamp
            payload["published_at"] = timestamp if next_is_active else None
            payload["closed_at"] = timestamp if not next_is_active else None
            txn.set(doc_ref, payload, merge=False)

    _upsert(transaction)
    logger.debug(
        "Upserted fill link: scope=%s scope_id=%s link=%s templates=%s",
        normalized_scope,
        cleaned_template_id or cleaned_group_id,
        doc_ref.id,
        len(deduped_template_ids),
    )
    return _serialize_fill_link(doc_ref.get())


def update_fill_link(
    link_id: str,
    user_id: str,
    *,
    title: Optional[str] = None,
    questions: Optional[List[Dict[str, Any]]] = None,
    group_name: Optional[str] = None,
    template_ids: Optional[List[str]] = None,
    require_all_fields: Optional[bool] = None,
    web_form_config: Optional[Dict[str, Any]] = None,
    signing_config: Optional[Dict[str, Any]] = None,
    respondent_pdf_download_enabled: Optional[bool] = None,
    respondent_pdf_snapshot: Optional[Dict[str, Any]] = None,
    canonical_schema_snapshot: Optional[Dict[str, Any]] = None,
    status: Optional[str] = None,
    closed_reason: Optional[str] = None,
) -> Optional[FillLinkRecord]:
    if not link_id or not user_id:
        return None
    client = get_firestore_client()
    doc_ref = client.collection(FILL_LINKS_COLLECTION).document(link_id)
    transaction = client.transaction()

    @firebase_firestore.transactional
    def _update(txn: firebase_firestore.Transaction) -> bool:
        snapshot = doc_ref.get(transaction=txn)
        if not snapshot.exists:
            return False
        record = _serialize_fill_link(snapshot)
        if record.user_id != user_id:
            return False

        timestamp = now_iso()
        payload: Dict[str, Any] = {"updated_at": timestamp, "public_token": None}
        if title is not None:
            payload["title"] = title.strip() or None
        if questions is not None:
            payload["questions"] = questions
        if group_name is not None:
            payload["group_name"] = group_name.strip() or None
        if template_ids is not None:
            payload["template_ids"] = _coerce_string_list(template_ids)
        if require_all_fields is not None:
            payload["require_all_fields"] = bool(require_all_fields)
        if web_form_config is not None:
            payload["web_form_config"] = dict(web_form_config) if isinstance(web_form_config, dict) else None
        if signing_config is not None:
            payload["signing_config"] = dict(signing_config) if isinstance(signing_config, dict) else None
        if respondent_pdf_download_enabled is not None:
            enabled = bool(respondent_pdf_download_enabled)
            payload["respondent_pdf_download_enabled"] = enabled
            payload["respondent_pdf_snapshot"] = (
                dict(respondent_pdf_snapshot)
                if isinstance(respondent_pdf_snapshot, dict)
                else None
            )
        if canonical_schema_snapshot is not None:
            payload["canonical_schema_snapshot"] = (
                dict(canonical_schema_snapshot)
                if isinstance(canonical_schema_snapshot, dict)
                else None
            )

        if status is not None:
            normalized_status = status.strip() or "closed"
            payload["status"] = normalized_status
            payload["closed_reason"] = (closed_reason or "").strip() or None
            next_is_active = normalized_status == "active"
            if next_is_active:
                payload["closed_at"] = None
                if not record.published_at:
                    payload["published_at"] = timestamp
            else:
                payload["closed_at"] = timestamp
        elif closed_reason is not None:
            payload["closed_reason"] = closed_reason.strip() or None

        txn.set(doc_ref, payload, merge=True)
        return True

    if not _update(transaction):
        return None
    return _serialize_fill_link(doc_ref.get())


def close_fill_link(link_id: str, user_id: str, *, closed_reason: str = "owner_closed") -> Optional[FillLinkRecord]:
    return update_fill_link(link_id, user_id, status="closed", closed_reason=closed_reason)


def close_fill_links_for_template(template_id: str, user_id: str, *, closed_reason: str = "template_deleted") -> int:
    if not template_id or not user_id:
        return 0
    records = list_fill_links(user_id, template_id=template_id, scope_type="template")
    closed = 0
    for record in records:
        next_record = close_fill_link(record.id, user_id, closed_reason=closed_reason)
        if next_record is not None:
            closed += 1
    return closed


def close_fill_links_for_group(group_id: str, user_id: str, *, closed_reason: str = "group_deleted") -> int:
    if not group_id or not user_id:
        return 0
    records = list_fill_links(user_id, group_id=group_id, scope_type="group")
    closed = 0
    for record in records:
        next_record = close_fill_link(record.id, user_id, closed_reason=closed_reason)
        if next_record is not None:
            closed += 1
    return closed


def close_group_fill_links_for_template(template_id: str, user_id: str, *, closed_reason: str = "template_deleted") -> int:
    if not template_id or not user_id:
        return 0
    records = [
        record
        for record in list_fill_links(user_id, scope_type="group")
        if template_id in record.template_ids
    ]
    closed = 0
    for record in records:
        next_record = close_fill_link(record.id, user_id, closed_reason=closed_reason)
        if next_record is not None:
            closed += 1
    return closed


def _cleanup_fill_link_responses(link_id: str, *, client=None) -> int:
    """Delete all response documents for a given link_id.

    Runs outside the link deletion transaction but is safe because the parent
    link document is already gone — any concurrent submission will see
    ``not_found`` and abort.  Batches deletes to stay within Firestore limits.
    """
    firestore_client = client or get_firestore_client()
    response_docs = where_equals(
        firestore_client.collection(FILL_LINK_RESPONSES_COLLECTION), "link_id", link_id
    ).get()
    docs = list(response_docs)
    if not docs:
        return 0
    orphaned_at = now_iso()
    if not hasattr(firestore_client, "batch"):
        for doc in docs:
            payload = doc.to_dict() or {}
            signing_request_id = str(payload.get("signing_request_id") or "").strip()
            if signing_request_id:
                doc.reference.set(
                    {
                        "orphaned_by_link_delete_at": orphaned_at,
                        "orphaned_by_link_delete_reason": "linked_signing_request_retained",
                    },
                    merge=True,
                )
            else:
                doc.reference.delete()
        return len(docs)
    batch = firestore_client.batch()
    count = 0
    for doc in docs:
        payload = doc.to_dict() or {}
        signing_request_id = str(payload.get("signing_request_id") or "").strip()
        if signing_request_id:
            batch.set(
                doc.reference,
                {
                    "orphaned_by_link_delete_at": orphaned_at,
                    "orphaned_by_link_delete_reason": "linked_signing_request_retained",
                },
                merge=True,
            )
        else:
            batch.delete(doc.reference)
        count += 1
        if count % 400 == 0:
            batch.commit()
            batch = firestore_client.batch()
    if count % 400 != 0:
        batch.commit()
    return count


def delete_fill_link(link_id: str, user_id: str) -> bool:
    if not link_id or not user_id:
        return False
    client = get_firestore_client()
    doc_ref = client.collection(FILL_LINKS_COLLECTION).document(link_id)
    transaction = client.transaction()

    @firebase_firestore.transactional
    def _delete(txn: firebase_firestore.Transaction) -> bool:
        snapshot = doc_ref.get(transaction=txn)
        if not snapshot.exists:
            return False
        record = _serialize_fill_link(snapshot)
        if record.user_id != user_id:
            return False
        txn.delete(doc_ref)
        return True

    if not _delete(transaction):
        return False
    try:
        _cleanup_fill_link_responses(link_id, client=client)
    except Exception:
        logger.warning(
            "Failed to clean up responses for deleted fill link %s; orphaned docs may remain.",
            link_id,
            exc_info=True,
        )
    return True


def delete_fill_links_for_template(template_id: str, user_id: str) -> int:
    if not template_id or not user_id:
        return 0
    records = list_fill_links(user_id, template_id=template_id, scope_type="template")
    deleted = 0
    for record in records:
        if delete_fill_link(record.id, user_id):
            deleted += 1
    return deleted


def delete_fill_links_for_group(group_id: str, user_id: str) -> int:
    if not group_id or not user_id:
        return 0
    records = list_fill_links(user_id, group_id=group_id, scope_type="group")
    deleted = 0
    for record in records:
        if delete_fill_link(record.id, user_id):
            deleted += 1
    return deleted


def delete_group_fill_links_for_template(template_id: str, user_id: str) -> int:
    if not template_id or not user_id:
        return 0
    records = [
        record
        for record in list_fill_links(user_id, scope_type="group")
        if template_id in record.template_ids
    ]
    deleted = 0
    for record in records:
        if delete_fill_link(record.id, user_id):
            deleted += 1
    return deleted


def list_fill_link_responses(
    link_id: str,
    user_id: str,
    *,
    search: Optional[str] = None,
    limit: int = 100,
) -> List[FillLinkResponseRecord]:
    link = get_fill_link(link_id, user_id)
    if not link:
        return []
    client = get_firestore_client()
    snapshot = where_equals(client.collection(FILL_LINK_RESPONSES_COLLECTION), "link_id", link_id).get()
    records = [_serialize_fill_link_response(doc) for doc in snapshot]
    normalized_search = (search or "").strip().lower()
    if normalized_search:
        records = [record for record in records if normalized_search in record.search_text]
    records.sort(key=lambda record: record.submitted_at or "", reverse=True)
    limited = max(1, min(int(limit or 100), 10000))
    return records[:limited]


def get_fill_link_response(response_id: str, link_id: str, user_id: str) -> Optional[FillLinkResponseRecord]:
    if not response_id or not link_id:
        return None
    link = get_fill_link(link_id, user_id)
    if not link:
        return None
    client = get_firestore_client()
    doc_ref = client.collection(FILL_LINK_RESPONSES_COLLECTION).document(response_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        return None
    record = _serialize_fill_link_response(snapshot)
    if record.link_id != link_id:
        return None
    return record


def attach_fill_link_response_signing_request(
    response_id: str,
    link_id: str,
    user_id: str,
    *,
    signing_request_id: str,
) -> Optional[FillLinkResponseRecord]:
    """Attach a signing request to an existing Fill By Link response.

    The helper is intentionally O(1) in Firestore operations: one ownership
    check via ``get_fill_link_response`` and one merge update for the response
    document. That keeps public submit retries cheap while giving later owner
    views a stable foreign key instead of inferring signing status from labels.
    """

    normalized_request_id = str(signing_request_id or "").strip()
    if not normalized_request_id:
        return None
    response_record = get_fill_link_response(response_id, link_id, user_id)
    if response_record is None:
        return None
    firestore_client = get_firestore_client()
    doc_ref = firestore_client.collection(FILL_LINK_RESPONSES_COLLECTION).document(response_id)
    linked_at = now_iso()
    doc_ref.set(
        {
            "signing_request_id": normalized_request_id,
            "signing_linked_at": linked_at,
        },
        merge=True,
    )
    return _serialize_fill_link_response(doc_ref.get())


def submit_fill_link_response(
    public_token: str,
    *,
    answers: Dict[str, Any],
    attempt_id: Optional[str] = None,
    respondent_label: str,
    respondent_secondary_label: Optional[str],
    search_text: str,
) -> FillLinkSubmissionResult:
    if not public_token:
        return FillLinkSubmissionResult(status="not_found", link=None, response=None)

    client = get_firestore_client()
    doc_ref = _get_fill_link_doc_ref_by_public_token(public_token, client=client)
    if doc_ref is None:
        return FillLinkSubmissionResult(status="not_found", link=None, response=None)
    month_key = _current_month_key()
    transaction = client.transaction()

    @firebase_firestore.transactional
    def _submit(txn: firebase_firestore.Transaction) -> FillLinkSubmissionResult:
        snapshot = doc_ref.get(transaction=txn)
        if not snapshot.exists:
            return FillLinkSubmissionResult(status="not_found", link=None, response=None)
        current = _serialize_fill_link(snapshot)
        response_doc_ref = _fill_link_response_doc_ref(link_id=current.id, attempt_id=attempt_id, client=client)
        existing_response_snapshot = response_doc_ref.get(transaction=txn)
        if existing_response_snapshot.exists:
            return FillLinkSubmissionResult(
                status="accepted",
                link=current,
                response=_serialize_fill_link_response(existing_response_snapshot),
            )
        if current.status != "active":
            return FillLinkSubmissionResult(status="closed", link=current, response=None)
        usage_doc_ref = _fill_link_usage_counter_doc_ref(current.user_id, month_key, client)
        usage_snapshot = usage_doc_ref.get(transaction=txn)
        usage_record = _serialize_fill_link_usage_counter(usage_snapshot) if usage_snapshot.exists else None
        current_usage = usage_record.response_count if usage_record is not None else 0
        monthly_limit = _resolve_fill_link_monthly_limit_for_user(current.user_id)
        if monthly_limit <= 0 or current_usage >= monthly_limit:
            return FillLinkSubmissionResult(status="monthly_limit_reached", link=current, response=None)

        timestamp = now_iso()
        response_payload = {
            "link_id": current.id,
            "user_id": current.user_id,
            "scope_type": current.scope_type,
            "template_id": current.template_id,
            "group_id": current.group_id,
            "attempt_id": str(attempt_id or "").strip() or None,
            "respondent_label": respondent_label,
            "respondent_secondary_label": respondent_secondary_label,
            "answers": answers,
            "search_text": search_text,
            "submitted_at": timestamp,
            "respondent_pdf_snapshot": (
                dict(current.respondent_pdf_snapshot)
                if isinstance(current.respondent_pdf_snapshot, dict)
                else None
            ),
            "signing_request_id": None,
            "signing_linked_at": None,
        }
        txn.set(response_doc_ref, response_payload)

        next_count = current.response_count + 1
        next_usage = current_usage + 1
        txn.set(
            usage_doc_ref,
            {
                "user_id": current.user_id,
                "month_key": month_key,
                "response_count": next_usage,
                "created_at": usage_record.created_at if usage_record is not None and usage_record.created_at else timestamp,
                "updated_at": timestamp,
            },
            merge=True,
        )

        link_payload: Dict[str, Any] = {
            "response_count": next_count,
            "updated_at": timestamp,
        }
        txn.set(doc_ref, link_payload, merge=True)

        next_link = FillLinkRecord(
            id=current.id,
            user_id=current.user_id,
            scope_type=current.scope_type,
            template_id=current.template_id,
            template_name=current.template_name,
            group_id=current.group_id,
            group_name=current.group_name,
            template_ids=current.template_ids,
            title=current.title,
            public_token=current.public_token,
            status=current.status,
            closed_reason=current.closed_reason,
            response_count=next_count,
            questions=current.questions,
            require_all_fields=current.require_all_fields,
            web_form_config=current.web_form_config,
            signing_config=current.signing_config,
            respondent_pdf_download_enabled=current.respondent_pdf_download_enabled,
            respondent_pdf_snapshot=current.respondent_pdf_snapshot,
            created_at=current.created_at,
            updated_at=timestamp,
            published_at=current.published_at,
            closed_at=current.closed_at,
        )
        response = FillLinkResponseRecord(
            id=response_doc_ref.id,
            link_id=current.id,
            user_id=current.user_id,
            scope_type=current.scope_type,
            template_id=current.template_id,
            group_id=current.group_id,
            attempt_id=str(attempt_id or "").strip() or None,
            respondent_label=respondent_label,
            respondent_secondary_label=respondent_secondary_label,
            answers=answers,
            search_text=search_text,
            submitted_at=timestamp,
            respondent_pdf_snapshot=_coerce_optional_dict(response_payload.get("respondent_pdf_snapshot")),
            signing_request_id=None,
            signing_linked_at=None,
        )
        return FillLinkSubmissionResult(status="accepted", link=next_link, response=response)

    return _submit(transaction)
