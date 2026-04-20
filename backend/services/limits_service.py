"""Role and tier-based limits."""

from __future__ import annotations

from typing import Any, Dict, Optional

from backend.env_utils import int_env as _int_env
from backend.firebaseDB.user_database import ROLE_GOD, ROLE_PRO, normalize_role


def resolve_detect_max_pages(role: Optional[str]) -> int:
    normalized = normalize_role(role)
    if normalized == ROLE_GOD:
        return max(1, _int_env("SANDBOX_DETECT_MAX_PAGES_GOD", 100))
    if normalized == ROLE_PRO:
        return max(1, _int_env("SANDBOX_DETECT_MAX_PAGES_PRO", 100))
    return max(1, _int_env("SANDBOX_DETECT_MAX_PAGES_BASE", 5))


def resolve_fillable_max_pages(role: Optional[str]) -> int:
    normalized = normalize_role(role)
    if normalized == ROLE_GOD:
        return max(1, _int_env("SANDBOX_FILLABLE_MAX_PAGES_GOD", 1000))
    if normalized == ROLE_PRO:
        return max(1, _int_env("SANDBOX_FILLABLE_MAX_PAGES_PRO", 1000))
    return max(1, _int_env("SANDBOX_FILLABLE_MAX_PAGES_BASE", 50))


def resolve_saved_forms_limit(role: Optional[str]) -> int:
    normalized = normalize_role(role)
    if normalized == ROLE_GOD:
        return max(1, _int_env("SANDBOX_SAVED_FORMS_MAX_GOD", 100))
    if normalized == ROLE_PRO:
        return max(1, _int_env("SANDBOX_SAVED_FORMS_MAX_PRO", 100))
    return max(1, _int_env("SANDBOX_SAVED_FORMS_MAX_BASE", 5))


def resolve_fill_link_responses_monthly_limit(role: Optional[str]) -> int:
    normalized = normalize_role(role)
    if normalized == ROLE_GOD:
        return max(0, _int_env("SANDBOX_FILL_LINK_RESPONSES_MONTHLY_MAX_GOD", 100000))
    if normalized == ROLE_PRO:
        return max(0, _int_env("SANDBOX_FILL_LINK_RESPONSES_MONTHLY_MAX_PRO", 10000))
    return max(0, _int_env("SANDBOX_FILL_LINK_RESPONSES_MONTHLY_MAX_BASE", 25))


def resolve_template_api_active_limit(role: Optional[str]) -> int:
    normalized = normalize_role(role)
    if normalized == ROLE_GOD:
        return max(0, _int_env("SANDBOX_TEMPLATE_API_ACTIVE_MAX_GOD", 100))
    if normalized == ROLE_PRO:
        return max(0, _int_env("SANDBOX_TEMPLATE_API_ACTIVE_MAX_PRO", 20))
    return max(0, _int_env("SANDBOX_TEMPLATE_API_ACTIVE_MAX_BASE", 1))


def resolve_template_api_requests_monthly_limit(role: Optional[str]) -> int:
    normalized = normalize_role(role)
    if normalized == ROLE_GOD:
        return max(0, _int_env("SANDBOX_TEMPLATE_API_REQUESTS_MONTHLY_MAX_GOD", 100000))
    if normalized == ROLE_PRO:
        return max(0, _int_env("SANDBOX_TEMPLATE_API_REQUESTS_MONTHLY_MAX_PRO", 10000))
    return max(0, _int_env("SANDBOX_TEMPLATE_API_REQUESTS_MONTHLY_MAX_BASE", 250))


def resolve_template_api_max_pages(role: Optional[str]) -> int:
    # Phase 5: bumped from 25/250/1000 → 50/500/2000 so a typical immigration
    # packet (~30 pages across 8 forms) fits on the free tier. Group endpoints
    # gate the *sum* of pages across every template in the group, so this
    # number has to accommodate packet-size fills, not single-template fills.
    normalized = normalize_role(role)
    if normalized == ROLE_GOD:
        return max(1, _int_env("SANDBOX_TEMPLATE_API_MAX_PAGES_GOD", 2000))
    if normalized == ROLE_PRO:
        return max(1, _int_env("SANDBOX_TEMPLATE_API_MAX_PAGES_PRO", 500))
    return max(1, _int_env("SANDBOX_TEMPLATE_API_MAX_PAGES_BASE", 50))


def check_group_fill_quota(
    *,
    monthly_limit: int,
    current_request_count: int,
    pdf_count: int,
    page_count_per_request: int,
    max_pages_per_request: int,
) -> Dict[str, Any]:
    """Phase 5 (D7): pre-validate a group fill against monthly + per-request limits.

    Returns a dict with::

        {
            "allowed": bool,
            "fillsRemaining": int,
            "pdfCount": int,
            "monthlyLimit": int,
            "maxPagesPerRequest": int,
            "pageCountPerRequest": int,
            "reason": Optional[str],
        }

    Reasons are stable strings the precheck endpoint can surface to clients:
      - ``"fills_exhausted"`` — the group fill would push monthly usage over.
      - ``"pages_per_request"`` — the sum of pages exceeds the per-request cap.

    All-or-nothing semantics: if either check fails, ``allowed`` is False and
    the caller must not consume any quota. The actual debit happens during
    materialization in ``record_template_api_endpoint_success`` with the same
    ``count_increment`` value, so a successful precheck plus a successful fill
    are guaranteed to use exactly the budget the precheck reported.
    """

    normalized_monthly_limit = max(0, int(monthly_limit or 0))
    normalized_current = max(0, int(current_request_count or 0))
    normalized_pdf_count = max(1, int(pdf_count or 1))
    normalized_pages = max(0, int(page_count_per_request or 0))
    normalized_max_pages = max(1, int(max_pages_per_request or 1))
    fills_remaining = max(0, normalized_monthly_limit - normalized_current)

    if normalized_pages > normalized_max_pages:
        return {
            "allowed": False,
            "fillsRemaining": fills_remaining,
            "pdfCount": normalized_pdf_count,
            "monthlyLimit": normalized_monthly_limit,
            "maxPagesPerRequest": normalized_max_pages,
            "pageCountPerRequest": normalized_pages,
            "reason": "pages_per_request",
        }
    if normalized_current + normalized_pdf_count > normalized_monthly_limit:
        return {
            "allowed": False,
            "fillsRemaining": fills_remaining,
            "pdfCount": normalized_pdf_count,
            "monthlyLimit": normalized_monthly_limit,
            "maxPagesPerRequest": normalized_max_pages,
            "pageCountPerRequest": normalized_pages,
            "reason": "fills_exhausted",
        }
    return {
        "allowed": True,
        "fillsRemaining": fills_remaining,
        "pdfCount": normalized_pdf_count,
        "monthlyLimit": normalized_monthly_limit,
        "maxPagesPerRequest": normalized_max_pages,
        "pageCountPerRequest": normalized_pages,
        "reason": None,
    }

def resolve_signing_requests_monthly_limit(role: Optional[str]) -> int:
    normalized = normalize_role(role)
    if normalized == ROLE_GOD:
        return max(0, _int_env("SANDBOX_SIGNING_REQUESTS_MONTHLY_MAX_GOD", 100000))
    if normalized == ROLE_PRO:
        return max(0, _int_env("SANDBOX_SIGNING_REQUESTS_MONTHLY_MAX_PRO", 10000))
    return max(0, _int_env("SANDBOX_SIGNING_REQUESTS_MONTHLY_MAX_BASE", 25))


def resolve_structured_fill_monthly_limit(role: Optional[str]) -> int:
    """Monthly Search & Fill credit cap for row-driven structured data fills.

    Credit cost is defined in ``backend/firebaseDB/structured_fill_database.py``:
    a single-template fill with at least one match charges 1; a group fill charges
    the number of matched target PDFs; no-match / schema-only fills charge 0.
    """
    normalized = normalize_role(role)
    if normalized == ROLE_GOD:
        return max(0, _int_env("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_GOD", 100000))
    if normalized == ROLE_PRO:
        return max(0, _int_env("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_PRO", 10000))
    return max(0, _int_env("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_BASE", 50))


def resolve_role_limits(role: Optional[str]) -> Dict[str, int]:
    return {
        "detectMaxPages": resolve_detect_max_pages(role),
        "fillableMaxPages": resolve_fillable_max_pages(role),
        "savedFormsMax": resolve_saved_forms_limit(role),
        "fillLinkResponsesMonthlyMax": resolve_fill_link_responses_monthly_limit(role),
        "templateApiActiveMax": resolve_template_api_active_limit(role),
        "templateApiRequestsMonthlyMax": resolve_template_api_requests_monthly_limit(role),
        "templateApiMaxPages": resolve_template_api_max_pages(role),
        "signingRequestsMonthlyMax": resolve_signing_requests_monthly_limit(role),
        "structuredFillMonthlyMax": resolve_structured_fill_monthly_limit(role),
    }
