"""Local-only Firestore aggregation for the internal stats dashboard.

This module intentionally lives outside `backend/` and `frontend/` so the
dashboard code never rides along with normal production deploy artifacts.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import logging
import os
from typing import Any, Dict, Optional

from firebase_admin import credentials, firestore, get_app, initialize_app

from backend.ai.status import OPENAI_JOB_STATUS_COMPLETE
from backend.firebaseDB.detection_database import DETECTION_REQUESTS_COLLECTION
from backend.firebaseDB.fill_link_database import (
    FILL_LINK_RESPONSES_COLLECTION,
    FILL_LINKS_COLLECTION,
)
from backend.firebaseDB.openai_job_database import OPENAI_JOBS_COLLECTION
from backend.firebaseDB.signing_database import SIGNING_REQUESTS_COLLECTION
from backend.firebaseDB.structured_fill_database import (
    STATUS_COMMITTED,
    STRUCTURED_FILL_EVENTS_COLLECTION,
    STRUCTURED_FILL_SOURCE_KINDS,
)
from backend.firebaseDB.template_api_endpoint_database import (
    TEMPLATE_API_ENDPOINTS_COLLECTION,
)
from backend.firebaseDB.template_database import TEMPLATES_COLLECTION
from backend.firebaseDB.user_database import (
    ROLE_BASE,
    ROLE_GOD,
    ROLE_PRO,
    USERS_COLLECTION,
    normalize_role,
)


logger = logging.getLogger(__name__)

PROD_FIREBASE_PROJECT_ID = "dullypdf"
SIGNING_STATUS_COMPLETED = "completed"
_APP_NAME = "internal-stats"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_text(value: Any) -> Optional[str]:
    normalized = str(value or "").strip()
    return normalized or None


def _coerce_non_negative_int(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 0
    return parsed if parsed >= 0 else 0


def _normalize_iso_timestamp(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc).isoformat()
        return value.astimezone(timezone.utc).isoformat()

    raw = _coerce_text(value)
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return raw
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)
    return parsed.isoformat()


def _latest_timestamp(*values: Any) -> Optional[str]:
    best: Optional[str] = None
    for value in values:
        normalized = _normalize_iso_timestamp(value)
        if not normalized:
            continue
        if best is None or normalized > best:
            best = normalized
    return best


def require_prod_project_configuration() -> None:
    """Fail closed unless the dashboard is pointed at the prod Firestore project."""

    for variable_name in ("GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT"):
        configured_project = _coerce_text(os.getenv(variable_name))
        if configured_project and configured_project != PROD_FIREBASE_PROJECT_ID:
            raise RuntimeError(
                "Internal stats must target the dullypdf production project; "
                f"{variable_name}={configured_project!r} is not allowed."
            )


def _get_firestore_client() -> firestore.Client:
    require_prod_project_configuration()
    try:
        app = get_app(_APP_NAME)
    except ValueError:
        app = initialize_app(
            credentials.ApplicationDefault(),
            {"projectId": PROD_FIREBASE_PROJECT_ID},
            name=_APP_NAME,
        )
    client = firestore.client(app=app)
    actual_project = _coerce_text(getattr(client, "project", None))
    if actual_project != PROD_FIREBASE_PROJECT_ID:
        raise RuntimeError(
            "Internal stats must use Firestore project "
            f"{PROD_FIREBASE_PROJECT_ID}, got {actual_project or 'unset'}."
        )
    return client


@dataclass
class UserStatsAccumulator:
    user_id: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str = ROLE_BASE
    detections: int = 0
    detection_pages: int = 0
    saved_templates: int = 0
    credits_used: int = 0
    fill_links: int = 0
    active_fill_links: int = 0
    fill_link_responses: int = 0
    api_endpoints: int = 0
    active_api_endpoints: int = 0
    api_fills: int = 0
    signing_requests: int = 0
    completed_signing_requests: int = 0
    structured_fill_credits: int = 0
    structured_fill_commits: int = 0
    structured_fill_matched_pdfs: int = 0
    structured_fill_credits_by_source: Dict[str, int] = None  # type: ignore[assignment]
    last_activity_at: Optional[str] = None
    last_structured_fill_at: Optional[str] = None

    def __post_init__(self) -> None:
        if self.structured_fill_credits_by_source is None:
            self.structured_fill_credits_by_source = {kind: 0 for kind in STRUCTURED_FILL_SOURCE_KINDS}

    def touch(self, *timestamps: Any) -> None:
        candidate = _latest_timestamp(self.last_activity_at, *timestamps)
        if candidate:
            self.last_activity_at = candidate

    def touch_structured_fill(self, timestamp: Any) -> None:
        candidate = _latest_timestamp(self.last_structured_fill_at, timestamp)
        if candidate:
            self.last_structured_fill_at = candidate

    @property
    def activity_score(self) -> int:
        return (
            self.detections
            + self.saved_templates
            + self.credits_used
            + self.fill_links
            + self.fill_link_responses
            + self.api_endpoints
            + self.api_fills
            + self.signing_requests
            + self.structured_fill_credits
        )

    def to_dict(self) -> Dict[str, Any]:
        by_source = self.structured_fill_credits_by_source or {}
        return {
            "userId": self.user_id,
            "email": self.email,
            "displayName": self.display_name,
            "role": self.role,
            "detections": self.detections,
            "detectionPages": self.detection_pages,
            "savedTemplates": self.saved_templates,
            "creditsUsed": self.credits_used,
            "fillLinks": self.fill_links,
            "activeFillLinks": self.active_fill_links,
            "fillLinkResponses": self.fill_link_responses,
            "apiEndpoints": self.api_endpoints,
            "activeApiEndpoints": self.active_api_endpoints,
            "apiFills": self.api_fills,
            "signingRequests": self.signing_requests,
            "completedSigningRequests": self.completed_signing_requests,
            "structuredFillCredits": self.structured_fill_credits,
            "structuredFillCommits": self.structured_fill_commits,
            "structuredFillMatchedPdfs": self.structured_fill_matched_pdfs,
            "structuredFillCsvCredits": by_source.get("csv", 0),
            "structuredFillExcelCredits": by_source.get("excel", 0),
            "structuredFillSqlCredits": by_source.get("sql", 0),
            "structuredFillJsonCredits": by_source.get("json", 0),
            "structuredFillTxtCredits": by_source.get("txt", 0),
            "lastStructuredFillAt": self.last_structured_fill_at,
            "lastActivityAt": self.last_activity_at,
            "activityScore": self.activity_score,
        }


def _get_user(accumulators: Dict[str, UserStatsAccumulator], user_id: str) -> UserStatsAccumulator:
    normalized_user_id = _coerce_text(user_id)
    if not normalized_user_id:
        raise ValueError("user_id is required")
    accumulator = accumulators.get(normalized_user_id)
    if accumulator is None:
        accumulator = UserStatsAccumulator(user_id=normalized_user_id)
        accumulators[normalized_user_id] = accumulator
    return accumulator


def _scan_users(
    client: firestore.Client,
    accumulators: Dict[str, UserStatsAccumulator],
) -> Dict[str, int]:
    role_counts = {
        ROLE_BASE: 0,
        ROLE_PRO: 0,
        ROLE_GOD: 0,
        "unknown": 0,
    }
    for snapshot in client.collection(USERS_COLLECTION).stream():
        user = _get_user(accumulators, snapshot.id)
        data = snapshot.to_dict() or {}
        user.email = _coerce_text(data.get("email")) or user.email
        user.display_name = _coerce_text(data.get("displayName")) or user.display_name
        user.role = normalize_role(_coerce_text(data.get("role")))
        user.touch(data.get("updated_at"), data.get("created_at"))
        if user.role in role_counts:
            role_counts[user.role] += 1
        else:
            role_counts["unknown"] += 1
    return role_counts


def _scan_detection_requests(
    client: firestore.Client,
    accumulators: Dict[str, UserStatsAccumulator],
) -> tuple[int, int]:
    total_requests = 0
    total_pages = 0
    for snapshot in client.collection(DETECTION_REQUESTS_COLLECTION).stream():
        data = snapshot.to_dict() or {}
        user_id = _coerce_text(data.get("user_id"))
        if not user_id:
            continue
        total_requests += 1
        page_count = _coerce_non_negative_int(data.get("page_count"))
        total_pages += page_count
        user = _get_user(accumulators, user_id)
        user.detections += 1
        user.detection_pages += page_count
        user.touch(data.get("updated_at"), data.get("created_at"))
    return total_requests, total_pages


def _scan_saved_templates(
    client: firestore.Client,
    accumulators: Dict[str, UserStatsAccumulator],
) -> int:
    total_templates = 0
    for snapshot in client.collection(TEMPLATES_COLLECTION).stream():
        data = snapshot.to_dict() or {}
        user_id = _coerce_text(data.get("user_id"))
        if not user_id:
            continue
        total_templates += 1
        user = _get_user(accumulators, user_id)
        user.saved_templates += 1
        user.touch(data.get("updated_at"), data.get("created_at"))
    return total_templates


def _scan_openai_jobs(
    client: firestore.Client,
    accumulators: Dict[str, UserStatsAccumulator],
) -> int:
    total_credits_used = 0
    for snapshot in client.collection(OPENAI_JOBS_COLLECTION).stream():
        data = snapshot.to_dict() or {}
        user_id = _coerce_text(data.get("user_id"))
        if not user_id:
            continue
        user = _get_user(accumulators, user_id)
        user.touch(
            data.get("completed_at"),
            data.get("updated_at"),
            data.get("created_at"),
        )
        status = _coerce_text(data.get("status"))
        credits_charged = bool(data.get("credits_charged"))
        if status != OPENAI_JOB_STATUS_COMPLETE or not credits_charged:
            continue
        credits = _coerce_non_negative_int(data.get("credits"))
        total_credits_used += credits
        user.credits_used += credits
    return total_credits_used


def _scan_fill_links(
    client: firestore.Client,
    accumulators: Dict[str, UserStatsAccumulator],
) -> tuple[int, int]:
    total_links = 0
    total_active_links = 0
    for snapshot in client.collection(FILL_LINKS_COLLECTION).stream():
        data = snapshot.to_dict() or {}
        user_id = _coerce_text(data.get("user_id"))
        if not user_id:
            continue
        total_links += 1
        status = _coerce_text(data.get("status")) or "closed"
        user = _get_user(accumulators, user_id)
        user.fill_links += 1
        if status == "active":
            total_active_links += 1
            user.active_fill_links += 1
        user.touch(
            data.get("published_at"),
            data.get("updated_at"),
            data.get("created_at"),
        )
    return total_links, total_active_links


def _scan_fill_link_responses(
    client: firestore.Client,
    accumulators: Dict[str, UserStatsAccumulator],
) -> int:
    total_responses = 0
    for snapshot in client.collection(FILL_LINK_RESPONSES_COLLECTION).stream():
        data = snapshot.to_dict() or {}
        user_id = _coerce_text(data.get("user_id"))
        if not user_id:
            continue
        total_responses += 1
        user = _get_user(accumulators, user_id)
        user.fill_link_responses += 1
        user.touch(data.get("submitted_at"))
    return total_responses


def _scan_template_api_endpoints(
    client: firestore.Client,
    accumulators: Dict[str, UserStatsAccumulator],
) -> tuple[int, int, int]:
    total_endpoints = 0
    total_active_endpoints = 0
    total_api_fills = 0
    for snapshot in client.collection(TEMPLATE_API_ENDPOINTS_COLLECTION).stream():
        data = snapshot.to_dict() or {}
        user_id = _coerce_text(data.get("user_id"))
        if not user_id:
            continue
        total_endpoints += 1
        usage_count = _coerce_non_negative_int(data.get("usage_count"))
        total_api_fills += usage_count
        status = _coerce_text(data.get("status")) or "revoked"
        user = _get_user(accumulators, user_id)
        user.api_endpoints += 1
        user.api_fills += usage_count
        if status == "active":
            total_active_endpoints += 1
            user.active_api_endpoints += 1
        user.touch(
            data.get("last_used_at"),
            data.get("updated_at"),
            data.get("published_at"),
            data.get("created_at"),
        )
    return total_endpoints, total_active_endpoints, total_api_fills


def _scan_structured_fill_events(
    client: firestore.Client,
    accumulators: Dict[str, UserStatsAccumulator],
) -> Dict[str, Any]:
    """Scan committed Search & Fill events for global + per-user credit totals.

    Only ``status='committed'`` events contribute to credit totals — replayed
    entries would double-count the original commit, and ``rejected_*`` events
    carry ``count_increment=0`` anyway.  Per-source-kind splits let the
    dashboard distinguish CSV vs Excel vs SQL vs JSON vs TXT usage.
    """

    total_credits = 0
    total_commits = 0
    total_matched_pdfs = 0
    credits_by_source: Dict[str, int] = {kind: 0 for kind in STRUCTURED_FILL_SOURCE_KINDS}

    for snapshot in client.collection(STRUCTURED_FILL_EVENTS_COLLECTION).stream():
        data = snapshot.to_dict() or {}
        user_id = _coerce_text(data.get("user_id"))
        if not user_id:
            continue
        status = _coerce_text(data.get("status")) or ""
        if status != STATUS_COMMITTED:
            continue
        count_increment = _coerce_non_negative_int(data.get("count_increment"))
        if count_increment <= 0:
            continue
        source_kind = _coerce_text(data.get("source_kind")) or ""
        matched_ids = data.get("matched_template_ids") or []
        matched_pdfs = len(matched_ids) if isinstance(matched_ids, list) else 0
        total_credits += count_increment
        total_commits += 1
        total_matched_pdfs += matched_pdfs
        if source_kind in credits_by_source:
            credits_by_source[source_kind] += count_increment

        user = _get_user(accumulators, user_id)
        user.structured_fill_credits += count_increment
        user.structured_fill_commits += 1
        user.structured_fill_matched_pdfs += matched_pdfs
        if source_kind in user.structured_fill_credits_by_source:
            user.structured_fill_credits_by_source[source_kind] += count_increment
        user.touch_structured_fill(data.get("created_at"))
        user.touch(data.get("created_at"), data.get("updated_at"))

    return {
        "totalCredits": total_credits,
        "totalCommits": total_commits,
        "totalMatchedPdfs": total_matched_pdfs,
        "creditsBySource": credits_by_source,
    }


def _scan_signing_requests(
    client: firestore.Client,
    accumulators: Dict[str, UserStatsAccumulator],
) -> tuple[int, int]:
    total_requests = 0
    total_completed_requests = 0
    for snapshot in client.collection(SIGNING_REQUESTS_COLLECTION).stream():
        data = snapshot.to_dict() or {}
        user_id = _coerce_text(data.get("user_id"))
        if not user_id:
            continue
        total_requests += 1
        status = _coerce_text(data.get("status")) or "draft"
        user = _get_user(accumulators, user_id)
        user.signing_requests += 1
        if status == SIGNING_STATUS_COMPLETED:
            total_completed_requests += 1
            user.completed_signing_requests += 1
        user.touch(
            data.get("completed_at"),
            data.get("sent_at"),
            data.get("updated_at"),
            data.get("created_at"),
        )
    return total_requests, total_completed_requests


def build_internal_stats_snapshot() -> Dict[str, Any]:
    """Build one in-memory snapshot by scanning each usage collection once.

    The dashboard is an operator-only local tool, so an O(C + D + T + J + L + R)
    full-collection pass is an acceptable tradeoff here. Reusing a single
    Firestore client keeps the work to one auth/session setup per refresh.
    """

    client = _get_firestore_client()
    accumulators: Dict[str, UserStatsAccumulator] = {}
    role_counts = _scan_users(client, accumulators)
    total_detections, total_detection_pages = _scan_detection_requests(client, accumulators)
    total_saved_templates = _scan_saved_templates(client, accumulators)
    total_credits_used = _scan_openai_jobs(client, accumulators)
    total_fill_links, total_active_fill_links = _scan_fill_links(client, accumulators)
    total_fill_link_responses = _scan_fill_link_responses(client, accumulators)
    total_api_endpoints, total_active_api_endpoints, total_api_fills = _scan_template_api_endpoints(client, accumulators)
    total_signing_requests, total_completed_signing_requests = _scan_signing_requests(client, accumulators)
    structured_fill_totals = _scan_structured_fill_events(client, accumulators)

    users = [user.to_dict() for user in accumulators.values()]
    users.sort(
        key=lambda entry: (
            -_coerce_non_negative_int(entry.get("activityScore")),
            -_coerce_non_negative_int(entry.get("creditsUsed")),
            (_coerce_text(entry.get("email")) or _coerce_text(entry.get("userId")) or "").lower(),
        )
    )
    active_users = sum(1 for user in users if _coerce_non_negative_int(user.get("activityScore")) > 0)

    logger.info("Built local internal stats snapshot for %s users.", len(users))

    return {
        "meta": {
            "generatedAt": _now_iso(),
            "environment": "prod",
            "projectId": PROD_FIREBASE_PROJECT_ID,
            "accessMode": "local-adc",
        },
        "global": {
            "totalUsers": len(users),
            "activeUsers": active_users,
            "roleCounts": role_counts,
            "totalDetections": total_detections,
            "totalDetectionPages": total_detection_pages,
            "totalSavedTemplates": total_saved_templates,
            "totalCreditsUsed": total_credits_used,
            "totalFillLinks": total_fill_links,
            "totalActiveFillLinks": total_active_fill_links,
            "totalFillLinkResponses": total_fill_link_responses,
            "totalApiEndpoints": total_api_endpoints,
            "totalActiveApiEndpoints": total_active_api_endpoints,
            "totalApiFills": total_api_fills,
            "totalSigningRequests": total_signing_requests,
            "totalCompletedSigningRequests": total_completed_signing_requests,
            "totalStructuredFillCredits": structured_fill_totals["totalCredits"],
            "totalStructuredFillCommits": structured_fill_totals["totalCommits"],
            "totalStructuredFillMatchedPdfs": structured_fill_totals["totalMatchedPdfs"],
            "totalStructuredFillCsvCredits": structured_fill_totals["creditsBySource"].get("csv", 0),
            "totalStructuredFillExcelCredits": structured_fill_totals["creditsBySource"].get("excel", 0),
            "totalStructuredFillSqlCredits": structured_fill_totals["creditsBySource"].get("sql", 0),
            "totalStructuredFillJsonCredits": structured_fill_totals["creditsBySource"].get("json", 0),
            "totalStructuredFillTxtCredits": structured_fill_totals["creditsBySource"].get("txt", 0),
        },
        "users": users,
    }
