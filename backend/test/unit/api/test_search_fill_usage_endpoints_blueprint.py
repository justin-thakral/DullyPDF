"""Endpoint tests for ``/api/search-fill/precheck`` and ``/api/search-fill/usage``."""

from __future__ import annotations

from backend.firebaseDB.structured_fill_database import (
    STATUS_COMMITTED,
    STATUS_REJECTED_NO_MATCH,
    STATUS_REPLAYED,
    StructuredFillCommitResult,
    StructuredFillInvalidRequestError,
    StructuredFillMonthlyLimitExceededError,
)


def _patch_auth(mocker, app_main, user) -> None:
    mocker.patch.object(app_main, "_verify_token", return_value={"uid": user.app_user_id})
    mocker.patch.object(app_main, "ensure_user", return_value=user)


def _base_payload(**overrides) -> dict:
    payload = {
        "requestId": "req-1",
        "sourceCategory": "structured_data",
        "sourceKind": "csv",
        "scopeType": "template",
        "templateId": "tpl-1",
        "targetTemplateIds": ["tpl-1"],
        "matchedTemplateIds": ["tpl-1"],
        "countIncrement": 1,
        "matchCount": 1,
        "recordLabelPreview": "Justin Thakral",
        "recordFingerprint": "fp-abc",
        "dataSourceLabel": "customers.csv",
    }
    payload.update(overrides)
    return payload


def test_precheck_reports_remaining_monthly_budget(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(
        app_main,
        "evaluate_structured_fill_precheck",
        return_value={
            "allowed": True,
            "monthlyLimit": 50,
            "currentMonthUsage": 3,
            "fillsRemaining": 47,
            "monthKey": "2026-04",
            "sourceKind": "csv",
            "sourceCategory": "structured_data",
            "pdfCount": 1,
        },
    )

    response = client.get(
        "/api/search-fill/precheck",
        headers=auth_headers,
        params={"pdfCount": 1, "sourceKind": "csv"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["allowed"] is True
    assert payload["monthlyLimit"] == 50
    assert payload["fillsRemaining"] == 47
    assert payload["monthKey"] == "2026-04"


def test_precheck_returns_400_for_invalid_source_kind(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(
        app_main,
        "evaluate_structured_fill_precheck",
        side_effect=StructuredFillInvalidRequestError("sourceKind must be one of ['csv', ...]"),
    )

    response = client.get(
        "/api/search-fill/precheck",
        headers=auth_headers,
        params={"pdfCount": 1, "sourceKind": "yaml"},
    )
    assert response.status_code == 400


def test_commit_returns_committed_event_metadata(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(
        app_main,
        "resolve_structured_fill_monthly_limit_for_user",
        return_value=50,
    )
    mocker.patch.object(
        app_main,
        "commit_structured_fill_usage",
        return_value=StructuredFillCommitResult(
            status=STATUS_COMMITTED,
            event_id="sfe_test_1",
            request_id="req-1",
            month_key="2026-04",
            count_increment=1,
            current_month_usage=1,
            fills_remaining=49,
            monthly_limit=50,
        ),
    )

    response = client.post(
        "/api/search-fill/usage",
        headers=auth_headers,
        json=_base_payload(),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == STATUS_COMMITTED
    assert body["eventId"] == "sfe_test_1"
    assert body["countIncrement"] == 1
    assert body["currentMonthUsage"] == 1
    assert body["fillsRemaining"] == 49
    assert body["monthlyLimit"] == 50


def test_commit_replay_returns_original_event(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "resolve_structured_fill_monthly_limit_for_user", return_value=50)
    mocker.patch.object(
        app_main,
        "commit_structured_fill_usage",
        return_value=StructuredFillCommitResult(
            status=STATUS_REPLAYED,
            event_id="sfe_original",
            request_id="req-1",
            month_key="2026-04",
            count_increment=1,
            current_month_usage=1,
            fills_remaining=49,
            monthly_limit=50,
        ),
    )

    response = client.post("/api/search-fill/usage", headers=auth_headers, json=_base_payload())
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == STATUS_REPLAYED
    assert body["eventId"] == "sfe_original"


def test_commit_no_match_returns_200_with_rejected_no_match_status(
    client, app_main, base_user, mocker, auth_headers
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "resolve_structured_fill_monthly_limit_for_user", return_value=50)
    mocker.patch.object(
        app_main,
        "commit_structured_fill_usage",
        return_value=StructuredFillCommitResult(
            status=STATUS_REJECTED_NO_MATCH,
            event_id="sfe_no_match",
            request_id="req-1",
            month_key="2026-04",
            count_increment=0,
            current_month_usage=0,
            fills_remaining=50,
            monthly_limit=50,
        ),
    )

    response = client.post(
        "/api/search-fill/usage",
        headers=auth_headers,
        json=_base_payload(matchedTemplateIds=[], countIncrement=0, matchCount=0),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == STATUS_REJECTED_NO_MATCH
    assert body["countIncrement"] == 0


def test_commit_returns_429_when_monthly_limit_exceeded(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "resolve_structured_fill_monthly_limit_for_user", return_value=50)
    mocker.patch.object(
        app_main,
        "commit_structured_fill_usage",
        side_effect=StructuredFillMonthlyLimitExceededError("Monthly Search & Fill credit limit reached."),
    )

    response = client.post("/api/search-fill/usage", headers=auth_headers, json=_base_payload())
    assert response.status_code == 429
    assert "Search & Fill" in response.json()["detail"]


def test_commit_returns_400_for_invalid_payload(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "resolve_structured_fill_monthly_limit_for_user", return_value=50)
    mocker.patch.object(
        app_main,
        "commit_structured_fill_usage",
        side_effect=StructuredFillInvalidRequestError("countIncrement cannot exceed matched templates"),
    )

    response = client.post(
        "/api/search-fill/usage",
        headers=auth_headers,
        json=_base_payload(countIncrement=5, matchedTemplateIds=["tpl-1"]),
    )
    assert response.status_code == 400
