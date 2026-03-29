"""Integration tests for billing-driven downgrade and upgrade lifecycle behavior."""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

import backend.main as main
import backend.api.middleware.security as security_middleware
import backend.api.routes.billing as billing_routes
import backend.api.routes.profile as profile_routes
import backend.api.routes.saved_forms as saved_forms_routes
import backend.api.routes.template_api as template_api_routes
import backend.api.routes.template_api_public as template_api_public_routes
import backend.firebaseDB.billing_database as billing_database
import backend.firebaseDB.fill_link_database as fill_link_database
import backend.firebaseDB.group_database as group_database
import backend.firebaseDB.signing_database as signing_database
import backend.firebaseDB.template_api_endpoint_database as template_api_endpoint_database
import backend.firebaseDB.template_database as template_database
import backend.firebaseDB.user_database as user_database
import backend.services.template_api_service as template_api_service
from backend.test.integration.billing_webhook_test_support import (
    encode_event,
    install_fake_stripe_module,
    sign_stripe_payload,
)
from backend.test.integration.downgrade_test_support import (
    build_request_user,
    seed_downgrade_ready_pro_profile,
    seed_saved_form_inventory,
)
from backend.test.unit.firebase._fakes import FakeFirestoreClient


def _authenticated_user(uid: str = "integration-user"):
    return build_request_user(
        uid=f"firebase-{uid}",
        app_user_id=uid,
        email="integration@example.com",
        display_name="Integration User",
        role=user_database.ROLE_BASE,
    )


def _seed_downgrade_lifecycle_state(firestore_client: FakeFirestoreClient, *, user_id: str) -> None:
    seed_downgrade_ready_pro_profile(
        firestore_client,
        user_id=user_id,
        email="integration@example.com",
        display_name="Integration User",
    )
    seed_saved_form_inventory(
        firestore_client,
        user_id=user_id,
        metadata_builder=lambda template_number: {
            "name": f"Saved Form {template_number}",
            "fillRules": {"checkboxRules": [], "textTransformRules": []},
            "editorSnapshot": {"path": f"gs://snapshots/form-{template_number}.json"},
        },
    )


def _seed_base_profile(firestore_client: FakeFirestoreClient, *, user_id: str) -> None:
    firestore_client.collection(user_database.USERS_COLLECTION).document(user_id).seed(
        {
            "email": "integration@example.com",
            "displayName": "Integration User",
            user_database.ROLE_FIELD: user_database.ROLE_BASE,
            user_database.OPENAI_CREDITS_FIELD: user_database.BASE_OPENAI_CREDITS,
            user_database.OPENAI_CREDITS_BASE_CYCLE_FIELD: "2026-03",
            "created_at": "2026-03-01T00:00:00+00:00",
            "updated_at": "2026-03-27T00:00:00+00:00",
        }
    )


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


@pytest.fixture
def webhook_secret(monkeypatch: pytest.MonkeyPatch) -> str:
    install_fake_stripe_module(monkeypatch)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_integration")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_integration_test")
    return "whsec_integration_test"


@pytest.fixture(autouse=True)
def _no_transaction_wrapper(mocker):
    mocker.patch.object(user_database.firebase_firestore, "transactional", side_effect=lambda fn: fn)


def test_webhook_subscription_deleted_drives_profile_retention_and_locked_saved_forms(
    client: TestClient,
    webhook_secret: str,
    mocker,
) -> None:
    firestore_client = FakeFirestoreClient()
    request_user = _authenticated_user()
    _seed_downgrade_lifecycle_state(firestore_client, user_id=request_user.app_user_id)
    event = {
        "id": "evt_integration_deleted_profile_lock",
        "type": "customer.subscription.deleted",
        "data": {
            "object": {
                "id": "sub_integration_deleted",
                "customer": "cus_integration",
                "status": "canceled",
                "metadata": {"userId": request_user.app_user_id},
                "items": {"data": [{"price": {"id": "price_pro_monthly"}}]},
            }
        },
    }
    payload = encode_event(event)
    signature = sign_stripe_payload(payload, secret=webhook_secret)

    mocker.patch.object(billing_routes, "start_billing_event", return_value=True)
    mocker.patch.object(
        billing_routes,
        "is_pro_price_id",
        side_effect=lambda value: value == "price_pro_monthly",
    )
    mocker.patch.object(billing_routes, "complete_billing_event", return_value=None)
    mocker.patch.object(billing_routes, "clear_billing_event", return_value=None)
    mocker.patch.object(security_middleware, "verify_token", return_value={"uid": request_user.uid})
    mocker.patch.object(profile_routes, "require_user", return_value=request_user)
    mocker.patch.object(saved_forms_routes, "require_user", return_value=request_user)
    mocker.patch.object(profile_routes, "billing_enabled", return_value=True)
    mocker.patch.object(profile_routes, "resolve_checkout_catalog", return_value={})
    for module in (
        user_database,
        template_database,
        group_database,
        fill_link_database,
        signing_database,
    ):
        mocker.patch.object(module, "get_firestore_client", return_value=firestore_client)

    webhook_response = client.post(
        "/api/billing/webhook",
        content=payload,
        headers={"Stripe-Signature": signature},
    )

    assert webhook_response.status_code == 200
    assert webhook_response.json() == {"received": True}

    profile_response = client.get("/api/profile", headers={"Authorization": "Bearer integration-token"})
    accessible_form_response = client.get(
        "/api/saved-forms/form-1",
        headers={"Authorization": "Bearer integration-token"},
    )
    locked_form_response = client.get(
        "/api/saved-forms/form-6",
        headers={"Authorization": "Bearer integration-token"},
    )

    assert profile_response.status_code == 200
    assert accessible_form_response.status_code == 200
    assert locked_form_response.status_code == 409

    stored_user = (
        firestore_client.collection(user_database.USERS_COLLECTION)
        .document(request_user.app_user_id)
        .get()
        .to_dict()
    )
    assert stored_user[user_database.ROLE_FIELD] == user_database.ROLE_BASE
    assert stored_user[user_database.STRIPE_SUBSCRIPTION_STATUS_FIELD] == "canceled"
    assert stored_user[user_database.OPENAI_CREDITS_BASE_CYCLE_FIELD]

    profile_payload = profile_response.json()
    assert profile_payload["role"] == user_database.ROLE_BASE
    assert profile_payload["billing"]["subscriptionStatus"] == "canceled"
    assert profile_payload["limits"]["savedFormsMax"] == 5
    assert profile_payload["limits"]["fillLinkResponsesMonthlyMax"] == 25
    assert profile_payload["limits"]["templateApiRequestsMonthlyMax"] == 250
    assert profile_payload["retention"]["selectionMode"] == "oldest_created"
    assert profile_payload["retention"]["accessibleTemplateIds"] == [
        "form-1",
        "form-2",
        "form-3",
        "form-4",
        "form-5",
    ]
    assert profile_payload["retention"]["lockedTemplateIds"] == ["form-6", "form-7"]
    assert profile_payload["retention"]["counts"]["accessibleTemplates"] == 5
    assert profile_payload["retention"]["counts"]["lockedTemplates"] == 2

    assert accessible_form_response.json()["name"] == "Saved Form 1"
    assert "locked on the base plan" in locked_form_response.text.lower()


def test_webhook_subscription_reactivation_restores_pro_limits_and_unlocks_saved_forms(
    client: TestClient,
    webhook_secret: str,
    mocker,
) -> None:
    firestore_client = FakeFirestoreClient()
    request_user = _authenticated_user()
    _seed_downgrade_lifecycle_state(firestore_client, user_id=request_user.app_user_id)
    deleted_event = {
        "id": "evt_integration_deleted_upgrade_recovery",
        "type": "customer.subscription.deleted",
        "data": {
            "object": {
                "id": "sub_integration_deleted",
                "customer": "cus_integration",
                "status": "canceled",
                "metadata": {"userId": request_user.app_user_id},
                "items": {"data": [{"price": {"id": "price_pro_monthly"}}]},
            }
        },
    }
    updated_event = {
        "id": "evt_integration_updated_upgrade_recovery",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_integration_deleted",
                "customer": "cus_integration",
                "status": "active",
                "metadata": {"userId": request_user.app_user_id},
                "items": {"data": [{"price": {"id": "price_pro_monthly"}}]},
            }
        },
    }
    deleted_signature = sign_stripe_payload(encode_event(deleted_event), secret=webhook_secret)
    updated_signature = sign_stripe_payload(encode_event(updated_event), secret=webhook_secret)

    mocker.patch.object(billing_routes, "start_billing_event", return_value=True)
    mocker.patch.object(
        billing_routes,
        "is_pro_price_id",
        side_effect=lambda value: value == "price_pro_monthly",
    )
    mocker.patch.object(billing_routes, "complete_billing_event", return_value=None)
    mocker.patch.object(billing_routes, "clear_billing_event", return_value=None)
    mocker.patch.object(security_middleware, "verify_token", return_value={"uid": request_user.uid})
    mocker.patch.object(profile_routes, "require_user", return_value=request_user)
    mocker.patch.object(saved_forms_routes, "require_user", return_value=request_user)
    mocker.patch.object(profile_routes, "billing_enabled", return_value=True)
    mocker.patch.object(profile_routes, "resolve_checkout_catalog", return_value={})
    for module in (
        user_database,
        template_database,
        group_database,
        fill_link_database,
        signing_database,
    ):
        mocker.patch.object(module, "get_firestore_client", return_value=firestore_client)

    deleted_response = client.post(
        "/api/billing/webhook",
        content=encode_event(deleted_event),
        headers={"Stripe-Signature": deleted_signature},
    )
    updated_response = client.post(
        "/api/billing/webhook",
        content=encode_event(updated_event),
        headers={"Stripe-Signature": updated_signature},
    )

    assert deleted_response.status_code == 200
    assert updated_response.status_code == 200

    profile_response = client.get("/api/profile", headers={"Authorization": "Bearer integration-token"})
    recovered_form_response = client.get(
        "/api/saved-forms/form-6",
        headers={"Authorization": "Bearer integration-token"},
    )

    assert profile_response.status_code == 200
    assert recovered_form_response.status_code == 200

    profile_payload = profile_response.json()
    assert profile_payload["role"] == user_database.ROLE_PRO
    assert profile_payload["retention"] is None
    assert profile_payload["limits"]["savedFormsMax"] == 100
    assert profile_payload["limits"]["fillLinkResponsesMonthlyMax"] == 10000
    assert profile_payload["limits"]["templateApiRequestsMonthlyMax"] == 10000

    stored_user = (
        firestore_client.collection(user_database.USERS_COLLECTION)
        .document(request_user.app_user_id)
        .get()
        .to_dict()
    )
    assert stored_user[user_database.ROLE_FIELD] == user_database.ROLE_PRO


def test_reconcile_checkout_session_upgrades_base_user_to_pro_with_real_profile_state(
    client: TestClient,
    mocker,
) -> None:
    firestore_client = FakeFirestoreClient()
    request_user = _authenticated_user()
    _seed_base_profile(firestore_client, user_id=request_user.app_user_id)
    session_obj = {
        "id": "cs_integration_promote",
        "created": 1711584000,
        "client_reference_id": request_user.app_user_id,
        "metadata": {
            "userId": request_user.app_user_id,
            "checkoutKind": "pro_monthly",
            "checkoutPriceId": "price_pro_monthly",
            "checkoutAttemptId": "attempt_integration_promote",
        },
        "payment_status": "paid",
        "subscription": "sub_integration_promote",
        "customer": "cus_integration_promote",
    }

    mocker.patch.object(user_database.firebase_firestore, "transactional", side_effect=lambda fn: fn)
    mocker.patch.object(billing_database.firebase_firestore, "transactional", side_effect=lambda fn: fn)
    mocker.patch.object(security_middleware, "verify_token", return_value={"uid": request_user.uid})
    mocker.patch.object(billing_routes, "ensure_user", return_value=request_user)
    mocker.patch.object(billing_routes, "require_user", return_value=request_user)
    mocker.patch.object(profile_routes, "require_user", return_value=request_user)
    mocker.patch.object(billing_routes, "billing_enabled", return_value=True)
    mocker.patch.object(profile_routes, "billing_enabled", return_value=True)
    mocker.patch.object(profile_routes, "resolve_checkout_catalog", return_value={})
    mocker.patch.object(billing_routes, "retrieve_checkout_session", return_value=session_obj)
    mocker.patch.object(billing_routes, "resolve_price_id_for_checkout_kind", return_value="price_pro_monthly")
    mocker.patch.object(billing_routes, "check_rate_limit", return_value=True)
    for module in (
        billing_database,
        user_database,
        fill_link_database,
    ):
        mocker.patch.object(module, "get_firestore_client", return_value=firestore_client)

    reconcile_response = client.post(
        "/api/billing/reconcile",
        json={
            "dryRun": False,
            "sessionId": "cs_integration_promote",
            "attemptId": "attempt_integration_promote",
        },
        headers={"Authorization": "Bearer integration-token"},
    )

    assert reconcile_response.status_code == 200
    reconcile_payload = reconcile_response.json()
    assert reconcile_payload["scope"] == "self"
    assert reconcile_payload["candidateEventCount"] == 1
    assert reconcile_payload["reconciledCount"] == 1
    assert reconcile_payload["events"][0]["checkoutSessionId"] == "cs_integration_promote"
    assert reconcile_payload["events"][0]["checkoutAttemptId"] == "attempt_integration_promote"
    assert reconcile_payload["events"][0]["checkoutKind"] == "pro_monthly"

    profile_response = client.get("/api/profile", headers={"Authorization": "Bearer integration-token"})
    assert profile_response.status_code == 200
    profile_payload = profile_response.json()
    assert profile_payload["role"] == user_database.ROLE_PRO
    assert profile_payload["billing"]["hasSubscription"] is True
    assert profile_payload["billing"]["subscriptionStatus"] == "active"
    assert profile_payload["limits"]["savedFormsMax"] == 100
    assert profile_payload["limits"]["fillLinkResponsesMonthlyMax"] == 10000
    assert profile_payload["limits"]["templateApiRequestsMonthlyMax"] == 10000
    assert profile_payload["monthlyCreditsRemaining"] == 500
    assert profile_payload["availableCredits"] == 500

    stored_user = (
        firestore_client.collection(user_database.USERS_COLLECTION)
        .document(request_user.app_user_id)
        .get()
        .to_dict()
    )
    assert stored_user[user_database.ROLE_FIELD] == user_database.ROLE_PRO
    assert stored_user[user_database.STRIPE_CUSTOMER_ID_FIELD] == "cus_integration_promote"
    assert stored_user[user_database.STRIPE_SUBSCRIPTION_ID_FIELD] == "sub_integration_promote"
    assert stored_user[user_database.STRIPE_SUBSCRIPTION_PRICE_ID_FIELD] == "price_pro_monthly"


def test_subscription_lifecycle_preserves_pro_price_across_multi_item_events_and_downgrades_on_delete(
    client: TestClient,
    webhook_secret: str,
    mocker,
) -> None:
    firestore_client = FakeFirestoreClient()
    request_user = _authenticated_user()
    seed_downgrade_ready_pro_profile(
        firestore_client,
        user_id=request_user.app_user_id,
        subscription_id="sub_integration_multi_item",
        subscription_price_id="price_pro_monthly",
    )
    updated_event = {
        "id": "evt_integration_multi_item_updated",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_integration_multi_item",
                "customer": "cus_integration",
                "status": "active",
                "metadata": {"userId": request_user.app_user_id},
                "items": {
                    "data": [
                        {"price": {"id": "price_non_pro"}},
                        {"price": {"id": "price_pro_monthly"}},
                    ]
                },
            }
        },
    }
    deleted_event = {
        "id": "evt_integration_multi_item_deleted",
        "type": "customer.subscription.deleted",
        "data": {
            "object": {
                "id": "sub_integration_multi_item",
                "customer": "cus_integration",
                "status": "canceled",
                "metadata": {"userId": request_user.app_user_id},
                "items": {
                    "data": [
                        {"price": {"id": "price_non_pro"}},
                        {"price": {"id": "price_pro_monthly"}},
                    ]
                },
            }
        },
    }

    mocker.patch.object(user_database.firebase_firestore, "transactional", side_effect=lambda fn: fn)
    mocker.patch.object(billing_database.firebase_firestore, "transactional", side_effect=lambda fn: fn)
    mocker.patch.object(
        billing_routes,
        "is_pro_price_id",
        side_effect=lambda value: value == "price_pro_monthly",
    )
    for module in (
        billing_database,
        user_database,
        template_database,
        group_database,
        fill_link_database,
        signing_database,
    ):
        mocker.patch.object(module, "get_firestore_client", return_value=firestore_client)

    updated_response = client.post(
        "/api/billing/webhook",
        content=encode_event(updated_event),
        headers={"Stripe-Signature": sign_stripe_payload(encode_event(updated_event), secret=webhook_secret)},
    )
    deleted_response = client.post(
        "/api/billing/webhook",
        content=encode_event(deleted_event),
        headers={"Stripe-Signature": sign_stripe_payload(encode_event(deleted_event), secret=webhook_secret)},
    )

    assert updated_response.status_code == 200
    assert deleted_response.status_code == 200

    stored_user = (
        firestore_client.collection(user_database.USERS_COLLECTION)
        .document(request_user.app_user_id)
        .get()
        .to_dict()
    )
    assert stored_user[user_database.STRIPE_SUBSCRIPTION_PRICE_ID_FIELD] == "price_pro_monthly"
    assert stored_user[user_database.STRIPE_SUBSCRIPTION_STATUS_FIELD] == "canceled"
    assert stored_user[user_database.ROLE_FIELD] == user_database.ROLE_BASE


def test_webhook_lifecycle_blocks_and_restores_template_api_schema_for_locked_saved_forms(
    client: TestClient,
    webhook_secret: str,
    mocker,
) -> None:
    firestore_client = FakeFirestoreClient()
    request_user = _authenticated_user()
    _seed_downgrade_lifecycle_state(firestore_client, user_id=request_user.app_user_id)
    deleted_event = {
        "id": "evt_integration_deleted_template_api_lock",
        "type": "customer.subscription.deleted",
        "data": {
            "object": {
                "id": "sub_integration_deleted",
                "customer": "cus_integration",
                "status": "canceled",
                "metadata": {"userId": request_user.app_user_id},
                "items": {"data": [{"price": {"id": "price_pro_monthly"}}]},
            }
        },
    }
    updated_event = {
        "id": "evt_integration_updated_template_api_unlock",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_integration_deleted",
                "customer": "cus_integration",
                "status": "active",
                "metadata": {"userId": request_user.app_user_id},
                "items": {"data": [{"price": {"id": "price_pro_monthly"}}]},
            }
        },
    }
    deleted_signature = sign_stripe_payload(encode_event(deleted_event), secret=webhook_secret)
    updated_signature = sign_stripe_payload(encode_event(updated_event), secret=webhook_secret)
    editor_snapshot = {
        "version": 1,
        "pageCount": 1,
        "pageSizes": {"1": {"width": 612, "height": 792}},
        "fields": [
            {
                "id": "field-1",
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": {"x": 1, "y": 2, "width": 100, "height": 20},
            }
        ],
    }

    mocker.patch.object(billing_routes, "start_billing_event", return_value=True)
    mocker.patch.object(
        billing_routes,
        "is_pro_price_id",
        side_effect=lambda value: value == "price_pro_monthly",
    )
    mocker.patch.object(billing_routes, "complete_billing_event", return_value=None)
    mocker.patch.object(billing_routes, "clear_billing_event", return_value=None)
    mocker.patch.object(security_middleware, "verify_token", return_value={"uid": request_user.uid})
    mocker.patch.object(template_api_routes, "require_user", return_value=request_user)
    mocker.patch.object(template_api_public_routes, "check_rate_limit", return_value=True)
    mocker.patch.object(template_api_public_routes, "resolve_client_ip", return_value="198.51.100.20")
    mocker.patch.object(template_api_service, "load_saved_form_editor_snapshot", return_value=editor_snapshot)
    for module in (
        user_database,
        template_database,
        group_database,
        fill_link_database,
        signing_database,
        template_api_endpoint_database,
    ):
        mocker.patch.object(module, "get_firestore_client", return_value=firestore_client)

    publish_response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "form-6", "exportMode": "flat"},
        headers={"Authorization": "Bearer integration-token"},
    )

    assert publish_response.status_code == 200
    publish_payload = publish_response.json()
    endpoint_id = publish_payload["endpoint"]["id"]
    basic_headers = {
        "Authorization": "Basic "
        + base64.b64encode(f"{publish_payload['secret']}:".encode("utf-8")).decode("ascii")
    }

    schema_before_downgrade = client.get(f"/api/v1/fill/{endpoint_id}/schema", headers=basic_headers)
    assert schema_before_downgrade.status_code == 200

    deleted_response = client.post(
        "/api/billing/webhook",
        content=encode_event(deleted_event),
        headers={"Stripe-Signature": deleted_signature},
    )
    assert deleted_response.status_code == 200

    schema_after_downgrade = client.get(f"/api/v1/fill/{endpoint_id}/schema", headers=basic_headers)
    assert schema_after_downgrade.status_code == 403
    assert "current plan" in schema_after_downgrade.text.lower()

    updated_response = client.post(
        "/api/billing/webhook",
        content=encode_event(updated_event),
        headers={"Stripe-Signature": updated_signature},
    )
    assert updated_response.status_code == 200

    schema_after_reactivation = client.get(f"/api/v1/fill/{endpoint_id}/schema", headers=basic_headers)
    assert schema_after_reactivation.status_code == 200
    stored_user = (
        firestore_client.collection(user_database.USERS_COLLECTION)
        .document(request_user.app_user_id)
        .get()
        .to_dict()
    )
    assert user_database.DOWNGRADE_RETENTION_FIELD not in stored_user
