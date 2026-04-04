"""Unit tests for Firestore-backed Fill By Link storage helpers."""

import pytest

from backend.firebaseDB import fill_link_database as fldb
from backend.services.fill_links_service import build_fill_link_public_token
from backend.test.unit.firebase._fakes import FakeFirestoreClient


@pytest.fixture(autouse=True)
def _no_transaction_wrapper(mocker):
    mocker.patch(
        "backend.firebaseDB.fill_link_database.firebase_firestore.transactional",
        side_effect=lambda fn: fn,
    )
    mocker.patch("backend.firebaseDB.fill_link_database.get_user_profile", return_value=None)


def test_create_or_update_fill_link_creates_and_updates_owned_record(mocker) -> None:
    client = FakeFirestoreClient()
    mocker.patch("backend.firebaseDB.fill_link_database.get_firestore_client", return_value=client)
    mocker.patch("backend.firebaseDB.fill_link_database.now_iso", side_effect=["ts-create", "ts-update"])

    created = fldb.create_or_update_fill_link(
        "user-1",
        template_id="tpl-1",
        template_name="Template One",
        title="Intake Form",
        questions=[{"key": "full_name", "label": "Full Name", "type": "text"}],
        require_all_fields=True,
    )

    assert created.status == "active"
    assert created.response_count == 0
    assert created.require_all_fields is True
    assert created.public_token is None
    stored = client.collection(fldb.FILL_LINKS_COLLECTION).document(created.id).get().to_dict()
    assert stored["published_at"] == "ts-create"
    assert stored["require_all_fields"] is True
    assert stored["public_token"] is None

    updated = fldb.create_or_update_fill_link(
        "user-1",
        template_id="tpl-1",
        template_name="Template One",
        title="Updated Title",
        questions=[{"key": "dob", "label": "DOB", "type": "date"}],
        require_all_fields=False,
        status="closed",
        closed_reason="owner_closed",
    )

    assert updated.id == created.id
    assert updated.title == "Updated Title"
    assert updated.status == "closed"
    assert updated.response_count == 0
    assert updated.require_all_fields is False
    assert updated.public_token is None


def test_create_or_update_fill_link_allows_multiple_active_links_for_one_owner(mocker) -> None:
    client = FakeFirestoreClient()
    mocker.patch("backend.firebaseDB.fill_link_database.get_firestore_client", return_value=client)
    mocker.patch(
        "backend.firebaseDB.fill_link_database.now_iso",
        side_effect=["ts-create-1", "ts-create-2", "ts-close", "ts-create-3"],
    )
    mocker.patch(
        "backend.firebaseDB.fill_link_database.allow_legacy_fill_link_public_tokens",
        return_value=False,
    )

    first = fldb.create_or_update_fill_link(
        "user-1",
        template_id="tpl-1",
        template_name="Template One",
        title="First",
        questions=[{"key": "full_name", "label": "Full Name", "type": "text"}],
        require_all_fields=True,
    )
    second = fldb.create_or_update_fill_link(
        "user-1",
        template_id="tpl-2",
        template_name="Template Two",
        title="Second",
        questions=[{"key": "full_name", "label": "Full Name", "type": "text"}],
        require_all_fields=True,
    )

    closed = fldb.update_fill_link(first.id, "user-1", status="closed")
    third = fldb.create_or_update_fill_link(
        "user-1",
        template_id="tpl-3",
        template_name="Template Three",
        title="Third",
        questions=[{"key": "full_name", "label": "Full Name", "type": "text"}],
        require_all_fields=True,
    )

    assert closed is not None
    assert closed.status == "closed"
    assert second.template_id == "tpl-2"
    assert third.template_id == "tpl-3"


def test_update_fill_link_reactivate_clears_legacy_public_token_and_preserves_link_id(mocker) -> None:
    client = FakeFirestoreClient()
    collection = client.collection(fldb.FILL_LINKS_COLLECTION)
    collection.document("link-1").seed(
        {
            "user_id": "user-1",
            "template_id": "tpl-1",
            "template_name": "Template 1",
            "title": "Old title",
            "public_token": "token-old",
            "status": "closed",
            "closed_reason": "owner_closed",
            "response_count": 1,
            "questions": [{"key": "name", "label": "Name", "type": "text"}],
            "require_all_fields": False,
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
            "published_at": "2024-01-01T00:00:00+00:00",
            "closed_at": "2024-01-02T00:00:00+00:00",
        }
    )
    mocker.patch("backend.firebaseDB.fill_link_database.get_firestore_client", return_value=client)
    mocker.patch("backend.firebaseDB.fill_link_database.now_iso", return_value="ts-reopen")

    updated = fldb.update_fill_link(
        "link-1",
        "user-1",
        status="active",
        require_all_fields=True,
    )

    assert updated is not None
    assert updated.id == "link-1"
    assert updated.status == "active"
    assert updated.public_token is None
    assert updated.require_all_fields is True
    stored = collection.document("link-1").get().to_dict()
    assert stored["public_token"] is None
    assert stored["status"] == "active"
    assert stored["closed_at"] is None


def test_signed_public_tokens_work_even_when_record_still_has_legacy_public_token(mocker) -> None:
    client = FakeFirestoreClient()
    client.collection(fldb.FILL_LINKS_COLLECTION).document("link-1").seed(
        {
            "user_id": "user-1",
            "template_id": "tpl-1",
            "template_name": "Template 1",
            "title": "Fill Link",
            "public_token": "token-rotated",
            "status": "active",
            "response_count": 0,
            "questions": [{"key": "full_name", "label": "Full Name", "type": "text"}],
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
            "published_at": "2024-01-01T00:00:00+00:00",
        }
    )
    mocker.patch("backend.firebaseDB.fill_link_database.get_firestore_client", return_value=client)
    mocker.patch("backend.firebaseDB.fill_link_database.allow_legacy_fill_link_public_tokens", return_value=False)

    assert fldb.get_fill_link_by_public_token("token-rotated") is None
    assert fldb.get_fill_link_by_public_token(build_fill_link_public_token("link-1")) is not None


def test_legacy_public_tokens_only_work_when_opt_in_flag_is_enabled(mocker) -> None:
    client = FakeFirestoreClient()
    client.collection(fldb.FILL_LINKS_COLLECTION).document("link-1").seed(
        {
            "user_id": "user-1",
            "template_id": "tpl-1",
            "template_name": "Template 1",
            "title": "Fill Link",
            "public_token": "token-legacy",
            "status": "active",
            "response_count": 0,
            "questions": [{"key": "full_name", "label": "Full Name", "type": "text"}],
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
            "published_at": "2024-01-01T00:00:00+00:00",
        }
    )
    mocker.patch("backend.firebaseDB.fill_link_database.get_firestore_client", return_value=client)

    mocker.patch("backend.firebaseDB.fill_link_database.allow_legacy_fill_link_public_tokens", return_value=False)
    assert fldb.get_fill_link_by_public_token("token-legacy") is None

    mocker.patch("backend.firebaseDB.fill_link_database.allow_legacy_fill_link_public_tokens", return_value=True)
    assert fldb.get_fill_link_by_public_token("token-legacy") is not None


def test_list_fill_links_filters_by_owner_and_template(mocker) -> None:
    client = FakeFirestoreClient()
    collection = client.collection(fldb.FILL_LINKS_COLLECTION)
    collection.document("owned-old").seed(
        {
            "user_id": "user-1",
            "template_id": "tpl-1",
            "template_name": "Template 1",
            "title": "Old",
            "public_token": None,
            "status": "active",
            "response_count": 1,
            "questions": [{"key": "name", "label": "Name", "type": "text"}],
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
        }
    )
    collection.document("owned-new").seed(
        {
            "user_id": "user-1",
            "template_id": "tpl-2",
            "template_name": "Template 2",
            "title": "New",
            "public_token": None,
            "status": "active",
            "response_count": 2,
            "questions": [{"key": "name", "label": "Name", "type": "text"}],
            "created_at": "2024-02-01T00:00:00+00:00",
            "updated_at": "2024-02-01T00:00:00+00:00",
        }
    )
    collection.document("foreign").seed(
        {
            "user_id": "user-2",
            "template_id": "tpl-1",
            "template_name": "Template 1",
            "title": "Foreign",
            "public_token": None,
            "status": "active",
            "response_count": 0,
            "questions": [{"key": "name", "label": "Name", "type": "text"}],
            "created_at": "2024-03-01T00:00:00+00:00",
            "updated_at": "2024-03-01T00:00:00+00:00",
        }
    )
    mocker.patch("backend.firebaseDB.fill_link_database.get_firestore_client", return_value=client)

    owned_records = fldb.list_fill_links("user-1")
    template_filtered = fldb.list_fill_links("user-1", template_id="tpl-1")

    assert [record.id for record in owned_records] == ["owned-new", "owned-old"]
    assert [record.id for record in template_filtered] == ["owned-old"]


def test_submit_fill_link_response_keeps_link_active_when_monthly_quota_has_capacity(mocker) -> None:
    client = FakeFirestoreClient()
    signed_token = build_fill_link_public_token("link-1")
    client.collection(fldb.FILL_LINKS_COLLECTION).document("link-1").seed(
        {
            "user_id": "user-1",
            "template_id": "tpl-1",
            "template_name": "Template 1",
            "title": "Fill Link",
            "public_token": None,
            "status": "active",
            "response_count": 1,
            "questions": [{"key": "full_name", "label": "Full Name", "type": "text"}],
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
            "published_at": "2024-01-01T00:00:00+00:00",
        }
    )
    mocker.patch("backend.firebaseDB.fill_link_database.get_firestore_client", return_value=client)
    mocker.patch("backend.firebaseDB.fill_link_database.now_iso", return_value="ts-submit")
    mocker.patch("backend.firebaseDB.fill_link_database._resolve_fill_link_monthly_limit_for_user", return_value=25)

    result = fldb.submit_fill_link_response(
        signed_token,
        answers={"full_name": "Ada Lovelace"},
        respondent_label="Ada Lovelace",
        respondent_secondary_label=None,
        search_text="ada lovelace full_name",
    )

    assert result.status == "accepted"
    assert result.link is not None
    assert result.link.response_count == 2
    assert result.link.status == "active"
    stored_link = client.collection(fldb.FILL_LINKS_COLLECTION).document("link-1").get().to_dict()
    assert stored_link["status"] == "active"
    usage_doc = client.collection(fldb.FILL_LINK_USAGE_COUNTERS_COLLECTION).document(
        f"user-1__{fldb._current_month_key()}"
    ).get().to_dict()
    assert usage_doc["response_count"] == 1
    stored_responses = client.collection(fldb.FILL_LINK_RESPONSES_COLLECTION)
    response_doc = stored_responses.document(result.response.id).get().to_dict()
    assert response_doc["respondent_label"] == "Ada Lovelace"


def test_submit_fill_link_response_returns_monthly_limit_reached_when_quota_is_exhausted(mocker) -> None:
    client = FakeFirestoreClient()
    signed_token = build_fill_link_public_token("link-1")
    client.collection(fldb.FILL_LINKS_COLLECTION).document("link-1").seed(
        {
            "user_id": "user-1",
            "template_id": "tpl-1",
            "template_name": "Template 1",
            "title": "Fill Link",
            "public_token": None,
            "status": "active",
            "response_count": 1,
            "questions": [{"key": "full_name", "label": "Full Name", "type": "text"}],
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
        }
    )
    client.collection(fldb.FILL_LINK_USAGE_COUNTERS_COLLECTION).document(
        f"user-1__{fldb._current_month_key()}"
    ).seed(
        {
            "user_id": "user-1",
            "month_key": fldb._current_month_key(),
            "response_count": 1,
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
        }
    )
    mocker.patch("backend.firebaseDB.fill_link_database.get_firestore_client", return_value=client)
    mocker.patch("backend.firebaseDB.fill_link_database.now_iso", return_value="ts-submit")
    mocker.patch("backend.firebaseDB.fill_link_database._resolve_fill_link_monthly_limit_for_user", return_value=1)

    result = fldb.submit_fill_link_response(
        signed_token,
        answers={"full_name": "Ada Lovelace"},
        respondent_label="Ada Lovelace",
        respondent_secondary_label=None,
        search_text="ada lovelace full_name",
    )

    assert result.status == "monthly_limit_reached"
    assert result.link is not None
    assert result.link.status == "active"
    assert result.link.closed_reason is None
    stored_link = client.collection(fldb.FILL_LINKS_COLLECTION).document("link-1").get().to_dict()
    assert stored_link["status"] == "active"
    assert stored_link.get("closed_reason") is None


def test_submit_fill_link_response_reuses_existing_attempt_without_incrementing_count(mocker) -> None:
    client = FakeFirestoreClient()
    signed_token = build_fill_link_public_token("link-1")
    client.collection(fldb.FILL_LINKS_COLLECTION).document("link-1").seed(
        {
            "user_id": "user-1",
            "template_id": "tpl-1",
            "template_name": "Template 1",
            "title": "Fill Link",
            "public_token": None,
            "status": "active",
            "response_count": 0,
            "questions": [{"key": "full_name", "label": "Full Name", "type": "text"}],
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
            "published_at": "2024-01-01T00:00:00+00:00",
        }
    )
    mocker.patch("backend.firebaseDB.fill_link_database.get_firestore_client", return_value=client)
    mocker.patch(
        "backend.firebaseDB.fill_link_database.now_iso",
        side_effect=["ts-submit-1", "ts-submit-1", "ts-submit-1", "ts-submit-2"],
    )

    first = fldb.submit_fill_link_response(
        signed_token,
        attempt_id="attempt-1",
        answers={"full_name": "Ada Lovelace"},
        respondent_label="Ada Lovelace",
        respondent_secondary_label=None,
        search_text="ada lovelace full_name",
    )
    second = fldb.submit_fill_link_response(
        signed_token,
        attempt_id="attempt-1",
        answers={"full_name": "Ada Lovelace"},
        respondent_label="Ada Lovelace",
        respondent_secondary_label=None,
        search_text="ada lovelace full_name",
    )

    assert first.status == "accepted"
    assert second.status == "accepted"
    assert second.response is not None
    assert second.response.id == first.response.id
    stored_link = client.collection(fldb.FILL_LINKS_COLLECTION).document("link-1").get().to_dict()
    assert stored_link["response_count"] == 1
    stored_responses = client.collection(fldb.FILL_LINK_RESPONSES_COLLECTION).where("link_id", "==", "link-1").get()
    assert len(stored_responses) == 1


def test_submit_fill_link_response_persists_response_snapshot_for_downloads(mocker) -> None:
    client = FakeFirestoreClient()
    signed_token = build_fill_link_public_token("link-1")
    expected_snapshot = {
        "version": 1,
        "sourcePdfPath": "gs://bucket/template-v1.pdf",
        "filename": "template-one-response.pdf",
        "fields": [{"name": "full_name", "type": "text", "page": 1}],
    }
    client.collection(fldb.FILL_LINKS_COLLECTION).document("link-1").seed(
        {
            "user_id": "user-1",
            "template_id": "tpl-1",
            "template_name": "Template 1",
            "title": "Fill Link",
            "public_token": None,
            "status": "active",
            "response_count": 0,
            "questions": [{"key": "full_name", "label": "Full Name", "type": "text"}],
            "respondent_pdf_download_enabled": True,
            "respondent_pdf_snapshot": expected_snapshot,
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
            "published_at": "2024-01-01T00:00:00+00:00",
        }
    )
    mocker.patch("backend.firebaseDB.fill_link_database.get_firestore_client", return_value=client)
    mocker.patch("backend.firebaseDB.fill_link_database.now_iso", return_value="ts-submit")

    result = fldb.submit_fill_link_response(
        signed_token,
        answers={"full_name": "Ada Lovelace"},
        respondent_label="Ada Lovelace",
        respondent_secondary_label=None,
        search_text="ada lovelace full_name",
    )

    assert result.status == "accepted"
    assert result.response is not None
    assert result.response.respondent_pdf_snapshot == expected_snapshot
    stored_response = client.collection(fldb.FILL_LINK_RESPONSES_COLLECTION).document(result.response.id).get().to_dict()
    assert stored_response["respondent_pdf_snapshot"] == expected_snapshot


def test_list_fill_link_responses_filters_search(mocker) -> None:
    client = FakeFirestoreClient()
    client.collection(fldb.FILL_LINKS_COLLECTION).document("link-1").seed(
        {
            "user_id": "user-1",
            "template_id": "tpl-1",
            "template_name": "Template 1",
            "title": "Fill Link",
            "public_token": "token-1",
            "status": "active",
            "response_count": 2,
            "questions": [{"key": "full_name", "label": "Full Name", "type": "text"}],
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
        }
    )
    responses = client.collection(fldb.FILL_LINK_RESPONSES_COLLECTION)
    responses.document("resp-1").seed(
        {
            "link_id": "link-1",
            "user_id": "user-1",
            "template_id": "tpl-1",
            "respondent_label": "Ada Lovelace",
            "answers": {"full_name": "Ada Lovelace"},
            "search_text": "ada lovelace",
            "submitted_at": "2024-02-01T00:00:00+00:00",
        }
    )
    responses.document("resp-2").seed(
        {
            "link_id": "link-1",
            "user_id": "user-1",
            "template_id": "tpl-1",
            "respondent_label": "Grace Hopper",
            "answers": {"full_name": "Grace Hopper"},
            "search_text": "grace hopper",
            "submitted_at": "2024-03-01T00:00:00+00:00",
        }
    )
    mocker.patch("backend.firebaseDB.fill_link_database.get_firestore_client", return_value=client)

    records = fldb.list_fill_link_responses("link-1", "user-1", search="grace")

    assert [record.id for record in records] == ["resp-2"]


def test_delete_fill_link_preserves_response_provenance_when_linked_signing_request_exists(mocker) -> None:
    client = FakeFirestoreClient()
    client.collection(fldb.FILL_LINKS_COLLECTION).document("link-1").seed(
        {
            "user_id": "user-1",
            "template_id": "tpl-1",
            "template_name": "Template 1",
            "title": "Fill Link",
            "public_token": "token-1",
            "status": "active",
            "response_count": 2,
            "questions": [{"key": "full_name", "label": "Full Name", "type": "text"}],
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
        }
    )
    responses = client.collection(fldb.FILL_LINK_RESPONSES_COLLECTION)
    responses.document("resp-unlinked").seed(
        {
            "link_id": "link-1",
            "user_id": "user-1",
            "template_id": "tpl-1",
            "respondent_label": "Ada Lovelace",
            "answers": {"full_name": "Ada Lovelace"},
            "search_text": "ada lovelace",
            "submitted_at": "2024-02-01T00:00:00+00:00",
        }
    )
    responses.document("resp-linked").seed(
        {
            "link_id": "link-1",
            "user_id": "user-1",
            "template_id": "tpl-1",
            "respondent_label": "Grace Hopper",
            "answers": {"full_name": "Grace Hopper"},
            "search_text": "grace hopper",
            "submitted_at": "2024-03-01T00:00:00+00:00",
            "signing_request_id": "sign-1",
        }
    )
    mocker.patch("backend.firebaseDB.fill_link_database.get_firestore_client", return_value=client)
    mocker.patch("backend.firebaseDB.fill_link_database.now_iso", return_value="ts-orphaned")

    deleted = fldb.delete_fill_link("link-1", "user-1")

    assert deleted is True
    assert not client.collection(fldb.FILL_LINKS_COLLECTION).document("link-1").get().exists
    assert not responses.document("resp-unlinked").get().exists
    linked_payload = responses.document("resp-linked").get().to_dict()
    assert linked_payload["signing_request_id"] == "sign-1"
    assert linked_payload["orphaned_by_link_delete_at"] == "ts-orphaned"
    assert linked_payload["orphaned_by_link_delete_reason"] == "linked_signing_request_retained"
