"""Build validated immutable PDF assets from a tracked batch selection."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from PIL import Image

from .models import FormSpec, load_form_spec
from .pdf_qa import validate_pdf
from .renderer import render_form
from .spec_qa import SpecQaResult, validate_spec_batch, validate_spec_content


RELEASE_SCHEMA_VERSION = 1
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
RISK_RANK = {"A": 1, "B": 2, "C": 3}


class ReleaseBuildError(RuntimeError):
    """Raised when a release workset cannot be safely built."""


@dataclass(frozen=True)
class PlannedSpec:
    plan_item: dict[str, Any]
    path: Path
    spec: FormSpec
    qa: SpecQaResult


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


def _load_selection(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ReleaseBuildError(f"Could not read selection plan {path}: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise ReleaseBuildError("Selection plan must be a schemaVersion 1 object")
    items = payload.get("items")
    target = payload.get("targetCount")
    if not isinstance(items, list) or not isinstance(target, int) or target <= 0:
        raise ReleaseBuildError("Selection plan has an invalid targetCount or items list")
    if len(items) != target:
        raise ReleaseBuildError(
            f"Selection plan expected {target} items but contains {len(items)}"
        )
    return payload


def _discover_specs(spec_root: Path) -> dict[str, Path]:
    discovered: dict[str, Path] = {}
    duplicate_ids: set[str] = set()
    for path in sorted(spec_root.rglob("*.json")):
        spec = load_form_spec(path)
        if spec.catalog_id in discovered:
            duplicate_ids.add(spec.catalog_id)
        else:
            discovered[spec.catalog_id] = path
    if duplicate_ids:
        raise ReleaseBuildError(
            "Duplicate tracked specs: " + ", ".join(sorted(duplicate_ids))
        )
    return discovered


def _bind_planned_specs(
    plan: Mapping[str, Any],
    *,
    spec_root: Path,
) -> list[PlannedSpec]:
    discovered = _discover_specs(spec_root)
    bound: list[PlannedSpec] = []
    errors: list[str] = []
    for index, raw_item in enumerate(plan["items"]):
        if not isinstance(raw_item, dict):
            errors.append(f"items[{index}] is not an object")
            continue
        catalog_id = str(raw_item.get("catalogId") or "")
        path = discovered.get(catalog_id)
        if path is None:
            errors.append(f"{catalog_id or f'items[{index}]'}: tracked spec missing")
            continue
        spec = load_form_spec(path)
        expected = {
            "sourceSection": spec.source_section,
            "filename": spec.source_filename,
            "slug": spec.slug,
        }
        for key, actual in expected.items():
            if raw_item.get(key) != actual:
                errors.append(
                    f"{catalog_id}: {key} changed from {raw_item.get(key)!r} to {actual!r}"
                )
        planned_risk = str(raw_item.get("riskTier") or "")
        if planned_risk not in RISK_RANK:
            errors.append(f"{catalog_id}: plan has invalid riskTier {planned_risk!r}")
        elif RISK_RANK[spec.risk_tier] < RISK_RANK[planned_risk]:
            errors.append(
                f"{catalog_id}: riskTier was downgraded from {planned_risk} to {spec.risk_tier}"
            )
        bound.append(
            PlannedSpec(
                plan_item=dict(raw_item),
                path=path,
                spec=spec,
                qa=validate_spec_content(spec),
            )
        )
    if errors:
        preview = "; ".join(errors[:20])
        if len(errors) > 20:
            preview += f"; ... {len(errors) - 20} more"
        raise ReleaseBuildError(f"Selection/spec binding failed: {preview}")
    return bound


def _render_thumbnail(
    pdf_path: Path,
    thumbnail_path: Path,
    *,
    width: int = 320,
    quality: int = 82,
) -> None:
    thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = thumbnail_path.with_suffix(".webp.tmp")
    try:
        with tempfile.TemporaryDirectory(prefix="dullypdf-thumbnail-") as temp_dir:
            prefix = Path(temp_dir) / "page"
            process = subprocess.run(
                [
                    "pdftoppm",
                    "-f",
                    "1",
                    "-l",
                    "1",
                    "-singlefile",
                    "-png",
                    "-scale-to-x",
                    str(width),
                    "-scale-to-y",
                    "-1",
                    str(pdf_path),
                    str(prefix),
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if process.returncode != 0:
                raise ReleaseBuildError(
                    f"Could not render thumbnail for {pdf_path}: {process.stderr.strip()}"
                )
            png_path = prefix.with_suffix(".png")
            with Image.open(png_path) as image:
                image.convert("RGB").save(
                    temporary_path,
                    format="WEBP",
                    quality=quality,
                    method=6,
                )
        os.replace(temporary_path, thumbnail_path)
    finally:
        temporary_path.unlink(missing_ok=True)


def _build_one(
    planned: PlannedSpec,
    *,
    release_id: str,
    output_root: Path,
) -> dict[str, Any]:
    spec = planned.spec
    asset_dir = output_root / "assets" / spec.source_section
    pdf_path = asset_dir / spec.source_filename
    thumbnail_path = pdf_path.with_suffix(".webp")
    asset_dir.mkdir(parents=True, exist_ok=True)
    render_form(spec, pdf_path)
    pdf_qa = validate_pdf(
        pdf_path,
        display_path=f"{spec.source_section}/{spec.source_filename}",
        render=True,
        synthetic_fill=True,
        render_root=None,
    )
    expected_widgets = int(planned.qa.metrics["widgets"])
    actual_widgets = int(pdf_qa["metrics"]["widgets"])
    if actual_widgets != expected_widgets:
        pdf_qa["errors"].append(
            {
                "code": "spec_pdf_widget_count_mismatch",
                "message": (
                    f"Specification declares {expected_widgets} controls but the "
                    f"rendered PDF contains {actual_widgets} widgets."
                ),
                "location": f"{spec.source_section}/{spec.source_filename}",
            }
        )
        pdf_qa["ok"] = False
    widgets_per_page = pdf_qa["metrics"].get("widgets_per_page") or []
    lowest_ratios = (
        pdf_qa["metrics"].get("lowest_widget_bottom_ratio_per_page") or []
    )
    lowest_ratio = pdf_qa["metrics"].get("last_page_lowest_widget_bottom_ratio")
    if (
        int(pdf_qa["metrics"]["pages"]) > 1
        and widgets_per_page
        and int(widgets_per_page[-1]) <= 6
        and isinstance(lowest_ratio, (int, float))
        and float(lowest_ratio) > 0.45
    ):
        pdf_qa["errors"].append(
            {
                "code": "orphan_last_page",
                "message": (
                    "The last page contains only a small control cluster in its "
                    "upper half; rebalance pagination or add substantive closeout content."
                ),
                "location": f"{spec.source_section}/{spec.source_filename}",
            }
        )
        pdf_qa["ok"] = False
    for page_index, (widget_count, page_lowest_ratio) in enumerate(
        zip(widgets_per_page[:-1], lowest_ratios[:-1]),
        start=1,
    ):
        if (
            int(widget_count) <= 16
            and isinstance(page_lowest_ratio, (int, float))
            and float(page_lowest_ratio) > 0.55
        ):
            pdf_qa["errors"].append(
                {
                    "code": "sparse_interior_page",
                    "message": (
                        f"Page {page_index} contains only {widget_count} controls "
                        "and leaves most of the page unused; rebalance adjacent "
                        "workflow content."
                    ),
                    "location": f"{spec.source_section}/{spec.source_filename}",
                }
            )
            pdf_qa["ok"] = False
    if not pdf_qa["ok"]:
        return {
            "catalogId": spec.catalog_id,
            "ok": False,
            "specPath": str(planned.path),
            "pdfPath": str(pdf_path),
            "pdfQa": pdf_qa,
        }

    _render_thumbnail(pdf_path, thumbnail_path)
    pdf_relative = pdf_path.relative_to(output_root).as_posix()
    thumbnail_relative = thumbnail_path.relative_to(output_root).as_posix()
    pdf_sha = _sha256_file(pdf_path)
    thumbnail_sha = _sha256_file(thumbnail_path)
    spec_sha = _sha256_file(planned.path)
    qa_evidence = {
        "specQa": planned.qa.to_dict(),
        "pdfQa": pdf_qa,
    }
    qa_path = (
        output_root
        / "qa"
        / spec.source_section
        / f"{Path(spec.source_filename).stem}.json"
    )
    qa_path.parent.mkdir(parents=True, exist_ok=True)
    qa_path.write_text(
        json.dumps(qa_evidence, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return {
        "catalogId": spec.catalog_id,
        "ok": True,
        "specPath": str(planned.path),
        "specSha256": spec_sha,
        "schemaSha256": planned.qa.content_hash,
        "riskTier": spec.risk_tier,
        "qaPath": str(qa_path),
        "qaSha256": _sha256_file(qa_path),
        "pageCount": int(pdf_qa["metrics"]["pages"]),
        "fieldCount": actual_widgets,
        "pdf": {
            "sourcePath": pdf_relative,
            "objectPath": f"releases/{release_id}/{pdf_relative}",
            "contentType": "application/pdf",
            "sha256": pdf_sha,
            "bytes": pdf_path.stat().st_size,
        },
        "thumbnail": {
            "sourcePath": thumbnail_relative,
            "objectPath": f"releases/{release_id}/{thumbnail_relative}",
            "contentType": "image/webp",
            "sha256": thumbnail_sha,
            "bytes": thumbnail_path.stat().st_size,
        },
    }


def build_release(
    *,
    selection_path: str | Path,
    spec_root: str | Path,
    output_root: str | Path,
    source_commit: str,
    previous_release_id: str | None,
    created_at: str | None = None,
    workers: int = 8,
) -> dict[str, Any]:
    """Build every planned asset and write a release manifest only on success."""

    normalized_commit = source_commit.strip().lower()
    if not COMMIT_PATTERN.fullmatch(normalized_commit):
        raise ReleaseBuildError("source_commit must be a 40- or 64-character Git object ID")
    selection = _load_selection(Path(selection_path))
    release_id = str(selection.get("releaseId") or "")
    if not release_id:
        raise ReleaseBuildError("Selection plan has no releaseId")
    resolved_output = Path(output_root).resolve()
    resolved_output.mkdir(parents=True, exist_ok=True)
    planned = _bind_planned_specs(selection, spec_root=Path(spec_root).resolve())
    content_report = validate_spec_batch([item.spec for item in planned])
    (resolved_output / "spec-qa.json").write_text(
        json.dumps(content_report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if not content_report["passed"]:
        raise ReleaseBuildError("Batch content QA failed; see spec-qa.json")

    worker_count = max(1, min(int(workers), 16))
    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = {
            executor.submit(
                _build_one,
                item,
                release_id=release_id,
                output_root=resolved_output,
            ): item.spec.catalog_id
            for item in planned
        }
        for future in as_completed(futures):
            catalog_id = futures[future]
            try:
                results.append(future.result())
            except Exception as exc:
                results.append(
                    {
                        "catalogId": catalog_id,
                        "ok": False,
                        "errors": [
                            {
                                "code": "release_asset_build_failed",
                                "message": str(exc),
                            }
                        ],
                    }
                )
    results.sort(key=lambda result: result["catalogId"])
    build_report = {
        "schemaVersion": 1,
        "releaseId": release_id,
        "selectionDigest": _canonical_hash(selection),
        "sourceCommit": normalized_commit,
        "count": len(results),
        "passed": all(result.get("ok") is True for result in results),
        "results": results,
    }
    (resolved_output / "build-report.json").write_text(
        json.dumps(build_report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if not build_report["passed"]:
        raise ReleaseBuildError("One or more release assets failed; see build-report.json")

    by_id = {item.spec.catalog_id: item for item in planned}
    release_forms: list[dict[str, Any]] = []
    for result in results:
        planned_item = by_id[result["catalogId"]]
        release_forms.append(
            {
                "catalogId": result["catalogId"],
                "slug": planned_item.spec.slug,
                "sourceSection": planned_item.spec.source_section,
                "filename": planned_item.spec.source_filename,
                "pageCount": result["pageCount"],
                "pdf": result["pdf"],
                "thumbnail": result["thumbnail"],
            }
        )
    timestamp = created_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    manifest = {
        "schemaVersion": RELEASE_SCHEMA_VERSION,
        "releaseId": release_id,
        "sourceCommit": normalized_commit,
        "previousReleaseId": previous_release_id,
        "createdAt": timestamp,
        "forms": release_forms,
    }
    manifest_path = resolved_output / "release.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return {
        "release_id": release_id,
        "count": len(release_forms),
        "manifest": str(manifest_path),
        "build_report": str(resolved_output / "build-report.json"),
        "spec_qa": str(resolved_output / "spec-qa.json"),
    }
