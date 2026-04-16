from __future__ import annotations

import base64

from backend.firebaseDB.template_api_endpoint_database import (
    TemplateApiEndpointRecord,
    TemplateApiMonthlyLimitExceededError,
)
from fastapi import HTTPException


def _basic_auth(secret: str) -> dict[str, str]:
    token = base64.b64encode(f"{secret}:".encode("utf-8")).decode("ascii")
    return {"Authorization": f"Basic {token}"}


def _endpoint_record(
    *,
    status: str = "active",
    key_prefix: str = "dpa_live_secret",
    secret_hash: str = "hash",
    snapshot: dict | None = None,
    scope_type: str = "template",
    template_id: str = "tpl-1",
    group_id: str | None = None,
    group_name: str | None = None,
) -> TemplateApiEndpointRecord:
    return TemplateApiEndpointRecord(
        id="tep-1",
        user_id="user_base",
        template_id=template_id,
        template_name="Patient Intake",
        status=status,
        snapshot_version=2,
        key_prefix=key_prefix,
        secret_hash=secret_hash,
        snapshot=snapshot
        or {
            "version": 1,
            "templateName": "Patient Intake",
            "defaultExportMode": "flat",
            "fields": [{"name": "full_name", "type": "text", "page": 1, "rect": [1, 2, 3, 4]}],
            "checkboxRules": [],
            "textTransformRules": [],
            "radioGroups": [],
        },
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
        published_at="2024-01-01T00:00:00+00:00",
        last_used_at=None,
        usage_count=0,
        current_usage_month="2026-03",
        current_month_usage_count=0,
        auth_failure_count=0,
        validation_failure_count=0,
        runtime_failure_count=0,
        suspicious_failure_count=0,
        last_failure_at=None,
        last_failure_reason=None,
        audit_event_count=0,
        scope_type=scope_type,
        group_id=group_id,
        group_name=group_name,
    )


def _group_endpoint_record() -> TemplateApiEndpointRecord:
    bundle = {
        "snapshotFormatVersion": 1,
        "frozenAt": "2026-04-13T00:00:00Z",
        "schema": {
            "groupId": "grp-1",
            "fields": [
                {
                    "canonicalKey": "patient_name",
                    "label": "Patient Name",
                    "type": "text",
                    "required": False,
                    "allowedValues": None,
                    "perTemplateBindings": [
                        {"templateId": "tpl-1", "fieldName": "patient_name", "sourceField": "patient_name", "sourceType": "pdf_field"},
                        {"templateId": "tpl-2", "fieldName": "patient_name", "sourceField": "patient_name", "sourceType": "pdf_field"},
                    ],
                    "sourceFillLinkType": "text",
                },
            ],
        },
        "templateSnapshots": [
            {"templateId": "tpl-1", "templateName": "I-130", "snapshot": {"sourcePdfPath": "gs://forms/tpl-1.pdf", "pageCount": 1}},
            {"templateId": "tpl-2", "templateName": "I-130A", "snapshot": {"sourcePdfPath": "gs://forms/tpl-2.pdf", "pageCount": 2}},
        ],
        "snapshotKind": "group",
        "templateApiSnapshotVersion": 1,
    }
    return _endpoint_record(
        snapshot=bundle,
        scope_type="group",
        template_id="",
        group_id="grp-1",
        group_name="I-130 Spouse Packet",
    )


def test_public_template_api_schema_and_fill_route(
    client,
    app_main,
    mocker,
    tmp_path,
) -> None:
    output_path = tmp_path / "filled.pdf"
    output_path.write_bytes(b"%PDF-1.4\n%mock\n")
    output_size = output_path.stat().st_size
    cleanup_targets = [output_path]

    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    mocker.patch.object(
        app_main,
        "build_template_api_schema",
        return_value={"fields": [{"key": "full_name"}], "checkboxFields": [], "checkboxGroups": [], "radioGroups": []},
    )
    resolve_data_mock = mocker.patch.object(
        app_main,
        "resolve_template_api_request_data",
        return_value={"full_name": "Ada Lovelace"},
    )
    materialize_mock = mocker.patch.object(
        app_main,
        "materialize_template_api_snapshot",
        return_value=(output_path, cleanup_targets, "patient-intake.pdf"),
    )
    record_success_mock = mocker.patch.object(app_main, "record_template_api_endpoint_success", return_value=_endpoint_record())
    mocker.patch.object(app_main, "_current_usage_month_key", return_value="2026-03")

    schema_response = client.get("/api/v1/fill/tep-1/schema", headers=_basic_auth("dpa_live_secret"))

    assert schema_response.status_code == 200
    assert schema_response.headers["cache-control"] == "private, no-store"
    assert schema_response.json() == {
        "endpoint": {
            "id": "tep-1",
            "scopeType": "template",
            "templateName": "Patient Intake",
            "groupName": None,
            "status": "active",
            "snapshotVersion": 2,
            "fillPath": "/api/v1/fill/tep-1.pdf",
            "schemaPath": "/api/v1/fill/tep-1/schema",
        },
        "schema": {"fields": [{"key": "full_name"}], "checkboxFields": [], "checkboxGroups": [], "radioGroups": []},
    }

    fill_response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={
            "data": {"full_name": "Ada Lovelace"},
            "filename": "patient-intake-final.pdf",
            "exportMode": "editable",
            "strict": True,
        },
        headers=_basic_auth("dpa_live_secret"),
    )

    assert fill_response.status_code == 200
    assert fill_response.headers["content-type"] == "application/pdf"
    assert fill_response.headers["cache-control"] == "private, no-store"
    resolve_data_mock.assert_called_once_with(
        _endpoint_record().snapshot,
        {"full_name": "Ada Lovelace"},
        strict=True,
    )
    materialize_mock.assert_called_once_with(
        _endpoint_record().snapshot,
        data={"full_name": "Ada Lovelace"},
        export_mode="editable",
        filename="patient-intake-final.pdf",
    )
    record_success_mock.assert_called_once()
    assert record_success_mock.call_args.args == ("tep-1",)
    assert record_success_mock.call_args.kwargs["month_key"] == "2026-03"
    assert record_success_mock.call_args.kwargs["monthly_limit"] == 250
    assert record_success_mock.call_args.kwargs["metadata"]["strict"] is True
    assert record_success_mock.call_args.kwargs["metadata"]["responseBytes"] == output_size


def test_public_template_api_fill_requires_valid_basic_auth(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    get_metadata_mock = mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=None)
    get_endpoint_mock = mocker.patch.object(app_main, "get_template_api_endpoint_public")

    response = client.post("/api/v1/fill/tep-1.pdf", json={"data": {"full_name": "Ada Lovelace"}})

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == 'Basic realm="API Fill"'
    get_metadata_mock.assert_not_called()
    get_endpoint_mock.assert_not_called()


def test_public_template_api_fill_preserves_auth_error_when_telemetry_writes_fail(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "record_template_api_endpoint_failure", side_effect=RuntimeError("firestore unavailable"))
    mocker.patch.object(app_main, "create_template_api_endpoint_event", side_effect=RuntimeError("firestore unavailable"))

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"full_name": "Ada Lovelace"}},
        headers=_basic_auth("dpa_live_other_secret"),
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == 'Basic realm="API Fill"'


def test_public_template_api_fill_skips_endpoint_auth_failure_bucket_for_missing_endpoint(client, app_main, mocker) -> None:
    seen_keys: list[str] = []

    def _record_rate_limit_key(key: str, *, limit: int, window_seconds: int, fail_closed: bool = False) -> bool:
        seen_keys.append(key)
        return True

    mocker.patch.object(app_main, "check_rate_limit", side_effect=_record_rate_limit_key)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=None)
    record_failure_mock = mocker.patch.object(app_main, "record_template_api_endpoint_failure")
    create_event_mock = mocker.patch.object(app_main, "create_template_api_endpoint_event")

    response = client.post(
        "/api/v1/fill/does-not-exist.pdf",
        json={"data": {"full_name": "Ada Lovelace"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == 'Basic realm="API Fill"'
    assert all("auth_failures:endpoint:" not in key for key in seen_keys)
    record_failure_mock.assert_not_called()
    create_event_mock.assert_not_called()


def test_public_template_api_schema_skips_endpoint_auth_failure_bucket_for_missing_endpoint(client, app_main, mocker) -> None:
    seen_keys: list[str] = []

    def _record_rate_limit_key(key: str, *, limit: int, window_seconds: int, fail_closed: bool = False) -> bool:
        seen_keys.append(key)
        return True

    mocker.patch.object(app_main, "check_rate_limit", side_effect=_record_rate_limit_key)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=None)
    record_failure_mock = mocker.patch.object(app_main, "record_template_api_endpoint_failure")
    create_event_mock = mocker.patch.object(app_main, "create_template_api_endpoint_event")

    response = client.get(
        "/api/v1/fill/does-not-exist/schema",
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == 'Basic realm="API Fill"'
    assert all("auth_failures:endpoint:" not in key for key in seen_keys)
    record_failure_mock.assert_not_called()
    create_event_mock.assert_not_called()


def test_public_template_api_fill_authenticates_before_body_parsing(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    get_metadata_mock = mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=None)
    get_endpoint_mock = mocker.patch.object(app_main, "get_template_api_endpoint_public")

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        content='{"data":',
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == 'Basic realm="API Fill"'
    get_metadata_mock.assert_not_called()
    get_endpoint_mock.assert_not_called()


def test_public_template_api_fill_rejects_malformed_basic_auth_without_metadata_lookup(client, app_main, mocker) -> None:
    malformed_token = base64.b64encode(b"dpa_live_secret:not-blank").decode("ascii")
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    get_metadata_mock = mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=None)
    get_endpoint_mock = mocker.patch.object(app_main, "get_template_api_endpoint_public")

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"full_name": "Ada Lovelace"}},
        headers={"Authorization": f"Basic {malformed_token}"},
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == 'Basic realm="API Fill"'
    get_metadata_mock.assert_not_called()
    get_endpoint_mock.assert_not_called()


def test_public_template_api_fill_blocks_disallowed_browser_origins(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "resolve_cors_origins", return_value=["https://app.example.com"])
    get_endpoint_mock = mocker.patch.object(app_main, "get_template_api_endpoint_public")

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        content='{"data":{"full_name":"Ada Lovelace"}}',
        headers={
            **_basic_auth("dpa_live_secret"),
            "Content-Type": "application/json",
            "Origin": "https://evil.example.com",
        },
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Origin not allowed."}
    get_endpoint_mock.assert_not_called()


def test_public_template_api_fill_rejects_wrong_key_prefix_before_snapshot_read(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(
        app_main,
        "get_template_api_endpoint_public_metadata",
        return_value=_endpoint_record(key_prefix="dpa_live_expected"),
    )
    get_endpoint_mock = mocker.patch.object(app_main, "get_template_api_endpoint_public")
    verify_secret_mock = mocker.patch.object(app_main, "verify_template_api_secret")

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"full_name": "Ada Lovelace"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 401
    get_endpoint_mock.assert_not_called()
    verify_secret_mock.assert_not_called()


def test_public_template_api_fill_requires_json_content_type(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    resolve_data_mock = mocker.patch.object(app_main, "resolve_template_api_request_data")

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        content='{"data":{"full_name":"Ada Lovelace"}}',
        headers={
            **_basic_auth("dpa_live_secret"),
            "Content-Type": "text/plain",
        },
    )

    assert response.status_code == 415
    assert response.json() == {"detail": "API Fill requests must use application/json."}
    resolve_data_mock.assert_not_called()


def test_public_template_api_fill_rejects_unknown_top_level_request_fields(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    record_failure_mock = mocker.patch.object(app_main, "record_template_api_endpoint_failure", return_value=_endpoint_record())
    resolve_data_mock = mocker.patch.object(app_main, "resolve_template_api_request_data")

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={
            "data": {"full_name": "Ada Lovelace"},
            "export_mode": "editable",
        },
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": [
            {
                "loc": ["export_mode"],
                "msg": "Extra inputs are not permitted",
                "type": "extra_forbidden",
            }
        ]
    }
    record_failure_mock.assert_called_once()
    resolve_data_mock.assert_not_called()


def test_public_template_api_schema_rejects_conflicting_published_snapshot(client, app_main, mocker) -> None:
    conflicting_snapshot = {
        "version": 1,
        "defaultExportMode": "flat",
        "fields": [
            {"name": "consent_group", "type": "text", "page": 1, "rect": [1, 2, 3, 4]},
            {
                "name": "consent_yes",
                "type": "checkbox",
                "page": 1,
                "rect": [1, 2, 3, 4],
                "groupKey": "consent_group",
                "optionKey": "yes",
                "optionLabel": "Yes",
            },
            {
                "name": "consent_no",
                "type": "checkbox",
                "page": 1,
                "rect": [1, 2, 3, 4],
                "groupKey": "consent_group",
                "optionKey": "no",
                "optionLabel": "No",
            },
        ],
        "checkboxRules": [],
        "textTransformRules": [],
        "radioGroups": [],
    }

    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record(snapshot=conflicting_snapshot))
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record(snapshot=conflicting_snapshot))
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)

    response = client.get(
        "/api/v1/fill/tep-1/schema",
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 500
    assert response.json() == {
        "detail": "Published API Fill schema is invalid. Ask the template owner to republish the endpoint."
    }


def test_public_template_api_fill_does_not_store_raw_payload_values_in_validation_failures(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    record_failure_mock = mocker.patch.object(app_main, "record_template_api_endpoint_failure", return_value=_endpoint_record())

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": ["123-45-6789", "alice@example.com"]},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": [
            {
                "loc": ["data"],
                "msg": "Input should be a valid dictionary",
                "type": "dict_type",
            }
        ]
    }
    stored_reason = record_failure_mock.call_args.kwargs["reason"]
    assert "123-45-6789" not in stored_reason
    assert "alice@example.com" not in stored_reason


def test_public_template_api_fill_treats_conflicting_published_schema_as_runtime_failure(client, app_main, mocker) -> None:
    conflicting_snapshot = {
        "version": 1,
        "defaultExportMode": "flat",
        "fields": [
            {"name": "consent_group", "type": "text", "page": 1, "rect": [1, 2, 3, 4]},
            {
                "name": "consent_yes",
                "type": "checkbox",
                "page": 1,
                "rect": [1, 2, 3, 4],
                "groupKey": "consent_group",
                "optionKey": "yes",
                "optionLabel": "Yes",
            },
            {
                "name": "consent_no",
                "type": "checkbox",
                "page": 1,
                "rect": [1, 2, 3, 4],
                "groupKey": "consent_group",
                "optionKey": "no",
                "optionLabel": "No",
            },
        ],
        "checkboxRules": [],
        "textTransformRules": [],
        "radioGroups": [],
    }

    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record(snapshot=conflicting_snapshot))
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record(snapshot=conflicting_snapshot))
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    runtime_failure_mock = mocker.patch.object(app_main, "_record_runtime_failure", return_value=None)
    validation_failure_mock = mocker.patch.object(app_main, "_record_failure_counters", return_value=None)

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"consent_group": ["yes"]}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 500
    assert "conflicting keys after normalization" in response.json()["detail"]
    runtime_failure_mock.assert_called_once()
    validation_failure_mock.assert_not_called()


def test_public_template_api_fill_requires_data_top_level_field(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    record_failure_mock = mocker.patch.object(app_main, "record_template_api_endpoint_failure", return_value=_endpoint_record())
    resolve_data_mock = mocker.patch.object(app_main, "resolve_template_api_request_data")

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"fields": {"full_name": "Ada Lovelace"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 422
    record_failure_mock.assert_called_once()
    resolve_data_mock.assert_not_called()


def test_public_template_api_fill_rejects_misspelled_strict_flag(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    record_failure_mock = mocker.patch.object(app_main, "record_template_api_endpoint_failure", return_value=_endpoint_record())
    resolve_data_mock = mocker.patch.object(app_main, "resolve_template_api_request_data")

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"full_name": "Ada Lovelace"}, "stict": True},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 422
    record_failure_mock.assert_called_once()
    resolve_data_mock.assert_not_called()


def test_public_template_api_fill_preserves_validation_error_when_telemetry_writes_fail(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    mocker.patch.object(app_main, "record_template_api_endpoint_failure", side_effect=RuntimeError("firestore unavailable"))
    mocker.patch.object(app_main, "create_template_api_endpoint_event", side_effect=RuntimeError("firestore unavailable"))

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": ["123-45-6789", "alice@example.com"]},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": [
            {
                "loc": ["data"],
                "msg": "Input should be a valid dictionary",
                "type": "dict_type",
            }
        ]
    }


def test_public_template_api_fill_propagates_request_validation_errors(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    record_failure_mock = mocker.patch.object(app_main, "record_template_api_endpoint_failure", return_value=_endpoint_record())
    mocker.patch.object(
        app_main,
        "resolve_template_api_request_data",
        side_effect=HTTPException(status_code=400, detail="Unknown API Fill keys: ignored_key."),
    )

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"ignored_key": "value"}, "strict": True},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Unknown API Fill keys: ignored_key."}
    record_failure_mock.assert_called_once()


def test_public_template_api_fill_truncates_stored_failure_reasons(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    record_failure_mock = mocker.patch.object(app_main, "record_template_api_endpoint_failure", return_value=_endpoint_record())
    mocker.patch.object(
        app_main,
        "resolve_template_api_request_data",
        side_effect=HTTPException(status_code=400, detail="x" * 4000),
    )

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"full_name": "Ada Lovelace"}, "strict": True},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 400
    reason = record_failure_mock.call_args.kwargs["reason"]
    assert len(reason) <= 512
    assert reason.endswith("...")


def test_public_template_api_fill_does_not_consume_quota_when_materialization_fails(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    record_success_mock = mocker.patch.object(app_main, "record_template_api_endpoint_success")
    mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    mocker.patch.object(
        app_main,
        "resolve_template_api_request_data",
        return_value={"full_name": "Ada Lovelace"},
    )
    mocker.patch.object(
        app_main,
        "materialize_template_api_snapshot",
        side_effect=FileNotFoundError("Saved form PDF is unavailable for respondent download."),
    )

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"full_name": "Ada Lovelace"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 404
    record_success_mock.assert_not_called()


def test_public_template_api_fill_preserves_runtime_error_when_telemetry_writes_fail(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    record_success_mock = mocker.patch.object(app_main, "record_template_api_endpoint_success")
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    mocker.patch.object(
        app_main,
        "resolve_template_api_request_data",
        return_value={"full_name": "Ada Lovelace"},
    )
    mocker.patch.object(
        app_main,
        "materialize_template_api_snapshot",
        side_effect=FileNotFoundError("Saved form PDF is unavailable for respondent download."),
    )
    mocker.patch.object(app_main, "record_template_api_endpoint_failure", side_effect=RuntimeError("firestore unavailable"))
    mocker.patch.object(app_main, "create_template_api_endpoint_event", side_effect=RuntimeError("firestore unavailable"))

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"full_name": "Ada Lovelace"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 404
    record_success_mock.assert_not_called()


def test_public_template_api_fill_returns_runtime_error_when_success_bookkeeping_fails(client, app_main, mocker, tmp_path) -> None:
    output_path = tmp_path / "filled.pdf"
    output_path.write_bytes(b"%PDF-1.4\n%mock\n")

    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    mocker.patch.object(
        app_main,
        "resolve_template_api_request_data",
        return_value={"full_name": "Ada Lovelace"},
    )
    mocker.patch.object(
        app_main,
        "materialize_template_api_snapshot",
        return_value=(output_path, [output_path], "patient-intake.pdf"),
    )
    mocker.patch.object(app_main, "record_template_api_endpoint_success", side_effect=RuntimeError("firestore unavailable"))
    runtime_failure_mock = mocker.patch.object(app_main, "_record_runtime_failure", return_value=None)

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"full_name": "Ada Lovelace"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 500
    runtime_failure_mock.assert_called_once()


def test_public_template_api_fill_limits_repeated_auth_failures_per_endpoint(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "_check_endpoint_rate_limit", return_value=False)
    record_failure_mock = mocker.patch.object(app_main, "record_template_api_endpoint_failure")
    create_event_mock = mocker.patch.object(app_main, "create_template_api_endpoint_event")

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"full_name": "Ada Lovelace"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 429
    assert response.json() == {"detail": "Too many API Fill authentication failures for this endpoint. Please wait and try again."}
    record_failure_mock.assert_not_called()
    create_event_mock.assert_not_called()


def test_public_template_api_schema_limits_repeated_auth_failures_per_endpoint(client, app_main, mocker) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "_check_endpoint_rate_limit", return_value=False)
    record_failure_mock = mocker.patch.object(app_main, "record_template_api_endpoint_failure")
    create_event_mock = mocker.patch.object(app_main, "create_template_api_endpoint_event")

    response = client.get(
        "/api/v1/fill/tep-1/schema",
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 429
    assert response.json() == {"detail": "Too many API Fill authentication failures for this endpoint. Please wait and try again."}
    record_failure_mock.assert_not_called()
    create_event_mock.assert_not_called()


def test_public_template_api_fill_blocks_when_monthly_quota_is_exhausted(client, app_main, mocker) -> None:
    mock_pdf_path = "/tmp/mock-filled.pdf"
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=10)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    create_event_mock = mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    mocker.patch.object(
        app_main,
        "resolve_template_api_request_data",
        return_value={"full_name": "Ada Lovelace"},
    )
    mocker.patch.object(
        app_main,
        "materialize_template_api_snapshot",
        return_value=(mock_pdf_path, [mock_pdf_path], "patient-intake.pdf"),
    )
    mocker.patch.object(
        app_main,
        "record_template_api_endpoint_success",
        side_effect=TemplateApiMonthlyLimitExceededError(
            "This account has reached its monthly API Fill request limit."
        ),
    )
    runtime_failure_mock = mocker.patch.object(app_main, "_record_runtime_failure", return_value=None)
    cleanup_mock = mocker.patch.object(app_main, "cleanup_paths", return_value=None)

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"full_name": "Ada Lovelace"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 429
    assert "monthly api fill request limit" in response.json()["detail"].lower()
    assert create_event_mock.call_args.kwargs["event_type"] == "fill_quota_blocked"
    runtime_failure_mock.assert_not_called()
    cleanup_mock.assert_called_once_with([mock_pdf_path])


def test_public_template_api_fill_rejects_before_materialization_when_monthly_usage_exhausted(
    client, app_main, mocker
) -> None:
    """Pre-check guard: when the pre-read monthly usage + pdf_count already exceeds
    the limit, ``_enforce_runtime_plan_limits`` must raise 429 *before* we call
    ``materialize_template_api_snapshot``. Saves the server from burning compute
    rendering a PDF that the atomic check inside
    ``record_template_api_endpoint_success`` would then reject.
    """
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=10)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    create_event_mock = mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    mocker.patch.object(
        app_main,
        "resolve_template_api_request_data",
        return_value={"full_name": "Ada Lovelace"},
    )
    from backend.firebaseDB.template_api_endpoint_database import TemplateApiMonthlyUsageRecord
    mocker.patch.object(
        app_main,
        "get_template_api_monthly_usage",
        return_value=TemplateApiMonthlyUsageRecord(
            id="user-1__2026-03",
            user_id="user-1",
            month_key="2026-03",
            request_count=10,  # exactly at limit
            created_at="2026-03-01T00:00:00+00:00",
            updated_at="2026-03-14T00:00:00+00:00",
        ),
    )
    materialize_mock = mocker.patch.object(app_main, "materialize_template_api_snapshot")
    record_success_mock = mocker.patch.object(app_main, "record_template_api_endpoint_success")

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"full_name": "Ada Lovelace"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 429
    assert "monthly api fill request limit" in response.json()["detail"].lower()
    # The whole point: materialization never ran.
    materialize_mock.assert_not_called()
    record_success_mock.assert_not_called()
    assert create_event_mock.call_args.kwargs["event_type"] == "fill_quota_blocked"


def test_public_template_api_group_fill_rejects_when_member_template_is_retention_locked(
    client, app_main, mocker
) -> None:
    """Retention bypass regression: if any template in the group bundle is
    locked by downgrade retention, the fill must be rejected with 403 —
    previously the check relied on ``is_user_retention_template_locked(template_id=None)``
    which silently returned False for group endpoints, letting downgraded users
    keep serving locked templates through the frozen API endpoint.
    """
    record = _group_endpoint_record()
    _patch_group_fill_environment(mocker, app_main)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=record)
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=record)
    # One of the group's member templates is locked by retention.
    mocker.patch.object(
        app_main,
        "get_user_retention_locked_template_ids",
        return_value={"tpl-1"},
    )
    materialize_mock = mocker.patch.object(app_main, "materialize_group_template_api_snapshot")
    record_success_mock = mocker.patch.object(app_main, "record_template_api_endpoint_success")

    response = client.post(
        "/api/v1/fill/tep-group-1.zip",
        json={"data": {"patient_name": "Aria Patel"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 403
    assert "current plan" in response.json()["detail"].lower()
    materialize_mock.assert_not_called()
    record_success_mock.assert_not_called()


def test_public_template_api_group_fill_rejects_before_materialization_when_monthly_usage_would_overflow(
    client, app_main, mocker, tmp_path
) -> None:
    """Group pre-check: the fixture group has 2 template snapshots, so pdf_count=2.
    With monthly_limit=10 and current usage=9, the fill would overflow (9+2=11>10).
    Must reject with 429 before materializing the zip.
    """
    record = _group_endpoint_record()
    _patch_group_fill_environment(mocker, app_main, monthly_limit=10)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=record)
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=record)
    from backend.firebaseDB.template_api_endpoint_database import TemplateApiMonthlyUsageRecord
    mocker.patch.object(
        app_main,
        "get_template_api_monthly_usage",
        return_value=TemplateApiMonthlyUsageRecord(
            id="user-1__2026-04",
            user_id="user-1",
            month_key="2026-04",
            request_count=9,  # 9 + 2 = 11 > 10
            created_at="2026-04-01T00:00:00+00:00",
            updated_at="2026-04-14T00:00:00+00:00",
        ),
    )
    materialize_mock = mocker.patch.object(app_main, "materialize_group_template_api_snapshot")
    record_success_mock = mocker.patch.object(app_main, "record_template_api_endpoint_success")

    response = client.post(
        "/api/v1/fill/tep-group-1.zip",
        json={"data": {"patient_name": "Aria Patel"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 429
    materialize_mock.assert_not_called()
    record_success_mock.assert_not_called()


def test_public_template_api_fill_records_plan_blocks_separately_from_quota(client, app_main, mocker) -> None:
    over_limit_snapshot = {
        **_endpoint_record().snapshot,
        "pageCount": 40,
    }
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    create_event_mock = mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record(snapshot=over_limit_snapshot))
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record(snapshot=over_limit_snapshot))
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    mocker.patch.object(
        app_main,
        "resolve_template_api_request_data",
        return_value={"full_name": "Ada Lovelace"},
    )

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"full_name": "Ada Lovelace"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 403
    assert "limited to 25 pages" in response.json()["detail"].lower()
    assert create_event_mock.call_args.kwargs["event_type"] == "fill_plan_blocked"


# ---------------------------------------------------------------------------
# Phase 4: group API Fill public routes
# ---------------------------------------------------------------------------


def _patch_group_fill_environment(mocker, app_main, *, monthly_limit: int = 250) -> None:
    mocker.patch.object(app_main, "check_rate_limit", return_value=True)
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=20)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=monthly_limit)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=250)
    mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)
    mocker.patch.object(app_main, "verify_template_api_secret", return_value=True)
    mocker.patch.object(app_main, "_current_usage_month_key", return_value="2026-04")


def test_public_template_api_group_zip_fill_route_returns_zip(client, app_main, mocker, tmp_path) -> None:
    """Phase 4 happy path: POST /.zip on a group endpoint validates the JSON body
    and streams a zip of per-template PDFs."""

    record = _group_endpoint_record()
    _patch_group_fill_environment(mocker, app_main)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=record)
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=record)

    zip_path = tmp_path / "i130-spouse-packet.zip"
    zip_path.write_bytes(b"PK\x03\x04stub-zip-bytes")
    materialize_mock = mocker.patch.object(
        app_main,
        "materialize_group_template_api_snapshot",
        return_value=(zip_path, [zip_path], "i130-spouse-packet.zip"),
    )
    record_success_mock = mocker.patch.object(
        app_main,
        "record_template_api_endpoint_success",
        return_value=record,
    )

    response = client.post(
        "/api/v1/fill/tep-1.zip",
        json={"data": {"patient_name": "Aria Patel"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "i130-spouse-packet.zip" in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "private, no-store"

    materialize_mock.assert_called_once()
    call_kwargs = materialize_mock.call_args.kwargs
    assert call_kwargs["data"] == {"patient_name": "Aria Patel"}

    record_success_mock.assert_called_once()
    metadata = record_success_mock.call_args.kwargs["metadata"]
    assert metadata["scopeType"] == "group"
    assert metadata["pdfCount"] == 2
    assert metadata["templateCount"] == 2
    assert metadata["totalPages"] == 3


def test_public_template_api_group_zip_fill_rejects_template_endpoint(client, app_main, mocker) -> None:
    """The .zip route only serves group endpoints; template endpoints get 409."""

    _patch_group_fill_environment(mocker, app_main)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=_endpoint_record())
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=_endpoint_record())

    response = client.post(
        "/api/v1/fill/tep-1.zip",
        json={"data": {"full_name": "Ada Lovelace"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 409
    assert "single-template" in response.text.lower() or ".pdf" in response.text


def test_public_template_api_pdf_fill_rejects_group_endpoint(client, app_main, mocker) -> None:
    """The .pdf route only serves template endpoints; group endpoints get 409 with .zip hint."""

    _patch_group_fill_environment(mocker, app_main)
    record = _group_endpoint_record()
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=record)
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=record)

    response = client.post(
        "/api/v1/fill/tep-1.pdf",
        json={"data": {"patient_name": "Aria Patel"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 409
    assert ".zip" in response.text


def test_public_template_api_group_zip_fill_rejects_unknown_field(client, app_main, mocker) -> None:
    """additionalProperties: false — unknown body keys are rejected (D6)."""

    record = _group_endpoint_record()
    _patch_group_fill_environment(mocker, app_main)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=record)
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=record)
    materialize_mock = mocker.patch.object(app_main, "materialize_group_template_api_snapshot")

    response = client.post(
        "/api/v1/fill/tep-1.zip",
        json={"data": {"patient_name": "Aria Patel", "rogue_field": "x"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 400
    assert "unknown field" in response.text.lower()
    materialize_mock.assert_not_called()


def test_public_template_api_group_zip_fill_passes_per_pdf_count_increment(client, app_main, mocker, tmp_path) -> None:
    """Phase 5 D7: a 7-PDF group fill calls record_template_api_endpoint_success
    with count_increment=7 so the user is charged 7 fills against their monthly
    quota, not 1."""

    record = _group_endpoint_record()
    _patch_group_fill_environment(mocker, app_main)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=record)
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=record)

    zip_path = tmp_path / "i130-spouse-packet.zip"
    zip_path.write_bytes(b"PK\x03\x04stub")
    mocker.patch.object(
        app_main,
        "materialize_group_template_api_snapshot",
        return_value=(zip_path, [zip_path], "i130-spouse-packet.zip"),
    )
    record_success_mock = mocker.patch.object(
        app_main,
        "record_template_api_endpoint_success",
        return_value=record,
    )

    response = client.post(
        "/api/v1/fill/tep-1.zip",
        json={"data": {"patient_name": "Aria Patel"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 200
    record_success_mock.assert_called_once()
    call_kwargs = record_success_mock.call_args.kwargs
    # The bundle from _group_endpoint_record has 2 templateSnapshots, so the
    # group fill charges 2 fills, not 1.
    assert call_kwargs["count_increment"] == 2
    metadata = call_kwargs["metadata"]
    assert metadata["pdfCount"] == 2
    assert metadata["quotaIncrement"] == 2
    assert metadata["scopeType"] == "group"


def test_public_template_api_group_zip_fill_blocks_when_increment_exceeds_quota(client, app_main, mocker, tmp_path) -> None:
    """Per-PDF accounting: a 2-PDF group fill rejects with 429 when the user
    has fewer than 2 fills remaining for the month. The materialize call
    happens (the precheck is best-effort, not a contract), but the success
    bookkeeping inside the transaction raises the limit error."""

    from backend.firebaseDB.template_api_endpoint_database import TemplateApiMonthlyLimitExceededError

    record = _group_endpoint_record()
    _patch_group_fill_environment(mocker, app_main)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=record)
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=record)
    zip_path = tmp_path / "i130.zip"
    zip_path.write_bytes(b"PK\x03\x04stub")
    mocker.patch.object(
        app_main,
        "materialize_group_template_api_snapshot",
        return_value=(zip_path, [zip_path], "i130.zip"),
    )
    mocker.patch.object(
        app_main,
        "record_template_api_endpoint_success",
        side_effect=TemplateApiMonthlyLimitExceededError("monthly limit reached"),
    )
    create_event_mock = mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)

    response = client.post(
        "/api/v1/fill/tep-1.zip",
        json={"data": {"patient_name": "Aria"}},
        headers=_basic_auth("dpa_live_secret"),
    )

    assert response.status_code == 429
    # The audit event for fill_quota_blocked should record group scope info so
    # post-mortems can see "the blocked fill was a 2-PDF group, not 1 PDF".
    quota_calls = [
        call for call in create_event_mock.call_args_list
        if call.kwargs.get("event_type") == "fill_quota_blocked"
    ]
    assert quota_calls, "expected at least one fill_quota_blocked audit event"
    metadata = quota_calls[-1].kwargs["metadata"]
    assert metadata.get("scopeType") == "group"
    assert metadata.get("pdfCount") == 2
    assert metadata.get("totalPages") == 3


def test_public_template_api_group_schema_route_returns_canonical_json_schema(client, app_main, mocker) -> None:
    """GET /schema on a group endpoint returns the canonical JSON Schema."""

    record = _group_endpoint_record()
    _patch_group_fill_environment(mocker, app_main)
    mocker.patch.object(app_main, "get_template_api_endpoint_public_metadata", return_value=record)
    mocker.patch.object(app_main, "get_template_api_endpoint_public", return_value=record)

    response = client.get("/api/v1/fill/tep-1/schema", headers=_basic_auth("dpa_live_secret"))

    assert response.status_code == 200
    body = response.json()
    assert body["endpoint"]["scopeType"] == "group"
    assert body["endpoint"]["fillPath"] == "/api/v1/fill/tep-1.zip"
    schema = body["schema"]
    assert schema["additionalProperties"] is False
    assert "patient_name" in schema["properties"]
    assert schema["properties"]["patient_name"]["type"] == "string"
    assert schema["properties"]["patient_name"]["x-dullypdf-templates"] == ["tpl-1", "tpl-2"]
