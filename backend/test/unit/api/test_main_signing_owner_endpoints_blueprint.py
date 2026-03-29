from __future__ import annotations

from types import SimpleNamespace


def _patch_auth(mocker, app_main, user) -> None:
    mocker.patch.object(app_main, "_verify_token", return_value={"uid": user.app_user_id})
    mocker.patch.object(app_main, "ensure_user", return_value=user)


def _business_disclosure_fields() -> dict[str, str]:
    return {
        "sender_display_name": "Owner Example",
        "sender_contact_email": "owner@example.com",
        "paper_copy_procedure": "Email owner@example.com for a paper copy.",
        "paper_copy_fee_description": "No fee.",
        "withdrawal_procedure": "Email owner@example.com before completion.",
        "withdrawal_consequences": "The signing request will be canceled.",
        "contact_update_procedure": "Email owner@example.com with updates.",
        "consent_scope_description": "This consent applies only to this request.",
    }


def test_owner_signing_create_rejects_template_queued_for_downgrade_deletion(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(
        app_main,
        "resolve_signing_consumer_disclosure_fields",
        return_value=_business_disclosure_fields(),
    )
    mocker.patch.object(app_main, "get_user_retention_pending_template_ids", return_value={"tpl-queued"})
    create_mock = mocker.patch.object(app_main, "create_signing_request")

    response = client.post(
        "/api/signing/requests",
        headers=auth_headers,
        json={
            "mode": "sign",
            "signatureMode": "business",
            "sourceType": "workspace",
            "sourceId": "tpl-queued",
            "sourceTemplateId": "tpl-queued",
            "sourceTemplateName": "Queued Template",
            "sourceDocumentName": "Queued Template",
            "sourcePdfSha256": "a" * 64,
            "documentCategory": "ordinary_business_form",
            "esignEligibilityConfirmed": True,
            "signerName": "Ada Lovelace",
            "signerEmail": "ada@example.com",
            "anchors": [],
        },
    )

    assert response.status_code == 409
    assert "locked on the base plan" in response.json()["detail"]
    create_mock.assert_not_called()


def test_owner_signing_send_rejects_template_queued_for_downgrade_deletion(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "ensure_signing_storage_configuration", return_value=None)
    mocker.patch.object(
        app_main,
        "get_signing_request_for_user",
        return_value=SimpleNamespace(id="req-1", source_template_id="tpl-queued", status="draft"),
    )
    mocker.patch.object(app_main, "validate_signing_sendable_record", return_value=None)
    mocker.patch.object(app_main, "get_user_retention_pending_template_ids", return_value={"tpl-queued"})
    read_upload_mock = mocker.patch.object(app_main, "read_upload_bytes")

    response = client.post(
        "/api/signing/requests/req-1/send",
        headers=auth_headers,
        files={"pdf": ("source.pdf", b"%PDF-1.4\n", "application/pdf")},
    )

    assert response.status_code == 409
    assert "locked on the base plan" in response.json()["detail"]
    read_upload_mock.assert_not_called()


def test_owner_signing_send_invalidates_draft_when_source_template_was_deleted(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    mocker.patch.object(app_main, "ensure_signing_storage_configuration", return_value=None)
    mocker.patch.object(
        app_main,
        "get_signing_request_for_user",
        return_value=SimpleNamespace(id="req-1", source_template_id="tpl-missing", status="draft"),
    )
    mocker.patch.object(app_main, "validate_signing_sendable_record", return_value=None)
    mocker.patch.object(app_main, "get_user_retention_pending_template_ids", return_value=set())
    mocker.patch.object(app_main, "get_template", return_value=None)
    invalidate_mock = mocker.patch.object(
        app_main,
        "invalidate_signing_request",
        return_value=SimpleNamespace(
            invalidation_reason="This signing draft can no longer be sent because its saved form was deleted."
        ),
    )
    read_upload_mock = mocker.patch.object(app_main, "read_upload_bytes")

    response = client.post(
        "/api/signing/requests/req-1/send",
        headers=auth_headers,
        files={"pdf": ("source.pdf", b"%PDF-1.4\n", "application/pdf")},
    )

    assert response.status_code == 409
    assert "saved form was deleted" in response.json()["detail"]
    invalidate_mock.assert_called_once_with(
        "req-1",
        "user_base",
        reason="This signing draft can no longer be sent because its saved form was deleted.",
    )
    read_upload_mock.assert_not_called()


def test_owner_signing_send_rolls_back_when_source_promotion_fails(
    client,
    app_main,
    base_user,
    mocker,
    auth_headers,
) -> None:
    _patch_auth(mocker, app_main, base_user)
    pdf_bytes = b"%PDF-1.4\nrolled-back\n"
    source_sha256 = app_main.sha256_hex_for_bytes(pdf_bytes)
    record = SimpleNamespace(
        id="req-1",
        source_template_id=None,
        status="draft",
        source_type="workspace",
        source_id="form-1",
        source_pdf_sha256=source_sha256,
        source_document_name="Bravo Packet",
        mode="sign",
        owner_review_confirmed_at=None,
    )
    sent_record = SimpleNamespace(
        id="req-1",
        status="sent",
        source_pdf_bucket_path="gs://bucket/source.pdf",
        source_pdf_sha256=source_sha256,
        source_type="workspace",
        source_id="form-1",
        source_template_id=None,
        source_document_name="Bravo Packet",
        mode="sign",
        owner_review_confirmed_at=None,
        retention_until="2033-03-28T00:00:00+00:00",
    )

    mocker.patch.object(app_main, "ensure_signing_storage_configuration", return_value=None)
    mocker.patch.object(app_main, "get_signing_request_for_user", return_value=record)
    mocker.patch.object(app_main, "validate_signing_sendable_record", return_value=None)
    mocker.patch.object(app_main, "get_user_retention_pending_template_ids", return_value=set())
    mocker.patch.object(app_main, "read_upload_bytes", return_value=pdf_bytes)
    mocker.patch.object(app_main, "validate_pdf_for_detection", return_value=SimpleNamespace(pdf_bytes=pdf_bytes, page_count=1))
    mocker.patch.object(app_main, "resolve_fillable_max_pages", return_value=10)
    mocker.patch.object(app_main, "pdf_has_form_widgets", return_value=False)
    mocker.patch.object(app_main, "upload_signing_pdf_bytes", return_value="gs://bucket/source.pdf")
    mocker.patch.object(app_main, "resolve_signing_stage_bucket_path", return_value="gs://staging/_staging/source.pdf")
    mocker.patch.object(app_main, "mark_signing_request_sent", return_value=sent_record)
    mocker.patch.object(app_main, "promote_signing_staged_object", side_effect=RuntimeError("retention failed"))
    rollback_mock = mocker.patch.object(app_main, "rollback_signing_request_sent", return_value=record)
    delete_mock = mocker.patch.object(app_main, "delete_storage_object", return_value=None)
    persist_business_mock = mocker.patch.object(app_main, "persist_business_disclosure_artifact")
    persist_consumer_mock = mocker.patch.object(app_main, "persist_consumer_disclosure_artifact")

    response = client.post(
        "/api/signing/requests/req-1/send",
        headers=auth_headers,
        files={"pdf": ("source.pdf", pdf_bytes, "application/pdf")},
        data={"sourcePdfSha256": source_sha256},
    )

    assert response.status_code == 503
    assert "retained source pdf" in response.json()["detail"].lower()
    rollback_mock.assert_called_once_with(
        "req-1",
        "user_base",
        expected_source_pdf_bucket_path="gs://bucket/source.pdf",
        expected_source_pdf_sha256=source_sha256,
    )
    delete_mock.assert_called_once_with("gs://staging/_staging/source.pdf")
    persist_business_mock.assert_not_called()
    persist_consumer_mock.assert_not_called()
