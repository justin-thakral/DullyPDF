"""Smoke integration coverage for generated-PDF quota and billing paths."""

from __future__ import annotations

import io
import json
import zipfile
from typing import Optional

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

import backend.main as main
import backend.api.middleware.security as security_middleware
import backend.api.routes.billing as billing_routes
import backend.api.routes.forms as forms_routes
import backend.api.routes.profile as profile_routes
import backend.firebaseDB.pdf_download_database as pdf_download_database
import backend.firebaseDB.user_database as user_database
from backend.firebaseDB.firebase_service import RequestUser
from backend.test.integration.billing_webhook_test_support import (
    encode_event,
    install_fake_stripe_module,
    sign_stripe_payload,
)
from backend.test.unit.firebase._fakes import FakeFirestoreClient


AUTH_PREFIX = "Bearer "
MONTH_KEY = "2026-05"


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


@pytest.fixture
def webhook_secret(monkeypatch: pytest.MonkeyPatch) -> str:
    install_fake_stripe_module(monkeypatch)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_pdf_quota")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_pdf_quota_smoke")
    return "whsec_pdf_quota_smoke"


def _pdf_bytes() -> bytes:
    output = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.write(output)
    return output.getvalue()


def _auth_headers(user_id: str) -> dict[str, str]:
    return {"Authorization": f"{AUTH_PREFIX}{user_id}"}


def _user_doc(fake_client: FakeFirestoreClient, user_id: str):
    return fake_client.collection(user_database.USERS_COLLECTION).document(user_id)


def _usage_doc(fake_client: FakeFirestoreClient, user_id: str):
    return fake_client.collection(pdf_download_database.PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION).document(
        pdf_download_database._usage_counter_doc_id(user_id, MONTH_KEY)
    )


def _usage_payload(fake_client: FakeFirestoreClient, user_id: str) -> dict:
    return _usage_doc(fake_client, user_id).get().to_dict()


def _seed_smoke_user(
    fake_client: FakeFirestoreClient,
    *,
    user_id: str,
    role: str,
    subscription_id: Optional[str] = None,
    subscription_status: Optional[str] = None,
) -> None:
    payload = {
        "email": f"{user_id}@example.com",
        "displayName": f"Smoke {user_id}",
        user_database.ROLE_FIELD: role,
        "created_at": "2026-05-01T00:00:00+00:00",
        "updated_at": "2026-05-01T00:00:00+00:00",
    }
    if role == user_database.ROLE_PRO:
        payload.update(
            {
                user_database.OPENAI_CREDITS_MONTHLY_FIELD: user_database.PRO_MONTHLY_OPENAI_CREDITS,
                user_database.OPENAI_CREDITS_REFILL_FIELD: 0,
                user_database.OPENAI_CREDITS_MONTHLY_CYCLE_FIELD: MONTH_KEY,
            }
        )
    else:
        payload.update(
            {
                user_database.OPENAI_CREDITS_FIELD: user_database.BASE_OPENAI_CREDITS,
                user_database.OPENAI_CREDITS_BASE_CYCLE_FIELD: MONTH_KEY,
            }
        )
    if subscription_id:
        payload.update(
            {
                user_database.STRIPE_CUSTOMER_ID_FIELD: f"cus_{user_id}",
                user_database.STRIPE_SUBSCRIPTION_ID_FIELD: subscription_id,
                user_database.STRIPE_SUBSCRIPTION_STATUS_FIELD: subscription_status or "active",
                user_database.STRIPE_SUBSCRIPTION_PRICE_ID_FIELD: "price_pro_monthly",
            }
        )
    _user_doc(fake_client, user_id).seed(payload)


def _seed_pdf_download_usage(
    fake_client: FakeFirestoreClient,
    *,
    user_id: str,
    download_count: int,
    workspace_download_count: Optional[int] = None,
    group_download_pdf_count: int = 0,
    event_count: Optional[int] = None,
) -> None:
    _usage_doc(fake_client, user_id).seed(
        {
            "user_id": user_id,
            "month_key": MONTH_KEY,
            "download_count": download_count,
            "event_count": download_count if event_count is None else event_count,
            "workspace_download_count": download_count if workspace_download_count is None else workspace_download_count,
            "group_download_pdf_count": group_download_pdf_count,
            "created_at": "2026-05-01T00:00:00+00:00",
            "updated_at": "2026-05-20T12:00:00+00:00",
        }
    )


def _install_pdf_quota_smoke_fakes(
    mocker,
    fake_client: FakeFirestoreClient,
) -> None:
    def _require_user(authorization: Optional[str] = None) -> RequestUser:
        token = str(authorization or "").strip()
        user_id = token[len(AUTH_PREFIX):].strip() if token.startswith(AUTH_PREFIX) else token
        if not user_id:
            user_id = "smoke-free"
        profile = user_database.get_user_profile(user_id)
        return RequestUser(
            uid=f"firebase-{user_id}",
            app_user_id=user_id,
            email=profile.email if profile else f"{user_id}@example.com",
            display_name=profile.display_name if profile else f"Smoke {user_id}",
            role=profile.role if profile else user_database.ROLE_BASE,
        )

    def _verify_token(authorization: Optional[str] = None) -> dict:
        token = str(authorization or "").strip()
        user_id = token[len(AUTH_PREFIX):].strip() if token.startswith(AUTH_PREFIX) else token
        if not user_id:
            raise ValueError("missing token")
        return {
            "uid": f"firebase-{user_id}",
            "app_user_id": user_id,
            "email": f"{user_id}@example.com",
            "email_verified": True,
            "firebase": {"sign_in_provider": "custom"},
            user_database.ROLE_FIELD: user_database.get_user_profile(user_id).role,
        }

    mocker.patch.object(security_middleware, "verify_token", side_effect=_verify_token)
    for module in (forms_routes, profile_routes):
        mocker.patch.object(module, "require_user", side_effect=_require_user)
    mocker.patch.object(user_database, "get_firestore_client", return_value=fake_client)
    mocker.patch.object(pdf_download_database, "get_firestore_client", return_value=fake_client)
    mocker.patch.object(user_database.firebase_firestore, "transactional", side_effect=lambda fn: fn)
    mocker.patch.object(pdf_download_database.firebase_firestore, "transactional", side_effect=lambda fn: fn)
    mocker.patch.object(user_database, "_current_month_cycle_key", return_value=MONTH_KEY)
    mocker.patch.object(pdf_download_database, "_current_month_key", return_value=MONTH_KEY)
    mocker.patch.object(user_database, "now_iso", return_value="2026-05-20T12:00:00+00:00")
    mocker.patch.object(pdf_download_database, "now_iso", return_value="2026-05-20T12:00:00+00:00")
    mocker.patch.object(profile_routes, "_current_month_key", return_value=MONTH_KEY)
    mocker.patch.object(profile_routes, "billing_enabled", return_value=False)
    mocker.patch.object(profile_routes, "sync_user_downgrade_retention", return_value=None)
    mocker.patch.object(profile_routes, "restore_user_downgrade_managed_links", return_value=None)
    mocker.patch.object(profile_routes, "clear_user_downgrade_retention", return_value=None)
    mocker.patch.object(billing_routes, "start_billing_event", return_value=True)
    mocker.patch.object(billing_routes, "complete_billing_event", return_value=None)
    mocker.patch.object(billing_routes, "clear_billing_event", return_value=None)
    mocker.patch.object(
        billing_routes,
        "get_user_billing_record",
        side_effect=lambda uid: user_database.get_user_billing_record(uid),
    )
    mocker.patch.object(
        billing_routes,
        "resolve_price_id_for_checkout_kind",
        return_value="price_pro_monthly",
    )
    mocker.patch.object(
        billing_routes,
        "is_pro_price_id",
        side_effect=lambda value: str(value or "").strip() == "price_pro_monthly",
    )
    mocker.patch.object(billing_routes, "restore_user_downgrade_managed_links", return_value=None)
    mocker.patch.object(billing_routes, "apply_user_downgrade_retention", return_value=None)


def _download_pdf(
    client: TestClient,
    *,
    user_id: str,
    request_id: str,
    export_mode: str = "editable",
):
    return client.post(
        "/api/forms/download",
        files={"pdf": ("smoke.pdf", _pdf_bytes(), "application/pdf")},
        data={"fields": "[]", "exportMode": export_mode, "downloadRequestId": request_id},
        headers=_auth_headers(user_id),
    )


def _download_group(
    client: TestClient,
    *,
    user_id: str,
    request_id: str,
    pdf_count: int,
):
    payload = {
        "downloadRequestId": request_id,
        "groupId": f"group-{user_id}",
        "groupName": f"Smoke Packet {user_id}",
        "items": [
            {
                "fileIndex": index,
                "filename": f"form-{index + 1}.pdf",
                "fields": [],
                "exportMode": "editable",
            }
            for index in range(pdf_count)
        ],
    }
    return client.post(
        "/api/forms/group-download",
        files=[
            ("pdfs", (f"form-{index + 1}.pdf", _pdf_bytes(), "application/pdf"))
            for index in range(pdf_count)
        ],
        data={"payload": json.dumps(payload)},
        headers=_auth_headers(user_id),
    )


def _post_webhook(
    client: TestClient,
    *,
    webhook_secret: str,
    event: dict,
):
    payload = encode_event(event)
    return client.post(
        "/api/billing/webhook",
        content=payload,
        headers={"Stripe-Signature": sign_stripe_payload(payload, secret=webhook_secret)},
    )


def test_pdf_download_quota_smoke_free_user_cap_profile_and_non_charged_materialize(
    client: TestClient,
    mocker,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SANDBOX_PDF_DOWNLOADS_MONTHLY_MAX_BASE", "25")
    fake_client = FakeFirestoreClient()
    _install_pdf_quota_smoke_fakes(mocker, fake_client)
    _seed_smoke_user(fake_client, user_id="smoke-free", role=user_database.ROLE_BASE)
    _seed_pdf_download_usage(fake_client, user_id="smoke-free", download_count=24)

    materialize_response = client.post(
        "/api/forms/materialize",
        files={"pdf": ("smoke.pdf", _pdf_bytes(), "application/pdf")},
        data={"fields": "[]", "exportMode": "editable"},
        headers=_auth_headers("smoke-free"),
    )
    assert materialize_response.status_code == 200
    assert _usage_payload(fake_client, "smoke-free")["download_count"] == 24

    profile_before = client.get("/api/profile", headers=_auth_headers("smoke-free")).json()
    assert profile_before["role"] == user_database.ROLE_BASE
    assert profile_before["pdfDownloadsThisMonth"] == 24
    assert profile_before["pdfDownloadsRemaining"] == 1
    assert profile_before["limits"]["pdfDownloadsMonthlyMax"] == 25

    final_allowed_download = _download_pdf(
        client,
        user_id="smoke-free",
        request_id="smoke-free-final-download",
    )
    assert final_allowed_download.status_code == 200
    assert final_allowed_download.headers["x-dullypdf-download-count"] == "25"
    assert final_allowed_download.headers["x-dullypdf-download-remaining"] == "0"
    assert _usage_payload(fake_client, "smoke-free")["download_count"] == 25

    blocked_download = _download_pdf(
        client,
        user_id="smoke-free",
        request_id="smoke-free-over-limit",
        export_mode="flat",
    )
    assert blocked_download.status_code == 429
    blocked_detail = blocked_download.json()["detail"]
    assert blocked_detail["code"] == "pdf_download_limit_reached"
    assert blocked_detail["monthlyLimit"] == 25
    assert blocked_detail["currentMonthUsage"] == 25
    assert blocked_detail["downloadsRemaining"] == 0
    assert _usage_payload(fake_client, "smoke-free")["download_count"] == 25

    profile_after = client.get("/api/profile", headers=_auth_headers("smoke-free")).json()
    assert profile_after["pdfDownloadsThisMonth"] == 25
    assert profile_after["pdfDownloadsRemaining"] == 0
    assert profile_after["pdfDownloadWorkspaceThisMonth"] == 25
    assert profile_after["pdfDownloadGroupThisMonth"] == 0
    assert profile_after["pdfDownloadBatchesThisMonth"] == 25
    assert profile_after["pdfDownloadResetAt"] == "2026-06-01T00:00:00+00:00"


def test_pdf_download_quota_smoke_group_all_or_nothing_and_premium_unlimited(
    client: TestClient,
    mocker,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SANDBOX_PDF_DOWNLOADS_MONTHLY_MAX_BASE", "25")
    monkeypatch.delenv("SANDBOX_PDF_DOWNLOADS_MONTHLY_MAX_PRO", raising=False)
    fake_client = FakeFirestoreClient()
    _install_pdf_quota_smoke_fakes(mocker, fake_client)
    _seed_smoke_user(fake_client, user_id="smoke-group-base", role=user_database.ROLE_BASE)
    _seed_pdf_download_usage(fake_client, user_id="smoke-group-base", download_count=23)
    _seed_smoke_user(fake_client, user_id="smoke-pro", role=user_database.ROLE_PRO)
    _seed_pdf_download_usage(
        fake_client,
        user_id="smoke-pro",
        download_count=25,
        workspace_download_count=20,
        group_download_pdf_count=5,
        event_count=21,
    )

    blocked_group = _download_group(
        client,
        user_id="smoke-group-base",
        request_id="smoke-group-base-over-limit",
        pdf_count=3,
    )
    assert blocked_group.status_code == 429
    assert blocked_group.json()["detail"]["pdfCount"] == 3
    assert _usage_payload(fake_client, "smoke-group-base")["download_count"] == 23
    assert _usage_payload(fake_client, "smoke-group-base")["group_download_pdf_count"] == 0

    pro_group = _download_group(
        client,
        user_id="smoke-pro",
        request_id="smoke-pro-group-unlimited",
        pdf_count=3,
    )
    assert pro_group.status_code == 200
    assert pro_group.headers["content-type"].startswith("application/zip")
    assert pro_group.headers["x-dullypdf-download-count"] == "28"
    assert "x-dullypdf-download-limit" not in pro_group.headers
    assert "x-dullypdf-download-remaining" not in pro_group.headers
    with zipfile.ZipFile(io.BytesIO(pro_group.content)) as archive:
        assert sorted(archive.namelist()) == ["form-1.pdf", "form-2.pdf", "form-3.pdf"]

    pro_usage = _usage_payload(fake_client, "smoke-pro")
    assert pro_usage["download_count"] == 28
    assert pro_usage["group_download_pdf_count"] == 8
    assert pro_usage["event_count"] == 22
    profile = client.get("/api/profile", headers=_auth_headers("smoke-pro")).json()
    assert profile["role"] == user_database.ROLE_PRO
    assert profile["pdfDownloadsRemaining"] is None
    assert profile["limits"]["pdfDownloadsMonthlyMax"] is None
    assert profile["pdfDownloadGroupThisMonth"] == 8


def test_pdf_download_quota_smoke_webhook_upgrade_and_terminal_downgrade_routes(
    client: TestClient,
    webhook_secret: str,
    mocker,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SANDBOX_PDF_DOWNLOADS_MONTHLY_MAX_BASE", "25")
    monkeypatch.delenv("SANDBOX_PDF_DOWNLOADS_MONTHLY_MAX_PRO", raising=False)
    fake_client = FakeFirestoreClient()
    _install_pdf_quota_smoke_fakes(mocker, fake_client)
    _seed_smoke_user(fake_client, user_id="smoke-upgrade", role=user_database.ROLE_BASE)
    _seed_pdf_download_usage(fake_client, user_id="smoke-upgrade", download_count=25)
    _seed_smoke_user(
        fake_client,
        user_id="smoke-downgrade",
        role=user_database.ROLE_PRO,
        subscription_id="sub_smoke_downgrade",
        subscription_status="active",
    )
    _seed_pdf_download_usage(fake_client, user_id="smoke-downgrade", download_count=26)

    upgrade_response = _post_webhook(
        client,
        webhook_secret=webhook_secret,
        event={
            "id": "evt_smoke_pdf_quota_upgrade",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_smoke_upgrade",
                    "client_reference_id": "smoke-upgrade",
                    "metadata": {
                        "userId": "smoke-upgrade",
                        "checkoutKind": "pro_monthly",
                        "checkoutPriceId": "price_pro_monthly",
                    },
                    "subscription": "sub_smoke_upgrade",
                    "customer": "cus_smoke_upgrade",
                    "payment_status": "paid",
                }
            },
        },
    )
    assert upgrade_response.status_code == 200
    assert _user_doc(fake_client, "smoke-upgrade").get().to_dict()[user_database.ROLE_FIELD] == user_database.ROLE_PRO

    upgraded_download = _download_pdf(
        client,
        user_id="smoke-upgrade",
        request_id="smoke-upgrade-post-checkout",
    )
    assert upgraded_download.status_code == 200
    assert upgraded_download.headers["x-dullypdf-download-count"] == "26"
    assert "x-dullypdf-download-remaining" not in upgraded_download.headers
    upgraded_profile = client.get("/api/profile", headers=_auth_headers("smoke-upgrade")).json()
    assert upgraded_profile["role"] == user_database.ROLE_PRO
    assert upgraded_profile["pdfDownloadsThisMonth"] == 26
    assert upgraded_profile["pdfDownloadsRemaining"] is None

    downgrade_response = _post_webhook(
        client,
        webhook_secret=webhook_secret,
        event={
            "id": "evt_smoke_pdf_quota_terminal_downgrade",
            "type": "customer.subscription.updated",
            "data": {
                "object": {
                    "id": "sub_smoke_downgrade",
                    "customer": "cus_smoke_downgrade",
                    "status": "unpaid",
                    "metadata": {"userId": "smoke-downgrade"},
                    "items": {"data": [{"price": {"id": "price_pro_monthly"}}]},
                }
            },
        },
    )
    assert downgrade_response.status_code == 200
    downgraded_doc = _user_doc(fake_client, "smoke-downgrade").get().to_dict()
    assert downgraded_doc[user_database.ROLE_FIELD] == user_database.ROLE_BASE
    assert downgraded_doc[user_database.STRIPE_SUBSCRIPTION_STATUS_FIELD] == "unpaid"

    blocked_after_downgrade = _download_pdf(
        client,
        user_id="smoke-downgrade",
        request_id="smoke-downgrade-over-base-cap",
    )
    assert blocked_after_downgrade.status_code == 429
    detail = blocked_after_downgrade.json()["detail"]
    assert detail["monthlyLimit"] == 25
    assert detail["currentMonthUsage"] == 26
    assert detail["downloadsRemaining"] == 0
    assert _usage_payload(fake_client, "smoke-downgrade")["download_count"] == 26
    downgraded_profile = client.get("/api/profile", headers=_auth_headers("smoke-downgrade")).json()
    assert downgraded_profile["role"] == user_database.ROLE_BASE
    assert downgraded_profile["pdfDownloadsThisMonth"] == 26
    assert downgraded_profile["pdfDownloadsRemaining"] == 0
    assert downgraded_profile["limits"]["pdfDownloadsMonthlyMax"] == 25
