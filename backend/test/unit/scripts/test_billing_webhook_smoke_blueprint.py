"""Regression checks for the signed Stripe webhook smoke helper."""

from __future__ import annotations

import sys

from backend.scripts import billing_webhook_smoke as smoke


def test_billing_webhook_smoke_identifies_loopback_urls() -> None:
    assert smoke._is_local_smoke_base_url("http://localhost:8000") is True
    assert smoke._is_local_smoke_base_url("http://127.0.0.1:8000") is True
    assert smoke._is_local_smoke_base_url("http://app.localhost:5173") is True
    assert smoke._is_local_smoke_base_url("https://dullypdf.com") is False
    assert smoke._is_local_smoke_base_url("https://dullypdf-dev.web.app") is False


def test_billing_webhook_smoke_refuses_non_local_endpoint_without_override(
    monkeypatch,
    capsys,
) -> None:
    calls: list[dict] = []
    monkeypatch.setattr(smoke, "run_smoke", lambda **kwargs: calls.append(kwargs) or [])
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "billing_webhook_smoke",
            "--base-url",
            "https://dullypdf.com",
            "--webhook-secret",
            "whsec_test",
        ],
    )

    exit_code = smoke.main()

    assert exit_code == 2
    assert "Refusing to send signed Stripe smoke events" in capsys.readouterr().out
    assert calls == []


def test_billing_webhook_smoke_allows_non_local_endpoint_with_explicit_override(
    monkeypatch,
) -> None:
    calls: list[dict] = []
    monkeypatch.setattr(
        smoke,
        "run_smoke",
        lambda **kwargs: calls.append(kwargs) or [],
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "billing_webhook_smoke",
            "--base-url",
            "https://staging.example.com",
            "--webhook-secret",
            "whsec_test",
            "--allow-non-local",
        ],
    )

    exit_code = smoke.main()

    assert exit_code == 0
    assert calls[0]["base_url"] == "https://staging.example.com"
