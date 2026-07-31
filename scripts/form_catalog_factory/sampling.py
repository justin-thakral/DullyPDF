"""Deterministic local and live sampling plans for large catalog releases."""

from __future__ import annotations

import hashlib
import json
import random
import re
from pathlib import Path
from typing import Any

from .themes import ThemeError, resolve_theme_provenance


class SamplingPlanError(RuntimeError):
    """Raised when release evidence cannot produce a stable sample."""


def _load(path: str | Path, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SamplingPlanError(f"Could not read {label}: {exc}") from exc
    if not isinstance(payload, dict):
        raise SamplingPlanError(f"{label} must be an object")
    return payload


def _sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_hash(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _resolve_render_theme(
    *sources: tuple[str, dict[str, Any]],
) -> dict[str, Any] | None:
    try:
        return resolve_theme_provenance(*sources)
    except ThemeError as exc:
        raise SamplingPlanError(str(exc)) from exc


def build_sample_plan(
    *,
    selection_path: str | Path,
    build_report_path: str | Path,
    manifest_path: str | Path,
    random_count: int = 10,
) -> dict[str, Any]:
    """Choose reproducible random samples plus worst-case deterministic canaries."""

    if random_count <= 0:
        raise SamplingPlanError("random_count must be positive")
    selection = _load(selection_path, "selection plan")
    report = _load(build_report_path, "build report")
    manifest = _load(manifest_path, "release manifest")
    render_theme = _resolve_render_theme(
        ("selection", selection),
        ("build report", report),
        ("release manifest", manifest),
    )
    items = selection.get("items")
    results = report.get("results")
    forms = manifest.get("forms")
    if (
        not isinstance(items, list)
        or not isinstance(results, list)
        or not isinstance(forms, list)
    ):
        raise SamplingPlanError("Selection, report, and manifest must contain item arrays")
    plan_by_id = {
        str(item.get("catalogId")): item
        for item in items
        if isinstance(item, dict)
    }
    result_by_id = {
        str(result.get("catalogId")): result
        for result in results
        if isinstance(result, dict)
    }
    form_by_id = {
        str(form.get("catalogId")): form
        for form in forms
        if isinstance(form, dict)
    }
    identity_sets = (set(plan_by_id), set(result_by_id), set(form_by_id))
    if (
        any(len(mapping) != len(source) for mapping, source in (
            (plan_by_id, items),
            (result_by_id, results),
            (form_by_id, forms),
        ))
        or len(set(map(frozenset, identity_sets))) != 1
    ):
        raise SamplingPlanError("Selection, build report, and manifest identities differ")
    ids = sorted(plan_by_id)
    release_id = manifest.get("releaseId")
    if (
        not isinstance(release_id, str)
        or not release_id
        or selection.get("releaseId") != release_id
        or report.get("releaseId") != release_id
    ):
        raise SamplingPlanError(
            "Selection, build report, and manifest release IDs must match"
        )
    source_commit = manifest.get("sourceCommit")
    if (
        not isinstance(source_commit, str)
        or not re.fullmatch(r"[0-9a-f]{40}(?:[0-9a-f]{24})?", source_commit)
        or report.get("sourceCommit") != source_commit
    ):
        raise SamplingPlanError(
            "Build report and manifest must share one lowercase source commit"
        )
    if manifest.get("rendererCommit") != source_commit:
        raise SamplingPlanError(
            "Manifest rendererCommit must equal sourceCommit"
        )
    for commit_key in ("baseCommit", "rendererCommit"):
        if (
            not isinstance(manifest.get(commit_key), str)
            or report.get(commit_key) != manifest.get(commit_key)
        ):
            raise SamplingPlanError(
                f"Build report and manifest {commit_key} values must match"
            )
    if (
        not isinstance(manifest.get("rendererRuntime"), dict)
        or report.get("rendererRuntime") != manifest.get("rendererRuntime")
    ):
        raise SamplingPlanError(
            "Build report and manifest rendererRuntime fingerprints must match"
        )
    manifest_sha256 = _sha256_file(manifest_path)
    build_report_sha256 = _sha256_file(build_report_path)
    selection_digest = _canonical_hash(selection)
    if (
        report.get("passed") is not True
        or report.get("count") != len(ids)
        or report.get("selectionDigest") != selection_digest
        or report.get("releaseManifestSha256") != manifest_sha256
    ):
        raise SamplingPlanError(
            "Build report is not bound to the exact passing selection and manifest"
        )
    for item_id in ids:
        item = plan_by_id[item_id]
        result = result_by_id[item_id]
        form = form_by_id[item_id]
        if result.get("ok") is not True:
            raise SamplingPlanError(f"{item_id}: build result is not passing")
        for item_key, form_key in (
            ("slug", "slug"),
            ("sourceSection", "sourceSection"),
            ("filename", "filename"),
        ):
            if item.get(item_key) != form.get(form_key):
                raise SamplingPlanError(
                    f"{item_id}: selection and manifest {item_key} differ"
                )
        if result.get("pageCount") != form.get("pageCount"):
            raise SamplingPlanError(
                f"{item_id}: build and manifest pageCount differ"
            )
        for asset_name in ("pdf", "thumbnail"):
            if result.get(asset_name) != form.get(asset_name):
                raise SamplingPlanError(
                    f"{item_id}: build and manifest {asset_name} assets differ"
                )
    seed_material = json.dumps(
        manifest,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    seed_sha256 = hashlib.sha256(seed_material).hexdigest()
    rng = random.Random(int(seed_sha256[:16], 16))
    random_ids = rng.sample(ids, min(random_count, len(ids)))

    largest_pages = max(
        ids,
        key=lambda item_id: (result_by_id[item_id]["pageCount"], item_id),
    )
    largest_fields = max(
        ids,
        key=lambda item_id: (result_by_id[item_id]["fieldCount"], item_id),
    )
    smallest_fields = min(
        ids,
        key=lambda item_id: (result_by_id[item_id]["fieldCount"], item_id),
    )
    canary_roles: dict[str, str] = {
        "alphabetical_first": ids[0],
        "alphabetical_last": ids[-1],
        "largest_page_count": largest_pages,
        "largest_field_count": largest_fields,
        "smallest_field_count": smallest_fields,
    }
    for tier in ("B", "C"):
        tier_ids = [
            item_id
            for item_id in ids
            if result_by_id[item_id].get(
                "riskTier",
                plan_by_id[item_id].get("riskTier"),
            )
            == tier
        ]
        if tier_ids:
            canary_roles[f"risk_tier_{tier.lower()}"] = max(
                tier_ids,
                key=lambda item_id: (result_by_id[item_id]["fieldCount"], item_id),
            )

    http_ids = sorted(set(random_ids) | set(canary_roles.values()))
    browser_ids: list[str] = []
    browser_candidates = [
        canary_roles["largest_field_count"],
        canary_roles.get("risk_tier_c"),
        canary_roles.get("risk_tier_b"),
        canary_roles["largest_page_count"],
        *random_ids,
        canary_roles["alphabetical_last"],
    ]
    for item_id in browser_candidates:
        if item_id and item_id not in browser_ids:
            browser_ids.append(item_id)
        if len(browser_ids) == 3:
            break

    samples = []
    for item_id in http_ids:
        item = plan_by_id[item_id]
        result = result_by_id[item_id]
        form = form_by_id[item_id]
        samples.append(
            {
                "catalogId": item_id,
                "slug": item["slug"],
                "riskTier": result.get("riskTier", item["riskTier"]),
                "sourceSection": item["sourceSection"],
                "filename": item["filename"],
                "pdfPath": form["pdf"]["objectPath"],
                "thumbnailPath": form["thumbnail"]["objectPath"],
                "sha256": form["pdf"]["sha256"],
                "bytes": form["pdf"]["bytes"],
                "thumbnailSha256": form["thumbnail"]["sha256"],
                "thumbnailBytes": form["thumbnail"]["bytes"],
                "pageCount": result["pageCount"],
                "fieldCount": result["fieldCount"],
                "random": item_id in random_ids,
                "canaryRoles": sorted(
                    role
                    for role, candidate in canary_roles.items()
                    if candidate == item_id
                ),
                "browserCanary": item_id in browser_ids,
            }
        )
    sample_plan = {
        "schemaVersion": 1,
        "releaseId": release_id,
        "sourceCommit": source_commit,
        "manifestSha256": manifest_sha256,
        "selectionDigest": selection_digest,
        "buildReportSha256": build_report_sha256,
        "seedSha256": seed_sha256,
        "randomCount": len(random_ids),
        "httpSampleCount": len(samples),
        "browserCanaryCount": len(browser_ids),
        "randomCatalogIds": random_ids,
        "canaryRoles": canary_roles,
        "browserCatalogIds": browser_ids,
        "samples": samples,
    }
    if render_theme is not None:
        sample_plan["renderTheme"] = render_theme
    return sample_plan


def write_sample_plan(path: str | Path, payload: dict[str, Any]) -> None:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
