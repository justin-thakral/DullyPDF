"""Bind reviewed release artifacts to the fenced catalog-factory ledger.

The release builder produces deterministic PDFs, thumbnails, and automated QA
records. This module verifies every byte and requires a machine-readable human
review receipt for every rendered page before advancing ledger items through
render, QA, and visual-review stages. Validation is completed for the entire
batch before the first state transition, so malformed or partial evidence
cannot publish a subset accidentally.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

from .ledger import BatchStatus, CatalogFactoryLedger, Stage, WorkItem
from .models import load_form_spec
from .release_builder import (
    release_runtime_repository_root,
    release_runtime_source_paths,
)
from .spec_qa import validate_spec_content
from .themes import ThemeError, resolve_theme_provenance


VISUAL_REVIEW_SCHEMA_VERSION = 1
VISUAL_REVIEW_REPORT_TYPE = "form-catalog-visual-review"
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
RISK_RANK = {"A": 1, "B": 2, "C": 3}
ALLOWED_RECONCILE_STAGES = {
    Stage.SPEC_READY,
    Stage.RENDERED,
    Stage.QA_PASSED,
    Stage.REVIEW_APPROVED,
}
ASSET_MANIFEST_KEYS = {
    "sourcePath",
    "objectPath",
    "contentType",
    "sha256",
    "bytes",
}


class ReviewedReleaseError(RuntimeError):
    """The release artifacts or visual-review evidence are not publishable."""


def _load_object(
    path: str | Path,
    label: str,
) -> tuple[Path, dict[str, Any], str]:
    source = Path(path).expanduser().resolve()
    try:
        raw = source.read_bytes()
        payload = json.loads(raw)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ReviewedReleaseError(f"Could not read {label} {source}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ReviewedReleaseError(f"{label} must be a JSON object")
    return source, payload, hashlib.sha256(raw).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
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


def _require_sha256(value: Any, location: str) -> str:
    normalized = str(value or "").strip()
    if not SHA256_PATTERN.fullmatch(normalized):
        raise ReviewedReleaseError(f"{location} must be a lowercase SHA-256")
    return normalized


def _require_positive_int(value: Any, location: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ReviewedReleaseError(f"{location} must be a positive integer")
    return value


def _require_timestamp(value: Any, location: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ReviewedReleaseError(f"{location} must be a non-empty timestamp")
    try:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ReviewedReleaseError(
            f"{location} must be an ISO-8601 timestamp"
        ) from exc
    if parsed.tzinfo is None:
        raise ReviewedReleaseError(f"{location} must include a timezone")
    return normalized


def _resolve_render_theme(
    *sources: tuple[str, Mapping[str, Any]],
) -> dict[str, Any] | None:
    """Resolve an all-absent historical theme or one exact shared provenance."""

    try:
        return resolve_theme_provenance(*sources)
    except ThemeError as exc:
        raise ReviewedReleaseError(str(exc)) from exc


def _require_render_theme(
    *,
    payload: Mapping[str, Any],
    label: str,
    expected: dict[str, Any] | None,
) -> None:
    """Apply the historical-or-themed binding rule to one later artifact."""

    synthetic: dict[str, Any] = {}
    if expected is not None:
        synthetic["renderTheme"] = expected
    _resolve_render_theme(
        ("bound release inputs", synthetic),
        (label, payload),
    )


def _resolve_contained_path(root: Path, relative: Any, location: str) -> Path:
    if not isinstance(relative, str) or not relative.strip():
        raise ReviewedReleaseError(f"{location} must be a non-empty relative path")
    candidate = Path(relative)
    if candidate.is_absolute():
        raise ReviewedReleaseError(f"{location} must be relative")
    resolved = (root / candidate).resolve()
    if not resolved.is_relative_to(root):
        raise ReviewedReleaseError(f"{location} escapes its allowed root")
    if not resolved.is_file():
        raise ReviewedReleaseError(f"{location} does not exist: {resolved}")
    return resolved


def _resolve_spec_path(spec_root: Path, value: Any, location: str) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ReviewedReleaseError(f"{location} must be a non-empty path")
    candidate = Path(value)
    resolved = (
        candidate.expanduser().resolve()
        if candidate.is_absolute()
        else (spec_root / candidate).resolve()
    )
    if not resolved.is_relative_to(spec_root):
        raise ReviewedReleaseError(f"{location} escapes the specification root")
    if not resolved.is_file():
        raise ReviewedReleaseError(f"{location} does not exist: {resolved}")
    return resolved


def build_visual_review_template(
    *,
    build_report_path: str | Path,
    reviewer: str,
) -> dict[str, Any]:
    """Create a pending receipt bound to one exact release build report."""

    _, report, report_hash = _load_object(build_report_path, "build report")
    reviewer_name = str(reviewer or "").strip()
    if not reviewer_name:
        raise ReviewedReleaseError("reviewer must be non-empty")
    if report.get("schemaVersion") != 1 or report.get("passed") is not True:
        raise ReviewedReleaseError("Build report must be a passing schemaVersion 1 report")
    release_id = str(report.get("releaseId") or "").strip()
    source_commit = str(report.get("sourceCommit") or "").strip()
    results = report.get("results")
    if not release_id or not source_commit or not isinstance(results, list) or not results:
        raise ReviewedReleaseError("Build report identity or results are incomplete")
    render_theme = _resolve_render_theme(("build report", report))

    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, result in enumerate(results):
        if not isinstance(result, dict) or result.get("ok") is not True:
            raise ReviewedReleaseError(f"Build result {index} is not passing")
        catalog_id = str(result.get("catalogId") or "").strip()
        pdf = result.get("pdf")
        if not catalog_id or catalog_id in seen or not isinstance(pdf, dict):
            raise ReviewedReleaseError(
                f"Build result {index} has a missing or duplicate catalog identity"
            )
        seen.add(catalog_id)
        items.append(
            {
                "catalogId": catalog_id,
                "pdfSha256": _require_sha256(
                    pdf.get("sha256"),
                    f"build results[{index}].pdf.sha256",
                ),
                "pageCount": _require_positive_int(
                    result.get("pageCount"),
                    f"build results[{index}].pageCount",
                ),
                "pagesReviewed": [],
                "status": "pending",
                "defects": [],
                "notes": "",
            }
        )

    template = {
        "schemaVersion": VISUAL_REVIEW_SCHEMA_VERSION,
        "reportType": VISUAL_REVIEW_REPORT_TYPE,
        "releaseId": release_id,
        "sourceCommit": source_commit,
        "buildReportSha256": report_hash,
        "reviewer": reviewer_name,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reviewedAt": None,
        "passed": False,
        "items": items,
    }
    if render_theme is not None:
        template["renderTheme"] = render_theme
    return template


def write_visual_review_template(
    output_path: str | Path,
    payload: Mapping[str, Any],
) -> Path:
    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(dict(payload), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return destination


def _selection_items(
    selection: Mapping[str, Any],
    *,
    batch_id: str,
    target_count: int,
) -> dict[str, dict[str, Any]]:
    if selection.get("schemaVersion") != 1:
        raise ReviewedReleaseError("Selection must use schemaVersion 1")
    if selection.get("releaseId") != batch_id:
        raise ReviewedReleaseError("Selection releaseId does not match the ledger batch")
    if selection.get("targetCount") != target_count:
        raise ReviewedReleaseError("Selection targetCount does not match the ledger batch")
    raw_items = selection.get("items")
    if not isinstance(raw_items, list) or len(raw_items) != target_count:
        raise ReviewedReleaseError("Selection does not contain the exact target count")
    items: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(raw_items):
        if not isinstance(raw, dict):
            raise ReviewedReleaseError(f"selection items[{index}] is not an object")
        catalog_id = str(raw.get("catalogId") or "").strip()
        source_section = str(raw.get("sourceSection") or "").strip()
        filename = str(raw.get("filename") or "").strip()
        slug = str(raw.get("slug") or "").strip()
        title = str(raw.get("title") or "").strip()
        risk_tier = str(raw.get("riskTier") or "").strip()
        if (
            not catalog_id
            or not source_section
            or not filename.lower().endswith(".pdf")
            or not slug
            or not title
            or risk_tier not in RISK_RANK
            or catalog_id != f"{source_section}/{filename[:-4]}"
            or catalog_id in items
        ):
            raise ReviewedReleaseError(
                f"selection items[{index}] has invalid or duplicate identity"
            )
        items[catalog_id] = dict(raw)
    return items


def _validate_asset(
    *,
    result_index: int,
    asset_name: str,
    raw: Any,
    build_root: Path,
    release_id: str,
) -> dict[str, Any]:
    location = f"build results[{result_index}].{asset_name}"
    if not isinstance(raw, dict):
        raise ReviewedReleaseError(f"{location} must be an object")
    if set(raw) != ASSET_MANIFEST_KEYS:
        raise ReviewedReleaseError(
            f"{location} must contain the exact immutable asset mapping"
        )
    source_path = str(raw.get("sourcePath") or "")
    asset_path = _resolve_contained_path(
        build_root,
        source_path,
        f"{location}.sourcePath",
    )
    expected_object_path = f"releases/{release_id}/{Path(source_path).as_posix()}"
    if raw.get("objectPath") != expected_object_path:
        raise ReviewedReleaseError(
            f"{location}.objectPath is not bound to its exact release source path"
        )
    expected_type = "application/pdf" if asset_name == "pdf" else "image/webp"
    if raw.get("contentType") != expected_type:
        raise ReviewedReleaseError(f"{location}.contentType is invalid")
    expected_hash = _require_sha256(raw.get("sha256"), f"{location}.sha256")
    actual_hash = _sha256_file(asset_path)
    if actual_hash != expected_hash:
        raise ReviewedReleaseError(f"{location} bytes do not match sha256")
    if raw.get("bytes") != asset_path.stat().st_size:
        raise ReviewedReleaseError(f"{location} byte count does not match")
    with asset_path.open("rb") as source:
        header = source.read(12)
    if asset_name == "pdf" and not header.startswith(b"%PDF-"):
        raise ReviewedReleaseError(f"{location} does not contain PDF bytes")
    if asset_name == "thumbnail" and not (
        len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP"
    ):
        raise ReviewedReleaseError(f"{location} does not contain WebP bytes")
    return {
        "path": asset_path,
        "sourcePath": Path(source_path).as_posix(),
        "sha256": expected_hash,
        "objectPath": expected_object_path,
        "contentType": expected_type,
        "bytes": asset_path.stat().st_size,
    }


def _validate_source_verification(
    *,
    raw: Any,
    selection_path: Path,
    source_commit: str,
    base_commit: str,
    renderer_commit: str,
    renderer_runtime: Mapping[str, Any],
    build_results: Mapping[str, Mapping[str, Any]],
) -> None:
    source_paths = [selection_path.resolve()]
    source_paths.extend(
        Path(result["specPath"]).resolve()
        for result in build_results.values()
    )
    source_workset_root = Path(
        os.path.commonpath([str(path) for path in source_paths])
    ).resolve()
    specifications = [
        {
            "catalogId": catalog_id,
            "path": (
                Path(result["specPath"])
                .resolve()
                .relative_to(source_workset_root)
                .as_posix()
            ),
            "sha256": str(result["specSha256"]),
        }
        for catalog_id, result in sorted(build_results.items())
    ]
    expected = {
        "schemaVersion": 1,
        "verificationType": "git-clean-exact-source-runtime-v2",
        "verified": True,
        "sourceCommit": source_commit,
        "repositoryHead": source_commit,
        "baseCommit": base_commit,
        "rendererCommit": renderer_commit,
        "workingTreeClean": True,
        "baseIsAncestor": True,
        "rendererIsAncestor": True,
        "filesTrackedAtSource": True,
        "filesByteIdentical": True,
        "verifiedFileCount": (
            len(specifications) + len(release_runtime_source_paths()) + 1
        ),
        "selection": {
            "path": selection_path.resolve().relative_to(
                source_workset_root
            ).as_posix(),
            "sha256": _sha256_file(selection_path),
        },
        "runtimeSources": [
            {
                "path": path.relative_to(
                    release_runtime_repository_root()
                ).as_posix(),
                "sha256": _sha256_file(path),
            }
            for path in release_runtime_source_paths()
        ],
        "rendererRuntime": dict(renderer_runtime),
        "specifications": specifications,
    }
    if raw != expected:
        raise ReviewedReleaseError(
            "Build report sourceVerification is not coherent with the exact "
            "selection, specifications, and commit ancestry"
        )


def _validate_build_results(
    *,
    selection: Mapping[str, Any],
    selection_path: Path,
    selection_items: Mapping[str, Mapping[str, Any]],
    build_report_path: Path,
    build_report: Mapping[str, Any],
    spec_root: Path,
    batch_id: str,
    target_count: int,
    base_commit: str,
    renderer_commit: str,
) -> tuple[str, dict[str, dict[str, Any]]]:
    if build_report.get("schemaVersion") != 1 or build_report.get("passed") is not True:
        raise ReviewedReleaseError(
            "Build report must be a passing schemaVersion 1 report"
        )
    if build_report.get("releaseId") != batch_id:
        raise ReviewedReleaseError("Build report releaseId does not match the batch")
    if build_report.get("selectionDigest") != _canonical_hash(selection):
        raise ReviewedReleaseError("Build report selectionDigest does not match selection")
    if build_report.get("baseCommit") != base_commit:
        raise ReviewedReleaseError(
            "Build report baseCommit does not match the ledger batch"
        )
    if build_report.get("rendererCommit") != renderer_commit:
        raise ReviewedReleaseError(
            "Build report rendererCommit does not match the ledger batch"
        )
    source_commit = str(build_report.get("sourceCommit") or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}(?:[0-9a-f]{24})?", source_commit):
        raise ReviewedReleaseError("Build report sourceCommit is invalid")
    if renderer_commit != source_commit:
        raise ReviewedReleaseError(
            "Build report rendererCommit must equal sourceCommit"
        )
    renderer_runtime = build_report.get("rendererRuntime")
    if not isinstance(renderer_runtime, dict):
        raise ReviewedReleaseError(
            "Build report rendererRuntime must be an observed runtime fingerprint"
        )
    raw_results = build_report.get("results")
    if (
        not isinstance(raw_results, list)
        or len(raw_results) != target_count
        or build_report.get("count") != target_count
    ):
        raise ReviewedReleaseError("Build report does not contain the exact target count")

    build_root = build_report_path.parent.resolve()
    results: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(raw_results):
        if not isinstance(raw, dict) or raw.get("ok") is not True:
            raise ReviewedReleaseError(f"build results[{index}] is not passing")
        catalog_id = str(raw.get("catalogId") or "").strip()
        planned = selection_items.get(catalog_id)
        if planned is None or catalog_id in results:
            raise ReviewedReleaseError(
                f"build results[{index}] has an unplanned or duplicate catalog ID"
            )
        spec_path = _resolve_spec_path(
            spec_root,
            raw.get("specPath"),
            f"build results[{index}].specPath",
        )
        spec = load_form_spec(spec_path)
        expected_identity = {
            "catalogId": catalog_id,
            "sourceSection": planned["sourceSection"],
            "filename": planned["filename"],
            "slug": planned["slug"],
        }
        actual_identity = {
            "catalogId": spec.catalog_id,
            "sourceSection": spec.source_section,
            "filename": spec.source_filename,
            "slug": spec.slug,
        }
        if actual_identity != expected_identity:
            raise ReviewedReleaseError(
                f"build results[{index}] specification identity does not match selection"
            )
        planned_risk = str(planned["riskTier"])
        if (
            raw.get("riskTier") != spec.risk_tier
            or RISK_RANK[spec.risk_tier] < RISK_RANK[planned_risk]
        ):
            raise ReviewedReleaseError(
                f"build results[{index}] risk tier is inconsistent or downgraded"
            )
        spec_hash = _require_sha256(
            raw.get("specSha256"),
            f"build results[{index}].specSha256",
        )
        if _sha256_file(spec_path) != spec_hash:
            raise ReviewedReleaseError(
                f"build results[{index}] specification bytes changed"
            )
        schema_hash = _require_sha256(
            raw.get("schemaSha256"),
            f"build results[{index}].schemaSha256",
        )
        if validate_spec_content(spec).content_hash != schema_hash:
            raise ReviewedReleaseError(
                f"build results[{index}] schema hash does not match specification"
            )
        qa_path_value = raw.get("qaPath")
        if not isinstance(qa_path_value, str) or not qa_path_value.strip():
            raise ReviewedReleaseError(
                f"build results[{index}].qaPath must be a path"
            )
        qa_candidate = Path(qa_path_value)
        qa_path = (
            qa_candidate.expanduser().resolve()
            if qa_candidate.is_absolute()
            else (build_root / qa_candidate).resolve()
        )
        if not qa_path.is_relative_to(build_root) or not qa_path.is_file():
            raise ReviewedReleaseError(
                f"build results[{index}].qaPath escapes or is missing"
            )
        qa_hash = _require_sha256(
            raw.get("qaSha256"),
            f"build results[{index}].qaSha256",
        )
        if _sha256_file(qa_path) != qa_hash:
            raise ReviewedReleaseError(
                f"build results[{index}] QA evidence bytes changed"
            )
        try:
            qa_evidence = json.loads(qa_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ReviewedReleaseError(
                f"build results[{index}] QA evidence is not valid JSON: {exc}"
            ) from exc
        if not isinstance(qa_evidence, dict):
            raise ReviewedReleaseError(
                f"build results[{index}] QA evidence must be an object"
            )
        page_count = _require_positive_int(
            raw.get("pageCount"),
            f"build results[{index}].pageCount",
        )
        field_count = _require_positive_int(
            raw.get("fieldCount"),
            f"build results[{index}].fieldCount",
        )
        pdf = _validate_asset(
            result_index=index,
            asset_name="pdf",
            raw=raw.get("pdf"),
            build_root=build_root,
            release_id=batch_id,
        )
        thumbnail = _validate_asset(
            result_index=index,
            asset_name="thumbnail",
            raw=raw.get("thumbnail"),
            build_root=build_root,
            release_id=batch_id,
        )
        spec_qa = qa_evidence.get("specQa")
        pdf_qa = qa_evidence.get("pdfQa")
        if (
            not isinstance(spec_qa, dict)
            or spec_qa.get("catalog_id") != catalog_id
            or spec_qa.get("passed") is not True
            or spec_qa.get("errors") != []
            or spec_qa.get("warnings") != []
            or spec_qa.get("content_hash") != schema_hash
        ):
            raise ReviewedReleaseError(
                f"build results[{index}] specification QA evidence is not clean"
            )
        pdf_metrics = pdf_qa.get("metrics") if isinstance(pdf_qa, dict) else None
        if (
            not isinstance(pdf_qa, dict)
            or pdf_qa.get("ok") is not True
            or pdf_qa.get("errors") != []
            or pdf_qa.get("warnings") != []
            or pdf_qa.get("sha256") != pdf["sha256"]
            or not isinstance(pdf_metrics, dict)
            or pdf_metrics.get("pages") != page_count
            or pdf_metrics.get("rendered_pages") != page_count
            or pdf_metrics.get("fields") != field_count
            or pdf_metrics.get("widgets") != field_count
            or pdf_metrics.get("synthetic_fill_attempted") != field_count
            or pdf_metrics.get("synthetic_fill_verified") != field_count
        ):
            raise ReviewedReleaseError(
                f"build results[{index}] PDF QA evidence is not clean or complete"
            )
        results[catalog_id] = {
            "catalogId": catalog_id,
            "specPath": spec_path,
            "specSha256": spec_hash,
            "schemaSha256": schema_hash,
            "qaPath": qa_path,
            "qaSha256": qa_hash,
            "pageCount": page_count,
            "fieldCount": field_count,
            "pdf": pdf,
            "thumbnail": thumbnail,
        }

    if set(results) != set(selection_items):
        raise ReviewedReleaseError("Build report identities do not equal selection")
    if list(results) != sorted(results):
        raise ReviewedReleaseError("Build report results must use canonical catalog order")
    _validate_source_verification(
        raw=build_report.get("sourceVerification"),
        selection_path=selection_path,
        source_commit=source_commit,
        base_commit=base_commit,
        renderer_commit=renderer_commit,
        renderer_runtime=renderer_runtime,
        build_results=results,
    )
    return source_commit, results


def _asset_manifest_mapping(asset: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "sourcePath": asset["sourcePath"],
        "objectPath": asset["objectPath"],
        "contentType": asset["contentType"],
        "sha256": asset["sha256"],
        "bytes": asset["bytes"],
    }


def _validate_release_manifest(
    *,
    release_manifest_path: str | Path,
    build_report_path: Path,
    build_report: Mapping[str, Any],
    batch_id: str,
    source_commit: str,
    base_commit: str,
    renderer_commit: str,
    render_theme: dict[str, Any] | None,
    selection_items: Mapping[str, Mapping[str, Any]],
    build_results: Mapping[str, Mapping[str, Any]],
) -> tuple[Path, str]:
    build_root = build_report_path.parent.resolve()
    reported_path = _resolve_contained_path(
        build_root,
        build_report.get("releaseManifestPath"),
        "build report releaseManifestPath",
    )
    provided_path = Path(release_manifest_path).expanduser().resolve()
    if provided_path != reported_path:
        raise ReviewedReleaseError(
            "Provided release manifest is not the build report releaseManifestPath"
        )
    manifest_path, manifest, manifest_hash = _load_object(
        provided_path,
        "release manifest",
    )
    if (
        _require_sha256(
            build_report.get("releaseManifestSha256"),
            "build report releaseManifestSha256",
        )
        != manifest_hash
    ):
        raise ReviewedReleaseError(
            "Release manifest bytes do not match build report linkage"
        )
    required_root_keys = {
        "schemaVersion",
        "releaseId",
        "sourceCommit",
        "baseCommit",
        "rendererCommit",
        "rendererRuntime",
        "previousReleaseId",
        "createdAt",
        "forms",
    }
    if "renderTheme" in manifest:
        required_root_keys.add("renderTheme")
    if set(manifest) != required_root_keys:
        raise ReviewedReleaseError(
            "Release manifest does not contain the exact v1 release mapping"
        )
    _require_render_theme(
        payload=manifest,
        label="release manifest",
        expected=render_theme,
    )
    if (
        manifest.get("schemaVersion") != 1
        or manifest.get("releaseId") != batch_id
        or manifest.get("sourceCommit") != source_commit
        or manifest.get("baseCommit") != base_commit
        or manifest.get("rendererCommit") != renderer_commit
        or manifest.get("rendererRuntime") != build_report.get("rendererRuntime")
    ):
        raise ReviewedReleaseError(
            "Release manifest identity or commit provenance does not match the build"
        )
    _require_timestamp(manifest.get("createdAt"), "release manifest createdAt")
    previous_release_id = manifest.get("previousReleaseId")
    if previous_release_id is not None and (
        not isinstance(previous_release_id, str) or not previous_release_id.strip()
    ):
        raise ReviewedReleaseError(
            "release manifest previousReleaseId must be null or non-empty"
        )

    expected_forms = [
        {
            "catalogId": catalog_id,
            "slug": selection_items[catalog_id]["slug"],
            "sourceSection": selection_items[catalog_id]["sourceSection"],
            "filename": selection_items[catalog_id]["filename"],
            "pageCount": result["pageCount"],
            "pdf": _asset_manifest_mapping(result["pdf"]),
            "thumbnail": _asset_manifest_mapping(result["thumbnail"]),
        }
        for catalog_id, result in sorted(build_results.items())
    ]
    if manifest.get("forms") != expected_forms:
        raise ReviewedReleaseError(
            "Release manifest form or asset mapping does not exactly match build results"
        )
    return manifest_path, manifest_hash


def _validate_visual_reviews(
    *,
    review_paths: Iterable[str | Path],
    release_id: str,
    source_commit: str,
    build_report_sha256: str,
    render_theme: dict[str, Any] | None,
    build_results: Mapping[str, Mapping[str, Any]],
) -> dict[str, dict[str, Any]]:
    paths = sorted({Path(path).expanduser().resolve() for path in review_paths})
    if not paths:
        raise ReviewedReleaseError("At least one visual-review receipt is required")
    reviewed: dict[str, dict[str, Any]] = {}
    for receipt_path in paths:
        _, receipt, receipt_hash = _load_object(
            receipt_path,
            "visual-review receipt",
        )
        if (
            receipt.get("schemaVersion") != VISUAL_REVIEW_SCHEMA_VERSION
            or receipt.get("reportType") != VISUAL_REVIEW_REPORT_TYPE
            or receipt.get("passed") is not True
        ):
            raise ReviewedReleaseError(
                f"Visual-review receipt {receipt_path} is not a passing v1 receipt"
            )
        _require_render_theme(
            payload=receipt,
            label=f"visual-review receipt {receipt_path}",
            expected=render_theme,
        )
        if (
            receipt.get("releaseId") != release_id
            or receipt.get("sourceCommit") != source_commit
            or receipt.get("buildReportSha256") != build_report_sha256
        ):
            raise ReviewedReleaseError(
                f"Visual-review receipt {receipt_path} is not bound to this build"
            )
        reviewer = str(receipt.get("reviewer") or "").strip()
        if not reviewer:
            raise ReviewedReleaseError(
                f"Visual-review receipt {receipt_path} has no reviewer"
            )
        _require_timestamp(receipt.get("reviewedAt"), f"{receipt_path}.reviewedAt")
        raw_items = receipt.get("items")
        if not isinstance(raw_items, list) or not raw_items:
            raise ReviewedReleaseError(
                f"Visual-review receipt {receipt_path} has no items"
            )
        for index, raw in enumerate(raw_items):
            location = f"{receipt_path}.items[{index}]"
            if not isinstance(raw, dict):
                raise ReviewedReleaseError(f"{location} must be an object")
            catalog_id = str(raw.get("catalogId") or "").strip()
            result = build_results.get(catalog_id)
            if result is None or catalog_id in reviewed:
                raise ReviewedReleaseError(
                    f"{location} has an unknown or duplicate catalog ID"
                )
            if raw.get("status") != "approved":
                raise ReviewedReleaseError(f"{location} is not approved")
            defects = raw.get("defects")
            if not isinstance(defects, list) or defects:
                raise ReviewedReleaseError(f"{location} contains unresolved defects")
            if raw.get("pageCount") != result["pageCount"]:
                raise ReviewedReleaseError(f"{location}.pageCount does not match build")
            if (
                _require_sha256(raw.get("pdfSha256"), f"{location}.pdfSha256")
                != result["pdf"]["sha256"]
            ):
                raise ReviewedReleaseError(f"{location}.pdfSha256 does not match build")
            reviewed_pages = raw.get("pagesReviewed")
            expected_pages = list(range(1, result["pageCount"] + 1))
            if reviewed_pages != expected_pages:
                raise ReviewedReleaseError(
                    f"{location}.pagesReviewed must list every page exactly once"
                )
            reviewed[catalog_id] = {
                "receiptPath": receipt_path,
                "receiptSha256": receipt_hash,
                "reviewer": reviewer,
            }
    if set(reviewed) != set(build_results):
        missing = sorted(set(build_results) - set(reviewed))
        preview = ", ".join(missing[:10])
        raise ReviewedReleaseError(
            "Visual-review receipts do not cover the exact build set"
            + (f": missing {preview}" if preview else "")
        )
    return reviewed


def _expected_artifacts(
    result: Mapping[str, Any],
    review: Mapping[str, Any],
) -> dict[str, str]:
    return {
        "spec_hash": str(result["specSha256"]),
        "pdf_hash": str(result["pdf"]["sha256"]),
        "thumbnail_hash": str(result["thumbnail"]["sha256"]),
        "schema_hash": str(result["schemaSha256"]),
        "pdf_uri": str(result["pdf"]["objectPath"]),
        "thumbnail_uri": str(result["thumbnail"]["objectPath"]),
        "qa_evidence_uri": str(result["qaPath"]),
        "qa_evidence_hash": str(result["qaSha256"]),
        "review_evidence_uri": str(review["receiptPath"]),
        "review_evidence_hash": str(review["receiptSha256"]),
    }


def _validate_ledger_item(
    item: WorkItem,
    *,
    batch_id: str,
    planned: Mapping[str, Any],
    expected: Mapping[str, str],
) -> None:
    if item.batch_id != batch_id or item.ownership != "first_party":
        raise ReviewedReleaseError(
            f"Ledger item {item.catalog_id} is not a first-party member of {batch_id}"
        )
    stable_identity = {
        "sourceSection": item.section,
        "filename": item.filename,
        "slug": item.slug,
        "title": item.payload.get("title"),
        "riskTier": item.payload.get("risk_tier"),
    }
    if stable_identity != {
        key: planned[key]
        for key in stable_identity
    }:
        raise ReviewedReleaseError(
            f"Ledger item {item.catalog_id} stable catalog identity does not "
            "match the selection"
        )
    if item.stage not in ALLOWED_RECONCILE_STAGES:
        raise ReviewedReleaseError(
            f"Ledger item {item.catalog_id} is in non-reconcilable stage "
            f"{item.stage.value}"
        )
    if item.spec_hash != expected["spec_hash"]:
        raise ReviewedReleaseError(
            f"Ledger item {item.catalog_id} spec hash does not match the build"
        )
    if item.stage in {
        Stage.RENDERED,
        Stage.QA_PASSED,
        Stage.REVIEW_APPROVED,
    }:
        for field_name in (
            "pdf_hash",
            "thumbnail_hash",
            "schema_hash",
            "pdf_uri",
            "thumbnail_uri",
        ):
            if getattr(item, field_name) != expected[field_name]:
                raise ReviewedReleaseError(
                    f"Ledger item {item.catalog_id} has conflicting {field_name}"
                )
    if item.stage in {Stage.QA_PASSED, Stage.REVIEW_APPROVED}:
        for field_name in ("qa_evidence_uri", "qa_evidence_hash"):
            if getattr(item, field_name) != expected[field_name]:
                raise ReviewedReleaseError(
                    f"Ledger item {item.catalog_id} has conflicting {field_name}"
                )
    if item.stage is Stage.REVIEW_APPROVED:
        for field_name in (
            "review_evidence_uri",
            "review_evidence_hash",
        ):
            if getattr(item, field_name) != expected[field_name]:
                raise ReviewedReleaseError(
                    f"Ledger item {item.catalog_id} has conflicting {field_name}"
                )


def _complete_exact_stage(
    ledger: CatalogFactoryLedger,
    *,
    batch_id: str,
    catalog_id: str,
    worker_id: str,
    claimed_stage: Stage,
    lease_seconds: float,
    evidence_hash: str,
    artifact_updates: Mapping[str, str],
) -> None:
    key_prefix = (
        f"{batch_id}:{catalog_id}:{claimed_stage.value}:{evidence_hash}"
    )
    lease = ledger.claim_next(
        worker_id=worker_id,
        claimed_stage=claimed_stage,
        lease_seconds=lease_seconds,
        batch_id=batch_id,
        catalog_id=catalog_id,
    )
    if lease is None:
        raise ReviewedReleaseError(
            f"Could not claim {catalog_id} for {claimed_stage.value}"
        )
    ledger.complete_lease(
        lease,
        idempotency_key=f"{key_prefix}:complete",
        artifact_updates=artifact_updates,
    )


def reconcile_reviewed_release(
    ledger: CatalogFactoryLedger,
    *,
    batch_id: str,
    selection_path: str | Path,
    build_report_path: str | Path,
    release_manifest_path: str | Path,
    visual_review_paths: Iterable[str | Path],
    worker_id: str,
    spec_root: str | Path,
    lease_seconds: float = 900,
) -> dict[str, Any]:
    """Validate a complete reviewed build and advance exact fenced items."""

    batch = ledger.get_batch(batch_id)
    if batch is None:
        raise ReviewedReleaseError(f"Unknown ledger batch {batch_id!r}")
    if batch.status is not BatchStatus.OPEN:
        raise ReviewedReleaseError(f"Ledger batch {batch_id!r} is not open")
    worker = str(worker_id or "").strip()
    if not worker:
        raise ReviewedReleaseError("worker_id must be non-empty")

    selection_source, selection, _ = _load_object(selection_path, "selection")
    selection_digest = _canonical_hash(selection)
    selection_items = _selection_items(
        selection,
        batch_id=batch_id,
        target_count=batch.target_count,
    )
    report_path, build_report, report_hash = _load_object(
        build_report_path,
        "build report",
    )
    render_theme = _resolve_render_theme(
        ("selection", selection),
        ("build report", build_report),
    )
    source_commit, build_results = _validate_build_results(
        selection=selection,
        selection_path=selection_source,
        selection_items=selection_items,
        build_report_path=report_path,
        build_report=build_report,
        spec_root=Path(spec_root).expanduser().resolve(),
        batch_id=batch_id,
        target_count=batch.target_count,
        base_commit=batch.base_commit,
        renderer_commit=batch.renderer_commit,
    )
    manifest_path, manifest_hash = _validate_release_manifest(
        release_manifest_path=release_manifest_path,
        build_report_path=report_path,
        build_report=build_report,
        batch_id=batch_id,
        source_commit=source_commit,
        base_commit=batch.base_commit,
        renderer_commit=batch.renderer_commit,
        render_theme=render_theme,
        selection_items=selection_items,
        build_results=build_results,
    )
    visual_reviews = _validate_visual_reviews(
        review_paths=visual_review_paths,
        release_id=batch_id,
        source_commit=source_commit,
        build_report_sha256=report_hash,
        render_theme=render_theme,
        build_results=build_results,
    )

    ledger.requeue_expired(actor=f"{worker}:reviewed-release-reconcile")
    ledger_items = {
        item.catalog_id: item for item in ledger.list_items(batch_id=batch_id)
    }
    if set(ledger_items) != set(selection_items):
        raise ReviewedReleaseError("Ledger batch identities do not equal selection")
    expected_by_id: dict[str, dict[str, str]] = {}
    for catalog_id in sorted(selection_items):
        expected = _expected_artifacts(
            build_results[catalog_id],
            visual_reviews[catalog_id],
        )
        _validate_ledger_item(
            ledger_items[catalog_id],
            batch_id=batch_id,
            planned=selection_items[catalog_id],
            expected=expected,
        )
        expected_by_id[catalog_id] = expected

    ledger.bind_release_evidence(
        batch_id=batch_id,
        source_commit=source_commit,
        selection_digest=selection_digest,
        build_report_hash=report_hash,
        release_manifest_hash=manifest_hash,
        idempotency_key=(
            f"{batch_id}:bind-release:{selection_digest}:{report_hash}:{manifest_hash}"
        ),
    )

    transitions: Counter[str] = Counter()
    unchanged: list[str] = []
    for catalog_id in sorted(selection_items):
        result = build_results[catalog_id]
        review = visual_reviews[catalog_id]
        expected = expected_by_id[catalog_id]
        item = ledger.get_item(catalog_id)
        if item is None:
            raise ReviewedReleaseError(f"Ledger item {catalog_id} disappeared")
        was_approved = item.stage is Stage.REVIEW_APPROVED
        if item.stage is Stage.SPEC_READY:
            _complete_exact_stage(
                ledger,
                batch_id=batch_id,
                catalog_id=catalog_id,
                worker_id=worker,
                claimed_stage=Stage.RENDER_CLAIMED,
                lease_seconds=lease_seconds,
                evidence_hash=report_hash,
                artifact_updates={
                    key: expected[key]
                    for key in (
                        "pdf_hash",
                        "thumbnail_hash",
                        "schema_hash",
                        "pdf_uri",
                        "thumbnail_uri",
                    )
                },
            )
            transitions[Stage.RENDERED.value] += 1
            item = ledger.get_item(catalog_id)
        if item is not None and item.stage is Stage.RENDERED:
            _complete_exact_stage(
                ledger,
                batch_id=batch_id,
                catalog_id=catalog_id,
                worker_id=worker,
                claimed_stage=Stage.QA_CLAIMED,
                lease_seconds=lease_seconds,
                evidence_hash=str(result["qaSha256"]),
                artifact_updates={
                    "qa_evidence_uri": expected["qa_evidence_uri"],
                    "qa_evidence_hash": expected["qa_evidence_hash"],
                },
            )
            transitions[Stage.QA_PASSED.value] += 1
            item = ledger.get_item(catalog_id)
        if item is not None and item.stage is Stage.QA_PASSED:
            _complete_exact_stage(
                ledger,
                batch_id=batch_id,
                catalog_id=catalog_id,
                worker_id=worker,
                claimed_stage=Stage.REVIEW_CLAIMED,
                lease_seconds=lease_seconds,
                evidence_hash=str(review["receiptSha256"]),
                artifact_updates={
                    "review_evidence_uri": expected["review_evidence_uri"],
                    "review_evidence_hash": expected["review_evidence_hash"],
                },
            )
            transitions[Stage.REVIEW_APPROVED.value] += 1
            item = ledger.get_item(catalog_id)
        if item is None or item.stage is not Stage.REVIEW_APPROVED:
            raise ReviewedReleaseError(
                f"Ledger item {catalog_id} did not reach review_approved"
            )
        if was_approved:
            unchanged.append(catalog_id)

    result = {
        "batch_id": batch_id,
        "source_commit": source_commit,
        "selection_count": len(selection_items),
        "build_report_sha256": report_hash,
        "release_manifest_path": str(manifest_path),
        "release_manifest_sha256": manifest_hash,
        "visual_review_receipts": [
            {
                "path": str(path),
                "sha256": _sha256_file(path),
            }
            for path in sorted(
                {review["receiptPath"] for review in visual_reviews.values()}
            )
        ],
        "transitions": dict(sorted(transitions.items())),
        "unchanged": unchanged,
        "stage": Stage.REVIEW_APPROVED.value,
    }
    if render_theme is not None:
        result["renderTheme"] = render_theme
    return result
