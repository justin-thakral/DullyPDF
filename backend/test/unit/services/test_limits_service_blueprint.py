"""Unit tests for ``backend.services.limits_service`` Phase 5 additions.

Covers the bumped per-request page limits (free 25 → 50, premium 250 → 500,
god 1000 → 2000) and the new ``check_group_fill_quota`` precheck helper that
gates group API Fill requests against monthly + per-request limits.
"""

from __future__ import annotations

import pytest

from backend.services import limits_service


# ---------------------------------------------------------------------------
# Phase 5: bumped per-request page limits
# ---------------------------------------------------------------------------


def test_resolve_template_api_max_pages_free_tier_is_50(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SANDBOX_TEMPLATE_API_MAX_PAGES_BASE", raising=False)
    assert limits_service.resolve_template_api_max_pages("base") == 50


def test_resolve_template_api_max_pages_premium_tier_is_500(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SANDBOX_TEMPLATE_API_MAX_PAGES_PRO", raising=False)
    assert limits_service.resolve_template_api_max_pages("pro") == 500


def test_resolve_template_api_max_pages_god_tier_is_2000(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SANDBOX_TEMPLATE_API_MAX_PAGES_GOD", raising=False)
    assert limits_service.resolve_template_api_max_pages("god") == 2000


def test_resolve_template_api_max_pages_respects_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    """An env override still wins over the new default."""

    monkeypatch.setenv("SANDBOX_TEMPLATE_API_MAX_PAGES_BASE", "30")
    assert limits_service.resolve_template_api_max_pages("base") == 30


# ---------------------------------------------------------------------------
# Phase 5: check_group_fill_quota
# ---------------------------------------------------------------------------


def test_check_group_fill_quota_allows_within_budget() -> None:
    result = limits_service.check_group_fill_quota(
        monthly_limit=250,
        current_request_count=10,
        pdf_count=7,
        page_count_per_request=32,
        max_pages_per_request=50,
    )
    assert result["allowed"] is True
    assert result["fillsRemaining"] == 240
    assert result["pdfCount"] == 7
    assert result["monthlyLimit"] == 250
    assert result["maxPagesPerRequest"] == 50
    assert result["pageCountPerRequest"] == 32
    assert result["reason"] is None


def test_check_group_fill_quota_blocks_when_increment_would_exceed_monthly() -> None:
    result = limits_service.check_group_fill_quota(
        monthly_limit=250,
        current_request_count=247,
        pdf_count=7,
        page_count_per_request=32,
        max_pages_per_request=50,
    )
    assert result["allowed"] is False
    assert result["reason"] == "fills_exhausted"
    assert result["fillsRemaining"] == 3


def test_check_group_fill_quota_blocks_when_pages_exceed_per_request_cap() -> None:
    result = limits_service.check_group_fill_quota(
        monthly_limit=250,
        current_request_count=10,
        pdf_count=7,
        page_count_per_request=80,
        max_pages_per_request=50,
    )
    assert result["allowed"] is False
    assert result["reason"] == "pages_per_request"
    assert result["pageCountPerRequest"] == 80


def test_check_group_fill_quota_pages_check_takes_precedence_over_quota() -> None:
    """Both checks fail simultaneously — the per-request page cap is reported first
    so users fix the structural issue (group is too big) before the quota issue."""

    result = limits_service.check_group_fill_quota(
        monthly_limit=250,
        current_request_count=247,  # would exhaust
        pdf_count=7,
        page_count_per_request=200,  # also exceeds 50 cap
        max_pages_per_request=50,
    )
    assert result["allowed"] is False
    assert result["reason"] == "pages_per_request"


def test_check_group_fill_quota_handles_exactly_at_limit() -> None:
    """An exact-fit fill is allowed (243 + 7 == 250)."""

    result = limits_service.check_group_fill_quota(
        monthly_limit=250,
        current_request_count=243,
        pdf_count=7,
        page_count_per_request=10,
        max_pages_per_request=50,
    )
    assert result["allowed"] is True
    assert result["fillsRemaining"] == 7


def test_check_group_fill_quota_normalizes_negative_inputs() -> None:
    """Defensive: negative current count clamps to 0; pdf_count under 1 clamps to 1."""

    result = limits_service.check_group_fill_quota(
        monthly_limit=250,
        current_request_count=-5,
        pdf_count=0,
        page_count_per_request=-3,
        max_pages_per_request=50,
    )
    assert result["allowed"] is True
    assert result["pdfCount"] == 1
    assert result["fillsRemaining"] == 250
    assert result["pageCountPerRequest"] == 0


def test_check_group_fill_quota_zero_monthly_limit_blocks_everything() -> None:
    """A free user with monthly_limit=0 (e.g., suspended) cannot fill anything."""

    result = limits_service.check_group_fill_quota(
        monthly_limit=0,
        current_request_count=0,
        pdf_count=1,
        page_count_per_request=1,
        max_pages_per_request=50,
    )
    assert result["allowed"] is False
    assert result["reason"] == "fills_exhausted"
    assert result["fillsRemaining"] == 0


def test_check_group_fill_quota_template_fill_uses_default_pdf_count_one() -> None:
    """Single-template fills pre-validate as pdf_count=1 (the default)."""

    result = limits_service.check_group_fill_quota(
        monthly_limit=250,
        current_request_count=10,
        pdf_count=1,
        page_count_per_request=4,
        max_pages_per_request=50,
    )
    assert result["allowed"] is True
    assert result["pdfCount"] == 1
