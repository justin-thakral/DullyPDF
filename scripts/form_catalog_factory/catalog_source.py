"""Build the canonical first-party work queue from catalog source records."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .ledger import CatalogFactoryLedger


RAW_ENTRIES_PATTERN = re.compile(
    r"const RAW_FORM_CATALOG_ENTRIES = \[\n(?P<body>[\s\S]*?)\n\];"
)
GENERIC_DESCRIPTION_PREFIX = "use this form for "
TOP_SEO_SLUGS = frozenset(
    {
        "summer-camp-incident-report-form",
        "summer-camp-sign-in-sheet-form",
        "oil-change-inspection-checklist",
        "generator-maintenance-service-request-form",
        "towing-dispatch-tracking-log",
        "courier-pickup-form",
        "locksmith-job-work-order-form",
        "courier-pickup-report-form",
        "equipment-rental-checklist",
        "food-pantry-intake-form",
    }
)

# These ranges are the 1,000 generic one-page forms produced by the current
# long-tail cross-product generator. Keeping the ownership table here avoids
# importing a script with a hyphenated filename or inferring provenance from
# a blank source URL.
LONGTAIL_RANGES: dict[str, tuple[str, int, int]] = {
    "construction_trades": ("dct", 1000, 1062),
    "field_service": ("dfs", 1100, 1162),
    "facilities_maintenance": ("dfm", 1200, 1262),
    "property_management": ("dpm", 1300, 1362),
    "manufacturing_quality": ("dmq", 1400, 1462),
    "logistics_transport": ("dlt", 1500, 1562),
    "education_childcare": ("dec", 1600, 1662),
    "nonprofit_events": ("dne", 1700, 1762),
    "hr_operations": ("dhr", 1800, 1861),
    "finance_lending": ("dfl", 1900, 1961),
    "insurance_claims": ("dic", 2000, 2061),
    "legal_office": ("dlo", 2100, 2161),
    "hospitality_events": ("dhe", 2200, 2261),
    "agriculture_food": ("daf", 2300, 2361),
    "utilities_energy": ("due", 2400, 2461),
    "retail_operations": ("dro", 2500, 2561),
}

TIER_C_SECTIONS = frozenset(
    {
        "finance_lending",
        "legal_admin",
        "legal_office",
        "patient_intake",
        "practice_intake",
    }
)
TIER_B_SECTIONS = frozenset(
    {
        "beauty_wellness",
        "finance_accounting",
        "hr_onboarding",
        "hr_operations",
        "insurance_claims",
        "safety_compliance",
    }
)


@dataclass(frozen=True)
class CatalogCandidate:
    catalog_id: str
    section: str
    filename: str
    slug: str
    title: str
    current_sha256: str | None
    description: str
    use_case: str
    source_family: str
    risk_tier: str
    priority: int
    intent_fingerprint: str
    intent_group_hash: str


def parse_frontend_catalog(path: str | Path) -> list[dict[str, Any]]:
    """Parse the generated one-entry-per-line catalog module."""

    source = Path(path).read_text(encoding="utf-8")
    match = RAW_ENTRIES_PATTERN.search(source)
    if not match:
        raise ValueError(f"Could not locate RAW_FORM_CATALOG_ENTRIES in {path}")
    entries: list[dict[str, Any]] = []
    for line_number, raw_line in enumerate(match.group("body").splitlines(), start=1):
        line = raw_line.strip().removesuffix(",")
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Invalid catalog JSON entry at generated line {line_number}: {exc}"
            ) from exc
        if not isinstance(payload, dict):
            raise ValueError(f"Catalog entry at generated line {line_number} is not an object")
        entries.append(payload)
    return entries


def load_first_party_keys(path: str | Path) -> set[tuple[str, str]]:
    """Read canonical DullyPDF-authored identities from the local registry."""

    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("local generated forms registry must be an object")
    keys: set[tuple[str, str]] = set()
    for section, raw_entries in payload.items():
        if not isinstance(section, str) or not isinstance(raw_entries, list):
            continue
        for entry in raw_entries:
            if not isinstance(entry, dict):
                continue
            filename = entry.get("filename")
            if isinstance(filename, str) and filename.endswith(".pdf"):
                keys.add((section, filename))
    return keys


def _longtail_family(section: str, filename: str) -> bool:
    rule = LONGTAIL_RANGES.get(section)
    if not rule:
        return False
    prefix, minimum, maximum = rule
    match = re.match(r"^([a-z]+)_(\d+)__", filename)
    if not match:
        return False
    return match.group(1) == prefix and minimum <= int(match.group(2)) <= maximum


def _risk_tier(section: str) -> str:
    if section in TIER_C_SECTIONS:
        return "C"
    if section in TIER_B_SECTIONS:
        return "B"
    return "A"


def _source_family(section: str, filename: str) -> str:
    if _longtail_family(section, filename):
        return "longtail"
    if section == "practice_intake":
        return "practice_intake"
    if re.match(r"^[a-z]+_(?:27|28)\d\d__", filename):
        return "premium_or_bespoke"
    return "first_party"


def _priority(entry: dict[str, Any], source_family: str, risk_tier: str) -> int:
    score = 0
    if entry.get("slug") in TOP_SEO_SLUGS:
        score += 100_000
    if source_family == "longtail":
        score += 10_000
    description = str(entry.get("description") or "").strip().lower()
    use_case = str(entry.get("useCase") or "").strip()
    if description.startswith(GENERIC_DESCRIPTION_PREFIX):
        score += 2_000
    if not use_case:
        score += 500
    if risk_tier == "B":
        score -= 20_000
    elif risk_tier == "C":
        score -= 50_000
    return score


def build_candidates(
    *,
    frontend_catalog_path: str | Path,
    local_registry_path: str | Path,
) -> tuple[list[CatalogCandidate], list[tuple[str, str]]]:
    """Join indexed entries to the canonical first-party registry.

    The join is O(n) in the catalog size. Missing registry identities are
    returned separately and must be resolved before claiming full coverage.
    """

    first_party_keys = load_first_party_keys(local_registry_path)
    indexed = {
        (str(entry.get("sourceSection") or ""), str(entry.get("filename") or "")): entry
        for entry in parse_frontend_catalog(frontend_catalog_path)
    }
    candidates: list[CatalogCandidate] = []
    missing: list[tuple[str, str]] = []
    for section, filename in sorted(first_party_keys):
        entry = indexed.get((section, filename))
        if entry is None:
            missing.append((section, filename))
            continue
        slug = str(entry.get("slug") or "")
        title = str(entry.get("title") or "")
        if not slug or not title:
            missing.append((section, filename))
            continue
        family = _source_family(section, filename)
        risk = _risk_tier(section)
        normalized_intent = re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()
        intent_group_hash = hashlib.sha256(
            f"{section}|{normalized_intent}".encode("utf-8")
        ).hexdigest()
        # Existing catalog duplicates must remain individually claimable so the
        # review stage can decide which stable URLs to keep, merge, or retire.
        # The unique reservation therefore includes the stable catalog ID,
        # while intent_group_hash retains the cross-item duplicate signal.
        catalog_id = f"{section}/{filename[:-4]}"
        fingerprint = hashlib.sha256(
            f"{intent_group_hash}|{catalog_id}".encode("utf-8")
        ).hexdigest()
        candidates.append(
            CatalogCandidate(
                catalog_id=catalog_id,
                section=section,
                filename=filename,
                slug=slug,
                title=title,
                current_sha256=entry.get("sha256"),
                description=str(entry.get("description") or ""),
                use_case=str(entry.get("useCase") or ""),
                source_family=family,
                risk_tier=risk,
                priority=_priority(entry, family, risk),
                intent_fingerprint=fingerprint,
                intent_group_hash=intent_group_hash,
            )
        )
    candidates.sort(key=lambda item: (-item.priority, item.catalog_id))
    return candidates, missing


def seed_ledger(
    ledger: CatalogFactoryLedger,
    candidates: list[CatalogCandidate],
) -> int:
    """Idempotently register candidates in the transactional work queue."""

    for candidate in candidates:
        ledger.add_item(
            catalog_id=candidate.catalog_id,
            section=candidate.section,
            filename=candidate.filename,
            slug=candidate.slug,
            ownership="first_party",
            intent_fingerprint=candidate.intent_fingerprint,
            priority=candidate.priority,
            payload={
                "title": candidate.title,
                "description": candidate.description,
                "use_case": candidate.use_case,
                "source_family": candidate.source_family,
                "risk_tier": candidate.risk_tier,
                "intent_group_hash": candidate.intent_group_hash,
            },
            current_asset_hash=candidate.current_sha256,
            idempotency_key=f"seed:{candidate.catalog_id}:{candidate.current_sha256 or 'none'}",
        )
    return len(candidates)
