"""Authenticated profile endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header
from fastapi import HTTPException

from backend.ai.credit_pricing import resolve_credit_pricing_config
from backend.api.schemas import DowngradeRetentionUpdateRequest
from backend.firebaseDB.pdf_download_database import get_pdf_download_monthly_usage
from backend.firebaseDB.structured_fill_database import get_structured_fill_monthly_usage
from backend.firebaseDB.user_database import (
    ROLE_BASE,
    ROLE_GOD,
    ROLE_PRO,
    clear_user_downgrade_retention,
    get_user_billing_record,
    get_user_profile,
    normalize_role,
)
from backend.services.auth_service import require_user
from backend.services.billing_service import billing_enabled, is_subscription_active, resolve_checkout_catalog
from backend.services.downgrade_retention_service import (
    DowngradeRetentionInactiveError,
    delete_user_downgrade_retention_now,
    restore_user_downgrade_managed_links,
    select_user_retained_templates,
    sync_user_downgrade_retention,
)
from backend.services.limits_service import (
    resolve_pdf_downloads_monthly_limit,
    resolve_role_limits,
    resolve_structured_fill_monthly_limit,
)

router = APIRouter()


def _current_month_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _next_month_reset_iso(month_key: Optional[str]) -> Optional[str]:
    normalized = str(month_key or "").strip()
    if len(normalized) != 7 or normalized[4] != "-":
        return None
    try:
        year = int(normalized[:4])
        month = int(normalized[5:7])
    except ValueError:
        return None
    if month < 1 or month > 12:
        return None
    if month == 12:
        year += 1
        month = 1
    else:
        month += 1
    return datetime(year, month, 1, tzinfo=timezone.utc).isoformat()


def _serialize_payment_recovery(record) -> Optional[Dict[str, Any]]:
    if record is None:
        return None
    return {
        "status": record.status,
        "latestInvoiceId": record.latest_invoice_id,
        "latestInvoiceStatus": record.latest_invoice_status,
        "failureCode": record.failure_code,
        "failedAt": record.failed_at,
        "nextPaymentAttempt": record.next_payment_attempt,
        "recoveryDeadline": record.recovery_deadline,
    }


@router.get("/api/profile")
async def get_profile(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    """Return the current user's profile details and limits."""
    user = require_user(authorization)
    profile = get_user_profile(user.app_user_id)
    role = normalize_role(profile.role if profile else user.role)
    credits_remaining: Optional[int] = None
    monthly_credits_remaining: Optional[int] = None
    refill_credits_remaining: Optional[int] = None
    available_credits: Optional[int] = None
    refill_credits_locked = False
    if profile:
        credits_remaining = profile.openai_credits_remaining
        monthly_credits_remaining = profile.openai_credits_monthly_remaining
        refill_credits_remaining = profile.openai_credits_refill_remaining
        available_credits = profile.openai_credits_available
        refill_credits_locked = bool(profile.refill_credits_locked)
    if role == ROLE_GOD:
        credits_remaining = None
        monthly_credits_remaining = None
        refill_credits_remaining = None
        available_credits = None
        refill_credits_locked = False
    retention_summary = None
    if role == ROLE_BASE:
        retention_summary = sync_user_downgrade_retention(user.app_user_id, create_if_missing=True)
    elif profile and profile.downgrade_retention:
        restore_user_downgrade_managed_links(user.app_user_id)
        clear_user_downgrade_retention(user.app_user_id)
    billing_is_enabled = billing_enabled()
    billing_record = get_user_billing_record(user.app_user_id) if billing_is_enabled else None
    structured_fill_usage = get_structured_fill_monthly_usage(user.app_user_id)
    structured_fill_monthly_max = resolve_structured_fill_monthly_limit(role)
    structured_fill_credits_this_month = (
        structured_fill_usage.credit_count if structured_fill_usage is not None else 0
    )
    structured_fill_usage_month = (
        structured_fill_usage.month_key if structured_fill_usage is not None else None
    )
    structured_fill_credits_remaining = max(
        0, structured_fill_monthly_max - structured_fill_credits_this_month
    )
    pdf_download_usage = get_pdf_download_monthly_usage(user.app_user_id)
    pdf_downloads_this_month = (
        pdf_download_usage.download_count if pdf_download_usage is not None else 0
    )
    pdf_download_workspace_this_month = (
        pdf_download_usage.workspace_download_count if pdf_download_usage is not None else 0
    )
    pdf_download_group_this_month = (
        pdf_download_usage.group_download_pdf_count if pdf_download_usage is not None else 0
    )
    pdf_download_batches_this_month = (
        pdf_download_usage.event_count if pdf_download_usage is not None else 0
    )
    pdf_download_usage_month = (
        pdf_download_usage.month_key if pdf_download_usage is not None else None
    )
    pdf_download_reset_at = _next_month_reset_iso(pdf_download_usage_month or _current_month_key())
    pdf_downloads_monthly_max = resolve_pdf_downloads_monthly_limit(role)
    pdf_downloads_remaining = (
        None
        if pdf_downloads_monthly_max is None
        else max(0, pdf_downloads_monthly_max - pdf_downloads_this_month)
    )
    return {
        "email": user.email,
        "displayName": user.display_name,
        "role": role,
        "creditsRemaining": credits_remaining,
        "monthlyCreditsRemaining": monthly_credits_remaining,
        "refillCreditsRemaining": refill_credits_remaining,
        "availableCredits": available_credits,
        "refillCreditsLocked": refill_credits_locked,
        "structuredFillCreditsThisMonth": structured_fill_credits_this_month,
        "structuredFillCreditsRemaining": structured_fill_credits_remaining,
        "structuredFillUsageMonth": structured_fill_usage_month,
        "pdfDownloadsThisMonth": pdf_downloads_this_month,
        "pdfDownloadsRemaining": pdf_downloads_remaining,
        "pdfDownloadUsageMonth": pdf_download_usage_month,
        "pdfDownloadWorkspaceThisMonth": pdf_download_workspace_this_month,
        "pdfDownloadGroupThisMonth": pdf_download_group_this_month,
        "pdfDownloadBatchesThisMonth": pdf_download_batches_this_month,
        "pdfDownloadResetAt": pdf_download_reset_at,
        "creditPricing": resolve_credit_pricing_config(),
        "billing": {
            "enabled": billing_is_enabled,
            "plans": resolve_checkout_catalog() if billing_is_enabled else {},
            "hasSubscription": bool(
                billing_record
                and billing_record.subscription_id
                and is_subscription_active(billing_record.subscription_status)
            ),
            "subscriptionStatus": billing_record.subscription_status if billing_record else None,
            "cancelAtPeriodEnd": billing_record.cancel_at_period_end if billing_record else None,
            "cancelAt": billing_record.cancel_at if billing_record else None,
            "currentPeriodEnd": billing_record.current_period_end if billing_record else None,
            "paymentRecovery": _serialize_payment_recovery(billing_record.payment_recovery if billing_record else None),
            "trialUsed": bool(profile and profile.trial_used) or role in {ROLE_PRO, ROLE_GOD},
        },
        "retention": retention_summary,
        "limits": resolve_role_limits(role),
    }


@router.patch("/api/profile/downgrade-retention")
async def update_profile_downgrade_retention(
    payload: DowngradeRetentionUpdateRequest,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    user = require_user(authorization)
    profile = get_user_profile(user.app_user_id)
    role = normalize_role(profile.role if profile else user.role)
    if role != ROLE_BASE:
        raise HTTPException(status_code=409, detail="Downgrade retention only applies to free accounts.")
    try:
        retention_summary = select_user_retained_templates(user.app_user_id, payload.keptTemplateIds)
    except DowngradeRetentionInactiveError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "success": True,
        "retention": retention_summary or None,
    }


@router.post("/api/profile/downgrade-retention/delete-now")
async def delete_profile_downgrade_retention(
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    user = require_user(authorization)
    profile = get_user_profile(user.app_user_id)
    role = normalize_role(profile.role if profile else user.role)
    if role != ROLE_BASE:
        raise HTTPException(status_code=409, detail="Downgrade retention only applies to free accounts.")
    result = delete_user_downgrade_retention_now(user.app_user_id)
    return {
        "success": True,
        **result,
    }
