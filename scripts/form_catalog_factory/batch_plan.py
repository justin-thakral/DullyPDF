"""Deterministic selection plans for immutable catalog release batches."""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

from .catalog_source import CatalogCandidate, TOP_SEO_SLUGS
from .themes import DEFAULT_THEME_ID, ThemeError, get_theme


PLAN_SCHEMA_VERSION = 1
DEFAULT_SELECTION_STRATEGY = "top-seo-then-longtail-v1"
SECTION_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,79}$")
FILENAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]*\.pdf$")


class BatchPlanError(ValueError):
    """Raised when a deterministic release selection cannot be produced."""


@dataclass(frozen=True)
class _ExcludedIdentity:
    """One stable catalog identity captured from an exclusion source."""

    catalog_id: str
    section: str
    filename: str
    slug: str | None


@dataclass(frozen=True)
class _ExclusionContext:
    """Validated exclusion identities plus their immutable source provenance."""

    identities: dict[str, _ExcludedIdentity]
    active_source: dict[str, Any] | None
    frozen_sources: tuple[dict[str, Any], ...]


def _sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_sha256(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for key, value in pairs:
        if key in payload:
            raise BatchPlanError(f"exclusion JSON contains duplicate key {key!r}")
        payload[key] = value
    return payload


def _load_object(
    path: str | Path,
    label: str,
) -> tuple[dict[str, Any], str]:
    source = Path(path)
    try:
        raw = source.read_bytes()
        payload = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_reject_duplicate_keys,
        )
    except BatchPlanError:
        raise
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BatchPlanError(f"could not read {label} {source}: {exc}") from exc
    schema_version = (
        payload.get("schemaVersion")
        if isinstance(payload, dict)
        else None
    )
    if (
        not isinstance(payload, dict)
        or isinstance(schema_version, bool)
        or schema_version != PLAN_SCHEMA_VERSION
    ):
        raise BatchPlanError(f"{label} must be a schemaVersion 1 object")
    return payload, hashlib.sha256(raw).hexdigest()


def _required_trimmed_string(value: Any, location: str) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise BatchPlanError(f"{location} must be a non-empty trimmed string")
    return value


def _identity(
    *,
    section: Any,
    filename: Any,
    catalog_id: Any | None,
    slug: Any | None,
    location: str,
) -> _ExcludedIdentity:
    normalized_section = _required_trimmed_string(
        section,
        f"{location}.sourceSection",
    )
    normalized_filename = _required_trimmed_string(
        filename,
        f"{location}.filename",
    )
    if not SECTION_PATTERN.fullmatch(normalized_section):
        raise BatchPlanError(f"{location}.sourceSection is invalid")
    if not FILENAME_PATTERN.fullmatch(normalized_filename):
        raise BatchPlanError(f"{location}.filename must be a lowercase PDF basename")
    expected_catalog_id = f"{normalized_section}/{normalized_filename[:-4]}"
    if catalog_id is not None:
        normalized_catalog_id = _required_trimmed_string(
            catalog_id,
            f"{location}.catalogId",
        )
        if normalized_catalog_id != expected_catalog_id:
            raise BatchPlanError(
                f"{location}.catalogId must equal {expected_catalog_id!r}"
            )
    normalized_slug = (
        _required_trimmed_string(slug, f"{location}.slug")
        if slug is not None
        else None
    )
    return _ExcludedIdentity(
        catalog_id=expected_catalog_id,
        section=normalized_section,
        filename=normalized_filename,
        slug=normalized_slug,
    )


def _load_active_exclusions(
    path: str | Path,
) -> tuple[dict[str, _ExcludedIdentity], dict[str, Any]]:
    payload, source_sha256 = _load_object(path, "active contract")
    replacements = payload.get("replacements")
    if not isinstance(replacements, list):
        raise BatchPlanError("active contract.replacements must be an array")
    release_id = payload.get("releaseId")
    if replacements:
        release_id = _required_trimmed_string(
            release_id,
            "active contract.releaseId",
        )
    elif release_id is not None:
        raise BatchPlanError(
            "an empty active contract must have a null releaseId"
        )

    identities: dict[str, _ExcludedIdentity] = {}
    for index, raw in enumerate(replacements):
        location = f"active contract.replacements[{index}]"
        if not isinstance(raw, dict):
            raise BatchPlanError(f"{location} must be an object")
        identity = _identity(
            section=raw.get("sourceSection"),
            filename=raw.get("filename"),
            catalog_id=None,
            slug=None,
            location=location,
        )
        if identity.catalog_id in identities:
            raise BatchPlanError(
                "active contract contains duplicate exclusion "
                f"{identity.catalog_id!r}"
            )
        identities[identity.catalog_id] = identity
    return identities, {
        "releaseId": release_id,
        "sha256": source_sha256,
        "itemCount": len(identities),
    }


def _load_frozen_exclusions(
    paths: Sequence[str | Path],
) -> tuple[dict[str, _ExcludedIdentity], tuple[dict[str, Any], ...]]:
    identities: dict[str, _ExcludedIdentity] = {}
    owner_by_catalog_id: dict[str, str] = {}
    seen_release_ids: set[str] = set()
    sources: list[dict[str, Any]] = []
    for raw_path in paths:
        payload, source_sha256 = _load_object(raw_path, "frozen selection")
        release_id = _required_trimmed_string(
            payload.get("releaseId"),
            "frozen selection.releaseId",
        )
        if release_id in seen_release_ids:
            raise BatchPlanError(
                f"duplicate frozen selection releaseId {release_id!r}"
            )
        seen_release_ids.add(release_id)
        items = payload.get("items")
        target_count = payload.get("targetCount")
        if (
            not isinstance(items, list)
            or isinstance(target_count, bool)
            or not isinstance(target_count, int)
            or target_count <= 0
            or len(items) != target_count
        ):
            raise BatchPlanError(
                f"frozen selection {release_id!r} has invalid items or targetCount"
            )

        source_identities: dict[str, _ExcludedIdentity] = {}
        for index, raw in enumerate(items):
            location = f"frozen selection {release_id!r}.items[{index}]"
            if not isinstance(raw, dict):
                raise BatchPlanError(f"{location} must be an object")
            identity = _identity(
                section=raw.get("sourceSection"),
                filename=raw.get("filename"),
                catalog_id=_required_trimmed_string(
                    raw.get("catalogId"),
                    f"{location}.catalogId",
                ),
                slug=_required_trimmed_string(
                    raw.get("slug"),
                    f"{location}.slug",
                ),
                location=location,
            )
            if identity.catalog_id in source_identities:
                raise BatchPlanError(
                    f"frozen selection {release_id!r} contains duplicate "
                    f"{identity.catalog_id!r}"
                )
            previous_owner = owner_by_catalog_id.get(identity.catalog_id)
            if previous_owner is not None:
                raise BatchPlanError(
                    f"frozen selections {previous_owner!r} and {release_id!r} "
                    f"both contain {identity.catalog_id!r}"
                )
            source_identities[identity.catalog_id] = identity
            owner_by_catalog_id[identity.catalog_id] = release_id
            identities[identity.catalog_id] = identity
        sources.append(
            {
                "releaseId": release_id,
                "sha256": source_sha256,
                "itemCount": len(source_identities),
            }
        )
    return identities, tuple(
        sorted(sources, key=lambda source: (source["releaseId"], source["sha256"]))
    )


def _build_exclusion_context(
    *,
    active_contract_path: str | Path | None,
    frozen_selection_paths: Sequence[str | Path],
) -> _ExclusionContext:
    active_identities: dict[str, _ExcludedIdentity] = {}
    active_source = None
    if active_contract_path is not None:
        active_identities, active_source = _load_active_exclusions(
            active_contract_path
        )
    frozen_identities, frozen_sources = _load_frozen_exclusions(
        frozen_selection_paths
    )
    for catalog_id in active_identities.keys() & frozen_identities.keys():
        active = active_identities[catalog_id]
        frozen = frozen_identities[catalog_id]
        if (
            active.section != frozen.section
            or active.filename != frozen.filename
        ):
            raise BatchPlanError(
                f"active and frozen exclusions conflict for {catalog_id!r}"
            )
    return _ExclusionContext(
        identities={**frozen_identities, **active_identities},
        active_source=active_source,
        frozen_sources=frozen_sources,
    )


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
    excluded_catalog_ids: Iterable[str] = (),
) -> list[CatalogCandidate]:
    """Select a stable, unique batch without changing public identities."""

    if target_count <= 0:
        raise BatchPlanError("target_count must be positive")
    raw_exclusions = list(excluded_catalog_ids)
    if any(
        not isinstance(catalog_id, str)
        or not catalog_id
        or catalog_id != catalog_id.strip()
        for catalog_id in raw_exclusions
    ):
        raise BatchPlanError("excluded catalog IDs must be non-empty trimmed strings")
    if len(raw_exclusions) != len(set(raw_exclusions)):
        raise BatchPlanError("excluded catalog IDs contain duplicates")
    exclusions = set(raw_exclusions)
    ordered = sorted(
        (
            candidate
            for candidate in candidates
            if candidate.catalog_id not in exclusions
        ),
        key=_selection_key,
    )
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
    overlap = catalog_ids & exclusions
    if overlap:
        raise BatchPlanError(
            "selection overlaps excluded catalog IDs: "
            + ", ".join(sorted(overlap)[:20])
        )
    return selected


def build_batch_plan(
    *,
    release_id: str,
    candidates: Iterable[CatalogCandidate],
    target_count: int,
    frontend_catalog_path: str | Path,
    local_registry_path: str | Path,
    active_contract_path: str | Path | None = None,
    frozen_selection_paths: Sequence[str | Path] = (),
    theme_id: str = DEFAULT_THEME_ID,
) -> dict[str, Any]:
    """Build the tracked pre-freeze ownership plan for one release."""

    if not release_id or release_id != release_id.strip():
        raise BatchPlanError("release_id must be a non-empty trimmed string")
    candidate_list = list(candidates)
    candidate_by_id = {candidate.catalog_id: candidate for candidate in candidate_list}
    if len(candidate_by_id) != len(candidate_list):
        raise BatchPlanError("candidate universe contains duplicate catalog IDs")

    exclusions = _build_exclusion_context(
        active_contract_path=active_contract_path,
        frozen_selection_paths=frozen_selection_paths,
    )
    for catalog_id, excluded in exclusions.identities.items():
        candidate = candidate_by_id.get(catalog_id)
        if candidate is None:
            raise BatchPlanError(
                f"excluded catalog ID is missing from the candidate universe: {catalog_id}"
            )
        if (
            candidate.section != excluded.section
            or candidate.filename != excluded.filename
            or (
                excluded.slug is not None
                and candidate.slug != excluded.slug
            )
        ):
            raise BatchPlanError(
                f"excluded identity no longer matches the candidate universe: {catalog_id}"
            )

    excluded_catalog_ids = sorted(exclusions.identities)
    eligible_count = len(candidate_list) - len(excluded_catalog_ids)
    selected = select_candidates(
        candidate_list,
        target_count=target_count,
        excluded_catalog_ids=excluded_catalog_ids,
    )
    if {candidate.catalog_id for candidate in selected} & set(excluded_catalog_ids):
        raise BatchPlanError("selected batch overlaps its exclusion union")
    try:
        render_theme = get_theme(theme_id).provenance()
    except ThemeError as exc:
        raise BatchPlanError(str(exc)) from exc

    family_counts = Counter(candidate.source_family for candidate in selected)
    risk_counts = Counter(candidate.risk_tier for candidate in selected)
    return {
        "schemaVersion": PLAN_SCHEMA_VERSION,
        "releaseId": release_id,
        "targetCount": target_count,
        "selectionStrategy": DEFAULT_SELECTION_STRATEGY,
        "renderTheme": render_theme,
        "sourceDigests": {
            "frontendCatalogSha256": _sha256_file(frontend_catalog_path),
            "localRegistrySha256": _sha256_file(local_registry_path),
        },
        "exclusionSources": {
            "activeContract": exclusions.active_source,
            "frozenSelections": list(exclusions.frozen_sources),
        },
        "exclusions": {
            "excludedCatalogIdCount": len(excluded_catalog_ids),
            "excludedCatalogIdsSha256": _canonical_sha256(
                excluded_catalog_ids
            ),
            "eligibleCandidateCount": eligible_count,
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
