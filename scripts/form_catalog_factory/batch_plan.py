"""Deterministic selection plans for immutable catalog release batches."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from .catalog_source import CatalogCandidate, TOP_SEO_SLUGS


PLAN_SCHEMA_VERSION = 1
DEFAULT_SELECTION_STRATEGY = "top-seo-then-longtail-v1"


class BatchPlanError(ValueError):
    """Raised when a deterministic release selection cannot be produced."""


def _sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _selection_key(candidate: CatalogCandidate) -> tuple[int, int, str]:
    """Rank approved SEO identities first, then the known low-value family."""

    if candidate.slug in TOP_SEO_SLUGS:
        group = 0
    elif candidate.source_family == "longtail":
        group = 1
    else:
        group = 2
    return group, -candidate.priority, candidate.catalog_id


def select_candidates(
    candidates: Iterable[CatalogCandidate],
    *,
    target_count: int,
) -> list[CatalogCandidate]:
    """Select a stable, unique batch without changing public identities."""

    if target_count <= 0:
        raise BatchPlanError("target_count must be positive")
    ordered = sorted(candidates, key=_selection_key)
    if len(ordered) < target_count:
        raise BatchPlanError(
            f"only {len(ordered)} eligible candidates exist for target {target_count}"
        )
    selected = ordered[:target_count]
    catalog_ids = {candidate.catalog_id for candidate in selected}
    slugs = {candidate.slug for candidate in selected}
    identities = {(candidate.section, candidate.filename) for candidate in selected}
    if (
        len(catalog_ids) != target_count
        or len(slugs) != target_count
        or len(identities) != target_count
    ):
        raise BatchPlanError("selection contains a duplicate ID, slug, or source identity")
    return selected


def build_batch_plan(
    *,
    release_id: str,
    candidates: Iterable[CatalogCandidate],
    target_count: int,
    frontend_catalog_path: str | Path,
    local_registry_path: str | Path,
) -> dict[str, Any]:
    """Build the tracked pre-freeze ownership plan for one release."""

    if not release_id or release_id != release_id.strip():
        raise BatchPlanError("release_id must be a non-empty trimmed string")
    selected = select_candidates(candidates, target_count=target_count)
    family_counts = Counter(candidate.source_family for candidate in selected)
    risk_counts = Counter(candidate.risk_tier for candidate in selected)
    return {
        "schemaVersion": PLAN_SCHEMA_VERSION,
        "releaseId": release_id,
        "targetCount": target_count,
        "selectionStrategy": DEFAULT_SELECTION_STRATEGY,
        "sourceDigests": {
            "frontendCatalogSha256": _sha256_file(frontend_catalog_path),
            "localRegistrySha256": _sha256_file(local_registry_path),
        },
        "summary": {
            "sourceFamilies": dict(sorted(family_counts.items())),
            "riskTiers": dict(sorted(risk_counts.items())),
        },
        "items": [
            {
                "catalogId": candidate.catalog_id,
                "sourceSection": candidate.section,
                "filename": candidate.filename,
                "slug": candidate.slug,
                "title": candidate.title,
                "sourceFamily": candidate.source_family,
                "riskTier": candidate.risk_tier,
                "currentSha256": candidate.current_sha256,
                "intentGroupHash": candidate.intent_group_hash,
            }
            for candidate in selected
        ],
    }


def write_batch_plan(path: str | Path, plan: dict[str, Any]) -> None:
    """Write one canonical, reviewable planning record."""

    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
