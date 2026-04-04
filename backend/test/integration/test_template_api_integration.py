"""Integration coverage for owner-managed API Fill endpoint lifecycle."""

from __future__ import annotations

import base64
from datetime import datetime, timezone

from fastapi.testclient import TestClient
import pytest

import backend.main as main
import backend.api.middleware.security as security_middleware
import backend.api.routes.template_api as template_api_routes
import backend.api.routes.template_api_public as template_api_public_routes
import backend.firebaseDB.fill_link_database as fill_link_database
import backend.firebaseDB.group_database as group_database
import backend.firebaseDB.signing_database as signing_database
import backend.firebaseDB.template_api_endpoint_database as template_api_endpoint_database
import backend.firebaseDB.template_database as template_database
import backend.firebaseDB.user_database as user_database
import backend.services.template_api_service as template_api_service
from backend.firebaseDB.firebase_service import RequestUser
from backend.test.integration.downgrade_test_support import seed_saved_form_inventory
from backend.test.unit.firebase._fakes import FakeFirestoreClient


AUTH_HEADERS = {"Authorization": "Bearer integration-token"}


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


@pytest.fixture
def qa_user() -> RequestUser:
    return RequestUser(
        uid="uid_integration",
        app_user_id="user_integration",
        email="integration@example.com",
        display_name="Integration QA",
        role="base",
    )


def _seed_template(
    firestore_client: FakeFirestoreClient,
    qa_user: RequestUser,
    *,
    fields: list[dict],
    fill_rules: dict | None = None,
) -> dict:
    firestore_client.collection(template_database.TEMPLATES_COLLECTION).document("tpl-1").seed(
        {
            "user_id": qa_user.app_user_id,
            "pdf_bucket_path": "gs://forms/patient-intake.pdf",
            "template_bucket_path": "gs://templates/patient-intake.json",
            "metadata": {
                "name": "Patient Intake",
                "fillRules": fill_rules or {"checkboxRules": []},
                "editorSnapshot": {"path": "gs://snapshots/editor.json"},
            },
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
        }
    )
    mock_fields = {
        "version": 1,
        "pageCount": 1,
        "pageSizes": {"1": {"width": 612, "height": 792}},
        "fields": fields,
    }
    return mock_fields


def _seed_owner_profile(
    firestore_client: FakeFirestoreClient,
    qa_user: RequestUser,
    *,
    role: str = user_database.ROLE_BASE,
) -> None:
    firestore_client.collection(user_database.USERS_COLLECTION).document(qa_user.app_user_id).seed(
        {
            "email": qa_user.email,
            "displayName": qa_user.display_name,
            user_database.ROLE_FIELD: role,
            user_database.OPENAI_CREDITS_FIELD: 10,
            user_database.OPENAI_CREDITS_BASE_CYCLE_FIELD: "2026-03",
            "created_at": "2026-03-28T00:00:00+00:00",
            "updated_at": "2026-03-28T00:00:00+00:00",
        }
    )


def _seed_locked_template_inventory(
    firestore_client: FakeFirestoreClient,
    qa_user: RequestUser,
    *,
    total_templates: int = 7,
) -> None:
    seed_saved_form_inventory(
        firestore_client,
        user_id=qa_user.app_user_id,
        total_templates=total_templates,
        metadata_builder=lambda template_number: {
            "name": f"Saved Form {template_number}",
            "fillRules": {"checkboxRules": []},
            "editorSnapshot": {"path": f"gs://snapshots/form-{template_number}.json"},
        },
    )


def _patch_template_api_runtime(
    mocker,
    qa_user: RequestUser,
    firestore_client: FakeFirestoreClient,
    *,
    editor_snapshot: dict,
) -> None:
    mocker.patch.object(security_middleware, "verify_token", return_value={"uid": qa_user.uid})
    mocker.patch.object(template_api_routes, "require_user", return_value=qa_user)
    mocker.patch.object(template_database, "get_firestore_client", return_value=firestore_client)
    mocker.patch.object(template_api_endpoint_database, "get_firestore_client", return_value=firestore_client)
    mocker.patch.object(user_database, "get_firestore_client", return_value=firestore_client)
    mocker.patch.object(fill_link_database, "get_firestore_client", return_value=firestore_client)
    mocker.patch.object(group_database, "get_firestore_client", return_value=firestore_client)
    mocker.patch.object(signing_database, "get_firestore_client", return_value=firestore_client)
    mocker.patch.object(template_api_service, "load_saved_form_editor_snapshot", return_value=editor_snapshot)
    mocker.patch.object(template_api_public_routes, "check_rate_limit", return_value=True)


def test_template_api_owner_lifecycle_persists_endpoint_snapshot(client: TestClient, mocker, qa_user: RequestUser) -> None:
    firestore_client = FakeFirestoreClient()
    firestore_client.collection(template_database.TEMPLATES_COLLECTION).document("tpl-1").seed(
        {
            "user_id": qa_user.app_user_id,
            "pdf_bucket_path": "gs://forms/patient-intake.pdf",
            "template_bucket_path": "gs://templates/patient-intake.json",
            "metadata": {
                "name": "Patient Intake",
                "fillRules": {
                    "checkboxRules": [
                        {
                            "databaseField": "consent_signed",
                            "groupKey": "consent_group",
                            "operation": "yes_no",
                            "trueOption": "yes",
                            "falseOption": "no",
                        }
                    ]
                },
                "editorSnapshot": {"path": "gs://snapshots/editor.json"},
            },
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
        }
    )
    _seed_owner_profile(firestore_client, qa_user)

    _patch_template_api_runtime(
        mocker,
        qa_user,
        firestore_client,
        editor_snapshot={
            "version": 1,
            "pageCount": 1,
            "pageSizes": {"1": {"width": 612, "height": 792}},
            "fields": [
                {"id": "field-1", "name": "full_name", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 100, "height": 20}},
                {
                    "id": "field-2",
                    "name": "i_consent_yes",
                    "type": "checkbox",
                    "page": 1,
                    "rect": {"x": 4, "y": 5, "width": 10, "height": 10},
                    "groupKey": "consent_group",
                    "optionKey": "yes",
                    "optionLabel": "Yes",
                },
                {
                    "id": "field-3",
                    "name": "i_consent_no",
                    "type": "checkbox",
                    "page": 1,
                    "rect": {"x": 16, "y": 5, "width": 10, "height": 10},
                    "groupKey": "consent_group",
                    "optionKey": "no",
                    "optionLabel": "No",
                },
            ],
        },
    )

    create_response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=AUTH_HEADERS,
    )

    assert create_response.status_code == 200
    create_payload = create_response.json()
    endpoint_id = create_payload["endpoint"]["id"]
    assert create_payload["created"] is True
    assert create_payload["secret"].startswith("dpa_live_")
    assert create_payload["schema"]["checkboxGroups"][0]["key"] == "consent_signed"

    stored_endpoint = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_ENDPOINTS_COLLECTION)
        .document(endpoint_id)
        .get()
        .to_dict()
    )
    assert stored_endpoint["template_id"] == "tpl-1"
    assert stored_endpoint["snapshot"]["sourcePdfPath"] == "gs://forms/patient-intake.pdf"
    assert stored_endpoint["snapshot"]["fields"][0]["name"] == "full_name"
    assert stored_endpoint["secret_hash"]
    assert stored_endpoint["secret_hash"] != create_payload["secret"]

    list_response = client.get("/api/template-api-endpoints?templateId=tpl-1", headers=AUTH_HEADERS)
    assert list_response.status_code == 200
    assert list_response.json()["endpoints"][0]["id"] == endpoint_id

    schema_response = client.get(f"/api/template-api-endpoints/{endpoint_id}/schema", headers=AUTH_HEADERS)
    assert schema_response.status_code == 200
    assert schema_response.json()["schema"]["exampleData"]["consent_signed"] is True

    rotate_response = client.post(f"/api/template-api-endpoints/{endpoint_id}/rotate", headers=AUTH_HEADERS)
    assert rotate_response.status_code == 200
    rotate_payload = rotate_response.json()
    assert rotate_payload["secret"].startswith("dpa_live_")
    assert rotate_payload["endpoint"]["id"] == endpoint_id

    revoked_response = client.post(f"/api/template-api-endpoints/{endpoint_id}/revoke", headers=AUTH_HEADERS)
    assert revoked_response.status_code == 200
    assert revoked_response.json()["endpoint"]["status"] == "revoked"

    refreshed_endpoint = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_ENDPOINTS_COLLECTION)
        .document(endpoint_id)
        .get()
        .to_dict()
    )
    assert refreshed_endpoint["status"] == "revoked"


def test_template_api_republish_updates_existing_active_snapshot_version(
    client: TestClient,
    mocker,
    qa_user: RequestUser,
) -> None:
    firestore_client = FakeFirestoreClient()
    firestore_client.collection(template_database.TEMPLATES_COLLECTION).document("tpl-1").seed(
        {
            "user_id": qa_user.app_user_id,
            "pdf_bucket_path": "gs://forms/patient-intake.pdf",
            "template_bucket_path": "gs://templates/patient-intake.json",
            "metadata": {
                "name": "Patient Intake",
                "fillRules": {"checkboxRules": []},
                "editorSnapshot": {"path": "gs://snapshots/editor.json"},
            },
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
        }
    )
    _seed_owner_profile(firestore_client, qa_user)

    _patch_template_api_runtime(
        mocker,
        qa_user,
        firestore_client,
        editor_snapshot={
            "version": 1,
            "pageCount": 1,
            "pageSizes": {"1": {"width": 612, "height": 792}},
            "fields": [
                {"id": "field-1", "name": "full_name", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 100, "height": 20}},
            ],
        },
    )

    snapshot_loader = mocker.patch.object(
        template_api_service,
        "load_saved_form_editor_snapshot",
        side_effect=[
            {
                "version": 1,
                "pageCount": 1,
                "pageSizes": {"1": {"width": 612, "height": 792}},
                "fields": [
                    {"id": "field-1", "name": "full_name", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 100, "height": 20}},
                ],
            },
            {
                "version": 1,
                "pageCount": 1,
                "pageSizes": {"1": {"width": 612, "height": 792}},
                "fields": [
                    {"id": "field-1", "name": "full_name", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 100, "height": 20}},
                    {"id": "field-2", "name": "dob", "type": "date", "page": 1, "rect": {"x": 5, "y": 30, "width": 80, "height": 18}},
                ],
            },
        ],
    )

    first_response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=AUTH_HEADERS,
    )
    endpoint_id = first_response.json()["endpoint"]["id"]

    second_response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "editable"},
        headers=AUTH_HEADERS,
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.json()["created"] is False
    assert second_response.json()["secret"] is None
    assert second_response.json()["endpoint"]["id"] == endpoint_id
    assert second_response.json()["endpoint"]["snapshotVersion"] == 2
    assert second_response.json()["schema"]["defaultExportMode"] == "editable"
    assert second_response.json()["schema"]["fields"] == [
        {"key": "dob", "fieldName": "dob", "type": "date", "page": 1},
        {"key": "full_name", "fieldName": "full_name", "type": "text", "page": 1},
    ]
    assert snapshot_loader.call_count == 2


def test_template_api_public_schema_and_fill_use_scoped_basic_auth(
    client: TestClient,
    mocker,
    qa_user: RequestUser,
    tmp_path,
) -> None:
    firestore_client = FakeFirestoreClient()
    firestore_client.collection(template_database.TEMPLATES_COLLECTION).document("tpl-1").seed(
        {
            "user_id": qa_user.app_user_id,
            "pdf_bucket_path": "gs://forms/patient-intake.pdf",
            "template_bucket_path": "gs://templates/patient-intake.json",
            "metadata": {
                "name": "Patient Intake",
                "fillRules": {
                    "checkboxRules": [
                        {
                            "databaseField": "consent_signed",
                            "groupKey": "consent_group",
                            "operation": "yes_no",
                            "trueOption": "yes",
                            "falseOption": "no",
                        }
                    ]
                },
                "editorSnapshot": {"path": "gs://snapshots/editor.json"},
            },
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
        }
    )
    _seed_owner_profile(firestore_client, qa_user)

    _patch_template_api_runtime(
        mocker,
        qa_user,
        firestore_client,
        editor_snapshot={
            "version": 1,
            "pageCount": 1,
            "pageSizes": {"1": {"width": 612, "height": 792}},
            "fields": [
                {"id": "field-1", "name": "full_name", "type": "text", "page": 1, "rect": {"x": 1, "y": 2, "width": 100, "height": 20}},
                {
                    "id": "field-2",
                    "name": "agree_to_terms",
                    "type": "checkbox",
                    "page": 1,
                    "rect": {"x": 4, "y": 5, "width": 10, "height": 10},
                },
                {
                    "id": "field-3",
                    "name": "i_consent_yes",
                    "type": "checkbox",
                    "page": 1,
                    "rect": {"x": 4, "y": 5, "width": 10, "height": 10},
                    "groupKey": "consent_group",
                    "optionKey": "yes",
                    "optionLabel": "Yes",
                },
                {
                    "id": "field-4",
                    "name": "i_consent_no",
                    "type": "checkbox",
                    "page": 1,
                    "rect": {"x": 16, "y": 5, "width": 10, "height": 10},
                    "groupKey": "consent_group",
                    "optionKey": "no",
                    "optionLabel": "No",
                },
            ],
        },
    )

    publish_response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=AUTH_HEADERS,
    )
    assert publish_response.status_code == 200
    publish_payload = publish_response.json()
    endpoint_id = publish_payload["endpoint"]["id"]
    secret = publish_payload["secret"]
    basic_headers = {
        "Authorization": "Basic " + base64.b64encode(f"{secret}:".encode("utf-8")).decode("ascii")
    }

    schema_response = client.get(f"/api/v1/fill/{endpoint_id}/schema", headers=basic_headers)
    assert schema_response.status_code == 200
    assert schema_response.headers["cache-control"] == "private, no-store"
    assert schema_response.json()["schema"]["checkboxFields"][0]["key"] == "agree_to_terms"
    assert schema_response.json()["schema"]["checkboxGroups"][0]["key"] == "consent_signed"

    output_path = tmp_path / "filled.pdf"
    output_path.write_bytes(b"%PDF-1.4\n%integration\n")
    cleanup_targets = [output_path]
    materialize_mock = mocker.patch.object(
        template_api_public_routes,
        "materialize_template_api_snapshot",
        return_value=(output_path, cleanup_targets, "patient-intake.pdf"),
    )

    fill_response = client.post(
        f"/api/v1/fill/{endpoint_id}.pdf",
        json={
            "data": {
                "full_name": "Ada Lovelace",
                "agree_to_terms": True,
                "consent_signed": False,
            },
            "strict": True,
        },
        headers=basic_headers,
    )
    assert fill_response.status_code == 200
    assert fill_response.headers["content-type"] == "application/pdf"
    assert fill_response.headers["cache-control"] == "private, no-store"
    materialize_mock.assert_called_once()

    endpoint_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_ENDPOINTS_COLLECTION)
        .document(endpoint_id)
        .get()
        .to_dict()
    )
    assert endpoint_doc["usage_count"] == 1
    assert endpoint_doc["last_used_at"]
    assert endpoint_doc["current_month_usage_count"] == 1

    monthly_usage_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_USAGE_COUNTERS_COLLECTION)
        .document(f"{qa_user.app_user_id}__{endpoint_doc['current_usage_month']}")
        .get()
        .to_dict()
    )
    assert monthly_usage_doc["request_count"] == 1

    events = template_api_endpoint_database.list_template_api_endpoint_events(endpoint_id, user_id=qa_user.app_user_id)
    assert any(event.event_type == "published" for event in events)
    assert any(event.event_type == "fill_succeeded" for event in events)


def test_template_api_public_fill_preserves_blank_scalar_values_end_to_end(
    client: TestClient,
    mocker,
    qa_user: RequestUser,
    tmp_path,
) -> None:
    firestore_client = FakeFirestoreClient()
    editor_snapshot = _seed_template(
        firestore_client,
        qa_user,
        fields=[
            {
                "id": "field-1",
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": {"x": 1, "y": 2, "width": 100, "height": 20},
            }
        ],
    )
    _patch_template_api_runtime(
        mocker,
        qa_user,
        firestore_client,
        editor_snapshot=editor_snapshot,
    )

    publish_response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=AUTH_HEADERS,
    )
    assert publish_response.status_code == 200
    publish_payload = publish_response.json()
    endpoint_id = publish_payload["endpoint"]["id"]
    secret = publish_payload["secret"]
    basic_headers = {
        "Authorization": "Basic " + base64.b64encode(f"{secret}:".encode("utf-8")).decode("ascii")
    }

    output_path = tmp_path / "blank-filled.pdf"
    output_path.write_bytes(b"%PDF-1.4\n%blank\n")
    cleanup_targets = [output_path]
    materialize_mock = mocker.patch.object(
        template_api_public_routes,
        "materialize_template_api_snapshot",
        return_value=(output_path, cleanup_targets, "blank-filled.pdf"),
    )

    fill_response = client.post(
        f"/api/v1/fill/{endpoint_id}.pdf",
        json={"data": {"full_name": ""}, "strict": True},
        headers=basic_headers,
    )

    assert fill_response.status_code == 200
    materialize_mock.assert_called_once()
    assert materialize_mock.call_args.kwargs["data"] == {"full_name": ""}
    assert materialize_mock.call_args.kwargs["export_mode"] is None

    endpoint_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_ENDPOINTS_COLLECTION)
        .document(endpoint_id)
        .get()
        .to_dict()
    )
    assert endpoint_doc["usage_count"] == 1
    assert endpoint_doc["current_month_usage_count"] == 1

    month_key = endpoint_doc["current_usage_month"]
    monthly_usage_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_USAGE_COUNTERS_COLLECTION)
        .document(f"{qa_user.app_user_id}__{month_key}")
        .get()
        .to_dict()
    )
    assert monthly_usage_doc["request_count"] == 1


def test_template_api_public_fill_enforces_real_base_monthly_quota_and_records_block_event(
    client: TestClient,
    mocker,
    qa_user: RequestUser,
    tmp_path,
) -> None:
    firestore_client = FakeFirestoreClient()
    editor_snapshot = _seed_template(
        firestore_client,
        qa_user,
        fields=[
            {
                "id": "field-1",
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": {"x": 1, "y": 2, "width": 100, "height": 20},
            }
        ],
    )
    _seed_owner_profile(firestore_client, qa_user, role=user_database.ROLE_BASE)
    _patch_template_api_runtime(
        mocker,
        qa_user,
        firestore_client,
        editor_snapshot=editor_snapshot,
    )
    mocker.patch.object(template_api_public_routes, "_current_usage_month_key", return_value="2026-03")
    firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_USAGE_COUNTERS_COLLECTION).document(
        f"{qa_user.app_user_id}__2026-03"
    ).seed(
        {
            "user_id": qa_user.app_user_id,
            "month_key": "2026-03",
            "request_count": 249,
            "created_at": "2026-03-01T00:00:00+00:00",
            "updated_at": "2026-03-27T00:00:00+00:00",
        }
    )

    publish_response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=AUTH_HEADERS,
    )
    assert publish_response.status_code == 200
    publish_payload = publish_response.json()
    endpoint_id = publish_payload["endpoint"]["id"]
    secret = publish_payload["secret"]
    basic_headers = {
        "Authorization": "Basic " + base64.b64encode(f"{secret}:".encode("utf-8")).decode("ascii")
    }

    materialized_count = {"value": 0}

    def _materialize_snapshot(*_args, **_kwargs):
        materialized_count["value"] += 1
        output_path = tmp_path / f"quota-fill-{materialized_count['value']}.pdf"
        output_path.write_bytes(b"%PDF-1.4\n%quota\n")
        return output_path, [output_path], "patient-intake.pdf"

    mocker.patch.object(
        template_api_public_routes,
        "materialize_template_api_snapshot",
        side_effect=_materialize_snapshot,
    )

    accepted_response = client.post(
        f"/api/v1/fill/{endpoint_id}.pdf",
        json={"data": {"full_name": "Ada Lovelace"}, "strict": True},
        headers=basic_headers,
    )
    blocked_response = client.post(
        f"/api/v1/fill/{endpoint_id}.pdf",
        json={"data": {"full_name": "Grace Hopper"}, "strict": True},
        headers=basic_headers,
    )

    assert accepted_response.status_code == 200
    assert blocked_response.status_code == 429
    assert "monthly api fill request limit" in blocked_response.text.lower()

    endpoint_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_ENDPOINTS_COLLECTION)
        .document(endpoint_id)
        .get()
        .to_dict()
    )
    assert endpoint_doc["usage_count"] == 1
    assert endpoint_doc["current_month_usage_count"] == 1
    assert endpoint_doc["current_usage_month"] == "2026-03"

    monthly_usage_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_USAGE_COUNTERS_COLLECTION)
        .document(f"{qa_user.app_user_id}__2026-03")
        .get()
        .to_dict()
    )
    assert monthly_usage_doc["request_count"] == 250

    events = template_api_endpoint_database.list_template_api_endpoint_events(endpoint_id, user_id=qa_user.app_user_id)
    assert any(event.event_type == "fill_succeeded" for event in events)
    assert any(event.event_type == "fill_quota_blocked" for event in events)


def test_template_api_publish_blocks_locked_saved_forms_after_downgrade(
    client: TestClient,
    mocker,
    qa_user: RequestUser,
) -> None:
    firestore_client = FakeFirestoreClient()
    _seed_owner_profile(firestore_client, qa_user, role=user_database.ROLE_BASE)
    _seed_locked_template_inventory(firestore_client, qa_user)

    mocker.patch.object(security_middleware, "verify_token", return_value={"uid": qa_user.uid})
    mocker.patch.object(template_api_routes, "require_user", return_value=qa_user)
    for module in (
        template_database,
        template_api_endpoint_database,
        user_database,
        fill_link_database,
        group_database,
        signing_database,
    ):
        mocker.patch.object(module, "get_firestore_client", return_value=firestore_client)

    response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "form-6", "exportMode": "flat"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 409
    assert "locked on the base plan" in response.text.lower()
    assert (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_ENDPOINTS_COLLECTION)
        .where("user_id", "==", qa_user.app_user_id)
        .get()
        == []
    )


def test_template_api_public_fill_starts_new_month_usage_bucket_after_prior_month_exhaustion(
    client: TestClient,
    mocker,
    qa_user: RequestUser,
    tmp_path,
) -> None:
    firestore_client = FakeFirestoreClient()
    editor_snapshot = _seed_template(
        firestore_client,
        qa_user,
        fields=[
            {
                "id": "field-1",
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": {"x": 1, "y": 2, "width": 100, "height": 20},
            }
        ],
    )
    _seed_owner_profile(firestore_client, qa_user, role=user_database.ROLE_BASE)
    _patch_template_api_runtime(
        mocker,
        qa_user,
        firestore_client,
        editor_snapshot=editor_snapshot,
    )
    mocker.patch.object(template_api_public_routes, "_current_usage_month_key", return_value="2026-04")
    firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_USAGE_COUNTERS_COLLECTION).document(
        f"{qa_user.app_user_id}__2026-03"
    ).seed(
        {
            "user_id": qa_user.app_user_id,
            "month_key": "2026-03",
            "request_count": 250,
            "created_at": "2026-03-01T00:00:00+00:00",
            "updated_at": "2026-03-31T00:00:00+00:00",
        }
    )

    publish_response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=AUTH_HEADERS,
    )
    assert publish_response.status_code == 200
    publish_payload = publish_response.json()
    endpoint_id = publish_payload["endpoint"]["id"]
    secret = publish_payload["secret"]
    basic_headers = {
        "Authorization": "Basic " + base64.b64encode(f"{secret}:".encode("utf-8")).decode("ascii")
    }

    output_path = tmp_path / "rolled-over-filled.pdf"
    output_path.write_bytes(b"%PDF-1.4\n%rollover\n")
    cleanup_targets = [output_path]
    mocker.patch.object(
        template_api_public_routes,
        "materialize_template_api_snapshot",
        return_value=(output_path, cleanup_targets, "patient-intake.pdf"),
    )

    fill_response = client.post(
        f"/api/v1/fill/{endpoint_id}.pdf",
        json={"data": {"full_name": "Ada Lovelace"}, "strict": True},
        headers=basic_headers,
    )

    assert fill_response.status_code == 200
    previous_month_usage_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_USAGE_COUNTERS_COLLECTION)
        .document(f"{qa_user.app_user_id}__2026-03")
        .get()
        .to_dict()
    )
    current_month_usage_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_USAGE_COUNTERS_COLLECTION)
        .document(f"{qa_user.app_user_id}__2026-04")
        .get()
        .to_dict()
    )
    assert previous_month_usage_doc["request_count"] == 250
    assert current_month_usage_doc["request_count"] == 1

    endpoint_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_ENDPOINTS_COLLECTION)
        .document(endpoint_id)
        .get()
        .to_dict()
    )
    assert endpoint_doc["current_usage_month"] == "2026-04"
    assert endpoint_doc["current_month_usage_count"] == 1


def test_template_api_public_fill_allows_only_one_new_month_request_after_rollover_from_exhausted_base_quota(
    client: TestClient,
    mocker,
    qa_user: RequestUser,
    tmp_path,
) -> None:
    firestore_client = FakeFirestoreClient()
    editor_snapshot = _seed_template(
        firestore_client,
        qa_user,
        fields=[
            {
                "id": "field-1",
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": {"x": 1, "y": 2, "width": 100, "height": 20},
            }
        ],
    )
    _seed_owner_profile(firestore_client, qa_user, role=user_database.ROLE_BASE)
    _patch_template_api_runtime(
        mocker,
        qa_user,
        firestore_client,
        editor_snapshot=editor_snapshot,
    )
    mocker.patch.object(template_api_public_routes, "_current_usage_month_key", return_value="2026-04")
    mocker.patch.object(template_api_public_routes, "resolve_template_api_requests_monthly_limit", return_value=1)
    firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_USAGE_COUNTERS_COLLECTION).document(
        f"{qa_user.app_user_id}__2026-03"
    ).seed(
        {
            "user_id": qa_user.app_user_id,
            "month_key": "2026-03",
            "request_count": 250,
            "created_at": "2026-03-01T00:00:00+00:00",
            "updated_at": "2026-03-31T00:00:00+00:00",
        }
    )

    publish_response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=AUTH_HEADERS,
    )
    assert publish_response.status_code == 200
    publish_payload = publish_response.json()
    endpoint_id = publish_payload["endpoint"]["id"]
    secret = publish_payload["secret"]
    basic_headers = {
        "Authorization": "Basic " + base64.b64encode(f"{secret}:".encode("utf-8")).decode("ascii")
    }

    materialized_count = {"value": 0}

    def _materialize_snapshot(*_args, **_kwargs):
        materialized_count["value"] += 1
        output_path = tmp_path / f"rollover-boundary-{materialized_count['value']}.pdf"
        output_path.write_bytes(b"%PDF-1.4\n%rollover-boundary\n")
        return output_path, [output_path], "patient-intake.pdf"

    mocker.patch.object(
        template_api_public_routes,
        "materialize_template_api_snapshot",
        side_effect=_materialize_snapshot,
    )

    first = client.post(
        f"/api/v1/fill/{endpoint_id}.pdf",
        json={"data": {"full_name": "Ada Lovelace"}, "strict": True},
        headers=basic_headers,
    )
    second = client.post(
        f"/api/v1/fill/{endpoint_id}.pdf",
        json={"data": {"full_name": "Grace Hopper"}, "strict": True},
        headers=basic_headers,
    )

    assert first.status_code == 200
    assert second.status_code == 429
    assert "monthly api fill request limit" in second.text.lower()

    previous_month_usage_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_USAGE_COUNTERS_COLLECTION)
        .document(f"{qa_user.app_user_id}__2026-03")
        .get()
        .to_dict()
    )
    current_month_usage_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_USAGE_COUNTERS_COLLECTION)
        .document(f"{qa_user.app_user_id}__2026-04")
        .get()
        .to_dict()
    )
    assert previous_month_usage_doc["request_count"] == 250
    assert current_month_usage_doc["request_count"] == 1

    endpoint_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_ENDPOINTS_COLLECTION)
        .document(endpoint_id)
        .get()
        .to_dict()
    )
    assert endpoint_doc["usage_count"] == 1
    assert endpoint_doc["current_usage_month"] == "2026-04"
    assert endpoint_doc["current_month_usage_count"] == 1

    events = template_api_endpoint_database.list_template_api_endpoint_events(endpoint_id, user_id=qa_user.app_user_id)
    assert any(event.event_type == "fill_succeeded" for event in events)
    assert any(event.event_type == "fill_quota_blocked" for event in events)


def test_template_api_public_runtime_failures_do_not_consume_usage_or_monthly_quota(
    client: TestClient,
    mocker,
    qa_user: RequestUser,
) -> None:
    firestore_client = FakeFirestoreClient()
    editor_snapshot = _seed_template(
        firestore_client,
        qa_user,
        fields=[
            {
                "id": "field-1",
                "name": "full_name",
                "type": "text",
                "page": 1,
                "rect": {"x": 1, "y": 2, "width": 100, "height": 20},
            }
        ],
    )
    _patch_template_api_runtime(
        mocker,
        qa_user,
        firestore_client,
        editor_snapshot=editor_snapshot,
    )

    publish_response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=AUTH_HEADERS,
    )
    assert publish_response.status_code == 200
    publish_payload = publish_response.json()
    endpoint_id = publish_payload["endpoint"]["id"]
    secret = publish_payload["secret"]
    basic_headers = {
        "Authorization": "Basic " + base64.b64encode(f"{secret}:".encode("utf-8")).decode("ascii")
    }

    mocker.patch.object(
        template_api_public_routes,
        "materialize_template_api_snapshot",
        side_effect=RuntimeError("renderer unavailable"),
    )

    fill_response = client.post(
        f"/api/v1/fill/{endpoint_id}.pdf",
        json={"data": {"full_name": "Ada Lovelace"}, "strict": True},
        headers=basic_headers,
    )

    assert fill_response.status_code == 500
    assert fill_response.json() == {"detail": "API Fill failed while generating the PDF."}

    endpoint_doc = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_ENDPOINTS_COLLECTION)
        .document(endpoint_id)
        .get()
        .to_dict()
    )
    assert endpoint_doc["usage_count"] == 0
    assert endpoint_doc["current_month_usage_count"] == 0
    assert endpoint_doc["runtime_failure_count"] == 1
    assert endpoint_doc["last_failure_reason"] == "unexpected_runtime_error"

    usage_month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    usage_snapshot = (
        firestore_client.collection(template_api_endpoint_database.TEMPLATE_API_USAGE_COUNTERS_COLLECTION)
        .document(f"{qa_user.app_user_id}__{usage_month_key}")
        .get()
    )
    assert usage_snapshot.exists is False

    events = template_api_endpoint_database.list_template_api_endpoint_events(endpoint_id, user_id=qa_user.app_user_id)
    assert any(event.event_type == "published" for event in events)
    assert any(event.event_type == "fill_runtime_failed" for event in events)
    assert all(event.event_type != "fill_succeeded" for event in events)
