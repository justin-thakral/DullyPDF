from __future__ import annotations

import hashlib

import pytest

from scripts.form_catalog_factory.batch_plan import BatchPlanError, select_candidates
from scripts.form_catalog_factory.catalog_source import CatalogCandidate


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
