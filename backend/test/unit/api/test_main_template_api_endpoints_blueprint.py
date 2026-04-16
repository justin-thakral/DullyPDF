from __future__ import annotations

from backend.firebaseDB.group_database import TemplateGroupRecord
from backend.firebaseDB.template_api_endpoint_database import (
    TemplateApiActiveEndpointLimitError,
    TemplateApiEndpointRecord,
    TemplateApiEndpointStatusError,
)
from backend.firebaseDB.template_database import TemplateRecord


def _patch_auth(mocker, app_main, user) -> None:
    mocker.patch.object(app_main, "_verify_token", return_value={"uid": user.app_user_id})
    mocker.patch.object(app_main, "ensure_user", return_value=user)


def _patch_limits(mocker, app_main) -> None:
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "get_template_api_monthly_usage", return_value=None)
    mocker.patch.object(app_main, "count_active_template_api_endpoints", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    mocker.patch.object(app_main, "list_template_api_endpoint_events", return_value=[])
    mocker.patch.object(app_main, "create_template_api_endpoint_event", return_value=None)


def _template_record() -> TemplateRecord:
    return TemplateRecord(
        id="tpl-1",
        pdf_bucket_path="gs://forms/patient-intake.pdf",
        template_bucket_path="gs://templates/patient-intake.json",
        metadata={"name": "Patient Intake"},
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
        name="Patient Intake",
    )


def _endpoint_record(
    *,
    endpoint_id: str = "tep-1",
    template_id: str = "tpl-1",
    status: str = "active",
    snapshot_version: int = 1,
    key_prefix: str | None = "dpa_live_abc123",
    secret_hash: str | None = "hash",
    snapshot: dict | None = None,
    current_usage_month: str | None = "2026-03",
    current_month_usage_count: int = 0,
    scope_type: str = "template",
    group_id: str | None = None,
    group_name: str | None = None,
) -> TemplateApiEndpointRecord:
    return TemplateApiEndpointRecord(
        id=endpoint_id,
        user_id="user_base",
        template_id=template_id,
        template_name="Patient Intake",
        status=status,
        snapshot_version=snapshot_version,
        key_prefix=key_prefix,
        secret_hash=secret_hash,
        snapshot=snapshot
        or {
            "version": 1,
            "defaultExportMode": "flat",
            "fields": [{"name": "full_name", "type": "text", "page": 1, "rect": [1, 2, 3, 4]}],
            "checkboxRules": [],
            "textTransformRules": [],
        },
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
        published_at="2024-01-01T00:00:00+00:00",
        last_used_at=None,
        usage_count=0,
        current_usage_month=current_usage_month,
        current_month_usage_count=current_month_usage_count,
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


def _group_record() -> TemplateGroupRecord:
    return TemplateGroupRecord(
        id="grp-1",
        user_id="user_base",
        name="I-130 Spouse Packet",
        normalized_name="i-130 spouse packet",
        template_ids=["tpl-1", "tpl-2"],
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
    )


def _group_endpoint_record(*, snapshot: dict | None = None) -> TemplateApiEndpointRecord:
    bundle = snapshot or {
        "snapshotFormatVersion": 1,
        "frozenAt": "2026-04-13T00:00:00Z",
        "schema": {"groupId": "grp-1", "fields": []},
        "templateSnapshots": [
            {"templateId": "tpl-1", "templateName": "I-130", "snapshot": {"sourcePdfPath": "gs://forms/tpl-1.pdf", "pageCount": 1}},
            {"templateId": "tpl-2", "templateName": "I-130A", "snapshot": {"sourcePdfPath": "gs://forms/tpl-2.pdf", "pageCount": 2}},
        ],
        "snapshotKind": "group",
        "templateApiSnapshotVersion": 1,
    }
    return _endpoint_record(
        endpoint_id="tep-grp-1",
        template_id="",
        snapshot=bundle,
        scope_type="group",
        group_id="grp-1",
        group_name="I-130 Spouse Packet",
    )


def test_template_api_endpoints_list_publish_rotate_revoke_and_schema(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "count_active_template_api_endpoints", return_value=0)

    mocker.patch.object(app_main, "list_template_api_endpoints", return_value=[_endpoint_record()])
    response = client.get("/api/template-api-endpoints", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json()["endpoints"] == [
        {
            "id": "tep-1",
            "scopeType": "template",
            "templateId": "tpl-1",
            "templateName": "Patient Intake",
            "groupId": None,
            "groupName": None,
            "status": "active",
            "snapshotVersion": 1,
            "keyPrefix": "dpa_live_abc123",
            "createdAt": "2024-01-01T00:00:00+00:00",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "publishedAt": "2024-01-01T00:00:00+00:00",
            "lastUsedAt": None,
            "usageCount": 0,
            "currentUsageMonth": "2026-03",
            "currentMonthUsageCount": 0,
            "authFailureCount": 0,
            "validationFailureCount": 0,
            "runtimeFailureCount": 0,
            "suspiciousFailureCount": 0,
            "lastFailureAt": None,
            "lastFailureReason": None,
            "auditEventCount": 0,
            "fillPath": "/api/v1/fill/tep-1.pdf",
            "schemaPath": "/api/template-api-endpoints/tep-1/schema",
        }
    ]
    assert response.json()["limits"]["activeEndpointsMax"] == 1

    mocker.patch.object(app_main, "get_template", return_value=_template_record())
    mocker.patch.object(app_main, "build_template_api_snapshot", return_value={"version": 1, "defaultExportMode": "flat", "pageCount": 1})
    mocker.patch.object(app_main, "build_template_api_schema", return_value={"fields": [], "checkboxGroups": [], "radioGroups": []})
    mocker.patch.object(app_main, "generate_template_api_secret", return_value="dpa_live_secret")
    mocker.patch.object(app_main, "build_template_api_key_prefix", return_value="dpa_live_secret")
    mocker.patch.object(app_main, "hash_template_api_secret", return_value="hashed-secret")
    created_record = _endpoint_record(key_prefix="dpa_live_secret")
    publish_mock = mocker.patch.object(
        app_main,
        "publish_or_republish_template_api_endpoint",
        return_value=(created_record, True),
    )
    mocker.patch.object(app_main, "get_template_api_endpoint", return_value=created_record)

    create_response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=auth_headers,
    )

    assert create_response.status_code == 200
    assert create_response.headers["cache-control"] == "private, no-store"
    assert create_response.json()["created"] is True
    assert create_response.json()["secret"] == "dpa_live_secret"
    assert create_response.json()["limits"]["maxPagesPerRequest"] == 25
    publish_mock.assert_called_once_with(
        user_id="user_base",
        scope_type="template",
        template_id="tpl-1",
        template_name="Patient Intake",
        active_limit=1,
        key_prefix="dpa_live_secret",
        secret_hash="hashed-secret",
        snapshot={"version": 1, "defaultExportMode": "flat", "pageCount": 1},
    )

    mocker.patch.object(app_main, "get_template_api_endpoint", return_value=_endpoint_record())
    update_rotate_mock = mocker.patch.object(
        app_main,
        "rotate_template_api_endpoint_secret_atomic",
        return_value=_endpoint_record(key_prefix="dpa_live_rotated"),
    )
    mocker.patch.object(app_main, "generate_template_api_secret", return_value="dpa_live_rotated")
    mocker.patch.object(app_main, "build_template_api_key_prefix", return_value="dpa_live_rotated")
    mocker.patch.object(app_main, "hash_template_api_secret", return_value="hashed-rotated")

    rotate_response = client.post("/api/template-api-endpoints/tep-1/rotate", headers=auth_headers)
    assert rotate_response.status_code == 200
    assert rotate_response.headers["cache-control"] == "private, no-store"
    assert rotate_response.json()["secret"] == "dpa_live_rotated"
    update_rotate_mock.assert_called_once_with(
        "tep-1",
        "user_base",
        key_prefix="dpa_live_rotated",
        secret_hash="hashed-rotated",
    )

    revoke_mock = mocker.patch.object(
        app_main,
        "revoke_template_api_endpoint_atomic",
        return_value=_endpoint_record(status="revoked"),
    )
    mocker.patch.object(
        app_main,
        "get_template_api_endpoint",
        side_effect=[_endpoint_record(), _endpoint_record(status="revoked")],
    )
    revoke_response = client.post("/api/template-api-endpoints/tep-1/revoke", headers=auth_headers)
    assert revoke_response.status_code == 200
    assert revoke_response.headers["cache-control"] == "private, no-store"
    assert revoke_response.json()["endpoint"]["status"] == "revoked"
    revoke_mock.assert_called_once_with("tep-1", "user_base")

    mocker.patch.object(app_main, "get_template_api_endpoint", return_value=_endpoint_record(status="revoked"))
    schema_response = client.get("/api/template-api-endpoints/tep-1/schema", headers=auth_headers)
    assert schema_response.status_code == 200
    assert schema_response.headers["cache-control"] == "private, no-store"
    assert schema_response.json()["schema"] == {"fields": [], "checkboxGroups": [], "radioGroups": []}


def test_template_api_owner_lifecycle_ignores_event_logging_failures(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "create_template_api_endpoint_event", side_effect=RuntimeError("firestore unavailable"))
    mocker.patch.object(app_main, "count_active_template_api_endpoints", return_value=0)

    mocker.patch.object(app_main, "get_template", return_value=_template_record())
    mocker.patch.object(app_main, "build_template_api_snapshot", return_value={"version": 1, "defaultExportMode": "flat", "pageCount": 1})
    mocker.patch.object(app_main, "build_template_api_schema", return_value={"fields": [], "checkboxGroups": [], "radioGroups": []})
    mocker.patch.object(app_main, "generate_template_api_secret", return_value="dpa_live_secret")
    mocker.patch.object(app_main, "build_template_api_key_prefix", return_value="dpa_live_secret")
    mocker.patch.object(app_main, "hash_template_api_secret", return_value="hashed-secret")
    created_record = _endpoint_record(key_prefix="dpa_live_secret")
    mocker.patch.object(
        app_main,
        "publish_or_republish_template_api_endpoint",
        return_value=(created_record, True),
    )
    mocker.patch.object(app_main, "get_template_api_endpoint", return_value=created_record)

    create_response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=auth_headers,
    )

    assert create_response.status_code == 200
    assert create_response.json()["secret"] == "dpa_live_secret"

    mocker.patch.object(app_main, "get_template_api_endpoint", return_value=_endpoint_record())
    mocker.patch.object(
        app_main,
        "rotate_template_api_endpoint_secret_atomic",
        return_value=_endpoint_record(key_prefix="dpa_live_rotated"),
    )
    mocker.patch.object(app_main, "generate_template_api_secret", return_value="dpa_live_rotated")
    mocker.patch.object(app_main, "build_template_api_key_prefix", return_value="dpa_live_rotated")
    mocker.patch.object(app_main, "hash_template_api_secret", return_value="hashed-rotated")

    rotate_response = client.post("/api/template-api-endpoints/tep-1/rotate", headers=auth_headers)

    assert rotate_response.status_code == 200
    assert rotate_response.json()["secret"] == "dpa_live_rotated"

    mocker.patch.object(
        app_main,
        "revoke_template_api_endpoint_atomic",
        return_value=_endpoint_record(status="revoked"),
    )
    mocker.patch.object(
        app_main,
        "get_template_api_endpoint",
        side_effect=[_endpoint_record(), _endpoint_record(status="revoked")],
    )

    revoke_response = client.post("/api/template-api-endpoints/tep-1/revoke", headers=auth_headers)

    assert revoke_response.status_code == 200
    assert revoke_response.json()["endpoint"]["status"] == "revoked"


def test_template_api_publish_returns_secret_when_owner_detail_reads_fail(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "count_active_template_api_endpoints", return_value=0)
    mocker.patch.object(app_main, "get_template", return_value=_template_record())
    mocker.patch.object(app_main, "build_template_api_snapshot", return_value={"version": 1, "defaultExportMode": "flat", "pageCount": 1})
    mocker.patch.object(app_main, "build_template_api_schema", return_value={"fields": [], "checkboxFields": [], "checkboxGroups": [], "radioGroups": []})
    mocker.patch.object(app_main, "generate_template_api_secret", return_value="dpa_live_secret")
    mocker.patch.object(app_main, "build_template_api_key_prefix", return_value="dpa_live_secret")
    mocker.patch.object(app_main, "hash_template_api_secret", return_value="hashed-secret")
    mocker.patch.object(
        app_main,
        "publish_or_republish_template_api_endpoint",
        return_value=(_endpoint_record(key_prefix="dpa_live_secret"), True),
    )
    mocker.patch.object(app_main, "_build_owner_limit_summary", side_effect=RuntimeError("firestore unavailable"))
    mocker.patch.object(app_main, "list_template_api_endpoint_events", side_effect=RuntimeError("firestore unavailable"))
    get_endpoint_mock = mocker.patch.object(
        app_main,
        "get_template_api_endpoint",
        side_effect=AssertionError("publish should not refetch the endpoint after mutation"),
    )

    response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["secret"] == "dpa_live_secret"
    assert response.json()["recentEvents"] == []
    assert response.json()["limits"]["activeEndpointsMax"] == 1
    assert response.json()["schema"] == {
        "fields": [],
        "checkboxFields": [],
        "checkboxGroups": [],
        "radioGroups": [],
    }
    get_endpoint_mock.assert_not_called()


def test_template_api_rotate_and_revoke_skip_post_mutation_refetch_when_owner_detail_reads_fail(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "_build_owner_limit_summary", side_effect=RuntimeError("firestore unavailable"))
    mocker.patch.object(app_main, "list_template_api_endpoint_events", side_effect=RuntimeError("firestore unavailable"))

    get_endpoint_rotate_mock = mocker.patch.object(
        app_main,
        "get_template_api_endpoint",
        side_effect=[_endpoint_record(), AssertionError("rotate should not refetch the endpoint after mutation")],
    )
    mocker.patch.object(
        app_main,
        "rotate_template_api_endpoint_secret_atomic",
        return_value=_endpoint_record(key_prefix="dpa_live_rotated"),
    )
    mocker.patch.object(app_main, "generate_template_api_secret", return_value="dpa_live_rotated")
    mocker.patch.object(app_main, "build_template_api_key_prefix", return_value="dpa_live_rotated")
    mocker.patch.object(app_main, "hash_template_api_secret", return_value="hashed-rotated")

    rotate_response = client.post("/api/template-api-endpoints/tep-1/rotate", headers=auth_headers)

    assert rotate_response.status_code == 200
    assert rotate_response.json()["secret"] == "dpa_live_rotated"
    assert rotate_response.json()["recentEvents"] == []
    assert get_endpoint_rotate_mock.call_count == 1

    get_endpoint_revoke_mock = mocker.patch.object(
        app_main,
        "get_template_api_endpoint",
        side_effect=[_endpoint_record(), AssertionError("revoke should not refetch the endpoint after mutation")],
    )
    mocker.patch.object(
        app_main,
        "revoke_template_api_endpoint_atomic",
        return_value=_endpoint_record(status="revoked"),
    )

    revoke_response = client.post("/api/template-api-endpoints/tep-1/revoke", headers=auth_headers)

    assert revoke_response.status_code == 200
    assert revoke_response.json()["endpoint"]["status"] == "revoked"
    assert revoke_response.json()["recentEvents"] == []
    assert get_endpoint_revoke_mock.call_count == 1


def test_template_api_owner_read_routes_degrade_when_limit_and_event_reads_fail(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    primary_endpoint = _endpoint_record(current_usage_month=None)
    sibling_endpoint = _endpoint_record(endpoint_id="tep-2", template_id="tpl-2", current_usage_month="2026-04")

    def _list_endpoints(user_id: str, template_id: str | None = None):
        assert user_id == "user_base"
        return [primary_endpoint] if template_id == "tpl-1" else [primary_endpoint, sibling_endpoint]

    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=25)
    mocker.patch.object(app_main, "list_template_api_endpoints", side_effect=_list_endpoints)
    mocker.patch.object(app_main, "get_template_api_monthly_usage", side_effect=RuntimeError("firestore unavailable"))
    mocker.patch.object(app_main, "count_active_template_api_endpoints", side_effect=RuntimeError("firestore unavailable"))
    mocker.patch.object(app_main, "get_template_api_endpoint", return_value=primary_endpoint)
    mocker.patch.object(app_main, "list_template_api_endpoint_events", side_effect=RuntimeError("firestore unavailable"))
    mocker.patch.object(
        app_main,
        "build_template_api_schema",
        return_value={"fields": [], "checkboxFields": [], "checkboxGroups": [], "radioGroups": []},
    )

    list_response = client.get("/api/template-api-endpoints?templateId=tpl-1", headers=auth_headers)

    assert list_response.status_code == 200
    assert list_response.json()["limits"]["activeEndpointsMax"] == 1
    assert list_response.json()["limits"]["activeEndpointsUsed"] == 2
    assert list_response.json()["limits"]["requestsThisMonth"] == 0
    assert list_response.json()["limits"]["requestUsageMonth"] == "2026-04"

    schema_response = client.get("/api/template-api-endpoints/tep-1/schema", headers=auth_headers)

    assert schema_response.status_code == 200
    assert schema_response.json()["recentEvents"] == []
    assert schema_response.json()["limits"]["activeEndpointsMax"] == 1
    assert schema_response.json()["limits"]["activeEndpointsUsed"] == 2
    assert schema_response.json()["limits"]["requestsThisMonth"] == 0
    assert schema_response.json()["limits"]["requestUsageMonth"] == "2026-04"


def test_template_api_publish_reuses_existing_active_endpoint_without_rotating_secret(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "get_template", return_value=_template_record())
    mocker.patch.object(app_main, "build_template_api_snapshot", return_value={"version": 1, "defaultExportMode": "editable", "pageCount": 1})
    mocker.patch.object(app_main, "build_template_api_schema", return_value={"fields": [{"key": "full_name"}]})
    mocker.patch.object(app_main, "generate_template_api_secret", return_value="dpa_live_secret")
    mocker.patch.object(app_main, "build_template_api_key_prefix", return_value="dpa_live_secret")
    mocker.patch.object(app_main, "hash_template_api_secret", return_value="hashed-secret")
    mocker.patch.object(app_main, "get_template_api_endpoint", return_value=_endpoint_record(snapshot_version=4))
    publish_mock = mocker.patch.object(
        app_main,
        "publish_or_republish_template_api_endpoint",
        return_value=(_endpoint_record(snapshot_version=4), False),
    )

    response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "editable"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["created"] is False
    assert response.json()["secret"] is None
    publish_mock.assert_called_once_with(
        user_id="user_base",
        scope_type="template",
        template_id="tpl-1",
        template_name="Patient Intake",
        active_limit=1,
        key_prefix="dpa_live_secret",
        secret_hash="hashed-secret",
        snapshot={"version": 1, "defaultExportMode": "editable", "pageCount": 1},
    )


def test_template_api_publish_returns_404_when_template_missing(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "get_template", return_value=None)

    response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "missing-template"},
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Saved form not found"}


def test_template_api_publish_rejects_unknown_top_level_fields(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    get_template_mock = mocker.patch.object(app_main, "get_template")

    response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "export_mode": "editable"},
        headers=auth_headers,
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "export_mode"]
    get_template_mock.assert_not_called()


def test_template_api_publish_returns_400_when_snapshot_build_fails(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "count_active_template_api_endpoints", return_value=0)
    mocker.patch.object(app_main, "get_template", return_value=_template_record())
    mocker.patch.object(
        app_main,
        "build_template_api_snapshot",
        side_effect=ValueError("Saved form needs an editor snapshot before API Fill can be published."),
    )

    response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1"},
        headers=auth_headers,
    )

    assert response.status_code == 400
    assert "editor snapshot" in response.json()["detail"]


def test_template_api_rotate_requires_active_endpoint(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "get_template_api_endpoint", return_value=_endpoint_record(status="revoked"))

    response = client.post("/api/template-api-endpoints/tep-1/rotate", headers=auth_headers)

    assert response.status_code == 409
    assert "active" in response.json()["detail"].lower()


def test_template_api_rotate_surfaces_atomic_status_conflicts(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "get_template_api_endpoint", return_value=_endpoint_record())
    mocker.patch.object(app_main, "generate_template_api_secret", return_value="dpa_live_rotated")
    mocker.patch.object(app_main, "build_template_api_key_prefix", return_value="dpa_live_rotated")
    mocker.patch.object(app_main, "hash_template_api_secret", return_value="hashed-rotated")
    mocker.patch.object(
        app_main,
        "rotate_template_api_endpoint_secret_atomic",
        side_effect=TemplateApiEndpointStatusError("Only active API Fill endpoints can rotate keys."),
    )

    response = client.post("/api/template-api-endpoints/tep-1/rotate", headers=auth_headers)

    assert response.status_code == 409
    assert "active" in response.json()["detail"].lower()


def test_template_api_publish_enforces_active_endpoint_limit(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "get_template", return_value=_template_record())
    mocker.patch.object(app_main, "build_template_api_snapshot", return_value={"version": 1, "defaultExportMode": "flat", "pageCount": 1})
    mocker.patch.object(
        app_main,
        "publish_or_republish_template_api_endpoint",
        side_effect=TemplateApiActiveEndpointLimitError("Your plan allows up to 1 active API Fill endpoints."),
    )

    response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=auth_headers,
    )

    assert response.status_code == 409
    assert "active api fill endpoints" in response.json()["detail"].lower()


def test_template_api_publish_enforces_page_limit(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "get_template", return_value=_template_record())
    mocker.patch.object(
        app_main,
        "build_template_api_snapshot",
        return_value={"version": 1, "defaultExportMode": "flat", "pageCount": 40},
    )

    response = client.post(
        "/api/template-api-endpoints",
        json={"templateId": "tpl-1", "exportMode": "flat"},
        headers=auth_headers,
    )

    assert response.status_code == 403
    assert "limited to 25 pages" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Phase 4: group API Fill endpoint publish
# ---------------------------------------------------------------------------


def test_template_api_publish_group_endpoint_persists_canonical_bundle(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    """Phase 4 happy path: publishing a group API Fill endpoint builds the canonical
    schema, freezes the publish snapshot bundle, persists it, and serializes the
    new endpoint with scopeType="group" and a .zip fillPath."""

    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "count_active_template_api_endpoints", return_value=0)
    mocker.patch.object(app_main, "get_group", return_value=_group_record())
    fake_bundle = {
        "snapshotFormatVersion": 1,
        "frozenAt": "2026-04-13T00:00:00Z",
        "schema": {"groupId": "grp-1", "fields": []},
        "templateSnapshots": [
            {"templateId": "tpl-1", "templateName": "I-130", "snapshot": {"sourcePdfPath": "gs://forms/tpl-1.pdf", "pageCount": 1}},
            {"templateId": "tpl-2", "templateName": "I-130A", "snapshot": {"sourcePdfPath": "gs://forms/tpl-2.pdf", "pageCount": 2}},
        ],
        "snapshotKind": "group",
        "templateApiSnapshotVersion": 1,
    }
    build_snapshot_mock = mocker.patch.object(
        app_main,
        "_build_group_snapshot_or_400",
        return_value=fake_bundle,
    )
    build_schema_mock = mocker.patch.object(
        app_main,
        "build_group_template_api_schema",
        return_value={"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object", "additionalProperties": False, "properties": {}},
    )
    mocker.patch.object(app_main, "generate_template_api_secret", return_value="dpa_live_group_secret")
    mocker.patch.object(app_main, "build_template_api_key_prefix", return_value="dpa_live_group_secret")
    mocker.patch.object(app_main, "hash_template_api_secret", return_value="hashed-group-secret")
    publish_mock = mocker.patch.object(
        app_main,
        "publish_or_republish_template_api_endpoint",
        return_value=(_group_endpoint_record(snapshot=fake_bundle), True),
    )

    response = client.post(
        "/api/template-api-endpoints",
        json={"scopeType": "group", "groupId": "grp-1", "exportMode": "flat"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["created"] is True
    assert body["secret"] == "dpa_live_group_secret"
    assert body["endpoint"]["scopeType"] == "group"
    assert body["endpoint"]["groupId"] == "grp-1"
    assert body["endpoint"]["groupName"] == "I-130 Spouse Packet"
    assert body["endpoint"]["fillPath"] == "/api/v1/fill/tep-grp-1.zip"

    build_snapshot_mock.assert_called_once()
    build_schema_mock.assert_called_once_with(fake_bundle)
    publish_mock.assert_called_once_with(
        user_id="user_base",
        scope_type="group",
        group_id="grp-1",
        group_name="I-130 Spouse Packet",
        template_id=None,
        template_name=None,
        active_limit=1,
        key_prefix="dpa_live_group_secret",
        secret_hash="hashed-group-secret",
        snapshot=fake_bundle,
    )


def test_template_api_publish_group_endpoint_returns_404_for_missing_group(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "count_active_template_api_endpoints", return_value=0)
    mocker.patch.object(app_main, "get_group", return_value=None)

    response = client.post(
        "/api/template-api-endpoints",
        json={"scopeType": "group", "groupId": "missing-group", "exportMode": "flat"},
        headers=auth_headers,
    )
    assert response.status_code == 404
    assert "workflow group not found" in response.text.lower()


def test_template_api_publish_group_endpoint_enforces_total_page_limit(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "count_active_template_api_endpoints", return_value=0)
    mocker.patch.object(app_main, "get_group", return_value=_group_record())
    huge_bundle = {
        "snapshotFormatVersion": 1,
        "frozenAt": "2026-04-13T00:00:00Z",
        "schema": {"groupId": "grp-1", "fields": []},
        "templateSnapshots": [
            {"templateId": "tpl-1", "templateName": "Big A", "snapshot": {"sourcePdfPath": "gs://forms/tpl-1.pdf", "pageCount": 20}},
            {"templateId": "tpl-2", "templateName": "Big B", "snapshot": {"sourcePdfPath": "gs://forms/tpl-2.pdf", "pageCount": 20}},
        ],
        "snapshotKind": "group",
        "templateApiSnapshotVersion": 1,
    }
    mocker.patch.object(app_main, "_build_group_snapshot_or_400", return_value=huge_bundle)

    response = client.post(
        "/api/template-api-endpoints",
        json={"scopeType": "group", "groupId": "grp-1", "exportMode": "flat"},
        headers=auth_headers,
    )

    assert response.status_code == 403
    assert "total pages" in response.text.lower()


def test_template_api_publish_rejects_template_id_with_group_scope(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)

    response = client.post(
        "/api/template-api-endpoints",
        json={"scopeType": "group", "groupId": "grp-1", "templateId": "tpl-1", "exportMode": "flat"},
        headers=auth_headers,
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    if isinstance(detail, list):
        messages = " ".join(str(entry.get("msg", "")) for entry in detail)
    else:
        messages = str(detail)
    assert "templateId must not be set" in messages or "templateid must not be set" in messages.lower()


def test_template_api_publish_rejects_group_id_with_template_scope(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)

    response = client.post(
        "/api/template-api-endpoints",
        json={"scopeType": "template", "templateId": "tpl-1", "groupId": "grp-1"},
        headers=auth_headers,
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    if isinstance(detail, list):
        messages = " ".join(str(entry.get("msg", "")) for entry in detail)
    else:
        messages = str(detail)
    assert "groupid must not be set" in messages.lower()


def test_template_api_serialize_group_endpoint_uses_zip_fill_path(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    """Listing API endpoints surfaces the .zip fillPath for group scope endpoints."""

    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    mocker.patch.object(app_main, "list_template_api_endpoints", return_value=[_group_endpoint_record()])

    response = client.get("/api/template-api-endpoints", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["endpoints"][0]["scopeType"] == "group"
    assert payload["endpoints"][0]["fillPath"] == "/api/v1/fill/tep-grp-1.zip"
    assert payload["endpoints"][0]["groupId"] == "grp-1"
    assert payload["endpoints"][0]["templateId"] is None


# ---------------------------------------------------------------------------
# Phase 5: precheck endpoint
# ---------------------------------------------------------------------------


def _patch_precheck_environment(mocker, app_main, *, current: int = 10, monthly_limit: int = 250, max_pages: int = 50) -> None:
    mocker.patch.object(app_main, "get_user_profile", return_value=None)
    mocker.patch.object(app_main, "normalize_role", return_value="base")
    mocker.patch.object(app_main, "resolve_template_api_active_limit", return_value=1)
    mocker.patch.object(app_main, "resolve_template_api_requests_monthly_limit", return_value=monthly_limit)
    mocker.patch.object(app_main, "resolve_template_api_max_pages", return_value=max_pages)

    class _Usage:
        def __init__(self, count: int) -> None:
            self.request_count = count
            self.month_key = "2026-04"

    mocker.patch.object(
        app_main,
        "get_template_api_monthly_usage",
        return_value=_Usage(current),
    )


def test_template_api_precheck_allows_fill_within_budget(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_precheck_environment(mocker, app_main, current=10, monthly_limit=250, max_pages=50)

    response = client.get(
        "/api/template-api-endpoints/precheck?pdfCount=7&pageCount=32",
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["allowed"] is True
    assert body["fillsRemaining"] == 240
    assert body["pdfCount"] == 7
    assert body["monthlyLimit"] == 250
    assert body["maxPagesPerRequest"] == 50
    assert body["pageCountPerRequest"] == 32
    assert body["reason"] is None
    assert body["currentMonthUsage"] == 10
    assert body["monthKey"] == "2026-04"


def test_template_api_precheck_blocks_when_fills_exhausted(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_precheck_environment(mocker, app_main, current=247, monthly_limit=250, max_pages=50)

    response = client.get(
        "/api/template-api-endpoints/precheck?pdfCount=7&pageCount=32",
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["allowed"] is False
    assert body["reason"] == "fills_exhausted"
    assert body["fillsRemaining"] == 3


def test_template_api_precheck_blocks_when_pages_exceed_per_request_cap(client, app_main, base_user, mocker, auth_headers) -> None:
    _patch_auth(mocker, app_main, base_user)
    _patch_precheck_environment(mocker, app_main, current=10, monthly_limit=250, max_pages=50)

    response = client.get(
        "/api/template-api-endpoints/precheck?pdfCount=7&pageCount=80",
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["allowed"] is False
    assert body["reason"] == "pages_per_request"
    assert body["pageCountPerRequest"] == 80


def test_template_api_precheck_defaults_to_one_pdf(client, app_main, base_user, mocker, auth_headers) -> None:
    """Calling precheck with no params returns the single-template cost (1 fill, 0 pages)."""

    _patch_auth(mocker, app_main, base_user)
    _patch_precheck_environment(mocker, app_main, current=0, monthly_limit=250, max_pages=50)

    response = client.get(
        "/api/template-api-endpoints/precheck",
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["allowed"] is True
    assert body["pdfCount"] == 1
    assert body["pageCountPerRequest"] == 0


def test_template_api_precheck_requires_authentication(client, app_main, mocker) -> None:
    response = client.get("/api/template-api-endpoints/precheck?pdfCount=7")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Phase 6: backwards compatibility / migration safety
# ---------------------------------------------------------------------------


def test_pre_migration_template_endpoint_loads_with_template_scope_default() -> None:
    """A pre-migration endpoint document with no ``scope_type`` / ``group_id`` /
    ``group_name`` fields must deserialize cleanly with ``scope_type="template"``
    and the new fields defaulted to ``None``."""

    from backend.firebaseDB.template_api_endpoint_database import _serialize_template_api_endpoint_data

    pre_migration_data = {
        "user_id": "user_legacy",
        "template_id": "tpl-old",
        "template_name": "Legacy Template",
        "status": "active",
        "snapshot_version": 3,
        "key_prefix": "dpa_live_old",
        "secret_hash": "hash",
        "snapshot": {"version": 1, "sourcePdfPath": "gs://forms/old.pdf", "fields": []},
        "usage_count": 42,
        # No scope_type, no group_id, no group_name — pre-Phase-4 record.
    }
    record = _serialize_template_api_endpoint_data("tep-legacy", pre_migration_data)
    assert record.scope_type == "template"
    assert record.group_id is None
    assert record.group_name is None
    assert record.template_id == "tpl-old"
    assert record.usage_count == 42


def test_pre_migration_template_endpoint_serializes_to_template_pdf_fill_path(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    """The list endpoint payload for a pre-migration record reports the .pdf
    fillPath (not .zip) since the defensive default is ``scope_type="template"``."""

    from backend.firebaseDB.template_api_endpoint_database import _serialize_template_api_endpoint_data

    _patch_auth(mocker, app_main, base_user)
    _patch_limits(mocker, app_main)
    pre_migration = _serialize_template_api_endpoint_data(
        "tep-legacy",
        {
            "user_id": base_user.app_user_id,
            "template_id": "tpl-old",
            "template_name": "Legacy Template",
            "status": "active",
            "snapshot_version": 3,
            "key_prefix": "dpa_live_old",
            "secret_hash": "hash",
            "snapshot": {"version": 1, "sourcePdfPath": "gs://forms/old.pdf", "fields": []},
            "usage_count": 42,
        },
    )
    mocker.patch.object(app_main, "list_template_api_endpoints", return_value=[pre_migration])

    response = client.get("/api/template-api-endpoints", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    endpoint = payload["endpoints"][0]
    assert endpoint["scopeType"] == "template"
    assert endpoint["fillPath"] == "/api/v1/fill/tep-legacy.pdf"
    assert endpoint["groupId"] is None
    assert endpoint["groupName"] is None
    assert endpoint["templateId"] == "tpl-old"
