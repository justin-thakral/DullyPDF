"""Build validated immutable PDF assets from a tracked batch selection."""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from PIL import Image, features as pillow_features

from .models import FormSpec, load_form_spec
from .pdf_qa import validate_pdf
from .renderer import render_form
from .spec_qa import (
    SpecQaResult,
    usability_profile_for_spec,
    validate_spec_batch,
    validate_spec_content,
)
from .themes import DEFAULT_THEME_ID, ThemeError, validate_theme_provenance


RELEASE_SCHEMA_VERSION = 1
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
RISK_RANK = {"A": 1, "B": 2, "C": 3}
MAX_SPARSE_LAST_PAGE_LOWEST_WIDGET_RATIO = 0.45
LEGACY_MAX_SPARSE_LAST_PAGE_LOWEST_WIDGET_RATIO = 0.60


class ReleaseBuildError(RuntimeError):
    """Raised when a release workset cannot be safely built."""


@dataclass(frozen=True)
class PlannedSpec:
    plan_item: dict[str, Any]
    path: Path
    spec: FormSpec
    qa: SpecQaResult


SourceVerifier = Callable[..., Mapping[str, Any]]
RuntimeVerifier = Callable[[], Mapping[str, Any]]
RENDERER_DEPENDENCIES = ("pillow", "pypdf", "reportlab")


def release_runtime_source_paths() -> tuple[Path, ...]:
    """Return every tracked project file that controls release rendering and QA."""

    package_root = Path(__file__).resolve().parent
    repository_root = package_root.parents[1]
    return tuple(
        sorted(
            (
                package_root / "__init__.py",
                package_root / "__main__.py",
                package_root / "release_builder.py",
                package_root / "models.py",
                package_root / "pdf_qa.py",
                package_root / "renderer.py",
                package_root / "spec_qa.py",
                package_root / "themes.py",
                repository_root / "backend" / "requirements.txt",
            )
        )
    )


def release_runtime_repository_root() -> Path:
    """Return the repository containing the renderer code currently imported."""

    return Path(__file__).resolve().parents[2]


def _source_workset_root(
    selection_path: Path,
    planned_specs: Sequence[PlannedSpec],
) -> Path:
    paths = [selection_path.resolve()]
    paths.extend(planned.path.resolve() for planned in planned_specs)
    return Path(os.path.commonpath([str(path) for path in paths])).resolve()


def _normalized_distribution_name(value: str) -> str:
    return re.sub(r"[-_.]+", "-", value).lower()


def _capture_renderer_runtime() -> Mapping[str, Any]:
    """Fail closed on unpinned renderer packages and record the observed toolchain."""

    requirements_path = next(
        path
        for path in release_runtime_source_paths()
        if path.as_posix().endswith("/backend/requirements.txt")
    )
    pins: dict[str, str] = {}
    for raw_line in requirements_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "==" not in line:
            continue
        name, version = line.split("==", 1)
        normalized = _normalized_distribution_name(name.strip())
        if normalized in RENDERER_DEPENDENCIES:
            pins[normalized] = version.strip()
    if set(pins) != set(RENDERER_DEPENDENCIES):
        missing = sorted(set(RENDERER_DEPENDENCIES) - set(pins))
        raise ReleaseBuildError(
            "backend/requirements.txt must exactly pin renderer dependencies: "
            + ", ".join(missing)
        )

    installed: dict[str, str] = {}
    for distribution in RENDERER_DEPENDENCIES:
        try:
            version = importlib.metadata.version(distribution)
        except importlib.metadata.PackageNotFoundError as exc:
            raise ReleaseBuildError(
                f"Required renderer dependency is not installed: {distribution}"
            ) from exc
        if version != pins[distribution]:
            raise ReleaseBuildError(
                f"Renderer dependency {distribution}=={version} does not match "
                f"the tracked pin {pins[distribution]}"
            )
        installed[distribution] = version

    pdftoppm_path = shutil.which("pdftoppm")
    if not pdftoppm_path:
        raise ReleaseBuildError("pdftoppm is required for release PDF QA")
    try:
        pdftoppm_result = subprocess.run(
            [pdftoppm_path, "-v"],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ReleaseBuildError(f"Could not inspect pdftoppm runtime: {exc}") from exc
    version_output = (
        pdftoppm_result.stderr.strip() or pdftoppm_result.stdout.strip()
    ).splitlines()
    if pdftoppm_result.returncode != 0 or not version_output:
        raise ReleaseBuildError("pdftoppm -v did not return a usable version")

    pillow_libraries: dict[str, dict[str, Any]] = {}
    for feature_name in ("webp", "zlib"):
        available = bool(pillow_features.check(feature_name))
        pillow_libraries[feature_name] = {
            "available": available,
            "version": (
                pillow_features.version(feature_name)
                if available
                else None
            ),
        }

    return {
        "schemaVersion": 1,
        "requirementsPath": "backend/requirements.txt",
        "requirementsSha256": _sha256_file(requirements_path),
        "pythonImplementation": platform.python_implementation(),
        "pythonVersion": platform.python_version(),
        "pythonExecutable": Path(sys.executable).name,
        "pythonExecutableSha256": _sha256_file(Path(sys.executable).resolve()),
        "packages": installed,
        "pdftoppmExecutable": Path(pdftoppm_path).name,
        "pdftoppmExecutableSha256": _sha256_file(Path(pdftoppm_path).resolve()),
        "pdftoppmVersion": version_output[0],
        "pillowLibraries": pillow_libraries,
    }


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


def _normalize_commit(value: str, name: str) -> str:
    normalized = str(value or "").strip().lower()
    if not COMMIT_PATTERN.fullmatch(normalized):
        raise ReleaseBuildError(
            f"{name} must be a 40- or 64-character Git object ID"
        )
    return normalized


def _run_git(
    repository_root: Path,
    arguments: Sequence[str],
    *,
    input_text: str | None = None,
) -> subprocess.CompletedProcess[str]:
    try:
        process = subprocess.run(
            ["git", "-C", str(repository_root), *arguments],
            input=input_text,
            check=False,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ReleaseBuildError(f"Could not execute Git source verification: {exc}") from exc
    return process


def _require_git_success(
    repository_root: Path,
    arguments: Sequence[str],
    *,
    error: str,
    input_text: str | None = None,
) -> subprocess.CompletedProcess[str]:
    process = _run_git(repository_root, arguments, input_text=input_text)
    if process.returncode != 0:
        detail = process.stderr.strip() or process.stdout.strip()
        raise ReleaseBuildError(f"{error}" + (f": {detail}" if detail else ""))
    return process


def _verify_git_source(
    *,
    source_commit: str,
    base_commit: str,
    renderer_commit: str,
    selection_path: Path,
    planned_specs: Sequence[PlannedSpec],
) -> Mapping[str, Any]:
    """Prove that all release inputs are bytes from one clean Git commit.

    The verification uses one tree lookup and one working-file hash pass for
    the complete workset, so runtime is O(n + b) for ``n`` paths and ``b``
    bytes. It does not launch one Git process per form.
    """

    discovery = _require_git_success(
        selection_path.parent,
        ["rev-parse", "--show-toplevel"],
        error="Selection is not inside a Git worktree",
    )
    repository_root = Path(discovery.stdout.strip()).resolve()
    head = _require_git_success(
        repository_root,
        ["rev-parse", "--verify", "HEAD^{commit}"],
        error="Could not resolve Git HEAD",
    ).stdout.strip().lower()
    if head != source_commit:
        raise ReleaseBuildError(
            f"source_commit {source_commit} does not equal clean Git HEAD {head}"
        )

    status = _require_git_success(
        repository_root,
        ["status", "--porcelain=v1", "--untracked-files=all"],
        error="Could not inspect Git worktree status",
    ).stdout
    if status:
        preview = "; ".join(line for line in status.splitlines()[:10])
        raise ReleaseBuildError(
            "Git worktree must be clean, including untracked files"
            + (f": {preview}" if preview else "")
        )

    for name, commit in (
        ("base_commit", base_commit),
        ("renderer_commit", renderer_commit),
    ):
        resolved = _require_git_success(
            repository_root,
            ["rev-parse", "--verify", f"{commit}^{{commit}}"],
            error=f"{name} does not resolve to a Git commit",
        ).stdout.strip().lower()
        if resolved != commit:
            raise ReleaseBuildError(f"{name} did not resolve to its exact object ID")
        ancestry = _run_git(
            repository_root,
            ["merge-base", "--is-ancestor", commit, source_commit],
        )
        if ancestry.returncode != 0:
            raise ReleaseBuildError(
                f"{name} {commit} is not an ancestor of source_commit {source_commit}"
            )

    source_files: list[tuple[str, str | None, Path]] = [
        ("selection", None, selection_path)
    ]
    source_files.extend(
        ("renderer runtime", path.name, path)
        for path in release_runtime_source_paths()
    )
    source_files.extend(
        ("specification", planned.spec.catalog_id, planned.path.resolve())
        for planned in sorted(
            planned_specs,
            key=lambda item: item.spec.catalog_id,
        )
    )
    relative_paths: list[str] = []
    for role, catalog_id, path in source_files:
        try:
            relative = path.resolve().relative_to(repository_root).as_posix()
        except ValueError as exc:
            identity = catalog_id or role
            raise ReleaseBuildError(
                f"{identity} source path is outside the verified Git worktree"
            ) from exc
        relative_paths.append(relative)
    if len(relative_paths) != len(set(relative_paths)):
        raise ReleaseBuildError("Release source paths contain duplicates")

    _require_git_success(
        repository_root,
        ["ls-files", "--error-unmatch", "--", *relative_paths],
        error=(
            "Selection, renderer runtime, and every selected specification "
            "must be tracked by Git"
        ),
    )
    tree = _require_git_success(
        repository_root,
        ["ls-tree", "-r", "-z", source_commit, "--", *relative_paths],
        error="Could not inspect release files at source_commit",
    ).stdout
    committed_blobs: dict[str, str] = {}
    for entry in tree.split("\0"):
        if not entry:
            continue
        try:
            metadata, path = entry.split("\t", 1)
            _, object_type, object_id = metadata.split(" ", 2)
        except ValueError as exc:
            raise ReleaseBuildError("Git returned an invalid source tree record") from exc
        if object_type != "blob" or path in committed_blobs:
            raise ReleaseBuildError(
                f"Git source tree has an invalid or duplicate record for {path}"
            )
        committed_blobs[path] = object_id.lower()
    if set(committed_blobs) != set(relative_paths):
        missing = sorted(set(relative_paths) - set(committed_blobs))
        raise ReleaseBuildError(
            "Selection, renderer runtime, and every selected specification "
            "must exist at source_commit"
            + (f": missing {', '.join(missing[:10])}" if missing else "")
        )

    working_hashes = _require_git_success(
        repository_root,
        ["hash-object", "--no-filters", "--stdin-paths"],
        input_text="\n".join(relative_paths) + "\n",
        error="Could not hash release source files",
    ).stdout.splitlines()
    if len(working_hashes) != len(relative_paths):
        raise ReleaseBuildError("Git did not hash the complete release source workset")
    mismatched = [
        path
        for path, working_hash in zip(relative_paths, working_hashes)
        if working_hash.strip().lower() != committed_blobs[path]
    ]
    if mismatched:
        raise ReleaseBuildError(
            "Selection, renderer runtime, and selected specifications must be "
            "byte-identical to "
            f"source_commit: {', '.join(mismatched[:10])}"
        )

    return {
        "repositoryHead": head,
        "workingTreeClean": True,
        "baseIsAncestor": True,
        "rendererIsAncestor": True,
        "filesTrackedAtSource": True,
        "filesByteIdentical": True,
    }


def _build_source_verification(
    *,
    source_commit: str,
    base_commit: str,
    renderer_commit: str,
    selection_path: Path,
    planned_specs: Sequence[PlannedSpec],
    verifier: SourceVerifier,
    runtime_verifier: RuntimeVerifier,
) -> dict[str, Any]:
    details = dict(
        verifier(
            source_commit=source_commit,
            base_commit=base_commit,
            renderer_commit=renderer_commit,
            selection_path=selection_path,
            planned_specs=planned_specs,
        )
    )
    expected_details = {
        "repositoryHead": source_commit,
        "workingTreeClean": True,
        "baseIsAncestor": True,
        "rendererIsAncestor": True,
        "filesTrackedAtSource": True,
        "filesByteIdentical": True,
    }
    if details != expected_details:
        raise ReleaseBuildError(
            "Source verifier did not attest a clean, exact, ancestor-bound Git source"
        )
    renderer_runtime = dict(runtime_verifier())
    source_workset_root = _source_workset_root(selection_path, planned_specs)
    runtime_repository_root = release_runtime_repository_root()
    runtime_sources = [
        {
            "path": path.relative_to(runtime_repository_root).as_posix(),
            "sha256": _sha256_file(path),
        }
        for path in release_runtime_source_paths()
    ]
    specifications = [
        {
            "catalogId": planned.spec.catalog_id,
            "path": (
                planned.path.resolve().relative_to(source_workset_root).as_posix()
            ),
            "sha256": _sha256_file(planned.path),
        }
        for planned in sorted(planned_specs, key=lambda item: item.spec.catalog_id)
    ]
    return {
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
        "verifiedFileCount": len(specifications) + len(runtime_sources) + 1,
        "selection": {
            "path": selection_path.resolve().relative_to(
                source_workset_root
            ).as_posix(),
            "sha256": _sha256_file(selection_path),
        },
        "runtimeSources": runtime_sources,
        "rendererRuntime": renderer_runtime,
        "specifications": specifications,
    }


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
    if "renderTheme" in payload:
        try:
            expected_theme = validate_theme_provenance(
                payload["renderTheme"],
                location="Selection plan renderTheme",
            )
        except ThemeError as exc:
            raise ReleaseBuildError(
                f"Selection plan renderTheme is invalid: {exc}"
            ) from exc
        payload["renderTheme"] = expected_theme
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


def validate_release_selection_specs(
    *,
    selection_path: str | Path,
    spec_root: str | Path,
) -> dict[str, Any]:
    """Run current content QA against one exact release workset."""

    resolved_selection = Path(selection_path).expanduser().resolve()
    resolved_spec_root = Path(spec_root).expanduser().resolve()
    selection = _load_selection(resolved_selection)
    planned = _bind_planned_specs(selection, spec_root=resolved_spec_root)
    report = validate_spec_batch(item.spec for item in planned)
    return {
        "schemaVersion": 1,
        "reportType": "form-catalog-selection-spec-qa",
        "releaseId": selection["releaseId"],
        "selectionPath": resolved_selection.as_posix(),
        "selectionSha256": _sha256_file(resolved_selection),
        "specRoot": resolved_spec_root.as_posix(),
        "renderTheme": selection.get("renderTheme"),
        **report,
    }


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


def _apply_task_page_budget(
    spec: FormSpec,
    pdf_qa: dict[str, Any],
    *,
    location: str,
) -> None:
    """Fail the rendered artifact when it exceeds its task-proportional ceiling."""

    usability_profile = usability_profile_for_spec(spec)
    page_count = int(pdf_qa["metrics"]["pages"])
    if page_count <= usability_profile.max_pages:
        return
    pdf_qa["errors"].append(
        {
            "code": "task_scope_exceeds_page_budget",
            "message": (
                f"The {usability_profile.name} task profile permits at most "
                f"{usability_profile.max_pages} rendered pages; found "
                f"{page_count}. Remove nonessential workflow stages or split "
                "a genuinely separate job into its own form."
            ),
            "location": location,
        }
    )
    pdf_qa["ok"] = False


def _apply_page_balance_qa(
    pdf_qa: dict[str, Any],
    *,
    location: str,
    max_sparse_last_page_ratio: float = MAX_SPARSE_LAST_PAGE_LOWEST_WIDGET_RATIO,
) -> None:
    """Reject mechanically measurable pagination spills before visual review."""

    metrics = pdf_qa["metrics"]
    widgets_per_page = metrics.get("widgets_per_page") or []
    lowest_ratios = metrics.get("lowest_widget_bottom_ratio_per_page") or []
    lowest_ratio = metrics.get("last_page_lowest_widget_bottom_ratio")
    page_count = int(metrics["pages"])
    is_orphan_last_page = (
        page_count > 1
        and widgets_per_page
        and int(widgets_per_page[-1]) <= 6
        and isinstance(lowest_ratio, (int, float))
        and float(lowest_ratio) > 0.45
    )
    if is_orphan_last_page:
        pdf_qa["errors"].append(
            {
                "code": "orphan_last_page",
                "message": (
                    "The last page contains only a small control cluster in its "
                    "upper half; compact or rebalance the workflow, adding closeout "
                    "content only when the task requires it."
                ),
                "location": location,
            }
        )
        pdf_qa["ok"] = False
    elif (
        page_count > 1
        and isinstance(lowest_ratio, (int, float))
        and float(lowest_ratio) > max_sparse_last_page_ratio
    ):
        pdf_qa["errors"].append(
            {
                "code": "sparse_last_page",
                "message": (
                    "The last page keeps every interactive control in its upper "
                    "region and leaves a large lower region unused; rebalance "
                    "adjacent workflow content."
                ),
                "location": location,
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
                    "location": location,
                }
            )
            pdf_qa["ok"] = False


def _build_one(
    planned: PlannedSpec,
    *,
    release_id: str,
    theme_id: str,
    max_sparse_last_page_ratio: float,
    output_root: Path,
    spec_root: Path,
) -> dict[str, Any]:
    spec = planned.spec
    asset_dir = output_root / "assets" / spec.source_section
    pdf_path = asset_dir / spec.source_filename
    thumbnail_path = pdf_path.with_suffix(".webp")
    asset_dir.mkdir(parents=True, exist_ok=True)
    render_form(spec, pdf_path, theme_id=theme_id)
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
    _apply_task_page_budget(
        spec,
        pdf_qa,
        location=f"{spec.source_section}/{spec.source_filename}",
    )
    _apply_page_balance_qa(
        pdf_qa,
        location=f"{spec.source_section}/{spec.source_filename}",
        max_sparse_last_page_ratio=max_sparse_last_page_ratio,
    )
    if not pdf_qa["ok"]:
        return {
            "catalogId": spec.catalog_id,
            "ok": False,
            "specPath": planned.path.resolve().relative_to(spec_root).as_posix(),
            "pdfPath": pdf_path.relative_to(output_root).as_posix(),
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
        "specPath": planned.path.resolve().relative_to(spec_root).as_posix(),
        "specSha256": spec_sha,
        "schemaSha256": planned.qa.content_hash,
        "riskTier": spec.risk_tier,
        "qaPath": qa_path.relative_to(output_root).as_posix(),
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
    base_commit: str,
    renderer_commit: str,
    previous_release_id: str | None,
    created_at: str | None = None,
    workers: int = 8,
    _source_verifier: SourceVerifier | None = None,
    _runtime_verifier: RuntimeVerifier | None = None,
) -> dict[str, Any]:
    """Build every planned asset and write a release manifest only on success."""

    normalized_commit = _normalize_commit(source_commit, "source_commit")
    normalized_base_commit = _normalize_commit(base_commit, "base_commit")
    normalized_renderer_commit = _normalize_commit(
        renderer_commit,
        "renderer_commit",
    )
    if normalized_renderer_commit != normalized_commit:
        raise ReleaseBuildError(
            "renderer_commit must equal source_commit because the release builder "
            "imports and executes renderer code from the current source checkout"
        )
    resolved_selection = Path(selection_path).expanduser().resolve()
    resolved_spec_root = Path(spec_root).expanduser().resolve()
    selection = _load_selection(resolved_selection)
    render_theme = (
        dict(selection["renderTheme"])
        if "renderTheme" in selection
        else None
    )
    theme_id = (
        str(render_theme["id"])
        if render_theme is not None
        else DEFAULT_THEME_ID
    )
    max_sparse_last_page_ratio = (
        MAX_SPARSE_LAST_PAGE_LOWEST_WIDGET_RATIO
        if render_theme is not None
        else LEGACY_MAX_SPARSE_LAST_PAGE_LOWEST_WIDGET_RATIO
    )
    release_id = str(selection.get("releaseId") or "")
    if not release_id:
        raise ReleaseBuildError("Selection plan has no releaseId")
    planned = _bind_planned_specs(selection, spec_root=resolved_spec_root)
    source_verification = _build_source_verification(
        source_commit=normalized_commit,
        base_commit=normalized_base_commit,
        renderer_commit=normalized_renderer_commit,
        selection_path=resolved_selection,
        planned_specs=planned,
        verifier=_source_verifier or _verify_git_source,
        runtime_verifier=_runtime_verifier or _capture_renderer_runtime,
    )
    renderer_runtime = source_verification["rendererRuntime"]
    resolved_output = Path(output_root).resolve()
    resolved_output.mkdir(parents=True, exist_ok=True)
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
                theme_id=theme_id,
                max_sparse_last_page_ratio=max_sparse_last_page_ratio,
                output_root=resolved_output,
                spec_root=resolved_spec_root,
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
        "baseCommit": normalized_base_commit,
        "rendererCommit": normalized_renderer_commit,
        "rendererRuntime": renderer_runtime,
        "sourceVerification": source_verification,
        "count": len(results),
        "passed": all(result.get("ok") is True for result in results),
        "results": results,
    }
    if render_theme is not None:
        build_report["renderTheme"] = render_theme
    if not build_report["passed"]:
        (resolved_output / "build-report.json").write_text(
            json.dumps(build_report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
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
        "baseCommit": normalized_base_commit,
        "rendererCommit": normalized_renderer_commit,
        "rendererRuntime": renderer_runtime,
        "previousReleaseId": previous_release_id,
        "createdAt": timestamp,
        "forms": release_forms,
    }
    if render_theme is not None:
        manifest["renderTheme"] = render_theme
    manifest_path = resolved_output / "release.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    build_report["releaseManifestPath"] = manifest_path.relative_to(
        resolved_output
    ).as_posix()
    build_report["releaseManifestSha256"] = _sha256_file(manifest_path)
    (resolved_output / "build-report.json").write_text(
        json.dumps(build_report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return {
        "release_id": release_id,
        "count": len(release_forms),
        "manifest": str(manifest_path),
        "build_report": str(resolved_output / "build-report.json"),
        "spec_qa": str(resolved_output / "spec-qa.json"),
    }
