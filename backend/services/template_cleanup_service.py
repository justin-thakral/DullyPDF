"""Shared saved-form cleanup helpers used by routes and retention jobs."""

from __future__ import annotations

from typing import Iterable, Optional

from backend.firebaseDB.fill_link_database import (
    close_fill_links_for_template,
    close_group_fill_links_for_template,
    delete_fill_links_for_template,
    delete_group_fill_links_for_template,
)
from backend.firebaseDB.group_database import remove_template_from_all_groups
from backend.firebaseDB.signing_database import invalidate_signing_request, list_signing_requests
from backend.firebaseDB.storage_service import delete_pdf, is_gcs_path
from backend.firebaseDB.template_database import delete_template, get_template
from backend.logging_config import get_logger
from backend.services.saved_form_snapshot_service import get_saved_form_editor_snapshot_path
from backend.services.signing_service import SIGNING_STATUS_DRAFT


logger = get_logger(__name__)


def _is_storage_not_found_error(exc: Exception) -> bool:
    if isinstance(exc, FileNotFoundError):
        return True
    status_code = getattr(exc, "status_code", None)
    if status_code is None:
        status_code = getattr(exc, "code", None)
    if status_code == 404:
        return True
    return exc.__class__.__name__.lower() == "notfound"


def _invalidate_template_backed_signing_drafts(
    form_id: str,
    user_id: str,
    *,
    draft_request_ids: Optional[Iterable[str]] = None,
) -> int:
    normalized_request_ids = [
        str(request_id or "").strip()
        for request_id in (draft_request_ids or [])
        if str(request_id or "").strip()
    ]
    if normalized_request_ids:
        candidate_request_ids = normalized_request_ids
    else:
        candidate_request_ids = [
            record.id
            for record in list_signing_requests(user_id)
            if record.status == SIGNING_STATUS_DRAFT and record.source_template_id == form_id
        ]
    invalidated_count = 0
    for request_id in candidate_request_ids:
        try:
            invalidated = invalidate_signing_request(
                request_id,
                user_id,
                reason=(
                    "This signing draft can no longer be sent because its saved form was deleted."
                ),
            )
        except Exception:
            logger.warning(
                "Failed to invalidate signing draft %s after deleting saved form %s.",
                request_id,
                form_id,
                exc_info=True,
            )
            continue
        if invalidated is not None:
            invalidated_count += 1
    return invalidated_count


def delete_saved_form_assets(
    form_id: str,
    user_id: str,
    *,
    hard_delete_link_records: bool = False,
    draft_signing_request_ids: Optional[Iterable[str]] = None,
) -> bool:
    """Delete a saved form, its storage objects, and dependent group/link metadata."""
    template = get_template(form_id, user_id)
    if not template:
        return False

    deletion_targets: list[str] = []
    if template.pdf_bucket_path and is_gcs_path(template.pdf_bucket_path):
        deletion_targets.append(template.pdf_bucket_path)
    if template.template_bucket_path and template.template_bucket_path != template.pdf_bucket_path:
        if is_gcs_path(template.template_bucket_path):
            deletion_targets.append(template.template_bucket_path)
    snapshot_path = get_saved_form_editor_snapshot_path(
        template.metadata if isinstance(template.metadata, dict) else None,
    )
    if snapshot_path and is_gcs_path(snapshot_path):
        deletion_targets.append(snapshot_path)

    for bucket_path in deletion_targets:
        try:
            delete_pdf(bucket_path)
        except Exception as exc:
            if _is_storage_not_found_error(exc):
                continue
            raise

    if hard_delete_link_records:
        delete_fill_links_for_template(form_id, user_id)
        delete_group_fill_links_for_template(form_id, user_id)
    else:
        close_fill_links_for_template(form_id, user_id, closed_reason="template_deleted")
        close_group_fill_links_for_template(form_id, user_id, closed_reason="template_deleted")

    removed = delete_template(form_id, user_id)
    if not removed:
        return False

    _invalidate_template_backed_signing_drafts(
        form_id,
        user_id,
        draft_request_ids=draft_signing_request_ids,
    )
    remove_template_from_all_groups(form_id, user_id)
    return True
