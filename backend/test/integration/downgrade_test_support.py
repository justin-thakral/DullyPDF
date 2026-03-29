"""Helpers for downgrade and locked-template integration scenarios."""

from __future__ import annotations

from typing import Any, Callable

import backend.firebaseDB.template_database as template_database
import backend.firebaseDB.user_database as user_database
from backend.firebaseDB.firebase_service import RequestUser
from backend.test.unit.firebase._fakes import FakeFirestoreClient


def build_request_user(
    *,
    uid: str,
    app_user_id: str,
    email: str,
    display_name: str,
    role: str = user_database.ROLE_BASE,
) -> RequestUser:
    return RequestUser(
        uid=uid,
        app_user_id=app_user_id,
        email=email,
        display_name=display_name,
        role=role,
    )


def seed_saved_form_inventory(
    firestore_client: FakeFirestoreClient,
    *,
    user_id: str,
    total_templates: int = 7,
    template_id_prefix: str = "form",
    name_prefix: str = "Saved Form",
    pdf_bucket_prefix: str = "gs://forms",
    template_bucket_prefix: str = "gs://templates",
    metadata_builder: Callable[[int], dict[str, Any]] | None = None,
) -> None:
    """Seed a deterministic oldest-created saved-form inventory for downgrade tests.

    The helper keeps the creation timestamps strictly increasing so retention
    tests can make exact assertions about which templates stay accessible under
    the oldest-created policy.
    """

    for template_number in range(1, total_templates + 1):
        template_id = f"{template_id_prefix}-{template_number}"
        firestore_client.collection(template_database.TEMPLATES_COLLECTION).document(template_id).seed(
            {
                "user_id": user_id,
                "pdf_bucket_path": f"{pdf_bucket_prefix}/{template_id}.pdf",
                "template_bucket_path": f"{template_bucket_prefix}/{template_id}.json",
                "metadata": (
                    metadata_builder(template_number)
                    if metadata_builder is not None
                    else {"name": f"{name_prefix} {template_number}"}
                ),
                "created_at": f"2024-01-{template_number:02d}T00:00:00+00:00",
                "updated_at": f"2024-01-{template_number:02d}T00:00:00+00:00",
            }
        )


def seed_downgrade_ready_pro_profile(
    firestore_client: FakeFirestoreClient,
    *,
    user_id: str,
    email: str = "integration@example.com",
    display_name: str = "Integration User",
    customer_id: str = "cus_integration",
    subscription_id: str = "sub_integration_deleted",
    subscription_price_id: str = "price_pro_monthly",
) -> None:
    firestore_client.collection(user_database.USERS_COLLECTION).document(user_id).seed(
        {
            "email": email,
            "displayName": display_name,
            user_database.ROLE_FIELD: user_database.ROLE_PRO,
            user_database.OPENAI_CREDITS_MONTHLY_FIELD: 500,
            user_database.OPENAI_CREDITS_REFILL_FIELD: 0,
            user_database.OPENAI_CREDITS_MONTHLY_CYCLE_FIELD: "2026-03",
            user_database.STRIPE_CUSTOMER_ID_FIELD: customer_id,
            user_database.STRIPE_SUBSCRIPTION_ID_FIELD: subscription_id,
            user_database.STRIPE_SUBSCRIPTION_STATUS_FIELD: "active",
            user_database.STRIPE_SUBSCRIPTION_PRICE_ID_FIELD: subscription_price_id,
            "created_at": "2026-03-01T00:00:00+00:00",
            "updated_at": "2026-03-27T00:00:00+00:00",
        }
    )
