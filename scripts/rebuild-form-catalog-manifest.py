#!/usr/bin/env python3
"""Rebuild manifest.json from the PDFs actually on disk.

Used when scrapers have been rate-limited and we don't want to re-fetch. Walks
every section directory, reads each PDF, and emits a manifest entry. Where
possible, augments with title / source URL from optional local source metadata
so the entries stay rich.
"""

import argparse
import hashlib
import importlib.util
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

REPO_ROOT = Path(__file__).resolve().parents[1]
CATALOG_ROOT = REPO_ROOT / "form_catalog"
LOCAL_GENERATED_PATH = CATALOG_ROOT / "local_generated_forms.json"

PUBLIC_BASE_SECTIONS = {
    "bankruptcy",
    "civil_litigation",
    "customs_logistics",
    "disaster_emergency",
    "federal_specialized",
    "healthcare",
    "hr_onboarding",
    "immigration",
    "labor_employment",
    "nonprofit",
    "patient_intake",
    "real_estate_housing",
    "small_business",
    "social_security",
    "state_courts",
    "state_department",
    "state_dmv",
    "state_tax",
    "tax_business",
    "tax_individual",
    "tax_payroll",
    "veterans",
}

PUBLIC_LOCAL_TEMPLATE_RANGES = {
    "agriculture_food": [("DAF", 2300, 2361)],
    "automotive_service": [("DAS", 2100, 2149)],
    "beauty_wellness": [("DBW", 100, 189), ("DBW", 2300, 2344)],
    "business_operations": [("DBO", 1755, 1809)],
    "construction_trades": [("DCF", 100, 199), ("DCT", 1000, 1062), ("DCT", 1100, 1174)],
    "education_childcare": [("DEY", 100, 189), ("DEC", 1400, 1469), ("DEC", 1600, 1662)],
    "events_waivers": [("DEW", 1800, 1854)],
    "facilities_maintenance": [("DFM", 1200, 1262)],
    "field_service": [("DHS", 100, 189), ("DFS", 1100, 1162), ("DFM", 1200, 1274)],
    "finance_accounting": [("DFA", 100, 169), ("DFA", 1700, 1754)],
    "finance_lending": [("DFL", 1900, 1961)],
    "home_services": [("DHS", 2400, 2444)],
    "hospitality_events": [("DHE", 2200, 2261)],
    "hr_onboarding": [("DHR", 100, 169)],
    "hr_operations": [("DHR", 1800, 1861)],
    "insurance_claims": [("DIC", 100, 179), ("DIC", 1600, 1654), ("DIC", 2000, 2061)],
    "legal_admin": [("DLP", 1500, 1559)],
    "legal_office": [("DLO", 2100, 2161)],
    "logistics_transport": [("DLT", 100, 169), ("DLT", 1500, 1562), ("DLD", 2200, 2249)],
    "manufacturing_quality": [("DMQ", 100, 179), ("DMQ", 1400, 1462), ("DMQ", 1810, 1864)],
    "nonprofit_community": [("DNE", 100, 179), ("DNV", 1900, 1949)],
    "nonprofit_events": [("DNE", 1700, 1762)],
    "pet_services": [("DPS", 100, 179), ("DVP", 2000, 2059)],
    "property_management": [("DPM", 1300, 1362)],
    "real_estate_property": [("DPM", 100, 199), ("DPM", 1000, 1079)],
    "retail_operations": [("DRO", 2500, 2561)],
    "safety_compliance": [("DSC", 1300, 1364)],
    "utilities_energy": [("DUE", 2400, 2461)],
}

PUBLIC_SECTION_DIRS = PUBLIC_BASE_SECTIONS | {"practice_intake"} | set(PUBLIC_LOCAL_TEMPLATE_RANGES)


def configure_paths(catalog_root: str) -> None:
    global CATALOG_ROOT, LOCAL_GENERATED_PATH
    CATALOG_ROOT = Path(catalog_root).resolve()
    LOCAL_GENERATED_PATH = CATALOG_ROOT / "local_generated_forms.json"


def _load_form_sources() -> list[tuple[str, str, str, str]]:
    form_sources_path = CATALOG_ROOT / "form_sources.py"
    if not form_sources_path.exists():
        return []

    spec = importlib.util.spec_from_file_location("form_catalog_sources", form_sources_path)
    if spec is None or spec.loader is None:
        return []
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return list(getattr(module, "FORMS", []))


def _add_source_index_entry(index: dict, form_number: str, title: str, url: str, section: str) -> None:
    base = unquote(url.rsplit("/", 1)[-1]).lower() if url else ""
    base_noext = base.rsplit(".", 1)[0]
    sanitized_base = re.sub(r"[^a-z0-9\-._]+", "_", base)
    sanitized_base_noext = sanitized_base.rsplit(".", 1)[0]
    safe_fn = re.sub(r"[^a-z0-9\-]+", "_", form_number.lower()).strip("_")

    keys = [
        f"{safe_fn}__{base}",
        f"{safe_fn}__{sanitized_base}",
        base_noext,
        sanitized_base_noext,
        base,
        sanitized_base,
    ]
    for key in keys:
        if key:
            index[key] = (form_number, title, url, section)


def _load_source_index():
    """filename-ish slug -> (form_number, title, url, section)."""
    index = {}
    for form_number, title, url, section in _load_form_sources():
        _add_source_index_entry(index, form_number, title, url, section)

    discovered_path = CATALOG_ROOT / "discovered_urls.json"
    if discovered_path.exists():
        discovered = json.loads(discovered_path.read_text())
        for section, entries in discovered.items():
            for entry in entries:
                url = entry["url"]
                form_number = entry["form_number"]
                title = entry["title"]
                _add_source_index_entry(index, form_number, title, url, section)

    if LOCAL_GENERATED_PATH.exists():
        generated = json.loads(LOCAL_GENERATED_PATH.read_text())
        for section, entries in generated.items():
            for entry in entries:
                filename = entry["filename"]
                form_number = entry["form_number"]
                title = entry["title"]
                url = entry.get("url", "")
                base = filename.lower()
                base_noext = base.rsplit(".", 1)[0]
                index[filename] = (form_number, title, url, section)
                index[base] = (form_number, title, url, section)
                index[base_noext] = (form_number, title, url, section)
    return index


def _is_prior_year(filename: str) -> bool:
    return bool(re.search(r"__\d{4}_", filename))


def _generated_form_number_parts(form_number: str):
    match = re.match(r"^([A-Z]{2,4})\s+(\d+)$", str(form_number or "").strip(), flags=re.I)
    if not match:
        return None
    return match.group(1).upper(), int(match.group(2))


def _is_within_local_template_range(form_number: str, rule) -> bool:
    parts = _generated_form_number_parts(form_number)
    if not parts:
        return False
    prefix, number = parts
    rule_prefix, minimum, maximum = rule
    return prefix == rule_prefix and minimum <= number <= maximum


def _is_public_disk_entry(section: str, form_number: str) -> bool:
    """Keep disk rebuilds aligned to the public catalog in O(1) per PDF."""
    if section == "practice_intake":
        return True

    local_rules = PUBLIC_LOCAL_TEMPLATE_RANGES.get(section) or []
    if section == "hr_onboarding":
        parts = _generated_form_number_parts(form_number)
        return (
            any(_is_within_local_template_range(form_number, rule) for rule in local_rules)
            if parts and any(parts[0] == rule[0] for rule in local_rules)
            else True
        )

    if section in PUBLIC_BASE_SECTIONS:
        return True
    if not local_rules:
        return False

    return any(_is_within_local_template_range(form_number, rule) for rule in local_rules)


def _title_from_slug(value: str) -> str:
    return re.sub(r"[_-]+", " ", value).strip().title()


def _identity_from_generated_filename(pdf: Path) -> tuple[str, str, str]:
    match = re.match(r"^([a-z]{2,4})_(\d+)__(.+)$", pdf.stem, flags=re.I)
    if not match:
        return pdf.stem, _title_from_slug(pdf.stem), ""

    prefix, number, title_slug = match.groups()
    return f"{prefix.upper()} {int(number)}", _title_from_slug(title_slug), ""


def _identity_from_pdf_path(pdf: Path, src_index: dict) -> tuple[str, str, str]:
    base = pdf.name.lower()
    base_noext = base.rsplit(".", 1)[0]
    if pdf.name in src_index:
        form_number, title, url, _section = src_index[pdf.name]
        return form_number, title, url
    if base in src_index:
        form_number, title, url, _section = src_index[base]
        return form_number, title, url
    if base_noext in src_index:
        form_number, title, url, _section = src_index[base_noext]
        return form_number, title, url

    if pdf.parent.name == "real_estate_housing":
        slug = pdf.stem
        return f"HUD-{slug.upper()}", _title_from_slug(slug), f"https://www.hud.gov/sites/documents/{pdf.name}"

    return _identity_from_generated_filename(pdf)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rebuild form_catalog/manifest.json from local PDFs.")
    parser.add_argument(
        "--catalog-root",
        default=str(CATALOG_ROOT),
        help="Directory containing local form catalog PDFs and metadata.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    configure_paths(args.catalog_root)
    if not CATALOG_ROOT.exists():
        raise SystemExit(f"Catalog root does not exist: {CATALOG_ROOT}")

    src_index = _load_source_index()
    entries = []
    section_dirs = [
        d
        for d in CATALOG_ROOT.iterdir()
        if d.is_dir() and not d.name.startswith((".", "_")) and d.name in PUBLIC_SECTION_DIRS
    ]

    for section_dir in sorted(section_dirs):
        pdfs = sorted(section_dir.glob("*.pdf"))
        if not pdfs:
            continue
        for pdf in pdfs:
            stat = pdf.stat()
            data = pdf.read_bytes()
            if not data.startswith(b"%PDF"):
                # Skip non-PDF files
                continue

            source_section = section_dir.name
            form_number, title, url = _identity_from_pdf_path(pdf, src_index)

            if not _is_public_disk_entry(source_section, form_number):
                continue

            # Hash only files selected for the public manifest.
            sha = hashlib.sha256(data).hexdigest()

            entries.append({
                "form_number": form_number,
                "title": title or pdf.stem,
                "url": url,
                "section": source_section,
                "filename": pdf.name,
                "ok": True,
                "error": None,
                "bytes": stat.st_size,
                "sha256": sha,
                "is_prior_year": _is_prior_year(pdf.name),
                "source": "disk_rebuild",
            })

    manifest = {
        "total": len(entries),
        "ok": len(entries),
        "failed": 0,
        "rebuilt_from_disk": True,
        "forms": sorted(entries, key=lambda e: (e["section"], e["form_number"])),
    }
    (CATALOG_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))

    print(f"=> wrote {len(entries)} entries to manifest.json (rebuilt from disk)")
    print()
    print("Section counts:")
    c = Counter(e["section"] for e in entries)
    for section, count in sorted(c.items(), key=lambda x: -x[1]):
        print(f"  {section:22s} {count:5d}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
