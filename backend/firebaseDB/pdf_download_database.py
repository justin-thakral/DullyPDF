"""Firestore-backed accounting for user-triggered generated PDF downloads."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

from firebase_admin import firestore as firebase_firestore

from backend.logging_config import get_logger
from backend.services.limits_service import resolve_pdf_downloads_monthly_limit
from backend.time_utils import now_iso
from .firebase_service import get_firestore_client


logger = get_logger(__name__)

PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION = "pdf_download_usage_counters"
PDF_DOWNLOAD_EVENTS_COLLECTION = "pdf_download_events"
PDF_DOWNLOAD_REQUEST_GUARDS_COLLECTION = "pdf_download_request_guards"

PDF_DOWNLOAD_EXPORT_MODES = frozenset({"editable", "flat", "zip"})
PDF_DOWNLOAD_SOURCES = frozenset({"workspace_download", "workspace_group_download"})

STATUS_COMMITTED = "committed"
STATUS_REPLAYED = "replayed"
STATUS_REJECTED_LIMIT = "rejected_limit"
STATUS_REJECTED_INVALID = "rejected_invalid"


class PdfDownloadMonthlyLimitExceededError(RuntimeError):
    """Raised when a generated PDF download would exceed the monthly cap."""

    def __init__(
        self,
        *,
        monthly_limit: int,
        current_month_usage: int,
        downloads_remaining: int,
        month_key: str,
        pdf_count: int,
    ) -> None:
        self.monthly_limit = max(0, int(monthly_limit))
        self.current_month_usage = max(0, int(current_month_usage))
        self.downloads_remaining = max(0, int(downloads_remaining))
        self.month_key = month_key
        self.pdf_count = max(1, int(pdf_count))
        super().__init__(
            f"You have used all {self.monthly_limit} generated PDF downloads for this month."
        )

    def to_api_detail(self) -> Dict[str, Any]:
        return {
            "code": "pdf_download_limit_reached",
            "message": str(self),
            "monthlyLimit": self.monthly_limit,
            "currentMonthUsage": self.current_month_usage,
            "downloadsRemaining": self.downloads_remaining,
            "monthKey": self.month_key,
            "pdfCount": self.pdf_count,
        }


@dataclass(frozen=True)
class PdfDownloadMonthlyUsageRecord:
    id: str
    user_id: str
    month_key: str
    download_count: int
    event_count: int
    workspace_download_count: int
    group_download_pdf_count: int
    created_at: Optional[str]
    updated_at: Optional[str]


@dataclass(frozen=True)
class PdfDownloadEventRecord:
    id: str
    user_id: str
    request_id: Optional[str]
    usage_month_key: str
    status: str
    source: str
    export_mode: str
    pdf_count: int
    page_count: int
    field_count: int
    created_at: Optional[str]
    updated_at: Optional[str]
    metadata: Dict[str, Any]


@dataclass(frozen=True)
class PdfDownloadCommitResult:
    status: str
    event_id: str
    request_id: str
    month_key: str
    count_increment: int
    current_month_usage: int
    downloads_remaining: Optional[int]
    monthly_limit: Optional[int]
    source: str
    export_mode: str
    pdf_count: int


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


def _coerce_non_negative_int(value: Any, *, default: int = 0) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed >= 0 else 0


def _normalize_export_mode(value: Any) -> str:
    normalized = str(value or "editable").strip().lower()
    return normalized if normalized in PDF_DOWNLOAD_EXPORT_MODES else "editable"


def _validate_export_mode(value: Any) -> str:
    normalized = str(value or "editable").strip().lower()
    if normalized not in PDF_DOWNLOAD_EXPORT_MODES:
        raise ValueError("Invalid PDF download export mode")
    return normalized


def _normalize_source(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized not in PDF_DOWNLOAD_SOURCES:
        raise ValueError("Invalid PDF download source")
    return normalized


def _normalize_pdf_count(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = 1
    return max(1, parsed)


def _usage_counter_doc_id(user_id: str, month_key: str) -> str:
    return f"{_sanitize_doc_id_component(user_id)}__{month_key}"


def _request_guard_doc_id(user_id: str, request_id: str) -> str:
    return f"{_sanitize_doc_id_component(user_id)}__{_sanitize_doc_id_component(request_id)}"


def _usage_counter_ref(client, user_id: str, month_key: str):
    return client.collection(PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION).document(
        _usage_counter_doc_id(user_id, month_key)
    )


def _request_guard_ref(client, user_id: str, request_id: str):
    return client.collection(PDF_DOWNLOAD_REQUEST_GUARDS_COLLECTION).document(
        _request_guard_doc_id(user_id, request_id)
    )


def _event_ref(client, *, event_id: Optional[str] = None):
    collection = client.collection(PDF_DOWNLOAD_EVENTS_COLLECTION)
    return collection.document(event_id or f"pdfdl_{uuid4().hex}")


def _serialize_usage_counter(doc) -> PdfDownloadMonthlyUsageRecord:
    data = doc.to_dict() or {}
    month_key = _coerce_month_key(data.get("month_key")) or _current_month_key()
    return PdfDownloadMonthlyUsageRecord(
        id=doc.id,
        user_id=str(data.get("user_id") or "").strip(),
        month_key=month_key,
        download_count=max(0, _coerce_non_negative_int(data.get("download_count"))),
        event_count=max(0, _coerce_non_negative_int(data.get("event_count"))),
        workspace_download_count=max(0, _coerce_non_negative_int(data.get("workspace_download_count"))),
        group_download_pdf_count=max(0, _coerce_non_negative_int(data.get("group_download_pdf_count"))),
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
    )


def _serialize_pdf_download_event(doc) -> PdfDownloadEventRecord:
    data = doc.to_dict() or {}
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    return PdfDownloadEventRecord(
        id=doc.id,
        user_id=str(data.get("user_id") or "").strip(),
        request_id=str(data.get("request_id") or "").strip() or None,
        usage_month_key=_coerce_month_key(data.get("usage_month_key")) or _current_month_key(),
        status=str(data.get("status") or STATUS_COMMITTED).strip() or STATUS_COMMITTED,
        source=str(data.get("source") or "").strip(),
        export_mode=_normalize_export_mode(data.get("export_mode")),
        pdf_count=_normalize_pdf_count(data.get("pdf_count")),
        page_count=max(0, _coerce_non_negative_int(data.get("page_count"))),
        field_count=max(0, _coerce_non_negative_int(data.get("field_count"))),
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
        metadata=dict(metadata),
    )


def get_pdf_download_monthly_usage(
    user_id: str,
    *,
    month_key: Optional[str] = None,
) -> Optional[PdfDownloadMonthlyUsageRecord]:
    normalized_user_id = str(user_id or "").strip()
    normalized_month_key = _coerce_month_key(month_key) or _current_month_key()
    if not normalized_user_id:
        return None
    client = get_firestore_client()
    snapshot = _usage_counter_ref(client, normalized_user_id, normalized_month_key).get()
    if not snapshot.exists:
        return None
    return _serialize_usage_counter(snapshot)


def _build_replay_result(
    *,
    guard_data: Dict[str, Any],
    usage_record: Optional[PdfDownloadMonthlyUsageRecord],
    monthly_limit: Optional[int],
) -> PdfDownloadCommitResult:
    month_key = _coerce_month_key(guard_data.get("usage_month_key")) or _current_month_key()
    current_usage = usage_record.download_count if usage_record is not None else 0
    downloads_remaining = None if monthly_limit is None else max(0, monthly_limit - current_usage)
    return PdfDownloadCommitResult(
        status=STATUS_REPLAYED,
        event_id=str(guard_data.get("event_id") or "").strip(),
        request_id=str(guard_data.get("request_id") or "").strip(),
        month_key=month_key,
        count_increment=0,
        current_month_usage=current_usage,
        downloads_remaining=downloads_remaining,
        monthly_limit=monthly_limit,
        source=str(guard_data.get("source") or "").strip(),
        export_mode=_normalize_export_mode(guard_data.get("export_mode")),
        pdf_count=_normalize_pdf_count(guard_data.get("pdf_count")),
    )


def commit_pdf_download_usage(
    *,
    user_id: str,
    role: Optional[str],
    request_id: str,
    source: str,
    export_mode: str,
    pdf_count: int = 1,
    page_count: int = 0,
    field_count: int = 0,
    metadata: Optional[Dict[str, Any]] = None,
) -> PdfDownloadCommitResult:
    """Atomically record a generated-PDF download against the monthly quota."""
    normalized_user_id = str(user_id or "").strip()
    normalized_request_id = str(request_id or "").strip()
    if not normalized_user_id:
        raise ValueError("user_id is required")
    if not normalized_request_id:
        raise ValueError("request_id is required")
    normalized_source = _normalize_source(source)
    normalized_export_mode = _validate_export_mode(export_mode)
    normalized_pdf_count = _normalize_pdf_count(pdf_count)
    normalized_page_count = max(0, _coerce_non_negative_int(page_count))
    normalized_field_count = max(0, _coerce_non_negative_int(field_count))
    monthly_limit = resolve_pdf_downloads_monthly_limit(role)
    month_key = _current_month_key()
    timestamp = now_iso()
    event_id = f"pdfdl_{uuid4().hex}"
    event_payload = {
        "user_id": normalized_user_id,
        "request_id": normalized_request_id,
        "usage_month_key": month_key,
        "source": normalized_source,
        "export_mode": normalized_export_mode,
        "pdf_count": normalized_pdf_count,
        "page_count": normalized_page_count,
        "field_count": normalized_field_count,
        "metadata": dict(metadata or {}),
        "created_at": timestamp,
        "updated_at": timestamp,
    }

    client = get_firestore_client()
    usage_ref = _usage_counter_ref(client, normalized_user_id, month_key)
    guard_ref = _request_guard_ref(client, normalized_user_id, normalized_request_id)
    event_ref = _event_ref(client, event_id=event_id)
    transaction = client.transaction()

    @firebase_firestore.transactional
    def _commit(txn: firebase_firestore.Transaction) -> PdfDownloadCommitResult:
        guard_snapshot = guard_ref.get(transaction=txn)
        if guard_snapshot.exists:
            guard_data = guard_snapshot.to_dict() or {}
            existing_month_key = _coerce_month_key(guard_data.get("usage_month_key")) or month_key
            usage_snapshot = _usage_counter_ref(client, normalized_user_id, existing_month_key).get(transaction=txn)
            usage_record = _serialize_usage_counter(usage_snapshot) if usage_snapshot.exists else None
            if str(guard_data.get("status") or "").strip() == STATUS_REJECTED_LIMIT:
                current_usage = usage_record.download_count if usage_record is not None else 0
                downloads_remaining = None if monthly_limit is None else max(0, monthly_limit - current_usage)
                return PdfDownloadCommitResult(
                    status=STATUS_REJECTED_LIMIT,
                    event_id=str(guard_data.get("event_id") or "").strip(),
                    request_id=normalized_request_id,
                    month_key=existing_month_key,
                    count_increment=0,
                    current_month_usage=current_usage,
                    downloads_remaining=downloads_remaining,
                    monthly_limit=monthly_limit,
                    source=normalized_source,
                    export_mode=normalized_export_mode,
                    pdf_count=normalized_pdf_count,
                )
            return _build_replay_result(
                guard_data=guard_data,
                usage_record=usage_record,
                monthly_limit=monthly_limit,
            )

        usage_snapshot = usage_ref.get(transaction=txn)
        usage_record = _serialize_usage_counter(usage_snapshot) if usage_snapshot.exists else None
        current_usage = usage_record.download_count if usage_record is not None else 0
        if monthly_limit is not None and current_usage + normalized_pdf_count > monthly_limit:
            rejected_event_payload = {
                **event_payload,
                "status": STATUS_REJECTED_LIMIT,
            }
            guard_payload = {
                "user_id": normalized_user_id,
                "request_id": normalized_request_id,
                "event_id": event_id,
                "usage_month_key": month_key,
                "status": STATUS_REJECTED_LIMIT,
                "source": normalized_source,
                "export_mode": normalized_export_mode,
                "pdf_count": normalized_pdf_count,
                "created_at": timestamp,
                "updated_at": timestamp,
            }
            txn.set(event_ref, rejected_event_payload, merge=True)
            txn.set(guard_ref, guard_payload, merge=True)
            return PdfDownloadCommitResult(
                status=STATUS_REJECTED_LIMIT,
                event_id=event_id,
                request_id=normalized_request_id,
                month_key=month_key,
                count_increment=0,
                current_month_usage=current_usage,
                downloads_remaining=max(0, monthly_limit - current_usage),
                monthly_limit=monthly_limit,
                source=normalized_source,
                export_mode=normalized_export_mode,
                pdf_count=normalized_pdf_count,
            )

        next_usage = current_usage + normalized_pdf_count
        usage_payload = {
            "user_id": normalized_user_id,
            "month_key": month_key,
            "download_count": next_usage,
            "event_count": (usage_record.event_count if usage_record is not None else 0) + 1,
            "workspace_download_count": (
                (usage_record.workspace_download_count if usage_record is not None else 0)
                + (normalized_pdf_count if normalized_source == "workspace_download" else 0)
            ),
            "group_download_pdf_count": (
                (usage_record.group_download_pdf_count if usage_record is not None else 0)
                + (normalized_pdf_count if normalized_source == "workspace_group_download" else 0)
            ),
            "created_at": usage_record.created_at if usage_record is not None and usage_record.created_at else timestamp,
            "updated_at": timestamp,
        }
        committed_event_payload = {
            **event_payload,
            "status": STATUS_COMMITTED,
        }
        guard_payload = {
            "user_id": normalized_user_id,
            "request_id": normalized_request_id,
            "event_id": event_id,
            "usage_month_key": month_key,
            "status": STATUS_COMMITTED,
            "source": normalized_source,
            "export_mode": normalized_export_mode,
            "pdf_count": normalized_pdf_count,
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        txn.set(usage_ref, usage_payload, merge=True)
        txn.set(event_ref, committed_event_payload, merge=True)
        txn.set(guard_ref, guard_payload, merge=True)
        return PdfDownloadCommitResult(
            status=STATUS_COMMITTED,
            event_id=event_id,
            request_id=normalized_request_id,
            month_key=month_key,
            count_increment=normalized_pdf_count,
            current_month_usage=next_usage,
            downloads_remaining=None if monthly_limit is None else max(0, monthly_limit - next_usage),
            monthly_limit=monthly_limit,
            source=normalized_source,
            export_mode=normalized_export_mode,
            pdf_count=normalized_pdf_count,
        )

    result = _commit(transaction)
    if result.status == STATUS_REJECTED_LIMIT:
        raise PdfDownloadMonthlyLimitExceededError(
            monthly_limit=result.monthly_limit or 0,
            current_month_usage=result.current_month_usage,
            downloads_remaining=result.downloads_remaining or 0,
            month_key=result.month_key,
            pdf_count=result.pdf_count,
        )
    logger.debug(
        "Committed PDF download usage user=%s source=%s count=%s status=%s",
        normalized_user_id,
        normalized_source,
        normalized_pdf_count,
        result.status,
    )
    return result


def record_pdf_download_event(
    *,
    user_id: str,
    source: str,
    export_mode: str,
    pdf_count: int = 1,
    metadata: Optional[Dict[str, Any]] = None,
) -> PdfDownloadEventRecord:
    """Record a non-enforcing generated PDF download event for legacy callers."""
    normalized_user_id = str(user_id or "").strip()
    normalized_source = str(source or "").strip()
    if not normalized_user_id:
        raise ValueError("user_id is required")
    if not normalized_source:
        raise ValueError("source is required")

    timestamp = now_iso()
    payload_metadata = dict(metadata or {})
    doc_ref = _event_ref(get_firestore_client())
    page_count = max(0, _coerce_non_negative_int(payload_metadata.get("pageCount", 0)))
    field_count = max(0, _coerce_non_negative_int(payload_metadata.get("fieldCount", 0)))
    doc_ref.set(
        {
            "user_id": normalized_user_id,
            "request_id": None,
            "usage_month_key": _current_month_key(),
            "status": STATUS_COMMITTED,
            "source": normalized_source,
            "export_mode": _normalize_export_mode(export_mode),
            "pdf_count": _normalize_pdf_count(pdf_count),
            "page_count": page_count,
            "field_count": field_count,
            "metadata": payload_metadata,
            "created_at": timestamp,
            "updated_at": timestamp,
        }
    )
    logger.debug("Recorded PDF download event user=%s source=%s", normalized_user_id, normalized_source)
    return _serialize_pdf_download_event(doc_ref.get())
