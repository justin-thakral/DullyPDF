"""Unit tests for ``resolve_structured_fill_monthly_limit`` defaults.

Phase 1 of the Search & Fill crediting plan introduces a separate monthly quota
for row-driven structured data fills. The defaults are 50 free / 10,000 premium
/ 100,000 god, each overridable via ``SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_*``.
"""

from __future__ import annotations

import pytest

from backend.services import limits_service


def test_structured_fill_free_tier_default_is_50(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_BASE", raising=False)
    assert limits_service.resolve_structured_fill_monthly_limit("base") == 50


def test_structured_fill_premium_tier_default_is_10000(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_PRO", raising=False)
    assert limits_service.resolve_structured_fill_monthly_limit("pro") == 10_000


def test_structured_fill_god_tier_default_is_100000(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_GOD", raising=False)
    assert limits_service.resolve_structured_fill_monthly_limit("god") == 100_000


def test_structured_fill_limit_respects_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_BASE", "7")
    assert limits_service.resolve_structured_fill_monthly_limit("base") == 7


def test_resolve_role_limits_includes_structured_fill_monthly_max(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_BASE", raising=False)
    limits = limits_service.resolve_role_limits("base")
    assert limits["structuredFillMonthlyMax"] == 50
