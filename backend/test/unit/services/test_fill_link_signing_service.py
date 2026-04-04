from __future__ import annotations

from types import SimpleNamespace
import pytest

from backend.services import fill_link_signing_service as service
from backend.services.signing_quota_service import SigningRequestMonthlyLimitError


@pytest.fixture(autouse=True)
def _default_available_template(mocker) -> None:
    mocker.patch.object(service, "get_template", return_value=SimpleNamespace(id="tpl-1"))
    mocker.patch.object(service, "get_user_retention_pending_template_ids", return_value=set())
    mocker.patch.object(service, "get_user_profile", return_value=None)
    mocker.patch.object(service, "get_signing_monthly_usage", return_value=None)
    mocker.patch.object(service, "attach_fill_link_response_signing_request", return_value=None)
    mocker.patch.object(service, "persist_business_disclosure_artifact", side_effect=lambda record, **_: record)
    mocker.patch.object(service, "persist_consumer_disclosure_artifact", side_effect=lambda record, **_: record)
    mocker.patch.object(service, "promote_signing_staged_object", return_value=None)


def test_ensure_fill_link_response_signing_request_uses_response_snapshot_when_link_snapshot_is_missing(mocker) -> None:
    mocker.patch.object(service, "build_immutable_signing_source_pdf", return_value=b"%PDF-1.4\nstub\n")
    create_mock = mocker.patch.object(
        service,
        "create_signing_request",
        return_value=SimpleNamespace(id="req-1", status="draft"),
    )
    mocker.patch.object(
        service,
        "mark_signing_request_sent",
        return_value=SimpleNamespace(id="req-1", status="sent", source_pdf_bucket_path="gs://bucket/source.pdf"),
    )
    upload_mock = mocker.patch.object(service, "upload_signing_pdf_bytes", return_value="gs://bucket/source.pdf")

    response_snapshot = {
        "filename": "template-one-response.pdf",
        "fields": [
            {
                "name": "signature",
                "type": "signature",
                "page": 1,
                "x": 1,
                "y": 2,
                "width": 100,
                "height": 20,
                "rect": [1, 2, 101, 22],
            },
        ],
    }
    link = SimpleNamespace(
        id="link-1",
        user_id="user-1",
        template_id="tpl-1",
        template_name="Template One",
        title="Template One Intake",
        respondent_pdf_snapshot=None,
    )
    response = SimpleNamespace(
        id="resp-1",
        respondent_label="Justin QA",
        answers={"full_name": "Justin QA", "email": "justin@example.com"},
        respondent_pdf_snapshot=response_snapshot,
        signing_request_id=None,
    )

    result = service.ensure_fill_link_response_signing_request(
        link=link,
        response=response,
        source_pdf_bytes=b"%PDF-1.4\nstub\n",
        signing_config={
            "esign_eligibility_confirmed": True,
            "esign_eligibility_confirmed_at": "2026-03-28T00:00:00+00:00",
            "esign_eligibility_confirmed_source": "fill_link_publish",
            "signature_mode": "business",
            "document_category": "ordinary_business_form",
            "manual_fallback_enabled": True,
            "signer_name_question_key": "full_name",
            "signer_email_question_key": "email",
        },
    )

    assert result.record.id == "req-1"
    assert result.record.status == "sent"
    assert result.created_now is True
    assert result.sent_now is True
    create_mock.assert_called_once()
    upload_mock.assert_called_once()


def test_normalize_fill_link_signing_config_requires_visible_email_question() -> None:
    with pytest.raises(ValueError, match="Add a visible email question"):
        service.normalize_fill_link_signing_config(
            {
                "enabled": True,
                "signatureMode": "business",
                "documentCategory": "ordinary_business_form",
                "manualFallbackEnabled": True,
                "signerNameQuestionKey": "name",
                "signerEmailQuestionKey": "name",
            },
            scope_type="template",
            questions=[
                {"key": "name", "label": "Name", "type": "text", "visible": True},
            ],
            fields=[
                {"name": "signature", "type": "signature", "page": 1, "rect": {"x": 1, "y": 1, "width": 2, "height": 1}},
            ],
        )


def test_resolve_fill_link_signer_identity_from_answers_requires_valid_email() -> None:
    with pytest.raises(ValueError, match="valid email address"):
        service.resolve_fill_link_signer_identity_from_answers(
            {"full_name": "Ada Lovelace", "email": "Ada Lovelace"},
            {
                "signer_name_question_key": "full_name",
                "signer_email_question_key": "email",
            },
        )


def test_ensure_fill_link_response_signing_request_recreates_invalidated_request(mocker) -> None:
    mocker.patch.object(service, "build_immutable_signing_source_pdf", return_value=b"%PDF-1.4\nstub\n")
    create_mock = mocker.patch.object(
        service,
        "create_signing_request",
        return_value=SimpleNamespace(id="req-new", status="draft"),
    )
    attach_mock = mocker.patch.object(service, "attach_fill_link_response_signing_request", return_value=None)
    mocker.patch.object(
        service,
        "get_signing_request_for_user",
        return_value=SimpleNamespace(id="req-old", status="invalidated"),
    )
    mocker.patch.object(service, "mark_signing_request_sent", return_value=SimpleNamespace(id="req-new", status="sent", source_pdf_bucket_path="gs://bucket/source-new.pdf"))
    mocker.patch.object(service, "upload_signing_pdf_bytes", return_value="gs://bucket/source-new.pdf")

    response_snapshot = {
        "filename": "template-one-response.pdf",
        "fields": [
            {
                "name": "signature",
                "type": "signature",
                "page": 1,
                "x": 1,
                "y": 2,
                "width": 100,
                "height": 20,
                "rect": [1, 2, 101, 22],
            },
        ],
    }
    link = SimpleNamespace(
        id="link-1",
        user_id="user-1",
        template_id="tpl-1",
        template_name="Template One",
        title="Template One Intake",
        respondent_pdf_snapshot=None,
    )
    response = SimpleNamespace(
        id="resp-1",
        respondent_label="Justin QA",
        answers={"full_name": "Justin QA", "email": "justin@example.com"},
        respondent_pdf_snapshot=response_snapshot,
        signing_request_id="req-old",
    )

    result = service.ensure_fill_link_response_signing_request(
        link=link,
        response=response,
        source_pdf_bytes=b"%PDF-1.4\nstub\n",
        signing_config={
            "esign_eligibility_confirmed": True,
            "esign_eligibility_confirmed_at": "2026-03-28T00:00:00+00:00",
            "esign_eligibility_confirmed_source": "fill_link_publish",
            "signature_mode": "business",
            "document_category": "ordinary_business_form",
            "manual_fallback_enabled": True,
            "signer_name_question_key": "full_name",
            "signer_email_question_key": "email",
        },
    )

    assert result.record.id == "req-new"
    assert result.created_now is True
    assert result.sent_now is True
    create_mock.assert_called_once()
    attach_mock.assert_called_once_with("resp-1", "link-1", "user-1", signing_request_id="req-new")


def test_ensure_fill_link_response_signing_request_blocks_when_template_is_queued_for_deletion(mocker) -> None:
    create_mock = mocker.patch.object(service, "create_signing_request")
    mocker.patch.object(service, "get_template", return_value=SimpleNamespace(id="tpl-1"))
    mocker.patch.object(service, "get_user_retention_pending_template_ids", return_value={"tpl-1"})

    link = SimpleNamespace(
        id="link-1",
        user_id="user-1",
        template_id="tpl-1",
        template_name="Template One",
        title="Template One Intake",
        respondent_pdf_snapshot=None,
    )
    response = SimpleNamespace(
        id="resp-1",
        respondent_label="Justin QA",
        answers={"full_name": "Justin QA", "email": "justin@example.com"},
        respondent_pdf_snapshot=None,
        signing_request_id=None,
    )

    with pytest.raises(
        service.FillLinkSigningUnavailableError,
        match="sender upgrades and reactivates the source form",
    ):
        service.ensure_fill_link_response_signing_request(
            link=link,
            response=response,
            source_pdf_bytes=b"%PDF-1.4\nstub\n",
            signing_config={
                "esign_eligibility_confirmed": True,
                "esign_eligibility_confirmed_at": "2026-03-28T00:00:00+00:00",
                "esign_eligibility_confirmed_source": "fill_link_publish",
                "signature_mode": "business",
                "document_category": "ordinary_business_form",
                "manual_fallback_enabled": True,
                "signer_name_question_key": "full_name",
                "signer_email_question_key": "email",
            },
        )

    create_mock.assert_not_called()


def test_ensure_fill_link_response_signing_request_blocks_send_when_monthly_limit_is_reached(mocker) -> None:
    mocker.patch.object(service, "build_immutable_signing_source_pdf", return_value=b"%PDF-1.4\nstub\n")
    create_mock = mocker.patch.object(
        service,
        "create_signing_request",
        return_value=SimpleNamespace(id="req-1", status="draft"),
    )
    mocker.patch.object(service, "get_user_profile", return_value=SimpleNamespace(role="base"))
    mocker.patch.object(service, "upload_signing_pdf_bytes", return_value="gs://bucket/source.pdf")
    mocker.patch.object(
        service,
        "mark_signing_request_sent",
        side_effect=SigningRequestMonthlyLimitError(limit=25),
    )

    response_snapshot = {
        "filename": "template-one-response.pdf",
        "fields": [
            {
                "name": "signature",
                "type": "signature",
                "page": 1,
                "x": 1,
                "y": 2,
                "width": 100,
                "height": 20,
                "rect": [1, 2, 101, 22],
            },
        ],
    }
    link = SimpleNamespace(
        id="link-1",
        user_id="user-1",
        template_id="tpl-1",
        template_name="Template One",
        title="Template One Intake",
        respondent_pdf_snapshot=None,
    )
    response = SimpleNamespace(
        id="resp-1",
        respondent_label="Justin QA",
        answers={"full_name": "Justin QA", "email": "justin@example.com"},
        respondent_pdf_snapshot=response_snapshot,
        signing_request_id=None,
    )

    with pytest.raises(SigningRequestMonthlyLimitError, match="25 sent signing request limit"):
        service.ensure_fill_link_response_signing_request(
            link=link,
            response=response,
            source_pdf_bytes=b"%PDF-1.4\nstub\n",
            signing_config={
                "esign_eligibility_confirmed": True,
                "esign_eligibility_confirmed_at": "2026-03-28T00:00:00+00:00",
                "esign_eligibility_confirmed_source": "fill_link_publish",
                "signature_mode": "business",
                "document_category": "ordinary_business_form",
                "manual_fallback_enabled": True,
                "signer_name_question_key": "full_name",
                "signer_email_question_key": "email",
            },
        )

    create_mock.assert_called_once()


def test_ensure_fill_link_response_signing_request_invalidates_draft_when_template_was_deleted(mocker) -> None:
    mocker.patch.object(
        service,
        "get_signing_request_for_user",
        return_value=SimpleNamespace(id="req-draft", status="draft"),
    )
    invalidate_mock = mocker.patch.object(service, "invalidate_signing_request", return_value=None)
    mocker.patch.object(service, "get_template", return_value=None)

    link = SimpleNamespace(
        id="link-1",
        user_id="user-1",
        template_id="tpl-1",
        template_name="Template One",
        title="Template One Intake",
        respondent_pdf_snapshot=None,
    )
    response = SimpleNamespace(
        id="resp-1",
        respondent_label="Justin QA",
        answers={"full_name": "Justin QA", "email": "justin@example.com"},
        respondent_pdf_snapshot=None,
        signing_request_id="req-draft",
    )

    with pytest.raises(
        service.FillLinkSigningUnavailableError,
        match="source form was deleted",
    ):
        service.ensure_fill_link_response_signing_request(
            link=link,
            response=response,
            source_pdf_bytes=b"%PDF-1.4\nstub\n",
            signing_config={
                "esign_eligibility_confirmed": True,
                "esign_eligibility_confirmed_at": "2026-03-28T00:00:00+00:00",
                "esign_eligibility_confirmed_source": "fill_link_publish",
                "signature_mode": "business",
                "document_category": "ordinary_business_form",
                "manual_fallback_enabled": True,
                "signer_name_question_key": "full_name",
                "signer_email_question_key": "email",
            },
        )

    invalidate_mock.assert_called_once_with(
        "req-draft",
        "user-1",
        reason="This signing draft can no longer be sent because its saved form was deleted.",
    )


def test_normalize_fill_link_signing_config_requires_esign_attestation() -> None:
    with pytest.raises(ValueError, match="eligible for DullyPDF"):
        service.normalize_fill_link_signing_config(
            {
                "enabled": True,
                "signatureMode": "business",
                "documentCategory": "ordinary_business_form",
                "manualFallbackEnabled": True,
                "signerNameQuestionKey": "name",
                "signerEmailQuestionKey": "email",
            },
            scope_type="template",
            questions=[
                {"key": "name", "label": "Name", "type": "text", "visible": True},
                {"key": "email", "label": "Email", "type": "email", "visible": True},
            ],
            fields=[
                {"name": "signature", "type": "signature", "page": 1, "rect": {"x": 1, "y": 1, "width": 2, "height": 1}},
            ],
        )


def test_ensure_fill_link_response_signing_request_revalidates_document_category(mocker) -> None:
    mocker.patch.object(service, "build_immutable_signing_source_pdf", return_value=b"%PDF-1.4\nstub\n")
    mocker.patch.object(service, "upload_signing_pdf_bytes", return_value="gs://bucket/source.pdf")

    response_snapshot = {
        "filename": "template-one-response.pdf",
        "fields": [
            {
                "name": "signature",
                "type": "signature",
                "page": 1,
                "x": 1,
                "y": 2,
                "width": 100,
                "height": 20,
                "rect": [1, 2, 101, 22],
            },
        ],
    }
    link = SimpleNamespace(
        id="link-1",
        user_id="user-1",
        template_id="tpl-1",
        template_name="Template One",
        title="Template One Intake",
        respondent_pdf_snapshot=None,
    )
    response = SimpleNamespace(
        id="resp-1",
        respondent_label="Justin QA",
        answers={"full_name": "Justin QA", "email": "justin@example.com"},
        respondent_pdf_snapshot=response_snapshot,
        signing_request_id=None,
    )

    with pytest.raises(ValueError, match="blocked"):
        service.ensure_fill_link_response_signing_request(
            link=link,
            response=response,
            source_pdf_bytes=b"%PDF-1.4\nstub\n",
            signing_config={
                "esign_eligibility_confirmed": True,
                "signature_mode": "business",
                "document_category": "court_document",
                "manual_fallback_enabled": True,
                "signer_name_question_key": "full_name",
                "signer_email_question_key": "email",
            },
        )


def test_ensure_fill_link_response_signing_request_rolls_back_when_source_promotion_fails(mocker) -> None:
    immutable_source_pdf_bytes = b"%PDF-1.4\nstub\n"
    mocker.patch.object(service, "build_immutable_signing_source_pdf", return_value=immutable_source_pdf_bytes)
    mocker.patch.object(
        service,
        "create_signing_request",
        return_value=SimpleNamespace(id="req-rollback", status="draft"),
    )
    mocker.patch.object(
        service,
        "mark_signing_request_sent",
        return_value=SimpleNamespace(
            id="req-rollback",
            status="sent",
            source_pdf_bucket_path="gs://bucket/source.pdf",
            retention_until="2033-03-28T00:00:00+00:00",
        ),
    )
    mocker.patch.object(service, "upload_signing_pdf_bytes", return_value="gs://bucket/source.pdf")
    mocker.patch.object(service, "resolve_signing_stage_bucket_path", return_value="gs://staging/_staging/source.pdf")
    mocker.patch.object(service, "promote_signing_staged_object", side_effect=RuntimeError("retention failed"))
    rollback_mock = mocker.patch.object(
        service,
        "rollback_signing_request_sent",
        return_value=SimpleNamespace(id="req-rollback", status="draft"),
    )
    delete_mock = mocker.patch.object(service, "delete_storage_object", return_value=None)

    response_snapshot = {
        "filename": "template-one-response.pdf",
        "fields": [
            {
                "name": "signature",
                "type": "signature",
                "page": 1,
                "x": 1,
                "y": 2,
                "width": 100,
                "height": 20,
                "rect": [1, 2, 101, 22],
            },
        ],
    }
    link = SimpleNamespace(
        id="link-1",
        user_id="user-1",
        template_id="tpl-1",
        template_name="Template One",
        title="Template One Intake",
        respondent_pdf_snapshot=None,
    )
    response = SimpleNamespace(
        id="resp-1",
        respondent_label="Justin QA",
        answers={"full_name": "Justin QA", "email": "justin@example.com"},
        respondent_pdf_snapshot=response_snapshot,
        signing_request_id=None,
    )

    with pytest.raises(service.FillLinkSigningUnavailableError, match="could not finalize the retained source PDF"):
        service.ensure_fill_link_response_signing_request(
            link=link,
            response=response,
            source_pdf_bytes=immutable_source_pdf_bytes,
            signing_config={
                "esign_eligibility_confirmed": True,
                "esign_eligibility_confirmed_at": "2026-03-28T00:00:00+00:00",
                "esign_eligibility_confirmed_source": "fill_link_publish",
                "signature_mode": "business",
                "document_category": "ordinary_business_form",
                "manual_fallback_enabled": True,
                "signer_name_question_key": "full_name",
                "signer_email_question_key": "email",
            },
        )

    rollback_mock.assert_called_once_with(
        "req-rollback",
        "user-1",
        expected_source_pdf_bucket_path="gs://bucket/source.pdf",
        expected_source_pdf_sha256=service.sha256_hex_for_bytes(immutable_source_pdf_bytes),
    )
    delete_mock.assert_called_once_with("gs://staging/_staging/source.pdf")
