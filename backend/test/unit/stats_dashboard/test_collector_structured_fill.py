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


def test_pdf_download_scanner_splits_flat_and_editable_counts() -> None:
    client = _FakeClient(
        {
            stats_collector.PDF_DOWNLOAD_EVENTS_COLLECTION: [
                {
                    "user_id": "user-a",
                    "source": "workspace_download",
                    "export_mode": "flat",
                    "pdf_count": 2,
                    "created_at": "2026-04-03T12:00:00+00:00",
                },
                {
                    "user_id": "user-a",
                    "source": "workspace_group_download",
                    "export_mode": "editable",
                    "pdf_count": 1,
                    "created_at": "2026-04-04T12:00:00+00:00",
                },
                {"user_id": "user-b", "source": "workspace_download", "export_mode": "flat", "pdf_count": 1},
                {
                    "user_id": "user-b",
                    "source": "workspace_download",
                    "status": "rejected_limit",
                    "export_mode": "flat",
                    "pdf_count": 1,
                },
                {
                    "user_id": "user-c",
                    "source": "workspace_download",
                    "status": "rejected_invalid",
                    "export_mode": "editable",
                    "pdf_count": 1,
                },
                {
                    "user_id": "user-c",
                    "source": "workspace_download",
                    "status": "replayed",
                    "export_mode": "editable",
                    "pdf_count": 1,
                },
                {"user_id": None, "source": "workspace_download", "export_mode": "flat", "pdf_count": 5},
            ],
        }
    )
    accumulators: Dict[str, stats_collector.UserStatsAccumulator] = {}

    totals = stats_collector._scan_pdf_download_events(client, accumulators)

    assert totals == {
        "totalDownloadedPdfs": 4,
        "totalDownloadedEditablePdfs": 1,
        "totalDownloadedFlatPdfs": 3,
        "totalDownloadedGroupPdfs": 1,
        "totalPdfDownloadLimitRejections": 1,
        "totalPdfDownloadInvalidRejections": 1,
    }
    assert accumulators["user-a"].downloaded_pdfs == 3
    assert accumulators["user-a"].downloaded_group_pdfs == 1
    assert accumulators["user-a"].downloaded_flat_pdfs == 2
    assert accumulators["user-a"].downloaded_editable_pdfs == 1
    assert accumulators["user-b"].downloaded_pdfs == 1
    assert accumulators["user-b"].pdf_download_limit_rejections == 1
    assert accumulators["user-c"].downloaded_pdfs == 0
    assert accumulators["user-c"].pdf_download_invalid_rejections == 1


def test_pdf_download_usage_counter_scanner_surfaces_current_month_support_fields(monkeypatch) -> None:
    monkeypatch.setattr(stats_collector, "_current_month_key", lambda: "2026-05")
    client = _FakeClient(
        {
            stats_collector.PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION: [
                {
                    "user_id": "base-near-cap",
                    "month_key": "2026-05",
                    "download_count": 20,
                    "updated_at": "2026-05-04T12:00:00+00:00",
                },
                {
                    "user_id": "pro-heavy",
                    "month_key": "2026-05",
                    "download_count": 125,
                    "updated_at": "2026-05-05T12:00:00+00:00",
                },
                {
                    "user_id": "base-old-month",
                    "month_key": "2026-04",
                    "download_count": 25,
                },
            ],
        }
    )
    accumulators: Dict[str, stats_collector.UserStatsAccumulator] = {
        "base-near-cap": stats_collector.UserStatsAccumulator(user_id="base-near-cap", role=stats_collector.ROLE_BASE),
        "pro-heavy": stats_collector.UserStatsAccumulator(user_id="pro-heavy", role=stats_collector.ROLE_PRO),
    }

    totals = stats_collector._scan_pdf_download_usage_counters(client, accumulators)

    assert totals == {
        "totalPdfDownloadsThisMonth": 145,
        "totalPdfDownloadUsersThisMonth": 2,
        "totalBaseUsersAt80PctPdfDownloads": 1,
        "totalProUsersHighPdfDownloadVolume": 1,
    }
    assert accumulators["base-near-cap"].downloaded_pdfs_this_month == 20
    assert accumulators["base-near-cap"].pdf_downloads_remaining_this_month == 5
    assert accumulators["pro-heavy"].downloaded_pdfs_this_month == 125
    assert accumulators["pro-heavy"].pdf_downloads_remaining_this_month is None


def test_saved_template_scanner_counts_snapshot_feature_adoption(monkeypatch) -> None:
    snapshots = {
        "gs://dullypdf-sessions-east4/snap-a.json": {
            "appearance": {
                "globalFieldFont": "Times-Roman",
                "globalFieldFontSize": "auto",
                "globalFieldFontColor": "#000000",
            },
            "fields": [
                {"id": "qr-1", "name": "qr", "type": "qr"},
                {"id": "pdf417-1", "name": "pdf417", "type": "pdf417"},
                {"id": "barcode-1", "name": "barcode", "type": "barcode"},
                {
                    "id": "total",
                    "name": "total",
                    "type": "text",
                    "fontColor": "#336699",
                    "calculation": {"role": "calculated_output"},
                },
                {"id": "quantity", "name": "quantity", "type": "text", "calculation": {"role": "number_input"}},
            ],
        },
        "gs://dullypdf-sessions-east4/snap-b.json": {
            "appearance": {
                "globalFieldFont": "default",
                "globalFieldFontSize": "auto",
                "globalFieldFontColor": "#000000",
            },
            "fields": [{"id": "name", "name": "name", "type": "text"}],
        },
    }
    monkeypatch.setattr(stats_collector, "_download_storage_json", lambda path: snapshots[path])
    client = _FakeClient(
        {
            stats_collector.TEMPLATES_COLLECTION: [
                {
                    "id": "tpl-a",
                    "user_id": "user-a",
                    "metadata": {"editorSnapshot": {"path": "gs://dullypdf-sessions-east4/snap-a.json"}},
                    "created_at": "2026-04-01T00:00:00+00:00",
                },
                {
                    "id": "tpl-b",
                    "user_id": "user-a",
                    "metadata": {"editorSnapshot": {"path": "gs://dullypdf-sessions-east4/snap-b.json"}},
                },
                {
                    "id": "tpl-c",
                    "user_id": "user-b",
                    "metadata": {"editorSnapshot": {"path": "gs://dullypdf-sessions-east4/missing.json"}},
                },
            ],
        }
    )
    accumulators: Dict[str, stats_collector.UserStatsAccumulator] = {}

    totals = stats_collector._scan_saved_templates(client, accumulators)

    assert totals["totalTemplates"] == 3
    assert totals["totalQrBarcodes"] == 1
    assert totals["totalPdf417Barcodes"] == 1
    assert totals["totalOneDBarcodes"] == 1
    assert totals["totalBarcodeFields"] == 3
    assert totals["totalCalculationFields"] == 2
    assert totals["totalCustomAppearanceTemplates"] == 1
    assert totals["totalCustomAppearanceFieldOverrides"] == 1
    assert totals["totalTemplateSnapshotLoadFailures"] == 1
    assert accumulators["user-a"].saved_templates == 2
    assert accumulators["user-a"].has_custom_appearance is True
    assert accumulators["user-a"].calculation_fields == 2
    assert accumulators["user-b"].saved_templates == 1


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
            stats_collector.PDF_DOWNLOAD_EVENTS_COLLECTION: [
                {"user_id": "user-a", "source": "workspace_download", "export_mode": "flat", "pdf_count": 1},
                {
                    "user_id": "user-a",
                    "source": "workspace_download",
                    "status": "rejected_limit",
                    "export_mode": "flat",
                    "pdf_count": 1,
                },
            ],
            stats_collector.PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION: [
                {
                    "user_id": "user-a",
                    "month_key": stats_collector._current_month_key(),
                    "download_count": 20,
                },
            ],
            stats_collector.TEMPLATES_COLLECTION: [
                {
                    "id": "tpl-a",
                    "user_id": "user-a",
                    "metadata": {"editorSnapshot": {"path": "gs://dullypdf-sessions-east4/snap-a.json"}},
                }
            ],
        }
    )
    monkeypatch.setattr(stats_collector, "_get_firestore_client", lambda: client)
    monkeypatch.setattr(
        stats_collector,
        "_download_storage_json",
        lambda _path: {
            "appearance": {"globalFieldFont": "default", "globalFieldFontSize": 14, "globalFieldFontColor": "#000000"},
            "fields": [
                {"id": "qr-1", "name": "qr", "type": "qr"},
                {"id": "calc-1", "name": "calc", "type": "text", "calculation": {"role": "calculated_output"}},
            ],
        },
    )

    snapshot = stats_collector.build_internal_stats_snapshot()

    global_stats = snapshot["global"]
    assert global_stats["totalSavedTemplates"] == 1
    assert global_stats["totalDownloadedPdfs"] == 1
    assert global_stats["totalDownloadedFlatPdfs"] == 1
    assert global_stats["totalPdfDownloadsThisMonth"] == 20
    assert global_stats["totalPdfDownloadUsersThisMonth"] == 1
    assert global_stats["totalBaseUsersAt80PctPdfDownloads"] == 1
    assert global_stats["totalPdfDownloadLimitRejections"] == 1
    assert global_stats["totalQrBarcodesCreated"] == 1
    assert global_stats["totalCalculationFields"] == 1
    assert global_stats["totalUsersWithCustomAppearance"] == 1
    assert global_stats["totalStructuredFillCredits"] == 3
    assert global_stats["totalStructuredFillCommits"] == 2
    assert global_stats["totalStructuredFillMatchedPdfs"] == 3  # 2 matched + 1 matched
    assert global_stats["totalStructuredFillCsvCredits"] == 2
    assert global_stats["totalStructuredFillJsonCredits"] == 1
    assert global_stats["totalStructuredFillExcelCredits"] == 0

    [user_row] = snapshot["users"]
    assert user_row["downloadedPdfs"] == 1
    assert user_row["downloadedPdfsThisMonth"] == 20
    assert user_row["pdfDownloadLimitRejections"] == 1
    assert user_row["pdfDownloadsRemainingThisMonth"] == 5
    assert user_row["qrBarcodesCreated"] == 1
    assert user_row["calculationFields"] == 1
    assert user_row["hasCustomAppearance"] is True
    assert user_row["structuredFillCredits"] == 3
    assert user_row["structuredFillCsvCredits"] == 2
    assert user_row["structuredFillJsonCredits"] == 1
