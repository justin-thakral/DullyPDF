"""Unit tests for free_trial checkout kind guards."""

from __future__ import annotations

import pytest

from backend.firebaseDB.user_database import UserBillingRecord, UserProfileRecord


@pytest.fixture(autouse=True)
def _allow_billing_rate_limit(mocker, app_main):
    return mocker.patch.object(app_main, "check_rate_limit", return_value=True)


def _patch_auth(mocker, app_main, user) -> None:
    mocker.patch.object(app_main, "_verify_token", return_value={"uid": user.app_user_id})
    mocker.patch.object(app_main, "ensure_user", return_value=user)


def test_free_trial_rejected_for_pro_user(
    client, app_main, base_user, mocker, auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "billing_enabled", return_value=True)
    mocker.patch.object(
        app_main, "get_user_profile",
        return_value=UserProfileRecord(
            uid=base_user.app_user_id, email=base_user.email,
            display_name=base_user.display_name, role="pro",
            openai_credits_remaining=500,
        ),
    )
    mocker.patch.object(app_main, "get_user_billing_record", return_value=None)
    checkout_mock = mocker.patch.object(app_main, "create_checkout_session")

    response = client.post(
        "/api/billing/checkout-session",
        json={"kind": "free_trial"},
        headers=auth_headers,
    )

    assert response.status_code == 409
    assert "not available" in response.text
    checkout_mock.assert_not_called()


def test_free_trial_rejected_when_already_used(
    client, app_main, base_user, mocker, auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "billing_enabled", return_value=True)
    mocker.patch.object(
        app_main, "get_user_profile",
        return_value=UserProfileRecord(
            uid=base_user.app_user_id, email=base_user.email,
            display_name=base_user.display_name, role="base",
            openai_credits_remaining=10,
        ),
    )
    mocker.patch.object(app_main, "get_user_billing_record", return_value=None)
    mocker.patch.object(app_main, "get_trial_used", return_value=True)
    checkout_mock = mocker.patch.object(app_main, "create_checkout_session")

    response = client.post(
        "/api/billing/checkout-session",
        json={"kind": "free_trial"},
        headers=auth_headers,
    )

    assert response.status_code == 409
    assert "already been used" in response.text
    checkout_mock.assert_not_called()


def test_free_trial_rejected_with_active_subscription(
    client, app_main, base_user, mocker, auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "billing_enabled", return_value=True)
    mocker.patch.object(
        app_main, "get_user_profile",
        return_value=UserProfileRecord(
            uid=base_user.app_user_id, email=base_user.email,
            display_name=base_user.display_name, role="base",
            openai_credits_remaining=10,
        ),
    )
    mocker.patch.object(
        app_main, "get_user_billing_record",
        return_value=UserBillingRecord(
            uid=base_user.app_user_id, customer_id="cus_1",
            subscription_id="sub_1", subscription_status="active",
            subscription_price_id="price_pro_monthly",
        ),
    )
    checkout_mock = mocker.patch.object(app_main, "create_checkout_session")

    response = client.post(
        "/api/billing/checkout-session",
        json={"kind": "free_trial"},
        headers=auth_headers,
    )

    assert response.status_code == 409
    checkout_mock.assert_not_called()


def test_free_trial_succeeds_for_eligible_base_user(
    client, app_main, base_user, mocker, auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "billing_enabled", return_value=True)
    mocker.patch.object(
        app_main, "get_user_profile",
        return_value=UserProfileRecord(
            uid=base_user.app_user_id, email=base_user.email,
            display_name=base_user.display_name, role="base",
            openai_credits_remaining=10,
        ),
    )
    mocker.patch.object(app_main, "get_user_billing_record", return_value=None)
    mocker.patch.object(app_main, "get_trial_used", return_value=False)
    mark_mock = mocker.patch.object(app_main, "mark_trial_used")
    mocker.patch.object(
        app_main, "create_checkout_session",
        return_value={"sessionId": "cs_trial", "url": "https://checkout/trial"},
    )

    response = client.post(
        "/api/billing/checkout-session",
        json={"kind": "free_trial"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["kind"] == "free_trial"
    assert data["sessionId"] == "cs_trial"
    mark_mock.assert_called_once_with(base_user.app_user_id)


def test_free_trial_kind_passes_schema_validation() -> None:
    from backend.api.schemas.models import BillingCheckoutRequest
    req = BillingCheckoutRequest(kind="free_trial")
    assert req.kind == "free_trial"
