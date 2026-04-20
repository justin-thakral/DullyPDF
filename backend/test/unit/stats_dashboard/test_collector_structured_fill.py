"""Unit tests for the Search & Fill scanner in ``internal_stats.collector``.

Focused on the collector contract — does it read the right event fields, count
only ``committed`` status, split by source_kind, and expose the expected
dashboard keys. We skip the Firestore auth dance by mocking
``_get_firestore_client`` and feeding the scanner a fake collection.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from internal_stats import collector as stats_collector


class _FakeSnapshot:
    def __init__(self, doc_id: str, data: Dict[str, Any]) -> None:
        self.id = doc_id
        self._data = dict(data)

    def to_dict(self) -> Dict[str, Any]:
        return dict(self._data)


class _FakeCollection:
    def __init__(self, docs: List[Dict[str, Any]]) -> None:
        self._docs = [
            _FakeSnapshot(doc.get("id") or f"auto_{i}", doc) for i, doc in enumerate(docs)
        ]

    def stream(self):
        return iter(self._docs)


class _FakeClient:
    def __init__(self, collections: Dict[str, List[Dict[str, Any]]]) -> None:
        self._collections = {name: _FakeCollection(docs) for name, docs in collections.items()}

    def collection(self, name: str) -> _FakeCollection:
        return self._collections.setdefault(name, _FakeCollection([]))


def _event(**overrides: Any) -> Dict[str, Any]:
    payload = {
        "user_id": "user-a",
        "request_id": "req-1",
        "usage_month_key": "2026-04",
        "status": "committed",
        "source_kind": "csv",
        "source_category": "structured_data",
        "scope_type": "template",
        "template_id": "tpl-1",
        "matched_template_ids": ["tpl-1"],
        "target_template_ids": ["tpl-1"],
        "count_increment": 1,
        "match_count": 1,
        "created_at": "2026-04-01T12:00:00+00:00",
    }
    payload.update(overrides)
    return payload


def test_scanner_counts_only_committed_events_and_splits_by_source_kind() -> None:
    client = _FakeClient(
        {
            stats_collector.STRUCTURED_FILL_EVENTS_COLLECTION: [
                _event(user_id="user-a", source_kind="csv", count_increment=1),
                _event(user_id="user-a", source_kind="excel", count_increment=1),
                _event(
                    user_id="user-a",
                    source_kind="excel",
                    count_increment=3,
                    matched_template_ids=["tpl-1", "tpl-2", "tpl-3"],
                    match_count=3,
                    created_at="2026-04-02T10:00:00+00:00",
                ),
                # Replayed commits must NOT inflate credit totals.
                _event(user_id="user-a", status="replayed", count_increment=1),
                # Rejected commits carry count_increment=0 — still skipped by the 0 guard.
                _event(user_id="user-a", status="rejected_no_match", count_increment=0),
                # Different user.
                _event(user_id="user-b", source_kind="sql", count_increment=2, matched_template_ids=["tpl-x", "tpl-y"]),
                # Event without user_id is ignored.
                _event(user_id=None, source_kind="csv"),
            ]
        }
    )

    accumulators: Dict[str, stats_collector.UserStatsAccumulator] = {}
    totals = stats_collector._scan_structured_fill_events(client, accumulators)

    assert totals["totalCredits"] == 1 + 1 + 3 + 2  # 7 charged credits
    assert totals["totalCommits"] == 4  # 4 committed events (replayed/rejected skipped)
    assert totals["totalMatchedPdfs"] == 1 + 1 + 3 + 2
    assert totals["creditsBySource"] == {
        "csv": 1,
        "excel": 4,
        "sql": 2,
        "json": 0,
        "txt": 0,
    }

    user_a = accumulators["user-a"]
    assert user_a.structured_fill_credits == 5
    assert user_a.structured_fill_commits == 3
    assert user_a.structured_fill_matched_pdfs == 5
    assert user_a.structured_fill_credits_by_source["csv"] == 1
    assert user_a.structured_fill_credits_by_source["excel"] == 4
    assert user_a.last_structured_fill_at is not None
    assert user_a.last_structured_fill_at.startswith("2026-04-02")

    user_b = accumulators["user-b"]
    assert user_b.structured_fill_credits == 2
    assert user_b.structured_fill_credits_by_source["sql"] == 2


def test_user_accumulator_to_dict_exposes_search_fill_dashboard_keys() -> None:
    acc = stats_collector.UserStatsAccumulator(user_id="user-a")
    acc.structured_fill_credits = 7
    acc.structured_fill_commits = 4
    acc.structured_fill_matched_pdfs = 9
    acc.structured_fill_credits_by_source["csv"] = 3
    acc.structured_fill_credits_by_source["excel"] = 4
    acc.last_structured_fill_at = "2026-04-05T00:00:00+00:00"

    payload = acc.to_dict()

    assert payload["structuredFillCredits"] == 7
    assert payload["structuredFillCommits"] == 4
    assert payload["structuredFillMatchedPdfs"] == 9
    assert payload["structuredFillCsvCredits"] == 3
    assert payload["structuredFillExcelCredits"] == 4
    assert payload["structuredFillSqlCredits"] == 0
    assert payload["structuredFillJsonCredits"] == 0
    assert payload["structuredFillTxtCredits"] == 0
    assert payload["lastStructuredFillAt"] == "2026-04-05T00:00:00+00:00"
    # activity_score folds structured fill credits into the overall activity score
    # so sorting by activity in the UI promotes heavy Search & Fill users.
    assert payload["activityScore"] >= 7


def test_build_internal_stats_snapshot_includes_new_global_totals(monkeypatch) -> None:
    """End-to-end: snapshot payload exposes the new Search & Fill keys."""

    # Seed only the collections the scanner path actually needs.
    events = [
        _event(user_id="user-a", source_kind="csv", count_increment=2, matched_template_ids=["tpl-1", "tpl-2"]),
        _event(user_id="user-a", source_kind="json", count_increment=1),
    ]
    users = [{"id": "user-a", "email": "a@example.com", "role": "base"}]
    client = _FakeClient(
        {
            stats_collector.USERS_COLLECTION: users,
            stats_collector.STRUCTURED_FILL_EVENTS_COLLECTION: events,
        }
    )
    monkeypatch.setattr(stats_collector, "_get_firestore_client", lambda: client)

    snapshot = stats_collector.build_internal_stats_snapshot()

    global_stats = snapshot["global"]
    assert global_stats["totalStructuredFillCredits"] == 3
    assert global_stats["totalStructuredFillCommits"] == 2
    assert global_stats["totalStructuredFillMatchedPdfs"] == 3  # 2 matched + 1 matched
    assert global_stats["totalStructuredFillCsvCredits"] == 2
    assert global_stats["totalStructuredFillJsonCredits"] == 1
    assert global_stats["totalStructuredFillExcelCredits"] == 0

    [user_row] = snapshot["users"]
    assert user_row["structuredFillCredits"] == 3
    assert user_row["structuredFillCsvCredits"] == 2
    assert user_row["structuredFillJsonCredits"] == 1
