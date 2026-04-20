"""Unit tests for the Search & Fill (structured data) Firestore commit path."""

from __future__ import annotations

import pytest

from backend.firebaseDB import structured_fill_database as sfdb
from backend.test.unit.firebase._fakes import FakeFirestoreClient


@pytest.fixture(autouse=True)
def _no_transaction_wrapper(mocker):
    mocker.patch(
        "backend.firebaseDB.structured_fill_database.firebase_firestore.transactional",
        side_effect=lambda fn: fn,
    )
    mocker.patch(
        "backend.firebaseDB.structured_fill_database.get_user_profile",
        return_value=None,
    )


def _install_fake_client(mocker) -> FakeFirestoreClient:
    client = FakeFirestoreClient()
    mocker.patch(
        "backend.firebaseDB.structured_fill_database.get_firestore_client",
        return_value=client,
    )
    return client


def _common_commit_kwargs(**overrides):
    payload = {
        "request_id": "req-1",
        "source_kind": "csv",
        "scope_type": "template",
        "template_id": "tpl-1",
        "target_template_ids": ["tpl-1"],
        "matched_template_ids": ["tpl-1"],
        "count_increment": 1,
        "match_count": 1,
        "record_label_preview": "Justin Thakral",
        "record_fingerprint": "fp-abc",
        "data_source_label": "customers.csv",
    }
    payload.update(overrides)
    return payload


def test_commit_charges_one_credit_for_single_template_fill(mocker) -> None:
    client = _install_fake_client(mocker)
    result = sfdb.commit_structured_fill_usage(
        "user-1", monthly_limit=50, **_common_commit_kwargs()
    )

    assert result.status == sfdb.STATUS_COMMITTED
    assert result.count_increment == 1
    assert result.current_month_usage == 1
    assert result.fills_remaining == 49
    assert result.monthly_limit == 50

    usage_doc = client.collection(sfdb.STRUCTURED_FILL_USAGE_COUNTERS_COLLECTION)
    usage_id = sfdb._usage_counter_doc_id("user-1", result.month_key)
    stored = usage_doc.document(usage_id).get().to_dict()
    assert stored["credit_count"] == 1
    assert stored["commit_count"] == 1
    assert stored["matched_pdf_count"] == 1


def test_commit_group_fill_charges_n_for_n_matched_templates(mocker) -> None:
    client = _install_fake_client(mocker)
    matched = ["tpl-a", "tpl-b", "tpl-c"]
    result = sfdb.commit_structured_fill_usage(
        "user-1",
        monthly_limit=50,
        **_common_commit_kwargs(
            request_id="req-group",
            scope_type="group",
            template_id=None,
            group_id="grp-1",
            target_template_ids=["tpl-a", "tpl-b", "tpl-c", "tpl-d"],
            matched_template_ids=matched,
            count_increment=3,
            match_count=3,
        ),
    )

    assert result.status == sfdb.STATUS_COMMITTED
    assert result.count_increment == 3
    assert result.current_month_usage == 3
    assert result.fills_remaining == 47

    usage_id = sfdb._usage_counter_doc_id("user-1", result.month_key)
    stored = (
        client.collection(sfdb.STRUCTURED_FILL_USAGE_COUNTERS_COLLECTION)
        .document(usage_id)
        .get()
        .to_dict()
    )
    assert stored["credit_count"] == 3
    assert stored["matched_pdf_count"] == 3


def test_commit_replays_duplicate_request_id_without_double_charging(mocker) -> None:
    _install_fake_client(mocker)
    first = sfdb.commit_structured_fill_usage(
        "user-1", monthly_limit=50, **_common_commit_kwargs()
    )
    second = sfdb.commit_structured_fill_usage(
        "user-1", monthly_limit=50, **_common_commit_kwargs()
    )

    assert first.status == sfdb.STATUS_COMMITTED
    assert second.status == sfdb.STATUS_REPLAYED
    assert second.event_id == first.event_id
    assert second.count_increment == first.count_increment
    assert second.current_month_usage == 1
    assert second.fills_remaining == 49


def test_commit_no_match_charges_zero_and_marks_rejected_no_match(mocker) -> None:
    client = _install_fake_client(mocker)
    result = sfdb.commit_structured_fill_usage(
        "user-1",
        monthly_limit=50,
        **_common_commit_kwargs(
            matched_template_ids=[],
            count_increment=0,
            match_count=0,
        ),
    )

    assert result.status == sfdb.STATUS_REJECTED_NO_MATCH
    assert result.count_increment == 0
    assert result.current_month_usage == 0
    assert result.fills_remaining == 50

    usage_id = sfdb._usage_counter_doc_id("user-1", result.month_key)
    usage_doc = (
        client.collection(sfdb.STRUCTURED_FILL_USAGE_COUNTERS_COLLECTION)
        .document(usage_id)
        .get()
    )
    assert usage_doc.exists is False


def test_commit_exhausted_limit_raises_without_writing_anything(mocker) -> None:
    client = _install_fake_client(mocker)
    # Seed usage at 49/50 and attempt a 2-credit group fill — should raise.
    month_key = sfdb._current_month_key()
    sfdb._usage_counter_ref(client, "user-1", month_key).set(
        {
            "user_id": "user-1",
            "month_key": month_key,
            "credit_count": 49,
            "commit_count": 49,
            "matched_pdf_count": 49,
            "created_at": "seed",
            "updated_at": "seed",
        }
    )

    with pytest.raises(sfdb.StructuredFillMonthlyLimitExceededError):
        sfdb.commit_structured_fill_usage(
            "user-1",
            monthly_limit=50,
            **_common_commit_kwargs(
                scope_type="group",
                template_id=None,
                group_id="grp-1",
                target_template_ids=["tpl-a", "tpl-b"],
                matched_template_ids=["tpl-a", "tpl-b"],
                count_increment=2,
                match_count=2,
            ),
        )

    # Counter must be unchanged.
    stored = sfdb._usage_counter_ref(client, "user-1", month_key).get().to_dict()
    assert stored["credit_count"] == 49

    # No event or guard should have been written.
    events = client.collection(sfdb.STRUCTURED_FILL_EVENTS_COLLECTION)._docs
    assert all(not doc.get().exists for doc in events.values())
    guards = client.collection(sfdb.STRUCTURED_FILL_REQUEST_GUARDS_COLLECTION)._docs
    assert all(not doc.get().exists for doc in guards.values())


def test_commit_rejects_increment_above_matched_count(mocker) -> None:
    _install_fake_client(mocker)
    with pytest.raises(sfdb.StructuredFillInvalidRequestError):
        sfdb.commit_structured_fill_usage(
            "user-1",
            monthly_limit=50,
            **_common_commit_kwargs(
                matched_template_ids=["tpl-1"],
                count_increment=5,
                match_count=1,
            ),
        )


def test_commit_rejects_missing_request_id(mocker) -> None:
    _install_fake_client(mocker)
    with pytest.raises(sfdb.StructuredFillInvalidRequestError):
        sfdb.commit_structured_fill_usage(
            "user-1", monthly_limit=50, **_common_commit_kwargs(request_id="")
        )


def test_commit_rejects_unknown_source_kind(mocker) -> None:
    _install_fake_client(mocker)
    with pytest.raises(sfdb.StructuredFillInvalidRequestError):
        sfdb.commit_structured_fill_usage(
            "user-1", monthly_limit=50, **_common_commit_kwargs(source_kind="yaml")
        )


def test_commit_group_scope_requires_group_id(mocker) -> None:
    _install_fake_client(mocker)
    with pytest.raises(sfdb.StructuredFillInvalidRequestError):
        sfdb.commit_structured_fill_usage(
            "user-1",
            monthly_limit=50,
            **_common_commit_kwargs(
                scope_type="group",
                template_id=None,
                group_id=None,
                matched_template_ids=["tpl-1"],
                count_increment=1,
            ),
        )


def test_precheck_reports_remaining_budget(mocker) -> None:
    client = _install_fake_client(mocker)
    month_key = sfdb._current_month_key()
    sfdb._usage_counter_ref(client, "user-1", month_key).set(
        {
            "user_id": "user-1",
            "month_key": month_key,
            "credit_count": 10,
            "commit_count": 10,
            "matched_pdf_count": 10,
            "created_at": "seed",
            "updated_at": "seed",
        }
    )
    mocker.patch(
        "backend.firebaseDB.structured_fill_database.resolve_structured_fill_monthly_limit",
        return_value=50,
    )
    result = sfdb.evaluate_structured_fill_precheck("user-1", pdf_count=5, source_kind="csv")
    assert result["allowed"] is True
    assert result["monthlyLimit"] == 50
    assert result["currentMonthUsage"] == 10
    assert result["fillsRemaining"] == 40
    assert result["pdfCount"] == 5
    assert result["sourceKind"] == "csv"
    assert result["sourceCategory"] == sfdb.STRUCTURED_FILL_SOURCE_CATEGORY


def test_precheck_blocks_when_request_would_exceed_cap(mocker) -> None:
    client = _install_fake_client(mocker)
    month_key = sfdb._current_month_key()
    sfdb._usage_counter_ref(client, "user-1", month_key).set(
        {
            "user_id": "user-1",
            "month_key": month_key,
            "credit_count": 48,
            "commit_count": 48,
            "matched_pdf_count": 48,
            "created_at": "seed",
            "updated_at": "seed",
        }
    )
    mocker.patch(
        "backend.firebaseDB.structured_fill_database.resolve_structured_fill_monthly_limit",
        return_value=50,
    )
    result = sfdb.evaluate_structured_fill_precheck("user-1", pdf_count=5, source_kind="json")
    assert result["allowed"] is False
    assert result["fillsRemaining"] == 2


def test_commit_rejects_match_count_gt_0_with_count_increment_0(mocker) -> None:
    """Regression: mismatched match_count/count_increment was a free-fill bypass.

    A caller could previously send match_count=1 with count_increment=0 and get
    an accepted 'committed' event carrying a 0-credit charge plus a request
    guard that then blocks the real charge from ever applying on retry. Close
    that hole — require the two to either both be zero (no-match) or equal.
    """

    _install_fake_client(mocker)
    with pytest.raises(sfdb.StructuredFillInvalidRequestError):
        sfdb.commit_structured_fill_usage(
            "user-1",
            monthly_limit=50,
            **_common_commit_kwargs(
                matched_template_ids=["tpl-1"],
                count_increment=0,
                match_count=1,
            ),
        )


def test_commit_rejects_match_count_that_undercounts_matched_ids(mocker) -> None:
    """Regression: match_count must equal len(matched_template_ids) or be 0."""

    _install_fake_client(mocker)
    with pytest.raises(sfdb.StructuredFillInvalidRequestError):
        sfdb.commit_structured_fill_usage(
            "user-1",
            monthly_limit=50,
            **_common_commit_kwargs(
                scope_type="group",
                template_id=None,
                group_id="grp-1",
                matched_template_ids=["tpl-a", "tpl-b", "tpl-c"],
                count_increment=3,
                match_count=1,
            ),
        )


def test_commit_accepts_explicit_no_match_zero_zero(mocker) -> None:
    """No-match remains legal: match_count=0, count_increment=0 → rejected_no_match."""

    _install_fake_client(mocker)
    result = sfdb.commit_structured_fill_usage(
        "user-1",
        monthly_limit=50,
        **_common_commit_kwargs(
            matched_template_ids=[],
            count_increment=0,
            match_count=0,
        ),
    )
    assert result.status == sfdb.STATUS_REJECTED_NO_MATCH
    assert result.count_increment == 0


def test_record_label_preview_is_truncated_to_store_size_bound(mocker) -> None:
    client = _install_fake_client(mocker)
    long_label = "A" * 300
    result = sfdb.commit_structured_fill_usage(
        "user-1",
        monthly_limit=50,
        **_common_commit_kwargs(record_label_preview=long_label),
    )
    event_doc = (
        client.collection(sfdb.STRUCTURED_FILL_EVENTS_COLLECTION)
        .document(result.event_id)
        .get()
        .to_dict()
    )
    assert len(event_doc["record_label_preview"]) <= 120
