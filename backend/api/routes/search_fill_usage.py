"""Authenticated Search & Fill (structured data) credit endpoints.

Implements the two routes described in the Search & Fill crediting plan:

* ``GET  /api/search-fill/precheck`` — UX hint for "how many credits remain?"
* ``POST /api/search-fill/usage`` — authoritative, idempotent commit that
  debits a credit only after the frontend is ready to mutate fields.

The actual bookkeeping lives in
``backend.firebaseDB.structured_fill_database``; this module is a thin
FastAPI wrapper that resolves role/limits and maps module errors to HTTP
responses.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Response

from backend.api.schemas import SearchFillUsageCommitRequest
from backend.firebaseDB.structured_fill_database import (
    STRUCTURED_FILL_SOURCE_CATEGORY,
    StructuredFillInvalidRequestError,
    StructuredFillMonthlyLimitExceededError,
    commit_structured_fill_usage,
    evaluate_structured_fill_precheck,
    resolve_structured_fill_monthly_limit_for_user,
)
from backend.services.auth_service import require_user


router = APIRouter()


def _apply_private_cache_headers(response: Response) -> None:
    response.headers["Cache-Control"] = "private, no-store"


@router.get("/api/search-fill/precheck")
async def precheck_search_fill_usage(
    response: Response,
    pdfCount: int = Query(default=1, ge=0),
    sourceKind: str = Query(default=""),
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Preview the remaining monthly Search & Fill budget for a planned fill.

    Read-only. Returns ``allowed=False`` when the planned ``pdfCount`` would
    push the user past their monthly cap. Never charges.
    """

    _apply_private_cache_headers(response)
    user = require_user(authorization)
    try:
        return evaluate_structured_fill_precheck(
            user.app_user_id,
            pdf_count=pdfCount,
            source_kind=sourceKind,
        )
    except StructuredFillInvalidRequestError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/search-fill/usage")
async def commit_search_fill_usage(
    payload: SearchFillUsageCommitRequest,
    response: Response,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Commit a Search & Fill charge. Idempotent on ``requestId``.

    A successful commit returns the committed ``eventId`` and the updated
    monthly counters. A duplicate ``requestId`` replays the original result
    without charging again (``status='replayed'``). A commit that would push
    monthly usage past the cap returns HTTP 429 and writes nothing.
    """

    _apply_private_cache_headers(response)
    user = require_user(authorization)
    monthly_limit = resolve_structured_fill_monthly_limit_for_user(user.app_user_id)
    try:
        result = commit_structured_fill_usage(
            user.app_user_id,
            request_id=payload.requestId,
            source_category=payload.sourceCategory or STRUCTURED_FILL_SOURCE_CATEGORY,
            source_kind=payload.sourceKind,
            scope_type=payload.scopeType,
            scope_id=payload.scopeId,
            template_id=payload.templateId,
            group_id=payload.groupId,
            target_template_ids=list(payload.targetTemplateIds or []),
            matched_template_ids=list(payload.matchedTemplateIds or []),
            count_increment=int(payload.countIncrement or 0),
            match_count=int(payload.matchCount or 0),
            record_label_preview=payload.recordLabelPreview,
            record_fingerprint=payload.recordFingerprint,
            data_source_label=payload.dataSourceLabel,
            workspace_saved_form_id=payload.workspaceSavedFormId,
            search_query_preview=payload.searchQueryPreview,
            reviewed_fill_context=payload.reviewedFillContext,
            monthly_limit=monthly_limit,
        )
    except StructuredFillInvalidRequestError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except StructuredFillMonthlyLimitExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    return {
        "status": result.status,
        "eventId": result.event_id,
        "requestId": result.request_id,
        "countIncrement": result.count_increment,
        "monthKey": result.month_key,
        "currentMonthUsage": result.current_month_usage,
        "fillsRemaining": result.fills_remaining,
        "monthlyLimit": result.monthly_limit,
    }
