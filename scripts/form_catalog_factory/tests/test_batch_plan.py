from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest

from scripts.form_catalog_factory.batch_plan import (
    BatchPlanError,
    build_batch_plan,
    select_candidates,
)
from scripts.form_catalog_factory.catalog_source import CatalogCandidate
from scripts.form_catalog_factory.__main__ import parse_args
from scripts.form_catalog_factory.themes import DEFAULT_THEME_ID, get_theme


def _candidate(
    catalog_id: str,
    *,
    slug: str,
    source_family: str,
    priority: int = 0,
) -> CatalogCandidate:
    section, stem = catalog_id.split("/", 1)
    title = stem.replace("_", " ").title()
    intent_group_hash = hashlib.sha256(title.encode("utf-8")).hexdigest()
    return CatalogCandidate(
        catalog_id=catalog_id,
        section=section,
        filename=f"{stem}.pdf",
        slug=slug,
        title=title,
        current_sha256="a" * 64,
        description="Description",
        use_case="Use case",
        source_family=source_family,
        risk_tier="A",
        priority=priority,
        intent_fingerprint=hashlib.sha256(catalog_id.encode("utf-8")).hexdigest(),
        intent_group_hash=intent_group_hash,
    )


def test_selection_places_top_seo_before_longtail_and_other_first_party() -> None:
    candidates = [
        _candidate("other/ordinary", slug="ordinary", source_family="first_party", priority=99),
        _candidate("longtail/item", slug="longtail-item", source_family="longtail"),
        _candidate(
            "seo/camp",
            slug="summer-camp-incident-report-form",
            source_family="first_party",
        ),
    ]

    selected = select_candidates(candidates, target_count=2)

    assert [candidate.catalog_id for candidate in selected] == [
        "seo/camp",
        "longtail/item",
    ]


def test_selection_fails_when_target_exceeds_eligible_candidates() -> None:
    candidates = [
        _candidate("longtail/item", slug="longtail-item", source_family="longtail"),
    ]

    with pytest.raises(BatchPlanError, match="only 1 eligible"):
        select_candidates(candidates, target_count=2)


def test_selection_rejects_duplicate_excluded_catalog_ids() -> None:
    candidate = _candidate(
        "section/item",
        slug="item",
        source_family="first_party",
    )

    with pytest.raises(BatchPlanError, match="contain duplicates"):
        select_candidates(
            [candidate],
            target_count=1,
            excluded_catalog_ids=[candidate.catalog_id, candidate.catalog_id],
        )


def _write_json(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _active_contract(*identities: tuple[str, str]) -> dict:
    return {
        "schemaVersion": 1,
        "releaseId": "catalog-active" if identities else None,
        "replacements": [
            {
                "sourceSection": section,
                "filename": f"{stem}.pdf",
            }
            for section, stem in identities
        ],
    }


def _frozen_selection(
    release_id: str,
    *candidates: CatalogCandidate,
) -> dict:
    return {
        "schemaVersion": 1,
        "releaseId": release_id,
        "targetCount": len(candidates),
        "items": [
            {
                "catalogId": candidate.catalog_id,
                "sourceSection": candidate.section,
                "filename": candidate.filename,
                "slug": candidate.slug,
            }
            for candidate in candidates
        ],
    }


def test_selection_excludes_active_and_frozen_union_before_ranking() -> None:
    candidates = [
        _candidate(
            "seo/camp",
            slug="summer-camp-incident-report-form",
            source_family="first_party",
        ),
        _candidate(
            "longtail/old",
            slug="longtail-old",
            source_family="longtail",
        ),
        _candidate(
            "first/new_high",
            slug="new-high",
            source_family="first_party",
            priority=20,
        ),
        _candidate(
            "first/new_low",
            slug="new-low",
            source_family="first_party",
            priority=10,
        ),
    ]

    selected = select_candidates(
        candidates,
        target_count=2,
        excluded_catalog_ids=["seo/camp", "longtail/old"],
    )

    assert [candidate.catalog_id for candidate in selected] == [
        "first/new_high",
        "first/new_low",
    ]


def test_build_plan_records_exact_exclusion_and_theme_provenance(
    tmp_path: Path,
) -> None:
    active_candidate = _candidate(
        "old/active",
        slug="active",
        source_family="first_party",
    )
    frozen_candidate = _candidate(
        "old/frozen",
        slug="frozen",
        source_family="first_party",
    )
    candidates = [
        active_candidate,
        frozen_candidate,
        _candidate(
            "new/higher",
            slug="higher",
            source_family="first_party",
            priority=10,
        ),
        _candidate(
            "new/lower",
            slug="lower",
            source_family="first_party",
            priority=5,
        ),
    ]
    catalog_path = tmp_path / "catalog.mjs"
    catalog_path.write_text("catalog bytes", encoding="utf-8")
    registry_path = tmp_path / "registry.json"
    registry_path.write_text("registry bytes", encoding="utf-8")
    active_path = _write_json(
        tmp_path / "active.json",
        _active_contract(("old", "active")),
    )
    # The active/frozen overlap is expected: active releases should also be
    # present in the durable frozen history. The union still contains two IDs.
    frozen_path = _write_json(
        tmp_path / "frozen.json",
        _frozen_selection(
            "catalog-frozen",
            active_candidate,
            frozen_candidate,
        ),
    )

    plan = build_batch_plan(
        release_id="catalog-next",
        candidates=candidates,
        target_count=2,
        frontend_catalog_path=catalog_path,
        local_registry_path=registry_path,
        active_contract_path=active_path,
        frozen_selection_paths=[frozen_path],
        theme_id="charcoal-deep-green-gold-v1",
    )

    excluded_ids = ["old/active", "old/frozen"]
    expected_exclusion_digest = hashlib.sha256(
        json.dumps(
            excluded_ids,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    assert [item["catalogId"] for item in plan["items"]] == [
        "new/higher",
        "new/lower",
    ]
    assert plan["renderTheme"] == get_theme(
        "charcoal-deep-green-gold-v1"
    ).provenance()
    assert plan["exclusionSources"] == {
        "activeContract": {
            "releaseId": "catalog-active",
            "sha256": hashlib.sha256(active_path.read_bytes()).hexdigest(),
            "itemCount": 1,
        },
        "frozenSelections": [
            {
                "releaseId": "catalog-frozen",
                "sha256": hashlib.sha256(frozen_path.read_bytes()).hexdigest(),
                "itemCount": 2,
            }
        ],
    }
    assert plan["exclusions"] == {
        "excludedCatalogIdCount": 2,
        "excludedCatalogIdsSha256": expected_exclusion_digest,
        "eligibleCandidateCount": 2,
    }
    assert not ({item["catalogId"] for item in plan["items"]} & set(excluded_ids))


def test_exclusion_sources_reject_duplicates_and_conflicts(
    tmp_path: Path,
) -> None:
    candidate = _candidate(
        "section/item",
        slug="item",
        source_family="first_party",
    )
    catalog_path = tmp_path / "catalog.mjs"
    catalog_path.write_text("catalog", encoding="utf-8")
    registry_path = tmp_path / "registry.json"
    registry_path.write_text("registry", encoding="utf-8")
    active = _active_contract(("section", "item"), ("section", "item"))
    active_path = _write_json(tmp_path / "active.json", active)

    with pytest.raises(BatchPlanError, match="duplicate exclusion"):
        build_batch_plan(
            release_id="catalog-next",
            candidates=[candidate],
            target_count=1,
            frontend_catalog_path=catalog_path,
            local_registry_path=registry_path,
            active_contract_path=active_path,
        )

    active_path = _write_json(tmp_path / "active.json", _active_contract())
    first = _write_json(
        tmp_path / "first.json",
        _frozen_selection("catalog-first", candidate),
    )
    second = _write_json(
        tmp_path / "second.json",
        _frozen_selection("catalog-second", candidate),
    )
    with pytest.raises(BatchPlanError, match="both contain"):
        build_batch_plan(
            release_id="catalog-next",
            candidates=[candidate],
            target_count=1,
            frontend_catalog_path=catalog_path,
            local_registry_path=registry_path,
            active_contract_path=active_path,
            frozen_selection_paths=[first, second],
        )


def test_malformed_exclusion_source_fails_closed(tmp_path: Path) -> None:
    candidate = _candidate(
        "section/item",
        slug="item",
        source_family="first_party",
    )
    catalog_path = tmp_path / "catalog.mjs"
    catalog_path.write_text("catalog", encoding="utf-8")
    registry_path = tmp_path / "registry.json"
    registry_path.write_text("registry", encoding="utf-8")
    active_path = _write_json(tmp_path / "active.json", _active_contract())
    malformed_path = _write_json(
        tmp_path / "malformed.json",
        {
            "schemaVersion": 1,
            "releaseId": "catalog-malformed",
            "targetCount": 1,
            "items": [
                {
                    "sourceSection": candidate.section,
                    "filename": candidate.filename,
                    "slug": candidate.slug,
                }
            ],
        },
    )

    with pytest.raises(BatchPlanError, match=r"\.catalogId"):
        build_batch_plan(
            release_id="catalog-next",
            candidates=[candidate],
            target_count=1,
            frontend_catalog_path=catalog_path,
            local_registry_path=registry_path,
            active_contract_path=active_path,
            frozen_selection_paths=[malformed_path],
        )

    malformed_path.write_text(
        '{"schemaVersion":1,"schemaVersion":1}',
        encoding="utf-8",
    )
    with pytest.raises(BatchPlanError, match="duplicate key"):
        build_batch_plan(
            release_id="catalog-next",
            candidates=[candidate],
            target_count=1,
            frontend_catalog_path=catalog_path,
            local_registry_path=registry_path,
            active_contract_path=active_path,
            frozen_selection_paths=[malformed_path],
        )


def test_excluded_identity_must_still_match_candidate_universe(
    tmp_path: Path,
) -> None:
    candidate = _candidate(
        "section/item",
        slug="current-slug",
        source_family="first_party",
    )
    mismatched = _candidate(
        "section/item",
        slug="stale-slug",
        source_family="first_party",
    )
    catalog_path = tmp_path / "catalog.mjs"
    catalog_path.write_text("catalog", encoding="utf-8")
    registry_path = tmp_path / "registry.json"
    registry_path.write_text("registry", encoding="utf-8")
    active_path = _write_json(tmp_path / "active.json", _active_contract())
    frozen_path = _write_json(
        tmp_path / "frozen.json",
        _frozen_selection("catalog-frozen", mismatched),
    )

    with pytest.raises(BatchPlanError, match="no longer matches"):
        build_batch_plan(
            release_id="catalog-next",
            candidates=[candidate],
            target_count=1,
            frontend_catalog_path=catalog_path,
            local_registry_path=registry_path,
            active_contract_path=active_path,
            frozen_selection_paths=[frozen_path],
        )


def test_cli_accepts_plan_exclusions_and_explicit_render_theme(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "form-catalog-factory",
            "plan-batch",
            "--release-id",
            "catalog-next",
            "--output",
            "selection.json",
        ],
    )
    default_plan_args = parse_args()
    assert default_plan_args.active_contract == "form_catalog_releases/active.json"
    assert default_plan_args.frozen_selection == []
    assert default_plan_args.theme_id == DEFAULT_THEME_ID

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "form-catalog-factory",
            "plan-batch",
            "--release-id",
            "catalog-next",
            "--output",
            "selection.json",
            "--active-contract",
            "active.json",
            "--frozen-selection",
            "frozen-one.json",
            "--frozen-selection",
            "frozen-two.json",
            "--theme-id",
            "charcoal-deep-green-gold-v1",
        ],
    )
    plan_args = parse_args()
    assert plan_args.active_contract == "active.json"
    assert plan_args.frozen_selection == [
        "frozen-one.json",
        "frozen-two.json",
    ]
    assert plan_args.theme_id == "charcoal-deep-green-gold-v1"

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "form-catalog-factory",
            "render",
            "spec.json",
            "--output-root",
            "rendered",
            "--theme-id",
            "charcoal-deep-green-gold-v1",
        ],
    )
    render_args = parse_args()
    assert render_args.theme_id == "charcoal-deep-green-gold-v1"

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "form-catalog-factory",
            "render",
            "spec.json",
            "--output-root",
            "rendered",
        ],
    )
    assert parse_args().theme_id == DEFAULT_THEME_ID
