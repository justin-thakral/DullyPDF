"""Shared helpers for Stripe webhook integration tests."""

from __future__ import annotations

import hashlib
import hmac
import json
import time

import pytest

import backend.services.billing_service as billing_service


def encode_event(event: dict) -> bytes:
    return json.dumps(event, separators=(",", ":"), sort_keys=True).encode("utf-8")


def sign_stripe_payload(payload: bytes, *, secret: str, timestamp: int | None = None) -> str:
    signed_timestamp = int(timestamp or time.time())
    signed_payload = f"{signed_timestamp}.".encode("utf-8") + payload
    digest = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return f"t={signed_timestamp},v1={digest}"


def install_fake_stripe_module(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeWebhook:
        @staticmethod
        def construct_event(payload: bytes, signature: str, secret: str):
            try:
                parts = dict(item.split("=", 1) for item in signature.split(","))
                timestamp = int(parts["t"])
                provided_digest = parts["v1"]
            except Exception as exc:  # pragma: no cover - defensive parsing path
                raise ValueError("Malformed Stripe-Signature header.") from exc

            signed_payload = f"{timestamp}.".encode("utf-8") + payload
            expected_digest = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected_digest, provided_digest):
                raise ValueError("Webhook signature verification failed.")
            if abs(int(time.time()) - timestamp) > 300:
                raise ValueError("Webhook signature timestamp is outside the tolerance zone.")
            return json.loads(payload.decode("utf-8"))

    class _FakeStripe:
        api_key = None
        Webhook = _FakeWebhook

    monkeypatch.setattr(billing_service, "_load_stripe_module", lambda: _FakeStripe)
