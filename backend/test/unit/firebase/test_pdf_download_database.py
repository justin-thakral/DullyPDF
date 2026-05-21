from __future__ import annotations

import pytest

import backend.firebaseDB.pdf_download_database as db
from backend.test.unit.firebase._fakes import FakeFirestoreClient


@pytest.fixture
def fake_firestore(mocker) -> FakeFirestoreClient:
    fake = FakeFirestoreClient()
    mocker.patch.object(db, "get_firestore_client", return_value=fake)
    mocker.patch.object(db.firebase_firestore, "transactional", side_effect=lambda fn: fn)
    mocker.patch.object(db, "_current_month_key", return_value="2026-05")
    mocker.patch.object(db, "now_iso", return_value="2026-05-20T12:00:00+00:00")
    return fake


def _usage_ref(fake: FakeFirestoreClient, user_id: str = "user-1", month_key: str = "2026-05"):
    return fake.collection(db.PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION).document(
        db._usage_counter_doc_id(user_id, month_key)
    )


def _seed_usage(
    fake: FakeFirestoreClient,
    *,
    user_id: str = "user-1",
    month_key: str = "2026-05",
    download_count: int,
    event_count: int = 0,
    workspace_download_count: int = 0,
    group_download_pdf_count: int = 0,
):
    usage_ref = _usage_ref(fake, user_id, month_key)
    usage_ref.seed(
        {
            "user_id": user_id,
            "month_key": month_key,
            "download_count": download_count,
            "event_count": event_count,
            "workspace_download_count": workspace_download_count,
            "group_download_pdf_count": group_download_pdf_count,
            "created_at": "2026-05-01T00:00:00+00:00",
            "updated_at": "2026-05-19T00:00:00+00:00",
        }
    )
    return usage_ref


def _existing_docs(fake: FakeFirestoreClient, collection_name: str):
    return [
        doc
        for doc in fake.collection(collection_name)._docs.values()
        if doc.get().exists
    ]


def test_get_pdf_download_monthly_usage_reads_counter(fake_firestore) -> None:
    _seed_usage(
        fake_firestore,
        download_count=7,
        event_count=3,
        workspace_download_count=5,
        group_download_pdf_count=2,
    )

    record = db.get_pdf_download_monthly_usage("user-1")

    assert record is not None
    assert record.month_key == "2026-05"
    assert record.download_count == 7
    assert record.event_count == 3
    assert record.workspace_download_count == 5
    assert record.group_download_pdf_count == 2


def test_commit_pdf_download_usage_allows_base_user_at_exact_monthly_cap(
    fake_firestore,
    mocker,
) -> None:
    mocker.patch.object(db, "resolve_pdf_downloads_monthly_limit", return_value=25)
    _seed_usage(
        fake_firestore,
        download_count=24,
        event_count=24,
        workspace_download_count=24,
    )

    result = db.commit_pdf_download_usage(
        user_id="user-1",
        role="base",
        request_id="req-1",
        source="workspace_download",
        export_mode="editable",
        pdf_count=1,
        page_count=2,
        field_count=6,
    )

    usage = _usage_ref(fake_firestore).get().to_dict()
    event = _existing_docs(fake_firestore, db.PDF_DOWNLOAD_EVENTS_COLLECTION)[0].get().to_dict()
    assert result.status == db.STATUS_COMMITTED
    assert result.current_month_usage == 25
    assert result.downloads_remaining == 0
    assert usage["download_count"] == 25
    assert usage["event_count"] == 25
    assert usage["workspace_download_count"] == 25
    assert event["status"] == db.STATUS_COMMITTED
    assert event["page_count"] == 2
    assert event["field_count"] == 6


def test_commit_pdf_download_usage_rejects_base_user_over_monthly_cap(
    fake_firestore,
    mocker,
) -> None:
    mocker.patch.object(db, "resolve_pdf_downloads_monthly_limit", return_value=25)
    _seed_usage(fake_firestore, download_count=25, event_count=25, workspace_download_count=25)

    with pytest.raises(db.PdfDownloadMonthlyLimitExceededError) as exc_info:
        db.commit_pdf_download_usage(
            user_id="user-1",
            role="base",
            request_id="req-over",
            source="workspace_download",
            export_mode="flat",
            pdf_count=1,
        )

    detail = exc_info.value.to_api_detail()
    usage = _usage_ref(fake_firestore).get().to_dict()
    event = _existing_docs(fake_firestore, db.PDF_DOWNLOAD_EVENTS_COLLECTION)[0].get().to_dict()
    guard = _existing_docs(fake_firestore, db.PDF_DOWNLOAD_REQUEST_GUARDS_COLLECTION)[0].get().to_dict()
    assert detail["code"] == "pdf_download_limit_reached"
    assert detail["monthlyLimit"] == 25
    assert detail["currentMonthUsage"] == 25
    assert detail["downloadsRemaining"] == 0
    assert usage["download_count"] == 25
    assert event["status"] == db.STATUS_REJECTED_LIMIT
    assert guard["status"] == db.STATUS_REJECTED_LIMIT


def test_commit_pdf_download_usage_counts_each_group_pdf_against_quota(
    fake_firestore,
    mocker,
) -> None:
    mocker.patch.object(db, "resolve_pdf_downloads_monthly_limit", return_value=25)
    _seed_usage(fake_firestore, download_count=22, event_count=4, group_download_pdf_count=22)

    with pytest.raises(db.PdfDownloadMonthlyLimitExceededError) as exc_info:
        db.commit_pdf_download_usage(
            user_id="user-1",
            role="base",
            request_id="group-req-1",
            source="workspace_group_download",
            export_mode="zip",
            pdf_count=5,
            metadata={"groupId": "group-1"},
        )

    assert exc_info.value.to_api_detail()["pdfCount"] == 5
    assert _usage_ref(fake_firestore).get().to_dict()["download_count"] == 22
    event = _existing_docs(fake_firestore, db.PDF_DOWNLOAD_EVENTS_COLLECTION)[0].get().to_dict()
    assert event["status"] == db.STATUS_REJECTED_LIMIT
    assert event["pdf_count"] == 5
    assert event["metadata"] == {"groupId": "group-1"}


def test_commit_pdf_download_usage_replays_duplicate_request_without_incrementing(
    fake_firestore,
    mocker,
) -> None:
    mocker.patch.object(db, "resolve_pdf_downloads_monthly_limit", return_value=25)

    first = db.commit_pdf_download_usage(
        user_id="user-1",
        role="base",
        request_id="req-idempotent",
        source="workspace_download",
        export_mode="editable",
        pdf_count=1,
    )
    second = db.commit_pdf_download_usage(
        user_id="user-1",
        role="base",
        request_id="req-idempotent",
        source="workspace_download",
        export_mode="editable",
        pdf_count=1,
    )

    usage = _usage_ref(fake_firestore).get().to_dict()
    assert first.status == db.STATUS_COMMITTED
    assert second.status == db.STATUS_REPLAYED
    assert second.count_increment == 0
    assert usage["download_count"] == 1
    assert usage["event_count"] == 1
    assert len(_existing_docs(fake_firestore, db.PDF_DOWNLOAD_EVENTS_COLLECTION)) == 1


def test_commit_pdf_download_usage_allows_unlimited_role_while_recording_usage(
    fake_firestore,
    mocker,
) -> None:
    mocker.patch.object(db, "resolve_pdf_downloads_monthly_limit", return_value=None)
    _seed_usage(fake_firestore, download_count=999, event_count=12, group_download_pdf_count=999)

    result = db.commit_pdf_download_usage(
        user_id="user-1",
        role="pro",
        request_id="pro-group-1",
        source="workspace_group_download",
        export_mode="zip",
        pdf_count=10,
    )

    usage = _usage_ref(fake_firestore).get().to_dict()
    assert result.monthly_limit is None
    assert result.downloads_remaining is None
    assert result.current_month_usage == 1009
    assert usage["download_count"] == 1009
    assert usage["group_download_pdf_count"] == 1009


def test_commit_pdf_download_usage_rejects_invalid_inputs_before_writes(
    fake_firestore,
    mocker,
) -> None:
    mocker.patch.object(db, "resolve_pdf_downloads_monthly_limit", return_value=25)

    with pytest.raises(ValueError, match="source"):
        db.commit_pdf_download_usage(
            user_id="user-1",
            role="base",
            request_id="req-invalid",
            source="other",
            export_mode="editable",
        )

    assert _existing_docs(fake_firestore, db.PDF_DOWNLOAD_EVENTS_COLLECTION) == []
    assert _existing_docs(fake_firestore, db.PDF_DOWNLOAD_REQUEST_GUARDS_COLLECTION) == []
