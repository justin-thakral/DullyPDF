from backend.firebaseDB.group_database import TemplateGroupRecord
from backend.firebaseDB.fill_link_database import FillLinkRecord
from backend.firebaseDB.template_database import TemplateRecord


def _template_record(
    *,
    template_id: str,
    name: str,
    created_at: str = "2025-01-01T00:00:00.000Z",
) -> TemplateRecord:
    return TemplateRecord(
        id=template_id,
        pdf_bucket_path=f"gs://forms/{template_id}.pdf",
        template_bucket_path=f"gs://templates/{template_id}.pdf",
        metadata={},
        created_at=created_at,
        updated_at=created_at,
        name=name,
    )


def _group_record(
    *,
    group_id: str = "group-1",
    user_id: str = "user_base",
    name: str = "Admissions",
    template_ids: list[str] | None = None,
) -> TemplateGroupRecord:
    return TemplateGroupRecord(
        id=group_id,
        user_id=user_id,
        name=name,
        normalized_name=name.lower(),
        template_ids=template_ids or ["tpl-b", "tpl-a"],
        created_at="2025-01-02T00:00:00.000Z",
        updated_at="2025-01-02T00:00:00.000Z",
    )


def _fill_link_record(
    *,
    link_id: str = "link-1",
    group_id: str = "group-1",
    group_name: str = "Admissions",
    template_ids: list[str] | None = None,
    status: str = "active",
    title: str | None = "Admissions",
) -> FillLinkRecord:
    questions = [{"key": "full_name", "label": "Full Name", "type": "text"}]
    return FillLinkRecord(
        id=link_id,
        user_id="user_base",
        scope_type="group",
        template_id=None,
        template_name=None,
        group_id=group_id,
        group_name=group_name,
        template_ids=template_ids or ["tpl-b", "tpl-a"],
        title=title,
        public_token="token-1",
        status=status,
        closed_reason=None if status == "active" else "owner_closed",
        response_count=0,
        questions=questions,
        require_all_fields=False,
        web_form_config={"schemaVersion": 2, "questions": questions},
        signing_config=None,
        created_at="2025-01-02T00:00:00.000Z",
        updated_at="2025-01-02T00:00:00.000Z",
        published_at="2025-01-02T00:00:00.000Z",
        closed_at=None,
    )


def _patch_auth(mocker, app_main, user) -> None:
    mocker.patch.object(app_main, "_verify_token", return_value={"uid": user.app_user_id})
    mocker.patch.object(app_main, "ensure_user", return_value=user)


def test_list_groups_serializes_template_summaries_in_alphabetical_order(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(
        app_main,
        "list_templates",
        return_value=[
            _template_record(template_id="tpl-a", name="Alpha Packet"),
            _template_record(template_id="tpl-b", name="Bravo Intake"),
        ],
    )
    mocker.patch.object(
        app_main,
        "list_groups",
        return_value=[_group_record(template_ids=["tpl-b", "tpl-a"])],
    )

    response = client.get("/api/groups", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["groups"][0]["name"] == "Admissions"
    assert payload["groups"][0]["templateIds"] == ["tpl-a", "tpl-b"]
    assert [entry["name"] for entry in payload["groups"][0]["templates"]] == [
        "Alpha Packet",
        "Bravo Intake",
    ]


def test_create_group_rejects_unknown_template_ids(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(
        app_main,
        "list_templates",
        return_value=[_template_record(template_id="tpl-a", name="Alpha Packet")],
    )
    mocker.patch.object(app_main, "list_groups", return_value=[])

    response = client.post(
        "/api/groups",
        json={"name": "Admissions", "templateIds": ["tpl-a", "tpl-missing"]},
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert "not found" in response.text.lower()


def test_create_group_rejects_duplicate_normalized_name(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(
        app_main,
        "list_templates",
        return_value=[_template_record(template_id="tpl-a", name="Alpha Packet")],
    )
    mocker.patch.object(app_main, "normalize_group_name", side_effect=lambda value: "admissions intake")
    mocker.patch.object(
        app_main,
        "list_groups",
        return_value=[_group_record(name="Admissions Intake", template_ids=["tpl-a"])],
    )

    response = client.post(
        "/api/groups",
        json={"name": "  Admissions   Intake ", "templateIds": ["tpl-a"]},
        headers=auth_headers,
    )

    assert response.status_code == 409
    assert "already exists" in response.text


def test_create_group_returns_created_group_payload(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    templates = [
        _template_record(template_id="tpl-a", name="Alpha Packet"),
        _template_record(template_id="tpl-b", name="Bravo Intake"),
    ]
    created_group = _group_record(name="Admissions", template_ids=["tpl-b", "tpl-a"])
    mocker.patch.object(app_main, "list_templates", return_value=templates)
    mocker.patch.object(app_main, "list_groups", return_value=[])
    create_group_mock = mocker.patch.object(app_main, "create_group", return_value=created_group)

    response = client.post(
        "/api/groups",
        json={"name": "Admissions", "templateIds": ["tpl-b", "tpl-a"]},
        headers=auth_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["group"]["name"] == "Admissions"
    assert payload["group"]["templateIds"] == ["tpl-a", "tpl-b"]
    create_group_mock.assert_called_once_with(base_user.app_user_id, name="Admissions", template_ids=["tpl-b", "tpl-a"])


def test_get_group_returns_404_when_missing(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "get_group", return_value=None)

    response = client.get("/api/groups/missing", headers=auth_headers)

    assert response.status_code == 404
    assert "Group not found" in response.text


def test_update_group_rejects_duplicate_name(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "get_group", return_value=_group_record(group_id="group-1", name="Admissions"))
    mocker.patch.object(
        app_main,
        "list_templates",
        return_value=[_template_record(template_id="tpl-a", name="Alpha Packet")],
    )
    mocker.patch.object(app_main, "normalize_group_name", side_effect=lambda value: "admissions intake")
    mocker.patch.object(
        app_main,
        "list_groups",
        return_value=[
            _group_record(group_id="group-1", name="Admissions", template_ids=["tpl-a"]),
            _group_record(group_id="group-2", name="Admissions Intake", template_ids=["tpl-a"]),
        ],
    )

    response = client.patch(
        "/api/groups/group-1",
        json={"name": "Admissions Intake", "templateIds": ["tpl-a"]},
        headers=auth_headers,
    )

    assert response.status_code == 409
    assert "already exists" in response.text


def test_update_group_returns_updated_payload(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    templates = [
        _template_record(template_id="tpl-a", name="Alpha Packet"),
        _template_record(template_id="tpl-b", name="Bravo Intake"),
    ]
    mocker.patch.object(app_main, "get_group", return_value=_group_record(group_id="group-1", name="Admissions"))
    mocker.patch.object(app_main, "list_templates", return_value=templates)
    mocker.patch.object(app_main, "list_groups", return_value=[_group_record(group_id="group-1", name="Admissions")])
    update_group_mock = mocker.patch.object(
        app_main,
        "update_group",
        return_value=_group_record(group_id="group-1", name="Updated Admissions", template_ids=["tpl-b", "tpl-a"]),
    )

    response = client.patch(
        "/api/groups/group-1",
        json={"name": "Updated Admissions", "templateIds": ["tpl-b", "tpl-a"]},
        headers=auth_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["group"]["name"] == "Updated Admissions"
    assert payload["group"]["templateIds"] == ["tpl-a", "tpl-b"]
    update_group_mock.assert_called_once_with(
        "group-1",
        base_user.app_user_id,
        name="Updated Admissions",
        template_ids=["tpl-b", "tpl-a"],
    )


def test_update_group_closes_active_group_fill_link_when_template_membership_changes(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    existing_group = _group_record(group_id="group-1", name="Admissions", template_ids=["tpl-a", "tpl-b"])
    updated_group = _group_record(group_id="group-1", name="Admissions", template_ids=["tpl-a"])
    mocker.patch.object(app_main, "get_group", return_value=existing_group)
    mocker.patch.object(
        app_main,
        "list_templates",
        return_value=[
            _template_record(template_id="tpl-a", name="Alpha Packet"),
            _template_record(template_id="tpl-b", name="Bravo Intake"),
        ],
    )
    mocker.patch.object(app_main, "list_groups", return_value=[existing_group])
    mocker.patch.object(app_main, "update_group", return_value=updated_group)
    mocker.patch.object(app_main, "get_fill_link_for_group", return_value=_fill_link_record(template_ids=["tpl-a", "tpl-b"]))
    close_fill_link_mock = mocker.patch.object(app_main, "close_fill_link", return_value=_fill_link_record(status="closed", template_ids=["tpl-a", "tpl-b"]))
    update_fill_link_mock = mocker.patch.object(app_main, "update_fill_link", return_value=None)

    response = client.patch(
        "/api/groups/group-1",
        json={"name": "Admissions", "templateIds": ["tpl-a"]},
        headers=auth_headers,
    )

    assert response.status_code == 200
    close_fill_link_mock.assert_called_once_with("link-1", base_user.app_user_id, closed_reason="group_updated")
    update_fill_link_mock.assert_not_called()


def test_update_group_syncs_existing_group_fill_link_name_without_closing_when_membership_is_unchanged(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    existing_group = _group_record(group_id="group-1", name="Admissions", template_ids=["tpl-a", "tpl-b"])
    updated_group = _group_record(group_id="group-1", name="Updated Admissions", template_ids=["tpl-a", "tpl-b"])
    mocker.patch.object(app_main, "get_group", return_value=existing_group)
    mocker.patch.object(
        app_main,
        "list_templates",
        return_value=[
            _template_record(template_id="tpl-a", name="Alpha Packet"),
            _template_record(template_id="tpl-b", name="Bravo Intake"),
        ],
    )
    mocker.patch.object(app_main, "list_groups", return_value=[existing_group])
    mocker.patch.object(app_main, "update_group", return_value=updated_group)
    mocker.patch.object(app_main, "get_fill_link_for_group", return_value=_fill_link_record(group_name="Admissions", title="Admissions"))
    close_fill_link_mock = mocker.patch.object(app_main, "close_fill_link", return_value=None)
    update_fill_link_mock = mocker.patch.object(app_main, "update_fill_link", return_value=_fill_link_record(group_name="Updated Admissions", title="Updated Admissions"))

    response = client.patch(
        "/api/groups/group-1",
        json={"name": "Updated Admissions", "templateIds": ["tpl-a", "tpl-b"]},
        headers=auth_headers,
    )

    assert response.status_code == 200
    close_fill_link_mock.assert_not_called()
    update_fill_link_mock.assert_called_once_with(
        "link-1",
        base_user.app_user_id,
        group_name="Updated Admissions",
        title="Updated Admissions",
    )


def test_delete_group_returns_success(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "get_group", return_value=_group_record(group_id="group-1", name="Admissions", template_ids=["tpl-a"]))
    call_order: list[str] = []

    def _close_links(*args, **kwargs):
        call_order.append("close")
        return 1

    def _delete_group(*args, **kwargs):
        call_order.append("delete")
        return True

    delete_group_mock = mocker.patch.object(app_main, "delete_group", side_effect=_delete_group)
    close_links_mock = mocker.patch.object(app_main, "close_fill_links_for_group", side_effect=_close_links)

    response = client.delete("/api/groups/group-1", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {"success": True}
    assert call_order == ["close", "delete"]
    delete_group_mock.assert_called_once_with("group-1", base_user.app_user_id)
    close_links_mock.assert_called_once_with("group-1", base_user.app_user_id, closed_reason="group_deleted")


def test_delete_group_returns_404_when_missing(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "get_group", return_value=None)

    response = client.delete("/api/groups/missing", headers=auth_headers)

    assert response.status_code == 404
    assert "Group not found" in response.text


# ---------------------------------------------------------------------------
# GET /api/groups/{group_id}/canonical-schema (Phase 2)
# ---------------------------------------------------------------------------


def _editor_snapshot(*fields: dict) -> dict:
    return {
        "version": 2,
        "pageCount": 1,
        "pageSizes": {"1": {"width": 612.0, "height": 792.0}},
        "fields": list(fields),
        "radioGroups": [],
        "hasRenamedFields": True,
        "hasMappedSchema": False,
    }


def _text_field(name: str, *, field_id: str | None = None, page: int = 1, y: int = 10) -> dict:
    return {
        "id": field_id or f"f-{name}",
        "name": name,
        "type": "text",
        "page": page,
        "rect": {"x": 10.0, "y": float(y), "width": 100.0, "height": 14.0},
    }


def _date_field(name: str, *, field_id: str | None = None, page: int = 1, y: int = 10) -> dict:
    return {
        "id": field_id or f"f-{name}",
        "name": name,
        "type": "date",
        "page": page,
        "rect": {"x": 10.0, "y": float(y), "width": 100.0, "height": 14.0},
    }


def _template_record_with_snapshot(template_id: str, name: str) -> TemplateRecord:
    return TemplateRecord(
        id=template_id,
        pdf_bucket_path=f"gs://forms/{template_id}.pdf",
        template_bucket_path=f"gs://templates/{template_id}.pdf",
        metadata={"editorSnapshot": {"version": 2, "path": f"gs://snapshots/{template_id}.json"}},
        created_at="2025-01-01T00:00:00.000Z",
        updated_at="2025-01-01T00:00:00.000Z",
        name=name,
    )


def test_canonical_schema_returns_404_when_group_missing(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "get_group", return_value=None)

    response = client.get("/api/groups/missing/canonical-schema", headers=auth_headers)
    assert response.status_code == 404
    assert "Group not found" in response.text


def test_canonical_schema_merges_two_template_snapshots(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    group = _group_record(group_id="grp-1", template_ids=["tpl-1", "tpl-2"])
    mocker.patch.object(app_main, "get_group", return_value=group)

    template_lookup = {
        "tpl-1": _template_record_with_snapshot("tpl-1", "I-130"),
        "tpl-2": _template_record_with_snapshot("tpl-2", "I-130A"),
    }
    snapshot_lookup = {
        "tpl-1": _editor_snapshot(_text_field("petitioner_name"), _date_field("petitioner_dob", y=30)),
        "tpl-2": _editor_snapshot(_text_field("petitioner_name"), _text_field("beneficiary_name", y=30)),
    }

    mocker.patch.object(app_main, "get_template", side_effect=lambda template_id, user_id: template_lookup.get(template_id))
    mocker.patch.object(
        app_main,
        "load_saved_form_editor_snapshot",
        side_effect=lambda metadata: snapshot_lookup.get(
            (metadata or {}).get("editorSnapshot", {}).get("path", "").split("/")[-1].replace(".json", "")
        ),
    )

    response = client.get("/api/groups/grp-1/canonical-schema", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()

    schema = body["schema"]
    assert schema["groupId"] == "grp-1"
    assert sorted(schema["templateIds"]) == ["tpl-1", "tpl-2"]

    canonical_keys = {field["canonicalKey"] for field in schema["fields"]}
    assert canonical_keys == {"petitioner_name", "petitioner_dob", "beneficiary_name"}

    petitioner_name = next(field for field in schema["fields"] if field["canonicalKey"] == "petitioner_name")
    binding_template_ids = sorted({binding["templateId"] for binding in petitioner_name["perTemplateBindings"]})
    assert binding_template_ids == ["tpl-1", "tpl-2"]


def test_canonical_schema_warns_on_missing_template_snapshots(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    """A template in the group with no editor snapshot is reported in skippedTemplateIds."""

    _patch_auth(mocker, app_main, base_user)
    group = _group_record(group_id="grp-1", template_ids=["tpl-1", "tpl-missing"])
    mocker.patch.object(app_main, "get_group", return_value=group)

    template_lookup = {
        "tpl-1": _template_record_with_snapshot("tpl-1", "I-130"),
        "tpl-missing": _template_record_with_snapshot("tpl-missing", "Pending"),
    }
    snapshot_lookup = {"tpl-1": _editor_snapshot(_text_field("petitioner_name"))}

    mocker.patch.object(app_main, "get_template", side_effect=lambda template_id, user_id: template_lookup.get(template_id))
    mocker.patch.object(
        app_main,
        "load_saved_form_editor_snapshot",
        side_effect=lambda metadata: snapshot_lookup.get(
            (metadata or {}).get("editorSnapshot", {}).get("path", "").split("/")[-1].replace(".json", "")
        ),
    )

    response = client.get("/api/groups/grp-1/canonical-schema", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["skippedTemplateIds"] == ["tpl-missing"]
    canonical_keys = {field["canonicalKey"] for field in body["schema"]["fields"]}
    assert canonical_keys == {"petitioner_name"}


def test_canonical_schema_strict_mode_returns_422_on_type_conflict(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    group = _group_record(group_id="grp-1", template_ids=["tpl-1", "tpl-2"])
    mocker.patch.object(app_main, "get_group", return_value=group)

    template_lookup = {
        "tpl-1": _template_record_with_snapshot("tpl-1", "Form A"),
        "tpl-2": _template_record_with_snapshot("tpl-2", "Form B"),
    }
    # 'dob' is a text field on tpl-1 but a date field on tpl-2 — strict mode must reject.
    snapshot_lookup = {
        "tpl-1": _editor_snapshot(_text_field("dob")),
        "tpl-2": _editor_snapshot(_date_field("dob")),
    }

    mocker.patch.object(app_main, "get_template", side_effect=lambda template_id, user_id: template_lookup.get(template_id))
    mocker.patch.object(
        app_main,
        "load_saved_form_editor_snapshot",
        side_effect=lambda metadata: snapshot_lookup.get(
            (metadata or {}).get("editorSnapshot", {}).get("path", "").split("/")[-1].replace(".json", "")
        ),
    )

    response = client.get("/api/groups/grp-1/canonical-schema?strict=true", headers=auth_headers)
    assert response.status_code == 422
    body = response.json()
    assert body["detail"]["code"] == "group_schema_type_conflict"
    assert body["detail"]["canonicalKey"] == "dob"
    assert sorted(body["detail"]["conflictingTypes"]) == sorted({"text", "date"})


def test_canonical_schema_soft_mode_emits_warnings_instead_of_failing(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    group = _group_record(group_id="grp-1", template_ids=["tpl-1", "tpl-2"])
    mocker.patch.object(app_main, "get_group", return_value=group)

    template_lookup = {
        "tpl-1": _template_record_with_snapshot("tpl-1", "Form A"),
        "tpl-2": _template_record_with_snapshot("tpl-2", "Form B"),
    }
    snapshot_lookup = {
        "tpl-1": _editor_snapshot(_text_field("dob")),
        "tpl-2": _editor_snapshot(_date_field("dob")),
    }

    mocker.patch.object(app_main, "get_template", side_effect=lambda template_id, user_id: template_lookup.get(template_id))
    mocker.patch.object(
        app_main,
        "load_saved_form_editor_snapshot",
        side_effect=lambda metadata: snapshot_lookup.get(
            (metadata or {}).get("editorSnapshot", {}).get("path", "").split("/")[-1].replace(".json", "")
        ),
    )

    response = client.get("/api/groups/grp-1/canonical-schema", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    warning_codes = [warning["code"] for warning in body["warnings"]]
    assert "type_conflict_soft" in warning_codes
    dob = next(field for field in body["schema"]["fields"] if field["canonicalKey"] == "dob")
    assert dob["type"] == "date"  # more-constrained type wins


def test_canonical_schema_includes_checkbox_rules_from_template_metadata(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    """Checkbox rules persisted on template metadata flow through to canonical questions."""

    _patch_auth(mocker, app_main, base_user)
    group = _group_record(group_id="grp-1", template_ids=["tpl-1"])
    mocker.patch.object(app_main, "get_group", return_value=group)

    template = TemplateRecord(
        id="tpl-1",
        pdf_bucket_path="gs://forms/tpl-1.pdf",
        template_bucket_path="gs://templates/tpl-1.pdf",
        metadata={
            "editorSnapshot": {"version": 2, "path": "gs://snapshots/tpl-1.json"},
            "fillRules": {
                "checkboxRules": [
                    {"databaseField": "marital_status", "groupKey": "marital_status", "operation": "enum"}
                ]
            },
        },
        created_at="2025-01-01T00:00:00.000Z",
        updated_at="2025-01-01T00:00:00.000Z",
        name="Form A",
    )
    snapshot = _editor_snapshot(
        {
            "id": "f-single",
            "name": "i_marital_status_single",
            "type": "checkbox",
            "page": 1,
            "rect": {"x": 10.0, "y": 10.0, "width": 14.0, "height": 14.0},
            "groupKey": "marital_status",
            "groupLabel": "Marital Status",
            "optionKey": "single",
            "optionLabel": "Single",
        },
        {
            "id": "f-married",
            "name": "i_marital_status_married",
            "type": "checkbox",
            "page": 1,
            "rect": {"x": 30.0, "y": 10.0, "width": 14.0, "height": 14.0},
            "groupKey": "marital_status",
            "groupLabel": "Marital Status",
            "optionKey": "married",
            "optionLabel": "Married",
        },
    )

    mocker.patch.object(app_main, "get_template", return_value=template)
    mocker.patch.object(app_main, "load_saved_form_editor_snapshot", return_value=snapshot)

    response = client.get("/api/groups/grp-1/canonical-schema", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    marital = next(field for field in body["schema"]["fields"] if field["canonicalKey"] == "marital_status")
    assert marital["type"] == "radio_group"
    assert marital["allowedValues"] == ["single", "married"]


def test_canonical_schema_returns_empty_fields_when_group_has_no_loadable_templates(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    group = _group_record(group_id="grp-1", template_ids=["tpl-1"])
    mocker.patch.object(app_main, "get_group", return_value=group)
    mocker.patch.object(app_main, "get_template", return_value=None)

    response = client.get("/api/groups/grp-1/canonical-schema", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["schema"]["fields"] == []
    assert body["skippedTemplateIds"] == ["tpl-1"]
