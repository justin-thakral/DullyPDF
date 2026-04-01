"""Unit tests for trial_used field in user_database."""

from __future__ import annotations

import pytest

from backend.firebaseDB import user_database
from backend.test.unit.firebase._fakes import FakeFirestoreClient


@pytest.fixture(autouse=True)
def _no_transaction_wrapper(mocker):
    mocker.patch.object(user_database.firebase_firestore, "transactional", side_effect=lambda fn: fn)


def test_mark_trial_used_sets_flag(mocker) -> None:
    client = FakeFirestoreClient()
    mocker.patch.object(user_database, "get_firestore_client", return_value=client)

    user_database.mark_trial_used("user-1")

    doc = client.collection(user_database.USERS_COLLECTION).document("user-1").get()
    assert doc.exists
    assert doc.to_dict()[user_database.TRIAL_USED_FIELD] is True


def test_mark_trial_used_raises_for_empty_uid() -> None:
    with pytest.raises(ValueError, match="Missing firebase uid"):
        user_database.mark_trial_used("")


def test_get_trial_used_false_for_new_user(mocker) -> None:
    client = FakeFirestoreClient()
    mocker.patch.object(user_database, "get_firestore_client", return_value=client)

    assert user_database.get_trial_used("nonexistent") is False


def test_get_trial_used_false_for_empty_uid() -> None:
    assert user_database.get_trial_used("") is False


def test_get_trial_used_true_after_mark(mocker) -> None:
    client = FakeFirestoreClient()
    mocker.patch.object(user_database, "get_firestore_client", return_value=client)

    user_database.mark_trial_used("user-2")
    assert user_database.get_trial_used("user-2") is True


def test_get_trial_used_false_when_field_missing(mocker) -> None:
    client = FakeFirestoreClient()
    client.collection(user_database.USERS_COLLECTION).document("user-3").seed(
        {"role": "base", "email": "test@example.com"}
    )
    mocker.patch.object(user_database, "get_firestore_client", return_value=client)

    assert user_database.get_trial_used("user-3") is False


def test_activate_pro_marks_trial_used(mocker) -> None:
    client = FakeFirestoreClient()
    client.collection(user_database.USERS_COLLECTION).document("user-4").seed(
        {"role": "base", "email": "test@example.com", "openai_credits_remaining": 10}
    )
    mocker.patch.object(user_database, "get_firestore_client", return_value=client)

    user_database.activate_pro_membership("user-4", stripe_event_id="evt_1")

    doc = client.collection(user_database.USERS_COLLECTION).document("user-4").get()
    data = doc.to_dict()
    assert data[user_database.ROLE_FIELD] == user_database.ROLE_PRO
    assert data[user_database.TRIAL_USED_FIELD] is True


def test_get_user_profile_includes_trial_used(mocker) -> None:
    client = FakeFirestoreClient()
    client.collection(user_database.USERS_COLLECTION).document("user-5").seed(
        {
            "role": "base",
            "email": "test@example.com",
            "openai_credits_remaining": 10,
            user_database.TRIAL_USED_FIELD: True,
        }
    )
    mocker.patch.object(user_database, "get_firestore_client", return_value=client)

    profile = user_database.get_user_profile("user-5")
    assert profile is not None
    assert profile.trial_used is True


def test_get_user_profile_trial_used_defaults_false(mocker) -> None:
    client = FakeFirestoreClient()
    client.collection(user_database.USERS_COLLECTION).document("user-6").seed(
        {"role": "base", "email": "test@example.com", "openai_credits_remaining": 10}
    )
    mocker.patch.object(user_database, "get_firestore_client", return_value=client)

    profile = user_database.get_user_profile("user-6")
    assert profile is not None
    assert profile.trial_used is False
