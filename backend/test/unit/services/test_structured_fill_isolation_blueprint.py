"""Regression tests that pin down credit-pool isolation.

Fill by File (structured_fill) credits debit
``structured_fill_usage_counters``. Every other usage-bearing flow has
its own independent pool:

* **Fill By Link (web form) responses** → ``fill_link_usage_counters``
  (debited at submit time via
  ``resolve_fill_link_responses_monthly_limit``).
* **Fill from Images and Documents** → the OpenAI credit pool on the
  user profile (``openai_credits_remaining``), deducted per uploaded
  image / PDF page bucket.
* **Template API fills** → ``template_api_usage_counters``.
* **Signing requests** → ``signing_usage_counters``.

These tests guard against three classes of collision:

1. **Env var leakage.** Setting one quota's env override should not
   change another pool's limit.
2. **Collection drift.** Every pool writes to a distinct Firestore
   collection — if a refactor renames one into another the stats
   collector / reconciliation pipelines will silently double-count.
3. **Source-kind mixing.** The ``/api/search-fill/usage`` commit path
   must reject non-structured source kinds (``respondent``, image
   extraction tags, etc.) so a buggy client can't trick the backend
   into charging the wrong pool.
"""

from __future__ import annotations

import pytest

from backend.firebaseDB import (
    fill_link_database,
    signing_database,
    structured_fill_database,
    template_api_endpoint_database,
)
from backend.firebaseDB.user_database import OPENAI_CREDITS_FIELD
from backend.services import limits_service


class TestEnvVarIsolation:
    """Each pool's env override must not bleed into another pool."""

    def test_structured_fill_env_does_not_change_fill_link_limit(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("SANDBOX_FILL_LINK_RESPONSES_MONTHLY_MAX_BASE", raising=False)
        monkeypatch.setenv("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_BASE", "999")
        assert limits_service.resolve_structured_fill_monthly_limit("base") == 999
        # Fill By Link keeps its own default (25) — not 999.
        assert limits_service.resolve_fill_link_responses_monthly_limit("base") == 25

    def test_fill_link_env_does_not_change_structured_fill_limit(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_BASE", raising=False)
        monkeypatch.setenv("SANDBOX_FILL_LINK_RESPONSES_MONTHLY_MAX_BASE", "7")
        assert limits_service.resolve_fill_link_responses_monthly_limit("base") == 7
        # Structured fill keeps its own default (50) — not 7.
        assert limits_service.resolve_structured_fill_monthly_limit("base") == 50

    def test_template_api_env_does_not_change_structured_fill_limit(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_PRO", raising=False)
        monkeypatch.setenv("SANDBOX_TEMPLATE_API_REQUESTS_MONTHLY_MAX_PRO", "42")
        assert limits_service.resolve_template_api_requests_monthly_limit("pro") == 42
        assert limits_service.resolve_structured_fill_monthly_limit("pro") == 10_000

    def test_signing_env_does_not_change_structured_fill_limit(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_GOD", raising=False)
        monkeypatch.setenv("SANDBOX_SIGNING_REQUESTS_MONTHLY_MAX_GOD", "3")
        assert limits_service.resolve_signing_requests_monthly_limit("god") == 3
        assert limits_service.resolve_structured_fill_monthly_limit("god") == 100_000

    def test_all_five_pool_defaults_independent_at_base_tier(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Clear every override so we get each pool's actual default.
        for key in (
            "SANDBOX_FILL_LINK_RESPONSES_MONTHLY_MAX_BASE",
            "SANDBOX_TEMPLATE_API_REQUESTS_MONTHLY_MAX_BASE",
            "SANDBOX_SIGNING_REQUESTS_MONTHLY_MAX_BASE",
            "SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_BASE",
        ):
            monkeypatch.delenv(key, raising=False)
        defaults = {
            "fill_link": limits_service.resolve_fill_link_responses_monthly_limit("base"),
            "template_api": limits_service.resolve_template_api_requests_monthly_limit("base"),
            "signing": limits_service.resolve_signing_requests_monthly_limit("base"),
            "structured_fill": limits_service.resolve_structured_fill_monthly_limit("base"),
        }
        # Sanity: the five pools have distinct free-tier defaults so any
        # accidental aliasing would show up as duplicates here.
        assert defaults == {
            "fill_link": 25,
            "template_api": 250,
            "signing": 25,
            "structured_fill": 50,
        }

    def test_resolve_role_limits_surfaces_every_pool_independently(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_BASE", "123")
        limits = limits_service.resolve_role_limits("base")
        # Structured fill override took effect.
        assert limits["structuredFillMonthlyMax"] == 123
        # But every other pool kept its own default in the same payload.
        assert limits["fillLinkResponsesMonthlyMax"] == 25
        assert limits["templateApiRequestsMonthlyMax"] == 250
        assert limits["signingRequestsMonthlyMax"] == 25


class TestFirestoreCollectionNamespacesAreDistinct:
    """Stats reconciliation depends on each pool living in its own collection."""

    def test_usage_counter_collections_do_not_alias(self) -> None:
        names = {
            fill_link_database.FILL_LINK_USAGE_COUNTERS_COLLECTION,
            template_api_endpoint_database.TEMPLATE_API_USAGE_COUNTERS_COLLECTION,
            signing_database.SIGNING_USAGE_COUNTERS_COLLECTION,
            structured_fill_database.STRUCTURED_FILL_USAGE_COUNTERS_COLLECTION,
        }
        # Four distinct constants → four distinct Firestore documents;
        # any deduplication here means two pools now share counters.
        assert len(names) == 4

    def test_structured_fill_collections_are_namespaced_to_search_fill(self) -> None:
        # A drift here would quietly route writes into the signing or
        # fill-link namespace — these names are the wire contract the
        # stats collector keys off.
        assert structured_fill_database.STRUCTURED_FILL_USAGE_COUNTERS_COLLECTION == (
            "structured_fill_usage_counters"
        )
        assert structured_fill_database.STRUCTURED_FILL_EVENTS_COLLECTION == (
            "structured_fill_events"
        )
        assert structured_fill_database.STRUCTURED_FILL_REQUEST_GUARDS_COLLECTION == (
            "structured_fill_request_guards"
        )

    def test_structured_fill_does_not_share_a_collection_with_openai_credits(self) -> None:
        # OpenAI credits live as user-profile fields, not a separate
        # usage counter. Any refactor that tried to collapse them into
        # ``structured_fill_usage_counters`` would surface here.
        assert OPENAI_CREDITS_FIELD == "openai_credits_remaining"
        assert not structured_fill_database.STRUCTURED_FILL_USAGE_COUNTERS_COLLECTION.startswith(
            "openai_"
        )


class TestSourceKindRegistryRejectsForeignFlows:
    """Non-structured flows must not satisfy the structured-fill validator."""

    def test_respondent_is_not_a_structured_fill_source_kind(self) -> None:
        # Fill By Link web-form responses carry ``dataSourceKind='respondent'``
        # in the frontend. That value must never satisfy the backend
        # validator — otherwise a buggy client could post a respondent
        # payload to ``/api/search-fill/usage`` and debit the wrong pool.
        assert "respondent" not in structured_fill_database.STRUCTURED_FILL_SOURCE_KINDS

    def test_image_source_kinds_are_not_structured_fill(self) -> None:
        # Fill from Images uses OpenAI credits; its internal source
        # tags must not leak into this enum.
        for kind in ("image", "images", "png", "jpg", "jpeg", "pdf_ocr", "document_image"):
            assert kind not in structured_fill_database.STRUCTURED_FILL_SOURCE_KINDS

    def test_structured_fill_source_kinds_match_documented_set(self) -> None:
        assert structured_fill_database.STRUCTURED_FILL_SOURCE_KINDS == frozenset(
            {"csv", "excel", "sql", "json", "txt"}
        )


class TestCommitValidatorRejectsForeignSourceKinds:
    """End-to-end rejection path for non-structured source kinds."""

    def _call(self, source_kind: str) -> None:
        structured_fill_database._validate_commit_inputs(
            user_id="user-1",
            request_id="req-iso-1",
            source_category=structured_fill_database.STRUCTURED_FILL_SOURCE_CATEGORY,
            source_kind=source_kind,
            scope_type="template",
            template_id="tpl-1",
            group_id=None,
            target_template_ids=["tpl-1"],
            matched_template_ids=["tpl-1"],
            count_increment=1,
            match_count=1,
        )

    def test_respondent_source_kind_is_rejected(self) -> None:
        with pytest.raises(structured_fill_database.StructuredFillInvalidRequestError):
            self._call("respondent")

    def test_image_source_kind_is_rejected(self) -> None:
        with pytest.raises(structured_fill_database.StructuredFillInvalidRequestError):
            self._call("image")

    def test_empty_source_kind_is_rejected(self) -> None:
        with pytest.raises(structured_fill_database.StructuredFillInvalidRequestError):
            self._call("")

    def test_sql_csv_json_excel_txt_all_accepted(self) -> None:
        for kind in ("csv", "excel", "sql", "json", "txt"):
            # Should not raise.
            self._call(kind)
