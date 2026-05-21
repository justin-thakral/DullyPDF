"""Stripe billing endpoints for checkout and webhook fulfillment."""

from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Request

from backend.api.schemas import BillingCheckoutRequest, BillingReconcileRequest
from backend.firebaseDB.billing_database import (
    BillingEventInProgressError,
    clear_billing_event,
    complete_billing_event,
    delete_billing_event,
    get_billing_event,
    start_billing_event,
)
from backend.firebaseDB.user_database import (
    ROLE_BASE,
    ROLE_GOD,
    ROLE_PRO,
    activate_pro_membership,
    add_refill_openai_credits,
    clear_user_billing_payment_recovery,
    downgrade_to_base_membership,
    ensure_user,
    find_user_id_by_subscription_id,
    get_trial_used,
    get_user_billing_record,
    get_user_profile,
    normalize_role,
    set_user_billing_payment_recovery,
    set_user_billing_subscription,
)
from backend.services.auth_service import require_user
from backend.security.rate_limit import check_rate_limit
from backend.services.billing_service import (
    BillingCheckoutConflictError,
    BillingConfigError,
    BillingCheckoutSessionNotFoundError,
    BillingPaymentRecoveryError,
    CHECKOUT_KIND_FREE_TRIAL,
    CHECKOUT_KIND_PRO_MONTHLY,
    CHECKOUT_KIND_PRO_YEARLY,
    CHECKOUT_KIND_REFILL_500,
    billing_enabled,
    cancel_subscription_at_period_end,
    construct_webhook_event,
    create_billing_portal_session,
    create_checkout_session,
    extract_price_ids_from_invoice,
    first_nonempty,
    is_pro_price_id,
    is_subscription_active,
    list_recent_checkout_completion_events,
    retrieve_checkout_session,
    resolve_webhook_health,
    resolve_price_id_for_checkout_kind,
    resolve_refill_credit_pack_size_for_price,
    sync_subscription_payment_method_for_retry,
    webhook_health_enforced_for_checkout,
)
from backend.services.downgrade_retention_service import (
    DowngradeRetentionEligibility,
    apply_user_downgrade_retention,
    restore_user_downgrade_managed_links,
)
from backend.logging_config import get_logger

router = APIRouter()
logger = get_logger(__name__)
TERMINAL_SUBSCRIPTION_STATUSES = {"canceled", "incomplete_expired", "unpaid"}


class RetryableWebhookProcessingError(RuntimeError):
    """Raised when webhook fulfillment should be retried later."""


def _release_billing_event_lock(event_id: str, *, event_type: str) -> None:
    """Best-effort release for webhook locks before returning an error to Stripe."""
    try:
        clear_billing_event(event_id)
        return
    except Exception:
        logger.exception(
            "Failed to clear Stripe webhook event lock.",
            extra={"stripeEventId": event_id, "eventType": event_type},
        )
    try:
        delete_billing_event(event_id)
    except Exception:
        logger.exception(
            "Failed to delete Stripe webhook event lock after clear failure.",
            extra={"stripeEventId": event_id, "eventType": event_type},
        )


def _is_refill_fulfillment_eligible(user_id: str) -> bool:
    """Gate refill fulfillment to users currently in an active Pro state."""
    profile = get_user_profile(user_id)
    role = normalize_role(profile.role if profile else None)
    if role != ROLE_PRO:
        return False

    billing_record = get_user_billing_record(user_id)
    if not billing_record:
        return False
    if not str(billing_record.subscription_id or "").strip():
        return False
    return is_subscription_active(billing_record.subscription_status)


def _resolve_user_from_request(request: Request, authorization: Optional[str]):
    auth_payload = getattr(request.state, "preverified_auth_payload", None)
    if auth_payload is None:
        return require_user(authorization)
    try:
        return ensure_user(auth_payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to synchronize user profile") from exc


def _resolve_user_id_from_subscription(subscription_obj: Dict[str, Any]) -> Optional[str]:
    metadata = subscription_obj.get("metadata") if isinstance(subscription_obj, dict) else None
    if isinstance(metadata, dict):
        user_id = first_nonempty(
            [
                metadata.get("userId"),
                metadata.get("user_id"),
            ]
        )
        if user_id:
            return user_id
    subscription_id = first_nonempty([str(subscription_obj.get("id") or "")]) if isinstance(subscription_obj, dict) else None
    if not subscription_id:
        return None
    return find_user_id_by_subscription_id(subscription_id)


def _extract_subscription_price_ids(subscription_obj: Dict[str, Any]) -> list[str]:
    items = subscription_obj.get("items") if isinstance(subscription_obj, dict) else None
    data = items.get("data") if isinstance(items, dict) else None
    if not isinstance(data, list):
        return []
    price_ids: list[str] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        price = item.get("price")
        if isinstance(price, dict):
            price_id = str(price.get("id") or "").strip()
        else:
            price_id = str(price or "").strip()
        if price_id:
            price_ids.append(price_id)
    return price_ids


def _resolve_subscription_price_id(subscription_obj: Dict[str, Any]) -> Optional[str]:
    """Prefer the Pro item when Stripe sends a mixed-price subscription payload."""
    price_ids = _extract_subscription_price_ids(subscription_obj)
    pro_price_id = next((price_id for price_id in price_ids if is_pro_price_id(price_id)), None)
    if pro_price_id:
        return pro_price_id
    return next((price_id for price_id in price_ids if price_id), None)


def _coerce_positive_int(value: Any) -> Optional[int]:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _resolve_invoice_subscription_id(invoice_obj: Dict[str, Any]) -> Optional[str]:
    subscription_details = (
        invoice_obj.get("subscription_details")
        if isinstance(invoice_obj.get("subscription_details"), dict)
        else {}
    )
    parent = invoice_obj.get("parent") if isinstance(invoice_obj.get("parent"), dict) else {}
    parent_subscription_details = (
        parent.get("subscription_details")
        if isinstance(parent.get("subscription_details"), dict)
        else {}
    )
    candidates: list[Optional[str]] = [
        str(invoice_obj.get("subscription") or ""),
        str(subscription_details.get("subscription") or ""),
        str(parent_subscription_details.get("subscription") or ""),
    ]

    lines = invoice_obj.get("lines") if isinstance(invoice_obj.get("lines"), dict) else {}
    line_items = lines.get("data") if isinstance(lines.get("data"), list) else []
    for entry in line_items:
        if not isinstance(entry, dict):
            continue
        candidates.append(str(entry.get("subscription") or ""))
        line_parent = entry.get("parent") if isinstance(entry.get("parent"), dict) else {}
        subscription_item_details = (
            line_parent.get("subscription_item_details")
            if isinstance(line_parent.get("subscription_item_details"), dict)
            else {}
        )
        candidates.append(str(subscription_item_details.get("subscription") or ""))
    return first_nonempty(candidates)


def _resolve_invoice_metadata_user_id(invoice_obj: Dict[str, Any]) -> Optional[str]:
    metadata = invoice_obj.get("metadata") if isinstance(invoice_obj.get("metadata"), dict) else {}
    subscription_details = (
        invoice_obj.get("subscription_details")
        if isinstance(invoice_obj.get("subscription_details"), dict)
        else {}
    )
    subscription_metadata = (
        subscription_details.get("metadata")
        if isinstance(subscription_details.get("metadata"), dict)
        else {}
    )
    parent = invoice_obj.get("parent") if isinstance(invoice_obj.get("parent"), dict) else {}
    parent_subscription_details = (
        parent.get("subscription_details")
        if isinstance(parent.get("subscription_details"), dict)
        else {}
    )
    parent_subscription_metadata = (
        parent_subscription_details.get("metadata")
        if isinstance(parent_subscription_details.get("metadata"), dict)
        else {}
    )
    line_metadata_candidates: list[Dict[str, Any]] = []
    lines = invoice_obj.get("lines") if isinstance(invoice_obj.get("lines"), dict) else {}
    line_items = lines.get("data") if isinstance(lines.get("data"), list) else []
    for entry in line_items:
        if isinstance(entry, dict) and isinstance(entry.get("metadata"), dict):
            line_metadata_candidates.append(entry["metadata"])
    candidate_values = [
        metadata.get("userId"),
        metadata.get("user_id"),
        subscription_metadata.get("userId"),
        subscription_metadata.get("user_id"),
        parent_subscription_metadata.get("userId"),
        parent_subscription_metadata.get("user_id"),
    ]
    for line_metadata in line_metadata_candidates:
        candidate_values.extend([line_metadata.get("userId"), line_metadata.get("user_id")])
    return first_nonempty(
        candidate_values
    )


def _resolve_payment_failure_details(invoice_obj: Dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    error_candidates: list[Dict[str, Any]] = []
    direct_error = invoice_obj.get("last_payment_error")
    if isinstance(direct_error, dict):
        error_candidates.append(direct_error)
    payment_intent = invoice_obj.get("payment_intent")
    if isinstance(payment_intent, dict):
        intent_error = payment_intent.get("last_payment_error")
        if isinstance(intent_error, dict):
            error_candidates.append(intent_error)
    charge = invoice_obj.get("charge")
    if isinstance(charge, dict):
        outcome = charge.get("outcome")
        if isinstance(outcome, dict):
            error_candidates.append(outcome)

    for error in error_candidates:
        code = first_nonempty(
            [
                str(error.get("decline_code") or ""),
                str(error.get("code") or ""),
                str(error.get("type") or ""),
            ]
        )
        message = first_nonempty([str(error.get("message") or ""), str(error.get("seller_message") or "")])
        if code or message:
            return code, message
    return None, None


def _resolve_payment_recovery_deadline(invoice_obj: Dict[str, Any], *, failed_at: Optional[int] = None) -> Optional[int]:
    resolved_failed_at = failed_at or _coerce_positive_int(invoice_obj.get("created"))
    if resolved_failed_at is None:
        resolved_failed_at = int(time.time())
    window_days = _safe_positive_int_env("STRIPE_PAYMENT_RECOVERY_WINDOW_DAYS", 7)
    return resolved_failed_at + (window_days * 24 * 60 * 60)


def _resolve_failed_invoice_subscription_status(
    invoice_obj: Dict[str, Any],
    billing_record,
    *,
    subscription_id: str,
) -> str:
    billing_reason = str(invoice_obj.get("billing_reason") or "").strip().lower()
    stored_subscription_id = (billing_record.subscription_id or "").strip() if billing_record else ""
    previous_status = (billing_record.subscription_status or "").strip().lower() if billing_record else ""
    if (
        billing_reason == "subscription_create"
        and (not stored_subscription_id or stored_subscription_id == subscription_id)
        and not is_subscription_active(previous_status)
    ):
        return "incomplete"
    return "past_due"


def _stored_payment_recovery_is_newer_than_event(
    billing_record,
    *,
    event_created: Optional[int],
) -> bool:
    payment_recovery = getattr(billing_record, "payment_recovery", None)
    if payment_recovery is None:
        return False
    recovery_failed_at = _coerce_positive_int(getattr(payment_recovery, "failed_at", None))
    event_at = _coerce_positive_int(event_created)
    return bool(recovery_failed_at and event_at and event_at < recovery_failed_at)


def _invoice_paid_is_older_than_stored_recovery(
    invoice_obj: Dict[str, Any],
    billing_record,
    *,
    stripe_event_created: Optional[int] = None,
) -> bool:
    payment_recovery = getattr(billing_record, "payment_recovery", None)
    if payment_recovery is None:
        return False
    recovery_invoice_id = str(getattr(payment_recovery, "latest_invoice_id", "") or "").strip()
    paid_invoice_id = str(invoice_obj.get("id") or "").strip()
    if recovery_invoice_id and paid_invoice_id and recovery_invoice_id == paid_invoice_id:
        return False
    paid_event_at = stripe_event_created or _coerce_positive_int(invoice_obj.get("created"))
    return _stored_payment_recovery_is_newer_than_event(billing_record, event_created=paid_event_at)


def _checkout_completed_is_older_than_stored_recovery(
    session_obj: Dict[str, Any],
    billing_record,
    *,
    subscription_id: Optional[str],
    stripe_event_created: Optional[int] = None,
) -> bool:
    stored_subscription_id = (getattr(billing_record, "subscription_id", None) or "").strip()
    normalized_subscription_id = (subscription_id or "").strip()
    if stored_subscription_id and normalized_subscription_id and stored_subscription_id != normalized_subscription_id:
        return False
    checkout_event_at = stripe_event_created or _coerce_positive_int(session_obj.get("created"))
    return _stored_payment_recovery_is_newer_than_event(billing_record, event_created=checkout_event_at)


def _invoice_payment_failed_is_older_than_stored_recovery(
    invoice_obj: Dict[str, Any],
    billing_record,
    *,
    stripe_event_created: Optional[int] = None,
) -> bool:
    payment_recovery = getattr(billing_record, "payment_recovery", None)
    if payment_recovery is None:
        return False
    recovery_invoice_id = str(getattr(payment_recovery, "latest_invoice_id", "") or "").strip()
    failed_invoice_id = str(invoice_obj.get("id") or "").strip()
    if recovery_invoice_id and failed_invoice_id and recovery_invoice_id == failed_invoice_id:
        return False
    failed_event_at = stripe_event_created or _coerce_positive_int(invoice_obj.get("created"))
    return _stored_payment_recovery_is_newer_than_event(billing_record, event_created=failed_event_at)


def _resolve_checkout_session_price_id(session_obj: Dict[str, Any], *, metadata_dict: Dict[str, Any]) -> Optional[str]:
    metadata_price_id = first_nonempty(
        [
            str(metadata_dict.get("checkoutPriceId") or ""),
            str(metadata_dict.get("checkout_price_id") or ""),
        ]
    )
    if metadata_price_id:
        return metadata_price_id
    line_items = session_obj.get("line_items") if isinstance(session_obj, dict) else None
    data = line_items.get("data") if isinstance(line_items, dict) else None
    if not isinstance(data, list) or not data:
        return None
    first_item = data[0]
    if not isinstance(first_item, dict):
        return None
    price = first_item.get("price")
    if isinstance(price, dict):
        return first_nonempty([str(price.get("id") or "")])
    return first_nonempty([str(price or "")])


def _resolve_checkout_attempt_id(metadata_dict: Dict[str, Any]) -> Optional[str]:
    return first_nonempty(
        [
            str(metadata_dict.get("checkoutAttemptId") or ""),
            str(metadata_dict.get("checkout_attempt_id") or ""),
        ]
    )


def _resolve_checkout_processing_key(
    session_obj: Dict[str, Any],
    *,
    fallback_event_id: Optional[str] = None,
) -> str:
    """Normalize checkout fulfillment idempotency to the checkout session id.

    Webhooks provide a Stripe event id while self-reconciliation starts from a
    checkout session id. Using the session id as the primary processing key
    keeps fulfillment idempotent across both paths and avoids duplicate credit
    grants when a delayed webhook arrives after a manual recovery.
    """
    session_id = str(session_obj.get("id") or "").strip()
    if session_id:
        return f"checkout_session:{session_id}"
    return str(fallback_event_id or "").strip()


def _resolve_refill_checkout_credits(session_obj: Dict[str, Any], *, metadata_dict: Dict[str, Any]) -> int:
    # Recent checkout sessions include both the Stripe price id and explicit refill
    # credit count in metadata. We validate the metadata against the configured
    # price mapping so credit grants stay aligned with what Stripe sold.
    checkout_price_id = first_nonempty(
        [
            _resolve_checkout_session_price_id(session_obj, metadata_dict=metadata_dict),
            resolve_price_id_for_checkout_kind(CHECKOUT_KIND_REFILL_500),
        ]
    )
    metadata_credits = _coerce_positive_int(
        first_nonempty(
            [
                str(metadata_dict.get("refillCredits") or ""),
                str(metadata_dict.get("refill_credits") or ""),
            ]
        )
    )
    configured_credits = resolve_refill_credit_pack_size_for_price(checkout_price_id)
    if metadata_credits is not None:
        if configured_credits is not None and metadata_credits != configured_credits:
            raise ValueError("Refill checkout metadata does not match configured Stripe credit mapping.")
        return metadata_credits
    if configured_credits is not None:
        return configured_credits
    raise ValueError("Unable to resolve refill credits for the Stripe checkout price.")


def _handle_checkout_session_completed(
    session_obj: Dict[str, Any],
    *,
    stripe_event_id: str,
    stripe_event_created: Optional[int] = None,
) -> None:
    metadata = session_obj.get("metadata") if isinstance(session_obj, dict) else None
    metadata_dict = metadata if isinstance(metadata, dict) else {}
    processing_key = _resolve_checkout_processing_key(session_obj, fallback_event_id=stripe_event_id)
    user_id = first_nonempty(
        [
            metadata_dict.get("userId"),
            metadata_dict.get("user_id"),
            str(session_obj.get("client_reference_id") or ""),
        ]
    )
    if not user_id:
        logger.warning(
            "Skipping checkout.session.completed because user id could not be resolved.",
            extra={"stripeEventId": stripe_event_id},
        )
        return
    checkout_kind = (metadata_dict.get("checkoutKind") or "").strip().lower()
    if checkout_kind in {CHECKOUT_KIND_PRO_MONTHLY, CHECKOUT_KIND_PRO_YEARLY, CHECKOUT_KIND_FREE_TRIAL}:
        payment_status = str(session_obj.get("payment_status") or "").strip().lower()
        if payment_status not in {"paid", "no_payment_required"}:
            return
        subscription_id = str(session_obj.get("subscription") or "").strip() or None
        customer_id = str(session_obj.get("customer") or "").strip() or None
        if not subscription_id or not customer_id:
            raise RetryableWebhookProcessingError(
                "Stripe checkout.session.completed is missing subscription linkage; awaiting complete session payload.",
            )
        subscription_price_id = resolve_price_id_for_checkout_kind(checkout_kind)
        billing_record = get_user_billing_record(user_id)
        stored_subscription_id = (billing_record.subscription_id or "").strip() if billing_record else ""
        previous_status = (billing_record.subscription_status or "").strip().lower() if billing_record else ""
        if (
            billing_record
            and stored_subscription_id
            and subscription_id
            and stored_subscription_id != subscription_id
            and is_subscription_active(previous_status)
        ):
            logger.info(
                "Skipping Stripe checkout.session.completed because a different local subscription is active.",
                extra={
                    "stripeEventId": stripe_event_id,
                    "checkoutSessionId": str(session_obj.get("id") or "").strip() or None,
                    "checkoutSubscriptionId": subscription_id,
                    "localSubscriptionId": stored_subscription_id,
                    "subscriptionStatus": previous_status,
                },
            )
            return
        if billing_record and _checkout_completed_is_older_than_stored_recovery(
            session_obj,
            billing_record,
            subscription_id=subscription_id,
            stripe_event_created=stripe_event_created,
        ):
            logger.info(
                "Skipping Stripe checkout.session.completed because a newer payment recovery record is stored.",
                extra={
                    "stripeEventId": stripe_event_id,
                    "checkoutSessionId": str(session_obj.get("id") or "").strip() or None,
                    "subscriptionId": subscription_id,
                },
            )
            return
        # Checkout is the explicit purchase boundary, so it is responsible for
        # granting the fresh monthly Pro pool. Stripe subscription metadata is
        # synced in a separate write so later invoice lifecycle events can heal
        # billing linkage without looking like a brand-new purchase.
        activate_pro_membership(
            user_id,
            stripe_event_id=processing_key,
            reset_monthly_credits=True,
        )
        set_user_billing_subscription(
            user_id,
            customer_id=customer_id,
            subscription_id=subscription_id,
            subscription_status="trialing" if checkout_kind == CHECKOUT_KIND_FREE_TRIAL else "active",
            subscription_price_id=subscription_price_id,
            cancel_at_period_end=False,
            cancel_at=None,
            current_period_end=None,
        )
        clear_user_billing_payment_recovery(user_id)
        restore_user_downgrade_managed_links(user_id)
        return
    if checkout_kind == CHECKOUT_KIND_REFILL_500:
        payment_status = str(session_obj.get("payment_status") or "").strip().lower()
        if payment_status not in {"paid", "no_payment_required"}:
            return
        if not _is_refill_fulfillment_eligible(user_id):
            raise RetryableWebhookProcessingError(
                "Credit refill requires an active Pro subscription at fulfillment time."
            )
        try:
            refill_credits = _resolve_refill_checkout_credits(session_obj, metadata_dict=metadata_dict)
        except ValueError:
            raise RetryableWebhookProcessingError(
                "Unable to resolve refill credits for Stripe checkout fulfillment."
            )
        add_refill_openai_credits(
            user_id,
            credits=refill_credits,
            stripe_event_id=processing_key,
        )


def _handle_invoice_paid(
    invoice_obj: Dict[str, Any],
    *,
    stripe_event_id: str,
    stripe_event_created: Optional[int] = None,
) -> None:
    subscription_id = _resolve_invoice_subscription_id(invoice_obj)
    if not subscription_id:
        return

    price_ids = extract_price_ids_from_invoice(invoice_obj)
    pro_price_id = next((price_id for price_id in price_ids if is_pro_price_id(price_id)), None)

    user_id = first_nonempty(
        [
            _resolve_invoice_metadata_user_id(invoice_obj),
            find_user_id_by_subscription_id(subscription_id),
        ]
    )
    if not user_id:
        if pro_price_id or not price_ids:
            raise RetryableWebhookProcessingError(
                "Unable to resolve user for Stripe invoice.paid event; awaiting subscription linkage.",
            )
        logger.info(
            "Skipping non-Pro invoice.paid event with unresolved user.",
            extra={
                "stripeEventId": stripe_event_id,
                "subscriptionId": subscription_id,
                "priceIds": price_ids,
            },
        )
        return

    billing_record = get_user_billing_record(user_id)

    if not pro_price_id and billing_record:
        if (
            (billing_record.subscription_id or "").strip() == subscription_id
            and is_pro_price_id(billing_record.subscription_price_id)
        ):
            pro_price_id = billing_record.subscription_price_id
    if not pro_price_id:
        return

    stored_subscription_id = (billing_record.subscription_id or "").strip() if billing_record else ""
    previous_status = (billing_record.subscription_status or "").strip().lower() if billing_record else ""
    if (
        billing_record
        and stored_subscription_id
        and stored_subscription_id != subscription_id
        and is_subscription_active(previous_status)
    ):
        logger.info(
            "Skipping Stripe invoice.paid because a different local subscription is active.",
            extra={
                "stripeEventId": stripe_event_id,
                "invoiceSubscriptionId": subscription_id,
                "localSubscriptionId": stored_subscription_id,
                "subscriptionStatus": previous_status,
            },
        )
        return
    if (
        billing_record
        and stored_subscription_id == subscription_id
        and previous_status in TERMINAL_SUBSCRIPTION_STATUSES
    ):
        logger.info(
            "Skipping Stripe invoice.paid because the local subscription is already terminal.",
            extra={
                "stripeEventId": stripe_event_id,
                "subscriptionId": subscription_id,
                "subscriptionStatus": previous_status,
            },
        )
        return

    if _invoice_paid_is_older_than_stored_recovery(
        invoice_obj,
        billing_record,
        stripe_event_created=stripe_event_created,
    ):
        logger.info(
            "Skipping Stripe invoice.paid because a newer payment recovery record is stored.",
            extra={
                "stripeEventId": stripe_event_id,
                "invoiceId": str(invoice_obj.get("id") or "").strip() or None,
                "subscriptionId": subscription_id,
            },
        )
        return

    customer_id = str(invoice_obj.get("customer") or "").strip() or None
    # Invoice settlement confirms an active subscription and should heal role
    # or billing linkage, but it must not blindly reset a Pro pool that was
    # already granted and partially spent after checkout.
    activate_pro_membership(
        user_id,
        stripe_event_id=stripe_event_id,
        reset_monthly_credits=False,
    )
    set_user_billing_subscription(
        user_id,
        customer_id=customer_id,
        subscription_id=subscription_id,
        subscription_status="active",
        subscription_price_id=pro_price_id,
    )
    clear_user_billing_payment_recovery(user_id)
    restore_user_downgrade_managed_links(user_id)


def _handle_invoice_payment_failed(
    invoice_obj: Dict[str, Any],
    *,
    stripe_event_id: str,
    stripe_event_created: Optional[int] = None,
) -> None:
    subscription_id = _resolve_invoice_subscription_id(invoice_obj)
    if not subscription_id:
        return

    price_ids = extract_price_ids_from_invoice(invoice_obj)
    pro_price_id = next((price_id for price_id in price_ids if is_pro_price_id(price_id)), None)
    user_id = first_nonempty(
        [
            _resolve_invoice_metadata_user_id(invoice_obj),
            find_user_id_by_subscription_id(subscription_id),
        ]
    )
    if not user_id:
        if pro_price_id or not price_ids:
            raise RetryableWebhookProcessingError(
                "Unable to resolve user for Stripe invoice.payment_failed event; awaiting subscription linkage.",
            )
        logger.info(
            "Skipping non-Pro invoice.payment_failed event with unresolved user.",
            extra={
                "stripeEventId": stripe_event_id,
                "subscriptionId": subscription_id,
                "priceIds": price_ids,
            },
        )
        return

    billing_record = get_user_billing_record(user_id)
    if not pro_price_id and billing_record:
        if (
            (billing_record.subscription_id or "").strip() == subscription_id
            and is_pro_price_id(billing_record.subscription_price_id)
        ):
            pro_price_id = billing_record.subscription_price_id
    if not pro_price_id:
        return

    customer_id = str(invoice_obj.get("customer") or "").strip() or None
    stored_subscription_id = (billing_record.subscription_id or "").strip() if billing_record else ""
    previous_status = (billing_record.subscription_status or "").strip().lower() if billing_record else ""
    if (
        billing_record
        and stored_subscription_id
        and stored_subscription_id != subscription_id
        and is_subscription_active(previous_status)
    ):
        logger.info(
            "Skipping Stripe invoice.payment_failed because a different local subscription is active.",
            extra={
                "stripeEventId": stripe_event_id,
                "invoiceSubscriptionId": subscription_id,
                "localSubscriptionId": stored_subscription_id,
                "subscriptionStatus": previous_status,
            },
        )
        return
    if (
        billing_record
        and stored_subscription_id == subscription_id
        and previous_status in TERMINAL_SUBSCRIPTION_STATUSES
    ):
        logger.info(
            "Skipping Stripe invoice.payment_failed because the local subscription is already terminal.",
            extra={
                "stripeEventId": stripe_event_id,
                "subscriptionId": subscription_id,
                "subscriptionStatus": previous_status,
            },
        )
        return
    if billing_record and _invoice_payment_failed_is_older_than_stored_recovery(
        invoice_obj,
        billing_record,
        stripe_event_created=stripe_event_created,
    ):
        logger.info(
            "Skipping Stripe invoice.payment_failed because a newer payment recovery record is stored.",
            extra={
                "stripeEventId": stripe_event_id,
                "invoiceId": str(invoice_obj.get("id") or "").strip() or None,
                "subscriptionId": subscription_id,
            },
        )
        return
    failed_subscription_status = _resolve_failed_invoice_subscription_status(
        invoice_obj,
        billing_record,
        subscription_id=subscription_id,
    )
    set_user_billing_subscription(
        user_id,
        customer_id=customer_id,
        subscription_id=subscription_id,
        subscription_status=failed_subscription_status,
        subscription_price_id=pro_price_id,
    )
    failure_code, failure_message = _resolve_payment_failure_details(invoice_obj)
    failed_at = stripe_event_created or _coerce_positive_int(invoice_obj.get("created"))
    set_user_billing_payment_recovery(
        user_id,
        status="payment_failed",
        latest_invoice_id=str(invoice_obj.get("id") or "").strip() or None,
        latest_invoice_status=str(invoice_obj.get("status") or "").strip() or None,
        failure_code=failure_code,
        failure_message=failure_message,
        failed_at=failed_at,
        next_payment_attempt=_coerce_positive_int(invoice_obj.get("next_payment_attempt")),
        recovery_deadline=_resolve_payment_recovery_deadline(invoice_obj, failed_at=failed_at),
    )


def _handle_invoice_updated(
    invoice_obj: Dict[str, Any],
    *,
    stripe_event_id: str,
    stripe_event_created: Optional[int] = None,
) -> None:
    subscription_id = _resolve_invoice_subscription_id(invoice_obj)
    invoice_id = str(invoice_obj.get("id") or "").strip()
    if not subscription_id or not invoice_id:
        return
    user_id = first_nonempty(
        [
            _resolve_invoice_metadata_user_id(invoice_obj),
            find_user_id_by_subscription_id(subscription_id),
        ]
    )
    if not user_id:
        logger.info(
            "Skipping Stripe invoice.updated because the user could not be resolved.",
            extra={
                "stripeEventId": stripe_event_id,
                "subscriptionId": subscription_id,
                "invoiceId": invoice_id,
            },
        )
        return

    billing_record = get_user_billing_record(user_id)
    if not billing_record:
        return
    stored_subscription_id = (billing_record.subscription_id or "").strip()
    if stored_subscription_id != subscription_id:
        return
    payment_recovery = getattr(billing_record, "payment_recovery", None)
    if payment_recovery is None:
        return
    recovery_invoice_id = str(getattr(payment_recovery, "latest_invoice_id", "") or "").strip()
    if not recovery_invoice_id or recovery_invoice_id != invoice_id:
        return
    if _stored_payment_recovery_is_newer_than_event(
        billing_record,
        event_created=stripe_event_created or _coerce_positive_int(invoice_obj.get("created")),
    ):
        logger.info(
            "Skipping Stripe invoice.updated because a newer payment recovery record is stored.",
            extra={
                "stripeEventId": stripe_event_id,
                "subscriptionId": subscription_id,
                "invoiceId": invoice_id,
            },
        )
        return

    invoice_status = str(invoice_obj.get("status") or "").strip().lower() or getattr(
        payment_recovery,
        "latest_invoice_status",
        None,
    )
    next_payment_attempt = _coerce_positive_int(invoice_obj.get("next_payment_attempt"))
    if next_payment_attempt is None:
        next_payment_attempt = getattr(payment_recovery, "next_payment_attempt", None)

    set_user_billing_payment_recovery(
        user_id,
        status=str(getattr(payment_recovery, "status", "") or "payment_failed"),
        latest_invoice_id=recovery_invoice_id,
        latest_invoice_status=invoice_status,
        failure_code=getattr(payment_recovery, "failure_code", None),
        failure_message=getattr(payment_recovery, "failure_message", None),
        failed_at=getattr(payment_recovery, "failed_at", None),
        next_payment_attempt=next_payment_attempt,
        recovery_deadline=getattr(payment_recovery, "recovery_deadline", None),
    )


def _handle_subscription_lifecycle(
    subscription_obj: Dict[str, Any],
    *,
    stripe_event_id: Optional[str] = None,
    stripe_event_created: Optional[int] = None,
) -> None:
    subscription_id = str(subscription_obj.get("id") or "").strip()
    if not subscription_id:
        return
    customer_id = str(subscription_obj.get("customer") or "").strip() or None
    status = str(subscription_obj.get("status") or "").strip().lower() or None
    cancel_at_period_end_raw = subscription_obj.get("cancel_at_period_end")
    cancel_at_period_end = bool(cancel_at_period_end_raw) if cancel_at_period_end_raw is not None else None
    try:
        cancel_at = int(subscription_obj.get("cancel_at")) if subscription_obj.get("cancel_at") is not None else None
    except (TypeError, ValueError):
        cancel_at = None
    try:
        current_period_end = (
            int(subscription_obj.get("current_period_end"))
            if subscription_obj.get("current_period_end") is not None
            else None
        )
    except (TypeError, ValueError):
        current_period_end = None

    subscription_price_id = _resolve_subscription_price_id(subscription_obj)
    explicit_non_pro_price = bool(subscription_price_id and not is_pro_price_id(subscription_price_id))

    user_id = _resolve_user_id_from_subscription(subscription_obj)
    if not user_id:
        if explicit_non_pro_price:
            logger.info(
                "Skipping non-Pro subscription lifecycle event with unresolved user.",
                extra={"subscriptionId": subscription_id},
            )
            return
        raise RetryableWebhookProcessingError(
            "Unable to resolve user for Stripe subscription lifecycle event; awaiting subscription linkage.",
        )

    billing_record = get_user_billing_record(user_id)
    has_pro_price = is_pro_price_id(subscription_price_id)
    if (
        not has_pro_price
        and billing_record
        and (billing_record.subscription_id or "").strip() == subscription_id
        and is_pro_price_id(billing_record.subscription_price_id)
    ):
        has_pro_price = True
        if not subscription_price_id:
            subscription_price_id = billing_record.subscription_price_id
    if not has_pro_price:
        return

    stored_subscription_id = (billing_record.subscription_id or "").strip() if billing_record else ""
    previous_status = (billing_record.subscription_status or "").strip().lower() if billing_record else ""
    if (
        status in TERMINAL_SUBSCRIPTION_STATUSES
        and billing_record
        and stored_subscription_id == subscription_id
        and _stored_payment_recovery_is_newer_than_event(
            billing_record,
            event_created=stripe_event_created,
        )
    ):
        logger.info(
            "Skipping Stripe terminal subscription lifecycle because a newer payment recovery record is stored.",
            extra={
                "stripeEventId": stripe_event_id,
                "subscriptionId": subscription_id,
                "subscriptionStatus": status,
            },
        )
        return
    if (
        billing_record
        and stored_subscription_id
        and stored_subscription_id != subscription_id
        and is_subscription_active(previous_status)
    ):
        logger.info(
            "Skipping Stripe subscription lifecycle because a different local subscription is active.",
            extra={
                "stripeEventId": stripe_event_id,
                "eventSubscriptionId": subscription_id,
                "localSubscriptionId": stored_subscription_id,
                "subscriptionStatus": previous_status,
            },
        )
        return

    set_user_billing_subscription(
        user_id,
        customer_id=customer_id,
        subscription_id=subscription_id,
        subscription_status=status,
        subscription_price_id=subscription_price_id,
        cancel_at_period_end=cancel_at_period_end,
        cancel_at=cancel_at,
        current_period_end=current_period_end,
    )
    if is_subscription_active(status):
        if status in {"active", "trialing"}:
            clear_user_billing_payment_recovery(user_id)
        activate_pro_membership(
            user_id,
            stripe_event_id=stripe_event_id,
            reset_monthly_credits=False,
        )
        restore_user_downgrade_managed_links(user_id)
        return
    if status not in TERMINAL_SUBSCRIPTION_STATUSES:
        logger.info(
            "Recorded non-active Stripe subscription lifecycle status without local downgrade.",
            extra={
                "stripeEventId": stripe_event_id,
                "subscriptionId": subscription_id,
                "subscriptionStatus": status,
            },
        )
        return
    clear_user_billing_payment_recovery(user_id)
    if status == "incomplete_expired" and not is_subscription_active(previous_status):
        logger.info(
            "Recorded incomplete_expired subscription lifecycle without local downgrade because Pro access was never active.",
            extra={
                "stripeEventId": stripe_event_id,
                "subscriptionId": subscription_id,
                "previousSubscriptionStatus": previous_status,
            },
        )
        return
    downgrade_to_base_membership(user_id)
    apply_user_downgrade_retention(user_id)


def _enforce_checkout_webhook_health() -> None:
    if not webhook_health_enforced_for_checkout():
        return
    health = resolve_webhook_health()
    if health.get("healthy") is True:
        return
    reason = str(health.get("reason") or "").strip() or "Stripe webhook health check failed."
    logger.warning(
        "Blocking checkout because Stripe webhook health check failed.",
        extra={"billingWebhookHealthy": False, "reason": reason},
    )
    raise HTTPException(
        status_code=503,
        detail=(
            "Stripe webhook health check failed. "
            "Checkout is temporarily disabled until an administrator reviews billing configuration."
        ),
    )


def _safe_positive_int_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _resolve_billing_route_rate_limit(scope: str) -> tuple[int, int]:
    normalized_scope = str(scope or "").strip().lower()
    defaults = {
        "checkout": (300, 12),
        "cancel": (300, 10),
        "portal": (300, 12),
        "reconcile": (300, 24),
    }
    default_window, default_limit = defaults.get(normalized_scope, (300, 12))
    env_prefix = f"BILLING_{normalized_scope.upper()}"
    return (
        _safe_positive_int_env(f"{env_prefix}_RATE_LIMIT_WINDOW_SECONDS", default_window),
        _safe_positive_int_env(f"{env_prefix}_RATE_LIMIT_PER_USER", default_limit),
    )


def _enforce_billing_route_rate_limit(*, scope: str, user_id: str) -> None:
    window_seconds, per_user = _resolve_billing_route_rate_limit(scope)
    if check_rate_limit(
        f"billing:{scope}:user:{user_id}",
        limit=per_user,
        window_seconds=window_seconds,
        fail_closed=True,
    ):
        return
    raise HTTPException(status_code=429, detail="Too many billing requests. Please wait and try again.")


def _resolve_event_session_object(event_payload: Dict[str, Any]) -> Dict[str, Any]:
    data = event_payload.get("data") if isinstance(event_payload, dict) else None
    event_object = data.get("object") if isinstance(data, dict) else {}
    return event_object if isinstance(event_object, dict) else {}


def _resolve_event_user_id(session_obj: Dict[str, Any]) -> Optional[str]:
    metadata = session_obj.get("metadata") if isinstance(session_obj.get("metadata"), dict) else {}
    return first_nonempty(
        [
            metadata.get("userId"),
            metadata.get("user_id"),
            str(session_obj.get("client_reference_id") or ""),
        ]
    )


def _event_is_checkout_fulfillment_candidate(event_payload: Dict[str, Any]) -> bool:
    session_obj = _resolve_event_session_object(event_payload)
    metadata = session_obj.get("metadata") if isinstance(session_obj.get("metadata"), dict) else {}
    checkout_kind = str(metadata.get("checkoutKind") or "").strip().lower()
    if checkout_kind not in {
        CHECKOUT_KIND_PRO_MONTHLY,
        CHECKOUT_KIND_PRO_YEARLY,
        CHECKOUT_KIND_FREE_TRIAL,
        CHECKOUT_KIND_REFILL_500,
    }:
        return False
    payment_status = str(session_obj.get("payment_status") or "").strip().lower()
    return payment_status in {"paid", "no_payment_required"}


def _build_checkout_reconcile_row(
    *,
    event_id: str,
    event_type: str,
    event_user_id: Optional[str],
    created: Optional[int],
    session_obj: Dict[str, Any],
    billing_event_status: Optional[str],
) -> Dict[str, Any]:
    metadata_dict = session_obj.get("metadata") if isinstance(session_obj.get("metadata"), dict) else {}
    return {
        "eventId": event_id,
        "eventType": event_type,
        "eventUserId": event_user_id,
        "created": created,
        "checkoutSessionId": str(session_obj.get("id") or "").strip() or None,
        "checkoutAttemptId": _resolve_checkout_attempt_id(metadata_dict),
        "checkoutKind": str(
            (
                metadata_dict.get("checkoutKind")
                if isinstance(metadata_dict, dict)
                else ""
            )
            or ""
        ).strip()
        or None,
        "checkoutPriceId": _resolve_checkout_session_price_id(session_obj, metadata_dict=metadata_dict),
        "billingEventStatus": billing_event_status or None,
    }


def _reconcile_checkout_session_object(*, session_obj: Dict[str, Any], processing_key: str) -> str:
    existing = get_billing_event(processing_key)
    existing_status = str(existing.get("status") or "").strip().lower() if isinstance(existing, dict) else ""
    if existing_status == "processed":
        return "already_processed"

    event_type = "checkout.session.completed"
    try:
        lock_acquired = start_billing_event(processing_key, event_type)
    except BillingEventInProgressError:
        return "processing"
    if not lock_acquired:
        return "already_processed"

    try:
        _handle_checkout_session_completed(
            session_obj,
            stripe_event_id=processing_key,
            stripe_event_created=_coerce_positive_int(session_obj.get("created")),
        )
        complete_billing_event(processing_key)
        return "reconciled"
    except RetryableWebhookProcessingError:
        _release_billing_event_lock(processing_key, event_type=event_type)
        return "retryable_error"
    except Exception:
        _release_billing_event_lock(processing_key, event_type=event_type)
        logger.exception(
            "Stripe checkout session reconciliation failed.",
            extra={"checkoutProcessingKey": processing_key, "eventType": event_type},
        )
        return "failed"


def _reconcile_checkout_event(*, event_payload: Dict[str, Any]) -> str:
    event_id = str(event_payload.get("id") or "").strip()
    event_type = str(event_payload.get("type") or "").strip() or "checkout.session.completed"
    if not event_id:
        return "invalid_event"

    existing = get_billing_event(event_id)
    existing_status = str(existing.get("status") or "").strip().lower() if isinstance(existing, dict) else ""
    if existing_status == "processed":
        return "already_processed"

    try:
        lock_acquired = start_billing_event(event_id, event_type)
    except BillingEventInProgressError:
        return "processing"
    if not lock_acquired:
        return "already_processed"

    try:
        session_obj = _resolve_event_session_object(event_payload)
        _handle_checkout_session_completed(
            session_obj,
            stripe_event_id=event_id,
            stripe_event_created=_coerce_positive_int(event_payload.get("created")),
        )
        complete_billing_event(event_id)
        return "reconciled"
    except RetryableWebhookProcessingError:
        _release_billing_event_lock(event_id, event_type=event_type)
        return "retryable_error"
    except Exception:
        _release_billing_event_lock(event_id, event_type=event_type)
        logger.exception(
            "Stripe reconciliation failed.",
            extra={"stripeEventId": event_id, "eventType": event_type},
        )
        return "failed"


@router.post("/api/billing/checkout-session")
async def create_checkout(
    payload: BillingCheckoutRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Create a Stripe Checkout session for the authenticated user."""
    if not billing_enabled():
        raise HTTPException(status_code=503, detail="Stripe billing is not configured.")
    _enforce_checkout_webhook_health()

    user = _resolve_user_from_request(request, authorization)
    profile = get_user_profile(user.app_user_id)
    role = normalize_role(profile.role if profile else user.role)
    if role != ROLE_GOD:
        _enforce_billing_route_rate_limit(scope="checkout", user_id=user.app_user_id)
    checkout_kind = payload.kind
    billing_record = None
    if checkout_kind in {CHECKOUT_KIND_PRO_MONTHLY, CHECKOUT_KIND_PRO_YEARLY, CHECKOUT_KIND_FREE_TRIAL}:
        billing_record = get_user_billing_record(user.app_user_id)
        if (
            billing_record
            and billing_record.subscription_id
            and is_subscription_active(billing_record.subscription_status)
        ):
            raise HTTPException(
                status_code=409,
                detail="An active Pro subscription already exists for this user.",
            )
    if checkout_kind == CHECKOUT_KIND_FREE_TRIAL:
        if role in {ROLE_PRO, ROLE_GOD}:
            raise HTTPException(status_code=409, detail="Free trial is not available for active Pro or God users.")
        if get_trial_used(user.app_user_id):
            raise HTTPException(status_code=409, detail="Free trial has already been used.")
    if checkout_kind == CHECKOUT_KIND_REFILL_500:
        if role != ROLE_PRO:
            raise HTTPException(status_code=403, detail="Credit refill is available to Pro users only.")
        if not _is_refill_fulfillment_eligible(user.app_user_id):
            raise HTTPException(status_code=409, detail="Credit refill requires an active Pro subscription.")

    create_kwargs = {
        "user_id": user.app_user_id,
        "user_email": user.email,
        "checkout_kind": checkout_kind,
        "customer_id": billing_record.customer_id if billing_record else None,
    }
    if payload.attemptId:
        create_kwargs["checkout_attempt_id"] = payload.attemptId

    try:
        session = create_checkout_session(**create_kwargs)
    except BillingCheckoutConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except BillingConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create Stripe Checkout session.") from exc

    if checkout_kind in {CHECKOUT_KIND_PRO_MONTHLY, CHECKOUT_KIND_PRO_YEARLY, CHECKOUT_KIND_FREE_TRIAL}:
        resolved_customer_id = first_nonempty(
            [
                str(session.get("customerId") or ""),
                billing_record.customer_id if billing_record else None,
            ]
        )
        if resolved_customer_id:
            try:
                set_user_billing_subscription(
                    user.app_user_id,
                    customer_id=resolved_customer_id,
                )
            except Exception:
                logger.warning(
                    "Failed to persist Stripe customer id for checkout session.",
                    extra={"userId": user.app_user_id},
                    exc_info=True,
                )

    return {
        "success": True,
        "kind": checkout_kind,
        "sessionId": session["sessionId"],
        "checkoutUrl": session["url"],
        "attemptId": first_nonempty([str(session.get("checkoutAttemptId") or "")]),
        "checkoutPriceId": first_nonempty([str(session.get("checkoutPriceId") or "")]),
    }


@router.get("/api/billing/webhook-health")
async def get_webhook_health(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Expose current Stripe webhook health status for authenticated users."""
    user = _resolve_user_from_request(request, authorization)
    profile = get_user_profile(user.app_user_id)
    role = normalize_role(profile.role if profile else user.role)
    payload = resolve_webhook_health(force_refresh=(role == ROLE_GOD))
    if role == ROLE_GOD:
        return payload
    redacted = dict(payload)
    redacted.pop("endpointId", None)
    redacted.pop("endpointUrl", None)
    redacted.pop("expectedEndpointUrl", None)
    redacted.pop("expectedEndpointUrls", None)
    if redacted.get("healthy") is True:
        redacted["reason"] = "Stripe webhook health check passed."
    else:
        redacted["reason"] = (
            "Stripe webhook health check is failing. "
            "Ask an administrator to review billing configuration."
        )
    return redacted


@router.post("/api/billing/reconcile")
async def reconcile_recent_checkout_events(
    payload: BillingReconcileRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Audit and recover missing fulfillment for recent Stripe checkout events."""
    if not billing_enabled():
        raise HTTPException(status_code=503, detail="Stripe billing is not configured.")

    user = _resolve_user_from_request(request, authorization)
    profile = get_user_profile(user.app_user_id)
    role = normalize_role(profile.role if profile else user.role)
    can_reconcile_all_users = role == ROLE_GOD
    if not can_reconcile_all_users:
        _enforce_billing_route_rate_limit(scope="reconcile", user_id=user.app_user_id)

    if not can_reconcile_all_users:
        normalized_session_id = (payload.sessionId or "").strip()
        normalized_attempt_id = (payload.attemptId or "").strip() or None
        if not normalized_session_id:
            raise HTTPException(
                status_code=400,
                detail="sessionId is required for self reconciliation.",
            )

        try:
            session_obj = retrieve_checkout_session(session_id=normalized_session_id)
        except BillingCheckoutSessionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except BillingConfigError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail="Failed to load Stripe checkout session for reconciliation.") from exc

        event_user_id = _resolve_event_user_id(session_obj)
        if not event_user_id or event_user_id != user.app_user_id:
            raise HTTPException(status_code=404, detail="Stripe checkout session was not found.")
        metadata_dict = session_obj.get("metadata") if isinstance(session_obj.get("metadata"), dict) else {}
        session_attempt_id = _resolve_checkout_attempt_id(metadata_dict)
        if normalized_attempt_id and session_attempt_id != normalized_attempt_id:
            raise HTTPException(status_code=404, detail="Stripe checkout session was not found.")

        processing_key = _resolve_checkout_processing_key(session_obj, fallback_event_id=normalized_session_id)
        existing = get_billing_event(processing_key)
        existing_status = str(existing.get("status") or "").strip().lower() if isinstance(existing, dict) else ""
        row = _build_checkout_reconcile_row(
            event_id=processing_key,
            event_type="checkout.session.completed",
            event_user_id=event_user_id,
            created=_coerce_positive_int(session_obj.get("created")),
            session_obj=session_obj,
            billing_event_status=existing_status or None,
        )
        is_candidate = _event_is_checkout_fulfillment_candidate({"data": {"object": session_obj}})

        reconciled = 0
        already_processed = 1 if existing_status == "processed" else 0
        processing = 0
        retryable = 0
        failed = 0
        invalid = 0
        pending_reconciliation = 0
        candidate_event_count = 1 if is_candidate and existing_status != "processed" else 0

        if is_candidate and existing_status != "processed":
            pending_reconciliation = 1
            if not payload.dryRun:
                reconcile_status = _reconcile_checkout_session_object(
                    session_obj=session_obj,
                    processing_key=processing_key,
                )
                if reconcile_status == "reconciled":
                    reconciled = 1
                elif reconcile_status == "already_processed":
                    already_processed += 1
                    candidate_event_count = 0
                    pending_reconciliation = 0
                    row["billingEventStatus"] = "processed"
                elif reconcile_status == "processing":
                    processing = 1
                elif reconcile_status == "retryable_error":
                    retryable = 1
                elif reconcile_status == "failed":
                    failed = 1
                else:
                    invalid = 1

        return {
            "success": True,
            "dryRun": bool(payload.dryRun),
            "scope": "self",
            "auditedEventCount": 1,
            "candidateEventCount": candidate_event_count,
            "pendingReconciliationCount": pending_reconciliation,
            "reconciledCount": reconciled,
            "alreadyProcessedCount": already_processed,
            "processingCount": processing,
            "retryableCount": retryable,
            "failedCount": failed,
            "invalidCount": invalid,
            "skippedForUserCount": 0,
            "events": [row],
        }

    now_unix = int(time.time())
    lookback_seconds = max(3600, int(payload.lookbackHours) * 3600)
    created_gte = now_unix - lookback_seconds

    try:
        events = list_recent_checkout_completion_events(
            created_gte=created_gte,
            limit=payload.maxEvents,
        )
    except BillingConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to list Stripe checkout events for reconciliation.") from exc

    candidates: list[Dict[str, Any]] = []
    response_events: list[Dict[str, Any]] = []
    scoped_audited_event_count = 0
    already_processed = 0
    processing = 0
    reconciled = 0
    retryable = 0
    failed = 0
    invalid = 0
    pending_reconciliation = 0

    for event_payload in events:
        if not _event_is_checkout_fulfillment_candidate(event_payload):
            continue
        event_id = str(event_payload.get("id") or "").strip()
        event_type = str(event_payload.get("type") or "").strip() or "checkout.session.completed"
        if not event_id:
            if can_reconcile_all_users:
                invalid += 1
            continue
        session_obj = _resolve_event_session_object(event_payload)
        event_user_id = _resolve_event_user_id(session_obj)
        if not event_user_id:
            if can_reconcile_all_users:
                invalid += 1
            continue
        if not can_reconcile_all_users and event_user_id != user.app_user_id:
            continue

        existing = get_billing_event(event_id)
        existing_status = str(existing.get("status") or "").strip().lower() if isinstance(existing, dict) else ""
        candidate_row = _build_checkout_reconcile_row(
            event_id=event_id,
            event_type=event_type,
            event_user_id=event_user_id,
            created=_coerce_positive_int(event_payload.get("created")),
            session_obj=session_obj,
            billing_event_status=existing_status or None,
        )
        scoped_audited_event_count += 1
        response_events.append(candidate_row)
        if existing_status == "processed":
            already_processed += 1
            continue

        pending_reconciliation += 1
        candidates.append(candidate_row)
        if payload.dryRun:
            continue

        reconcile_status = _reconcile_checkout_event(event_payload=event_payload)
        if reconcile_status == "reconciled":
            reconciled += 1
        elif reconcile_status == "already_processed":
            already_processed += 1
        elif reconcile_status == "processing":
            processing += 1
        elif reconcile_status == "retryable_error":
            retryable += 1
        elif reconcile_status == "failed":
            failed += 1
        else:
            invalid += 1

    return {
        "success": True,
        "dryRun": bool(payload.dryRun),
        "scope": "all_users" if can_reconcile_all_users else "self",
        "auditedEventCount": len(events) if can_reconcile_all_users else scoped_audited_event_count,
        "candidateEventCount": len(candidates),
        "pendingReconciliationCount": pending_reconciliation,
        "reconciledCount": reconciled,
        "alreadyProcessedCount": already_processed,
        "processingCount": processing,
        "retryableCount": retryable,
        "failedCount": failed,
        "invalidCount": invalid,
        "skippedForUserCount": 0,
        "events": response_events,
    }


@router.post("/api/billing/subscription/cancel")
async def cancel_subscription(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Cancel the authenticated user's Stripe subscription at period end."""
    if not billing_enabled():
        raise HTTPException(status_code=503, detail="Stripe billing is not configured.")

    user = _resolve_user_from_request(request, authorization)
    profile = get_user_profile(user.app_user_id)
    role = normalize_role(profile.role if profile else user.role)
    if role != ROLE_GOD:
        _enforce_billing_route_rate_limit(scope="cancel", user_id=user.app_user_id)
    billing_record = get_user_billing_record(user.app_user_id)
    subscription_id = billing_record.subscription_id if billing_record else None
    if role != ROLE_PRO and not subscription_id:
        raise HTTPException(status_code=403, detail="Only Pro users can cancel a subscription.")
    if not subscription_id:
        raise HTTPException(status_code=409, detail="No active subscription was found for this user.")
    recorded_status = str(billing_record.subscription_status or "").strip().lower() if billing_record else ""
    if recorded_status in TERMINAL_SUBSCRIPTION_STATUSES:
        raise HTTPException(status_code=409, detail="Stored subscription is already inactive.")
    cancel_already_scheduled = bool(billing_record and billing_record.cancel_at_period_end is True)
    if cancel_already_scheduled and is_subscription_active(recorded_status):
        return {
            "success": True,
            "subscriptionId": subscription_id,
            "status": billing_record.subscription_status,
            "cancelAtPeriodEnd": True,
            "cancelAt": billing_record.cancel_at,
            "currentPeriodEnd": billing_record.current_period_end,
            "alreadyCanceled": True,
        }

    try:
        canceled = cancel_subscription_at_period_end(subscription_id=subscription_id)
    except BillingConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to cancel Stripe subscription.") from exc

    state_sync_deferred = False
    try:
        set_user_billing_subscription(
            user.app_user_id,
            customer_id=first_nonempty([canceled.customer_id, billing_record.customer_id if billing_record else None]),
            subscription_id=subscription_id,
            subscription_status=canceled.status,
            subscription_price_id=first_nonempty([canceled.price_id, billing_record.subscription_price_id if billing_record else None]),
            cancel_at_period_end=canceled.cancel_at_period_end,
            cancel_at=canceled.cancel_at,
            current_period_end=canceled.current_period_end,
        )
    except Exception:
        state_sync_deferred = True
        logger.warning(
            "Stripe cancellation succeeded but failed to persist billing subscription state.",
            extra={"userId": user.app_user_id, "subscriptionId": subscription_id},
            exc_info=True,
        )

    if not is_subscription_active(canceled.status):
        try:
            downgrade_to_base_membership(user.app_user_id)
            if state_sync_deferred:
                apply_user_downgrade_retention(
                    user.app_user_id,
                    eligibility_override=DowngradeRetentionEligibility(
                        should_apply=True,
                        role=ROLE_BASE,
                        has_active_subscription=False,
                    ),
                    billing_state_deferred=True,
                )
            else:
                apply_user_downgrade_retention(user.app_user_id)
        except Exception:
            state_sync_deferred = True
            logger.warning(
                "Stripe cancellation succeeded but failed to downgrade local user role.",
                extra={"userId": user.app_user_id, "subscriptionId": subscription_id},
                exc_info=True,
            )

    response: Dict[str, Any] = {
        "success": True,
        "subscriptionId": subscription_id,
        "status": canceled.status,
        "cancelAtPeriodEnd": canceled.cancel_at_period_end,
        "cancelAt": canceled.cancel_at,
        "currentPeriodEnd": canceled.current_period_end,
    }
    if state_sync_deferred:
        response["stateSyncDeferred"] = True
    return response


@router.post("/api/billing/portal-session")
async def create_portal_session(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Create a Stripe Billing Portal session for the authenticated user."""
    if not billing_enabled():
        raise HTTPException(status_code=503, detail="Stripe billing is not configured.")

    user = _resolve_user_from_request(request, authorization)
    profile = get_user_profile(user.app_user_id)
    role = normalize_role(profile.role if profile else user.role)
    if role != ROLE_GOD:
        _enforce_billing_route_rate_limit(scope="portal", user_id=user.app_user_id)
    billing_record = get_user_billing_record(user.app_user_id)
    customer_id = billing_record.customer_id if billing_record else None
    if not customer_id:
        raise HTTPException(status_code=409, detail="No Stripe customer is linked to this profile yet.")

    try:
        session = create_billing_portal_session(customer_id=customer_id)
    except BillingConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create Stripe Billing Portal session.") from exc

    return {
        "success": True,
        "url": session.url,
        "customerId": session.customer_id,
    }


@router.post("/api/billing/payment-method-recovery/sync")
async def sync_payment_method_recovery(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Copy a Portal-updated payment method onto the subscription and retry payment."""
    if not billing_enabled():
        raise HTTPException(status_code=503, detail="Stripe billing is not configured.")

    user = _resolve_user_from_request(request, authorization)
    profile = get_user_profile(user.app_user_id)
    role = normalize_role(profile.role if profile else user.role)
    if role != ROLE_GOD:
        _enforce_billing_route_rate_limit(scope="portal", user_id=user.app_user_id)

    billing_record = get_user_billing_record(user.app_user_id)
    customer_id = billing_record.customer_id if billing_record else None
    subscription_id = billing_record.subscription_id if billing_record else None
    if not customer_id or not subscription_id:
        raise HTTPException(status_code=409, detail="No recoverable Stripe subscription is linked to this profile.")

    payment_recovery = getattr(billing_record, "payment_recovery", None)
    latest_invoice_id = getattr(payment_recovery, "latest_invoice_id", None)
    try:
        recovery = sync_subscription_payment_method_for_retry(
            customer_id=customer_id,
            subscription_id=subscription_id,
            latest_invoice_id=latest_invoice_id,
        )
    except BillingPaymentRecoveryError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except BillingConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            "Failed to synchronize Stripe payment method recovery.",
            extra={"userId": user.app_user_id, "subscriptionId": subscription_id},
        )
        raise HTTPException(status_code=500, detail="Failed to synchronize Stripe payment recovery.") from exc

    if recovery.subscription_status:
        try:
            set_user_billing_subscription(
                user.app_user_id,
                customer_id=recovery.customer_id,
                subscription_id=recovery.subscription_id,
                subscription_status=recovery.subscription_status,
                subscription_price_id=billing_record.subscription_price_id if billing_record else None,
            )
        except Exception:
            logger.warning(
                "Stripe payment recovery sync succeeded but local billing status sync failed.",
                extra={"userId": user.app_user_id, "subscriptionId": subscription_id},
                exc_info=True,
            )

    if recovery.invoice_payment_succeeded and is_subscription_active(recovery.subscription_status):
        activate_pro_membership(
            user.app_user_id,
            stripe_event_id=f"payment_method_recovery:{recovery.latest_invoice_id or recovery.subscription_id}",
            reset_monthly_credits=False,
        )
        clear_user_billing_payment_recovery(user.app_user_id)
        restore_user_downgrade_managed_links(user.app_user_id)

    return {
        "success": True,
        "customerId": recovery.customer_id,
        "subscriptionId": recovery.subscription_id,
        "paymentMethodField": recovery.payment_method_field,
        "subscriptionPaymentMethodUpdated": recovery.subscription_updated,
        "latestInvoiceId": recovery.latest_invoice_id,
        "invoicePaymentAttempted": recovery.invoice_payment_attempted,
        "invoicePaymentSucceeded": recovery.invoice_payment_succeeded,
        "invoiceStatus": recovery.invoice_status,
        "invoicePaymentError": recovery.invoice_payment_error,
        "subscriptionStatus": recovery.subscription_status,
    }


@router.post("/api/billing/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(default=None, alias="Stripe-Signature"),
) -> Dict[str, Any]:
    """Handle Stripe webhooks for subscription lifecycle and refill fulfillment."""
    raw_payload = await request.body()
    try:
        event = construct_webhook_event(payload=raw_payload, signature=(stripe_signature or ""))
    except BillingConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook payload.") from exc

    event_id = str(event.get("id") or "").strip()
    event_type = str(event.get("type") or "").strip()
    if not event_id or not event_type:
        raise HTTPException(status_code=400, detail="Stripe event id/type is required.")
    logger.info(
        "Received Stripe webhook event.",
        extra={"stripeEventId": event_id, "eventType": event_type},
    )

    try:
        lock_acquired = start_billing_event(event_id, event_type)
    except BillingEventInProgressError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not lock_acquired:
        logger.info(
            "Stripe webhook event already processed; returning duplicate acknowledgment.",
            extra={"stripeEventId": event_id, "eventType": event_type},
        )
        return {"received": True, "duplicate": True}

    try:
        data = event.get("data") if isinstance(event, dict) else None
        event_object = data.get("object") if isinstance(data, dict) else {}
        payload_object = event_object if isinstance(event_object, dict) else {}

        if event_type == "checkout.session.completed":
            _handle_checkout_session_completed(
                payload_object,
                stripe_event_id=event_id,
                stripe_event_created=_coerce_positive_int(event.get("created")),
            )
        elif event_type == "invoice.paid":
            _handle_invoice_paid(
                payload_object,
                stripe_event_id=event_id,
                stripe_event_created=_coerce_positive_int(event.get("created")),
            )
        elif event_type == "invoice.payment_failed":
            _handle_invoice_payment_failed(
                payload_object,
                stripe_event_id=event_id,
                stripe_event_created=_coerce_positive_int(event.get("created")),
            )
        elif event_type == "invoice.updated":
            _handle_invoice_updated(
                payload_object,
                stripe_event_id=event_id,
                stripe_event_created=_coerce_positive_int(event.get("created")),
            )
        elif event_type in {"customer.subscription.updated", "customer.subscription.deleted"}:
            _handle_subscription_lifecycle(
                payload_object,
                stripe_event_id=event_id,
                stripe_event_created=_coerce_positive_int(event.get("created")),
            )
        else:
            logger.warning(
                "Received unsupported Stripe webhook event type; no action taken.",
                extra={"stripeEventId": event_id, "eventType": event_type},
            )
        complete_billing_event(event_id)
        logger.info(
            "Completed Stripe webhook event processing.",
            extra={"stripeEventId": event_id, "eventType": event_type},
        )
    except RetryableWebhookProcessingError as exc:
        _release_billing_event_lock(event_id, event_type=event_type)
        logger.warning(
            "Stripe webhook processing deferred for retry.",
            extra={"stripeEventId": event_id, "eventType": event_type},
            exc_info=True,
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        _release_billing_event_lock(event_id, event_type=event_type)
        logger.error(
            "Stripe webhook processing failed.",
            extra={"stripeEventId": event_id, "eventType": event_type},
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Failed to process Stripe webhook.") from exc

    return {"received": True}
