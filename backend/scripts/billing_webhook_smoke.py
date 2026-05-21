"""Run signed webhook smoke tests against a live billing endpoint.

This script targets a running backend (typically local dev) and validates:
1) signature enforcement (valid/invalid/expired),
2) duplicate event short-circuit behavior,
3) card outcome event acceptance for checkout session completion,
4) invoice payment-failure event acceptance,
5) subscription cancellation lifecycle event acceptance.

It does not require Stripe CLI; signatures are generated with the configured
`STRIPE_WEBHOOK_SECRET`.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib.parse import urlsplit

import httpx


STRIPE_TEST_CARD_SUCCESS = "4242 4242 4242 4242"
STRIPE_TEST_CARD_3DS_REQUIRED = "4000 0025 0000 3155"
STRIPE_TEST_CARD_DECLINED = "4000 0000 0000 0002"
STRIPE_TEST_CARD_INSUFFICIENT_FUNDS = "4000 0000 0000 9995"


@dataclass(frozen=True)
class CaseResult:
    name: str
    passed: bool
    detail: str


def _is_local_smoke_base_url(base_url: str) -> bool:
    """Return True for loopback-only smoke targets."""
    try:
        parsed = urlsplit(base_url)
    except Exception:
        return False
    hostname = (parsed.hostname or "").strip().lower()
    return hostname in {"localhost", "127.0.0.1", "0.0.0.0", "::1"} or hostname.endswith(".localhost")


def _json_bytes(payload: Dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _sign_payload(payload: bytes, *, secret: str, timestamp: Optional[int] = None) -> str:
    signed_timestamp = int(timestamp or time.time())
    signed_payload = f"{signed_timestamp}.".encode("utf-8") + payload
    digest = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return f"t={signed_timestamp},v1={digest}"


def _post_webhook(
    *,
    client: httpx.Client,
    endpoint: str,
    event_payload: Dict[str, Any],
    webhook_secret: str,
    signature_secret_override: Optional[str] = None,
    timestamp: Optional[int] = None,
) -> httpx.Response:
    payload_bytes = _json_bytes(event_payload)
    signature_secret = signature_secret_override if signature_secret_override is not None else webhook_secret
    signature = _sign_payload(payload_bytes, secret=signature_secret, timestamp=timestamp)
    headers = {"Stripe-Signature": signature, "Content-Type": "application/json"}
    return client.post(endpoint, content=payload_bytes, headers=headers)


def _checkout_event(
    *,
    event_id: str,
    checkout_kind: str,
    payment_status: str,
    card_number: str,
    user_id: str = "billing-smoke-user",
) -> Dict[str, Any]:
    return {
        "id": event_id,
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": user_id,
                "metadata": {
                    "userId": user_id,
                    "checkoutKind": checkout_kind,
                    # Included for traceability in smoke logs.
                    "stripeTestCardNumber": card_number,
                },
                "payment_status": payment_status,
                "subscription": "sub_smoke_123",
                "customer": "cus_smoke_123",
            }
        },
    }


def _subscription_event(
    *,
    event_id: str,
    event_type: str,
    status: str,
    user_id: str = "billing-smoke-user",
) -> Dict[str, Any]:
    return {
        "id": event_id,
        "type": event_type,
        "data": {
            "object": {
                "id": "sub_smoke_123",
                "customer": "cus_smoke_123",
                "status": status,
                "cancel_at_period_end": event_type == "customer.subscription.updated",
                "metadata": {"userId": user_id},
                "items": {"data": [{"price": {"id": "price_smoke"}}]},
            }
        },
    }


def _invoice_payment_failed_event(
    *,
    event_id: str,
    user_id: str = "billing-smoke-user",
) -> Dict[str, Any]:
    return {
        "id": event_id,
        "type": "invoice.payment_failed",
        "created": int(time.time()),
        "data": {
            "object": {
                "id": f"in_{event_id}",
                "subscription": None,
                "customer": "cus_smoke_123",
                "status": "open",
                "created": int(time.time()),
                "next_payment_attempt": int(time.time()) + 86400,
                "parent": {
                    "type": "subscription_details",
                    "subscription_details": {
                        "subscription": "sub_smoke_123",
                        "metadata": {"userId": user_id},
                    },
                },
                "lines": {
                    "data": [
                        {
                            "pricing": {
                                "type": "price_details",
                                "price_details": {"price": "price_smoke"},
                            },
                        },
                    ],
                },
            }
        },
    }


def _invoice_updated_event(
    *,
    event_id: str,
    user_id: str = "billing-smoke-user",
) -> Dict[str, Any]:
    return {
        "id": event_id,
        "type": "invoice.updated",
        "created": int(time.time()),
        "data": {
            "object": {
                "id": f"in_{event_id}",
                "subscription": None,
                "customer": "cus_smoke_123",
                "status": "open",
                "next_payment_attempt": int(time.time()) + 86400,
                "parent": {
                    "type": "subscription_details",
                    "subscription_details": {
                        "subscription": "sub_smoke_123",
                        "metadata": {"userId": user_id},
                    },
                },
            }
        },
    }


def _assert_json_flag(response: httpx.Response, *, key: str, expected: bool) -> tuple[bool, str]:
    try:
        payload = response.json()
    except Exception as exc:  # pragma: no cover - defensive
        return False, f"Non-JSON response: {exc}"
    actual = bool(payload.get(key))
    if actual != expected:
        return False, f"Expected JSON {key}={expected}, got payload={payload}"
    return True, f"status={response.status_code}, payload={payload}"


def run_smoke(
    *,
    base_url: str,
    webhook_path: str,
    webhook_secret: str,
    timeout_seconds: float,
) -> list[CaseResult]:
    endpoint = f"{base_url.rstrip('/')}{webhook_path}"
    results: list[CaseResult] = []
    run_id = str(int(time.time() * 1000))

    with httpx.Client(timeout=timeout_seconds) as client:
        # Security: valid payload with invalid signature should be rejected.
        bad_sig_event = _checkout_event(
            event_id=f"evt_smoke_bad_sig_{run_id}",
            checkout_kind="refill_500",
            payment_status="paid",
            card_number=STRIPE_TEST_CARD_SUCCESS,
        )
        bad_sig_response = _post_webhook(
            client=client,
            endpoint=endpoint,
            event_payload=bad_sig_event,
            webhook_secret=webhook_secret,
            signature_secret_override=f"{webhook_secret}_wrong",
        )
        results.append(
            CaseResult(
                name="reject_invalid_signature",
                passed=bad_sig_response.status_code == 400,
                detail=f"status={bad_sig_response.status_code}",
            )
        )

        # Security: valid signature but stale timestamp should be rejected by Stripe tolerance.
        stale_event = _checkout_event(
            event_id=f"evt_smoke_stale_{run_id}",
            checkout_kind="refill_500",
            payment_status="paid",
            card_number=STRIPE_TEST_CARD_SUCCESS,
        )
        stale_response = _post_webhook(
            client=client,
            endpoint=endpoint,
            event_payload=stale_event,
            webhook_secret=webhook_secret,
            timestamp=int(time.time()) - 1000,
        )
        results.append(
            CaseResult(
                name="reject_stale_signature_timestamp",
                passed=stale_response.status_code == 400,
                detail=f"status={stale_response.status_code}",
            )
        )

        # Input validation: event id/type are required.
        missing_fields_event = {
            "id": "",
            "type": "checkout.session.completed",
            "data": {"object": {"metadata": {"checkoutKind": "refill_500"}}},
        }
        missing_fields_response = _post_webhook(
            client=client,
            endpoint=endpoint,
            event_payload=missing_fields_event,
            webhook_secret=webhook_secret,
        )
        results.append(
            CaseResult(
                name="reject_missing_event_id_or_type",
                passed=missing_fields_response.status_code == 400,
                detail=f"status={missing_fields_response.status_code}",
            )
        )

        # Idempotency: first call succeeds, second returns duplicate.
        duplicate_event_id = f"evt_smoke_duplicate_{run_id}"
        duplicate_event = _checkout_event(
            event_id=duplicate_event_id,
            checkout_kind="refill_500",
            payment_status="unpaid",
            card_number=STRIPE_TEST_CARD_DECLINED,
        )
        first_duplicate_response = _post_webhook(
            client=client,
            endpoint=endpoint,
            event_payload=duplicate_event,
            webhook_secret=webhook_secret,
        )
        second_duplicate_response = _post_webhook(
            client=client,
            endpoint=endpoint,
            event_payload=duplicate_event,
            webhook_secret=webhook_secret,
        )
        first_ok = first_duplicate_response.status_code == 200
        duplicate_ok, duplicate_detail = _assert_json_flag(
            second_duplicate_response,
            key="duplicate",
            expected=True,
        )
        results.append(
            CaseResult(
                name="duplicate_event_short_circuit",
                passed=first_ok and duplicate_ok,
                detail=f"first_status={first_duplicate_response.status_code}; {duplicate_detail}",
            )
        )

        # Card outcome matrix for pro/refill checkout session completion.
        card_scenarios = [
            (STRIPE_TEST_CARD_SUCCESS, "paid"),
            (STRIPE_TEST_CARD_3DS_REQUIRED, "unpaid"),
            (STRIPE_TEST_CARD_DECLINED, "unpaid"),
            (STRIPE_TEST_CARD_INSUFFICIENT_FUNDS, "unpaid"),
        ]
        for card_number, payment_status in card_scenarios:
            for checkout_kind in ("pro_monthly", "refill_500"):
                event_id = f"evt_smoke_{checkout_kind}_{card_number[-4:]}_{run_id}"
                response = _post_webhook(
                    client=client,
                    endpoint=endpoint,
                    event_payload=_checkout_event(
                        event_id=event_id,
                        checkout_kind=checkout_kind,
                        payment_status=payment_status,
                        card_number=card_number,
                    ),
                    webhook_secret=webhook_secret,
                )
                case_name = f"{checkout_kind}_{card_number[-4:]}_{payment_status}"
                ok, detail = _assert_json_flag(response, key="received", expected=True)
                results.append(CaseResult(name=case_name, passed=ok, detail=detail))

        failed_invoice_response = _post_webhook(
            client=client,
            endpoint=endpoint,
            event_payload=_invoice_payment_failed_event(event_id=f"evt_smoke_invoice_failed_{run_id}"),
            webhook_secret=webhook_secret,
        )
        ok, detail = _assert_json_flag(failed_invoice_response, key="received", expected=True)
        results.append(CaseResult(name="invoice_payment_failed_acceptance", passed=ok, detail=detail))

        invoice_updated_response = _post_webhook(
            client=client,
            endpoint=endpoint,
            event_payload=_invoice_updated_event(event_id=f"evt_smoke_invoice_updated_{run_id}"),
            webhook_secret=webhook_secret,
        )
        ok, detail = _assert_json_flag(invoice_updated_response, key="received", expected=True)
        results.append(CaseResult(name="invoice_updated_acceptance", passed=ok, detail=detail))

        # Cancellation lifecycle webhook acceptance.
        for event_type, status in (
            ("customer.subscription.updated", "active"),
            ("customer.subscription.deleted", "canceled"),
        ):
            event_id = f"evt_smoke_{event_type.split('.')[-1]}_{run_id}"
            lifecycle_response = _post_webhook(
                client=client,
                endpoint=endpoint,
                event_payload=_subscription_event(
                    event_id=event_id,
                    event_type=event_type,
                    status=status,
                ),
                webhook_secret=webhook_secret,
            )
            ok, detail = _assert_json_flag(lifecycle_response, key="received", expected=True)
            results.append(CaseResult(name=f"lifecycle_{event_type}", passed=ok, detail=detail))

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Signed Stripe webhook smoke tests for billing endpoint")
    parser.add_argument("--base-url", default="http://localhost:8000", help="Backend base URL")
    parser.add_argument("--webhook-path", default="/api/billing/webhook", help="Webhook path")
    parser.add_argument("--webhook-secret", default=os.getenv("STRIPE_WEBHOOK_SECRET", ""), help="Stripe webhook signing secret")
    parser.add_argument("--timeout-seconds", type=float, default=15.0, help="Request timeout")
    parser.add_argument(
        "--allow-non-local",
        action="store_true",
        help="Allow signed smoke events against a non-local endpoint.",
    )
    args = parser.parse_args()

    webhook_secret = (args.webhook_secret or "").strip()
    if not webhook_secret:
        print("Missing webhook secret. Provide --webhook-secret or STRIPE_WEBHOOK_SECRET in env.")
        return 2
    if not args.allow_non_local and not _is_local_smoke_base_url(args.base_url):
        print(
            "Refusing to send signed Stripe smoke events to a non-local endpoint. "
            "Use --allow-non-local only for an isolated staging backend."
        )
        return 2

    results = run_smoke(
        base_url=args.base_url,
        webhook_path=args.webhook_path,
        webhook_secret=webhook_secret,
        timeout_seconds=args.timeout_seconds,
    )

    failures = [result for result in results if not result.passed]
    for result in results:
        status = "PASS" if result.passed else "FAIL"
        print(f"[{status}] {result.name}: {result.detail}")

    if failures:
        print(f"\nBilling webhook smoke failed: {len(failures)} of {len(results)} cases failed.")
        return 1

    print(f"\nBilling webhook smoke passed: {len(results)} cases.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
