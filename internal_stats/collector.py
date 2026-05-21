"""Local-only Firestore aggregation for the internal stats dashboard.

This module intentionally lives outside `backend/` and `frontend/` so the
dashboard code never rides along with normal production deploy artifacts.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
import os
import re
from typing import Any, Dict, Optional

from firebase_admin import credentials, firestore, get_app, initialize_app, storage

from backend.ai.status import OPENAI_JOB_STATUS_COMPLETE
from backend.firebaseDB.detection_database import DETECTION_REQUESTS_COLLECTION
from backend.firebaseDB.fill_link_database import (
    FILL_LINK_RESPONSES_COLLECTION,
    FILL_LINKS_COLLECTION,
)
from backend.firebaseDB.openai_job_database import OPENAI_JOBS_COLLECTION
from backend.firebaseDB.pdf_download_database import (
    PDF_DOWNLOAD_EVENTS_COLLECTION,
    PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION,
    STATUS_COMMITTED as PDF_DOWNLOAD_STATUS_COMMITTED,
    STATUS_REJECTED_INVALID as PDF_DOWNLOAD_STATUS_REJECTED_INVALID,
    STATUS_REJECTED_LIMIT as PDF_DOWNLOAD_STATUS_REJECTED_LIMIT,
)
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
PROD_STORAGE_BUCKETS = frozenset(
    {
        "dullypdf-forms-east4",
        "dullypdf-templates-east4",
        "dullypdf-sessions-east4",
    }
)
SAVED_FORM_EDITOR_SNAPSHOT_METADATA_KEY = "editorSnapshot"
CALCULATION_FIELD_ROLES = frozenset(
    {
        "number_input",
        "calculated_output",
        "calculated_intermediate",
        "external_imported_calculation",
    }
)
DEFAULT_GLOBAL_FIELD_FONT = "default"
DEFAULT_GLOBAL_FIELD_FONT_SIZE = "auto"
DEFAULT_GLOBAL_FIELD_FONT_COLOR = "#000000"
PDF_DOWNLOAD_BASE_MONTHLY_LIMIT = 25
PDF_DOWNLOAD_BASE_EIGHTY_PERCENT_THRESHOLD = 20
PDF_DOWNLOAD_HIGH_VOLUME_PRO_THRESHOLD = 100


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _current_month_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


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


def _get_firebase_app():
    require_prod_project_configuration()
    try:
        return get_app(_APP_NAME)
    except ValueError:
        return initialize_app(
            credentials.ApplicationDefault(),
            {"projectId": PROD_FIREBASE_PROJECT_ID},
            name=_APP_NAME,
        )


def _get_firestore_client() -> firestore.Client:
    app = _get_firebase_app()
    client = firestore.client(app=app)
    actual_project = _coerce_text(getattr(client, "project", None))
    if actual_project != PROD_FIREBASE_PROJECT_ID:
        raise RuntimeError(
            "Internal stats must use Firestore project "
            f"{PROD_FIREBASE_PROJECT_ID}, got {actual_project or 'unset'}."
        )
    return client


def _download_storage_json(bucket_path: str) -> Any:
    match = re.match(r"^gs://([^/]+)/(.+)$", str(bucket_path or "").strip())
    if not match:
        raise ValueError("Invalid editor snapshot storage path.")
    bucket_name, object_path = match.groups()
    if bucket_name not in PROD_STORAGE_BUCKETS:
        raise ValueError(f"Refusing to read non-production stats bucket: {bucket_name}")
    body = storage.bucket(bucket_name, app=_get_firebase_app()).blob(object_path).download_as_bytes()
    return json.loads(body.decode("utf-8"))


@dataclass
class UserStatsAccumulator:
    user_id: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str = ROLE_BASE
    detections: int = 0
    detection_pages: int = 0
    saved_templates: int = 0
    downloaded_pdfs: int = 0
    downloaded_editable_pdfs: int = 0
    downloaded_flat_pdfs: int = 0
    downloaded_group_pdfs: int = 0
    downloaded_pdfs_this_month: int = 0
    pdf_download_limit_rejections: int = 0
    pdf_download_invalid_rejections: int = 0
    pdf_downloads_remaining_this_month: Optional[int] = None
    qr_barcodes_created: int = 0
    pdf417_barcodes_created: int = 0
    one_d_barcodes_created: int = 0
    calculation_fields: int = 0
    custom_appearance_templates: int = 0
    custom_appearance_field_overrides: int = 0
    has_custom_appearance: bool = False
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
            + self.downloaded_pdfs
            + self.downloaded_pdfs_this_month
            + self.qr_barcodes_created
            + self.pdf417_barcodes_created
            + self.one_d_barcodes_created
            + self.calculation_fields
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
            "downloadedPdfs": self.downloaded_pdfs,
            "downloadedEditablePdfs": self.downloaded_editable_pdfs,
            "downloadedFlatPdfs": self.downloaded_flat_pdfs,
            "downloadedGroupPdfs": self.downloaded_group_pdfs,
            "downloadedPdfsThisMonth": self.downloaded_pdfs_this_month,
            "pdfDownloadLimitRejections": self.pdf_download_limit_rejections,
            "pdfDownloadInvalidRejections": self.pdf_download_invalid_rejections,
            "pdfDownloadsRemainingThisMonth": self.pdf_downloads_remaining_this_month,
            "qrBarcodesCreated": self.qr_barcodes_created,
            "pdf417BarcodesCreated": self.pdf417_barcodes_created,
            "oneDBarcodesCreated": self.one_d_barcodes_created,
            "barcodeFieldsCreated": (
                self.qr_barcodes_created
                + self.pdf417_barcodes_created
                + self.one_d_barcodes_created
            ),
            "calculationFields": self.calculation_fields,
            "customAppearanceTemplates": self.custom_appearance_templates,
            "customAppearanceFieldOverrides": self.custom_appearance_field_overrides,
            "hasCustomAppearance": self.has_custom_appearance,
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


def _template_editor_snapshot_path(metadata: Any) -> Optional[str]:
    if not isinstance(metadata, dict):
        return None
    manifest = metadata.get(SAVED_FORM_EDITOR_SNAPSHOT_METADATA_KEY)
    if not isinstance(manifest, dict):
        return None
    return _coerce_text(manifest.get("path"))


def _field_has_calculation_metadata(field: Any) -> bool:
    if not isinstance(field, dict):
        return False
    calculation = field.get("calculation")
    if not isinstance(calculation, dict):
        return False
    return str(calculation.get("role") or "").strip() in CALCULATION_FIELD_ROLES


def _has_global_appearance_change(appearance: Any) -> bool:
    if not isinstance(appearance, dict):
        return False
    global_font = str(appearance.get("globalFieldFont") or DEFAULT_GLOBAL_FIELD_FONT).strip()
    global_size = str(appearance.get("globalFieldFontSize") or DEFAULT_GLOBAL_FIELD_FONT_SIZE).strip()
    global_color = str(appearance.get("globalFieldFontColor") or DEFAULT_GLOBAL_FIELD_FONT_COLOR).strip().lower()
    return (
        global_font != DEFAULT_GLOBAL_FIELD_FONT
        or global_size != DEFAULT_GLOBAL_FIELD_FONT_SIZE
        or global_color != DEFAULT_GLOBAL_FIELD_FONT_COLOR
    )


def _field_has_appearance_override(field: Any) -> bool:
    if not isinstance(field, dict) or str(field.get("type") or "text").strip().lower() != "text":
        return False
    font_name = str(field.get("fontName") or "").strip()
    if font_name and font_name != "global":
        return True
    font_size = str(field.get("fontSize") or "").strip()
    if font_size and font_size not in {"global", DEFAULT_GLOBAL_FIELD_FONT_SIZE}:
        return True
    font_color = str(field.get("fontColor") or "").strip().lower()
    if font_color and font_color not in {"global", DEFAULT_GLOBAL_FIELD_FONT_COLOR}:
        return True
    return False


def _analyze_editor_snapshot(snapshot: Any) -> Dict[str, int | bool]:
    """Count feature-bearing fields in a saved-form editor snapshot.

    The scan is O(F) for F fields in the snapshot. The caller performs the
    storage read once per template because editor snapshots are stored as JSON
    blobs instead of inline Firestore fields.
    """

    fields = snapshot.get("fields") if isinstance(snapshot, dict) else None
    field_list = fields if isinstance(fields, list) else []
    qr_count = 0
    pdf417_count = 0
    one_d_count = 0
    calculation_count = 0
    appearance_override_count = 0
    for field in field_list:
        if not isinstance(field, dict):
            continue
        field_type = str(field.get("type") or "text").strip().lower()
        if field_type == "qr":
            qr_count += 1
        elif field_type == "pdf417":
            pdf417_count += 1
        elif field_type == "barcode":
            one_d_count += 1
        if _field_has_calculation_metadata(field):
            calculation_count += 1
        if _field_has_appearance_override(field):
            appearance_override_count += 1
    global_appearance_changed = _has_global_appearance_change(
        snapshot.get("appearance") if isinstance(snapshot, dict) else None
    )
    return {
        "qrBarcodes": qr_count,
        "pdf417Barcodes": pdf417_count,
        "oneDBarcodes": one_d_count,
        "calculationFields": calculation_count,
        "appearanceFieldOverrides": appearance_override_count,
        "hasCustomAppearance": bool(global_appearance_changed or appearance_override_count > 0),
    }


def _scan_saved_templates(
    client: firestore.Client,
    accumulators: Dict[str, UserStatsAccumulator],
) -> Dict[str, int]:
    total_templates = 0
    total_qr_barcodes = 0
    total_pdf417_barcodes = 0
    total_one_d_barcodes = 0
    total_calculation_fields = 0
    total_custom_appearance_templates = 0
    total_custom_appearance_field_overrides = 0
    total_snapshot_load_failures = 0
    for snapshot in client.collection(TEMPLATES_COLLECTION).stream():
        data = snapshot.to_dict() or {}
        user_id = _coerce_text(data.get("user_id"))
        if not user_id:
            continue
        total_templates += 1
        user = _get_user(accumulators, user_id)
        user.saved_templates += 1
        user.touch(data.get("updated_at"), data.get("created_at"))
        snapshot_path = _template_editor_snapshot_path(data.get("metadata"))
        if not snapshot_path:
            continue
        try:
            editor_snapshot = _download_storage_json(snapshot_path)
        except Exception as exc:
            total_snapshot_load_failures += 1
            logger.warning(
                "Failed to load saved-form editor snapshot for stats template=%s path=%s error=%s",
                snapshot.id,
                snapshot_path,
                exc,
            )
            continue

        feature_stats = _analyze_editor_snapshot(editor_snapshot)
        qr_barcodes = _coerce_non_negative_int(feature_stats.get("qrBarcodes"))
        pdf417_barcodes = _coerce_non_negative_int(feature_stats.get("pdf417Barcodes"))
        one_d_barcodes = _coerce_non_negative_int(feature_stats.get("oneDBarcodes"))
        calculation_fields = _coerce_non_negative_int(feature_stats.get("calculationFields"))
        appearance_overrides = _coerce_non_negative_int(feature_stats.get("appearanceFieldOverrides"))
        has_custom_appearance = bool(feature_stats.get("hasCustomAppearance"))

        total_qr_barcodes += qr_barcodes
        total_pdf417_barcodes += pdf417_barcodes
        total_one_d_barcodes += one_d_barcodes
        total_calculation_fields += calculation_fields
        total_custom_appearance_field_overrides += appearance_overrides
        if has_custom_appearance:
            total_custom_appearance_templates += 1

        user.qr_barcodes_created += qr_barcodes
        user.pdf417_barcodes_created += pdf417_barcodes
        user.one_d_barcodes_created += one_d_barcodes
        user.calculation_fields += calculation_fields
        user.custom_appearance_field_overrides += appearance_overrides
        if has_custom_appearance:
            user.custom_appearance_templates += 1
            user.has_custom_appearance = True

    return {
        "totalTemplates": total_templates,
        "totalQrBarcodes": total_qr_barcodes,
        "totalPdf417Barcodes": total_pdf417_barcodes,
        "totalOneDBarcodes": total_one_d_barcodes,
        "totalBarcodeFields": total_qr_barcodes + total_pdf417_barcodes + total_one_d_barcodes,
        "totalCalculationFields": total_calculation_fields,
        "totalCustomAppearanceTemplates": total_custom_appearance_templates,
        "totalCustomAppearanceFieldOverrides": total_custom_appearance_field_overrides,
        "totalTemplateSnapshotLoadFailures": total_snapshot_load_failures,
    }


def _scan_pdf_download_events(
    client: firestore.Client,
    accumulators: Dict[str, UserStatsAccumulator],
) -> Dict[str, int]:
    total_downloaded_pdfs = 0
    total_editable_pdfs = 0
    total_flat_pdfs = 0
    total_group_pdfs = 0
    total_limit_rejections = 0
    total_invalid_rejections = 0
    for snapshot in client.collection(PDF_DOWNLOAD_EVENTS_COLLECTION).stream():
        data = snapshot.to_dict() or {}
        user_id = _coerce_text(data.get("user_id"))
        if not user_id:
            continue
        status = _coerce_text(data.get("status")) or PDF_DOWNLOAD_STATUS_COMMITTED
        pdf_count = _coerce_non_negative_int(data.get("pdf_count"))
        if pdf_count <= 0:
            continue
        user = _get_user(accumulators, user_id)
        if status == PDF_DOWNLOAD_STATUS_REJECTED_LIMIT:
            total_limit_rejections += 1
            user.pdf_download_limit_rejections += 1
            user.touch(data.get("created_at"))
            continue
        if status == PDF_DOWNLOAD_STATUS_REJECTED_INVALID:
            total_invalid_rejections += 1
            user.pdf_download_invalid_rejections += 1
            user.touch(data.get("created_at"))
            continue
        if status != PDF_DOWNLOAD_STATUS_COMMITTED:
            continue
        export_mode = _coerce_text(data.get("export_mode")) or "editable"
        source = _coerce_text(data.get("source")) or ""
        total_downloaded_pdfs += pdf_count
        user.downloaded_pdfs += pdf_count
        if export_mode == "flat":
            total_flat_pdfs += pdf_count
            user.downloaded_flat_pdfs += pdf_count
        elif export_mode == "editable":
            total_editable_pdfs += pdf_count
            user.downloaded_editable_pdfs += pdf_count
        if source == "workspace_group_download":
            total_group_pdfs += pdf_count
            user.downloaded_group_pdfs += pdf_count
        user.touch(data.get("created_at"))
    return {
        "totalDownloadedPdfs": total_downloaded_pdfs,
        "totalDownloadedEditablePdfs": total_editable_pdfs,
        "totalDownloadedFlatPdfs": total_flat_pdfs,
        "totalDownloadedGroupPdfs": total_group_pdfs,
        "totalPdfDownloadLimitRejections": total_limit_rejections,
        "totalPdfDownloadInvalidRejections": total_invalid_rejections,
    }


def _scan_pdf_download_usage_counters(
    client: firestore.Client,
    accumulators: Dict[str, UserStatsAccumulator],
) -> Dict[str, int]:
    month_key = _current_month_key()
    total_current_month_downloads = 0
    users_with_current_month_downloads = 0
    base_users_at_eighty_percent = 0
    pro_users_high_volume = 0

    for snapshot in client.collection(PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION).stream():
        data = snapshot.to_dict() or {}
        if (_coerce_text(data.get("month_key")) or "") != month_key:
            continue
        user_id = _coerce_text(data.get("user_id"))
        if not user_id:
            continue
        download_count = _coerce_non_negative_int(data.get("download_count"))
        total_current_month_downloads += download_count
        if download_count > 0:
            users_with_current_month_downloads += 1
        user = _get_user(accumulators, user_id)
        user.downloaded_pdfs_this_month = max(user.downloaded_pdfs_this_month, download_count)
        user.touch(data.get("updated_at"), data.get("created_at"))

        if user.role == ROLE_BASE:
            user.pdf_downloads_remaining_this_month = max(0, PDF_DOWNLOAD_BASE_MONTHLY_LIMIT - download_count)
            if download_count >= PDF_DOWNLOAD_BASE_EIGHTY_PERCENT_THRESHOLD:
                base_users_at_eighty_percent += 1
        elif user.role == ROLE_PRO:
            user.pdf_downloads_remaining_this_month = None
            if download_count >= PDF_DOWNLOAD_HIGH_VOLUME_PRO_THRESHOLD:
                pro_users_high_volume += 1
        else:
            user.pdf_downloads_remaining_this_month = None

    return {
        "totalPdfDownloadsThisMonth": total_current_month_downloads,
        "totalPdfDownloadUsersThisMonth": users_with_current_month_downloads,
        "totalBaseUsersAt80PctPdfDownloads": base_users_at_eighty_percent,
        "totalProUsersHighPdfDownloadVolume": pro_users_high_volume,
    }


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
    full-collection pass is an acceptable tradeoff here. Saved-template feature
    adoption also reads one editor-snapshot JSON blob per saved template, making
    that portion O(T + F) for T templates and F total fields. Reusing a single
    Firebase app keeps the work to one auth/session setup per refresh.
    """

    client = _get_firestore_client()
    accumulators: Dict[str, UserStatsAccumulator] = {}
    role_counts = _scan_users(client, accumulators)
    total_detections, total_detection_pages = _scan_detection_requests(client, accumulators)
    saved_template_totals = _scan_saved_templates(client, accumulators)
    pdf_download_totals = _scan_pdf_download_events(client, accumulators)
    pdf_download_counter_totals = _scan_pdf_download_usage_counters(client, accumulators)
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
            "totalSavedTemplates": saved_template_totals["totalTemplates"],
            "totalDownloadedPdfs": pdf_download_totals["totalDownloadedPdfs"],
            "totalDownloadedEditablePdfs": pdf_download_totals["totalDownloadedEditablePdfs"],
            "totalDownloadedFlatPdfs": pdf_download_totals["totalDownloadedFlatPdfs"],
            "totalDownloadedGroupPdfs": pdf_download_totals["totalDownloadedGroupPdfs"],
            "totalPdfDownloadsThisMonth": pdf_download_counter_totals["totalPdfDownloadsThisMonth"],
            "totalPdfDownloadUsersThisMonth": pdf_download_counter_totals["totalPdfDownloadUsersThisMonth"],
            "totalBaseUsersAt80PctPdfDownloads": pdf_download_counter_totals["totalBaseUsersAt80PctPdfDownloads"],
            "totalProUsersHighPdfDownloadVolume": pdf_download_counter_totals["totalProUsersHighPdfDownloadVolume"],
            "totalPdfDownloadLimitRejections": pdf_download_totals["totalPdfDownloadLimitRejections"],
            "totalPdfDownloadInvalidRejections": pdf_download_totals["totalPdfDownloadInvalidRejections"],
            "totalQrBarcodesCreated": saved_template_totals["totalQrBarcodes"],
            "totalPdf417BarcodesCreated": saved_template_totals["totalPdf417Barcodes"],
            "totalOneDBarcodesCreated": saved_template_totals["totalOneDBarcodes"],
            "totalBarcodeFieldsCreated": saved_template_totals["totalBarcodeFields"],
            "totalCalculationFields": saved_template_totals["totalCalculationFields"],
            "totalUsersWithCustomAppearance": sum(1 for user in users if bool(user.get("hasCustomAppearance"))),
            "totalCustomAppearanceTemplates": saved_template_totals["totalCustomAppearanceTemplates"],
            "totalCustomAppearanceFieldOverrides": saved_template_totals["totalCustomAppearanceFieldOverrides"],
            "totalTemplateSnapshotLoadFailures": saved_template_totals["totalTemplateSnapshotLoadFailures"],
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
