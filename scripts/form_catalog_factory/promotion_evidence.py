"""Validate release-bound hosting, HTTP, and browser promotion evidence."""

from __future__ import annotations

import hashlib
import json
import re
import struct
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote, urlsplit

from .active_mapping import (
    ActiveMappingError,
    build_active_mapping_evidence,
)
from .sampling import SamplingPlanError, build_sample_plan


SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
WORKFLOW_RUN_PATTERN = re.compile(r"^[1-9][0-9]*$")
HOSTING_VERSION_PATTERN = re.compile(
    r"^sites/[a-z0-9][a-z0-9-]{2,62}/versions/[A-Za-z0-9._-]+$"
)
REQUIRED_BROWSER_CHECKS = frozenset(
    {
        "catalogIdentity",
        "immutablePdfPath",
        "fieldOverlays",
        "fillSaveReopen",
    }
)
REQUIRED_BROWSER_ARTIFACT_KINDS = frozenset(
    {
        "catalog_page_screenshot",
        "populated_workspace_screenshot",
        "filled_pdf",
    }
)
BROWSER_CANARY_PRODUCER_VERSION = "form-catalog-browser-canary-v1"
BROWSER_AUTOMATION_LIBRARY = "@playwright/test"
BROWSER_ARTIFACT_KIND_ORDER = (
    "catalog_page_screenshot",
    "populated_workspace_screenshot",
    "filled_pdf",
)


class PromotionEvidenceError(ValueError):
    """Promotion evidence is missing, stale, or not bound to this release."""


@dataclass(frozen=True)
class ValidatedPromotionEvidence:
    """Fields recorded in the active pointer after all promotion gates pass."""

    hosting_version: str
    rollback_hosting_version: str
    site_origins: tuple[str, ...]
    hosting_evidence_sha256: str
    live_report_sha256: str
    browser_report_sha256: str
    sample_plan_sha256: str
    active_mapping_evidence_sha256: str
    active_contract_sha256: str
    form_catalog_data_sha256: str
    active_mapping_digest: str
    manifest_mapping_digest: str
    active_replacement_count: int
    current_release_replacement_count: int
    live_checked_at: str
    browser_completed_at: str
    browser_catalog_ids: tuple[str, ...]
    project_id: str
    site: str
    deployment_commit: str
    workflow_run_id: str
    workflow_run_attempt: str
    hosting_release_name: str
    deployed_at: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "hostingVersion": self.hosting_version,
            "rollbackHostingVersion": self.rollback_hosting_version,
            "siteOrigins": list(self.site_origins),
            "hostingEvidenceSha256": self.hosting_evidence_sha256,
            "liveReportSha256": self.live_report_sha256,
            "browserReportSha256": self.browser_report_sha256,
            "samplePlanSha256": self.sample_plan_sha256,
            "activeMappingEvidenceSha256": self.active_mapping_evidence_sha256,
            "activeContractSha256": self.active_contract_sha256,
            "formCatalogDataSha256": self.form_catalog_data_sha256,
            "activeMappingDigest": self.active_mapping_digest,
            "manifestMappingDigest": self.manifest_mapping_digest,
            "activeReplacementCount": self.active_replacement_count,
            "currentReleaseReplacementCount": self.current_release_replacement_count,
            "liveCheckedAt": self.live_checked_at,
            "browserCompletedAt": self.browser_completed_at,
            "browserCatalogIds": list(self.browser_catalog_ids),
            "projectId": self.project_id,
            "site": self.site,
            "deploymentCommit": self.deployment_commit,
            "workflowRunId": self.workflow_run_id,
            "workflowRunAttempt": self.workflow_run_attempt,
            "hostingReleaseName": self.hosting_release_name,
            "deployedAt": self.deployed_at,
        }


def _load_json(path: Path, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PromotionEvidenceError(f"Could not read {label} {path}: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise PromotionEvidenceError(f"{label} must be a schemaVersion 1 object")
    return payload


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _required_string(payload: dict[str, Any], key: str, label: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise PromotionEvidenceError(f"{label}.{key} must be a non-empty trimmed string")
    return value


def _require_binding(
    payload: dict[str, Any],
    *,
    label: str,
    release_id: str,
    source_commit: str,
    manifest_sha256: str,
) -> None:
    expected = {
        "releaseId": release_id,
        "sourceCommit": source_commit,
        "manifestSha256": manifest_sha256,
    }
    for key, value in expected.items():
        if payload.get(key) != value:
            raise PromotionEvidenceError(
                f"{label}.{key} does not match the validated release"
            )


def _timestamp(value: Any, location: str) -> tuple[str, datetime]:
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise PromotionEvidenceError(f"{location} must be an ISO-8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise PromotionEvidenceError(
            f"{location} must be an ISO-8601 timestamp"
        ) from exc
    if parsed.tzinfo is None:
        raise PromotionEvidenceError(f"{location} must include a timezone")
    return value, parsed


def _site_origins(value: Any, location: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not value:
        raise PromotionEvidenceError(f"{location} must be a non-empty array")
    origins: list[str] = []
    for index, raw in enumerate(value):
        if not isinstance(raw, str) or raw != raw.strip():
            raise PromotionEvidenceError(f"{location}[{index}] must be a trimmed URL")
        parsed = urlsplit(raw)
        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            raise PromotionEvidenceError(
                f"{location}[{index}] must be an HTTPS origin without a path"
            )
        normalized = raw.rstrip("/")
        if normalized in origins:
            raise PromotionEvidenceError(f"{location} contains a duplicate origin")
        origins.append(normalized)
    return tuple(origins)


def _asset_bases(value: Any, location: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not value:
        raise PromotionEvidenceError(f"{location} must be a non-empty array")
    bases: list[str] = []
    for index, raw in enumerate(value):
        if not isinstance(raw, str) or raw != raw.strip():
            raise PromotionEvidenceError(f"{location}[{index}] must be a trimmed URL")
        parsed = urlsplit(raw)
        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or parsed.query
            or parsed.fragment
        ):
            raise PromotionEvidenceError(
                f"{location}[{index}] must be an HTTPS URL without query or fragment"
            )
        normalized = raw.rstrip("/")
        if normalized in bases:
            raise PromotionEvidenceError(f"{location} contains a duplicate URL")
        bases.append(normalized)
    return tuple(bases)


def _validate_successful_checks(
    checks: Any,
    *,
    location: str,
    required_keys: set[str] | frozenset[str],
) -> None:
    if not isinstance(checks, dict):
        raise PromotionEvidenceError(f"{location} must be an object")
    missing = required_keys - checks.keys()
    if missing:
        raise PromotionEvidenceError(
            f"{location} is missing checks: {', '.join(sorted(missing))}"
        )
    failed = sorted(key for key in required_keys if checks.get(key) is not True)
    if failed:
        raise PromotionEvidenceError(
            f"{location} has failed checks: {', '.join(failed)}"
        )


def _validate_artifact(
    raw: Any,
    *,
    report_dir: Path,
    location: str,
) -> tuple[str, Path]:
    if not isinstance(raw, dict):
        raise PromotionEvidenceError(f"{location} must be an object")
    kind = _required_string(raw, "kind", location)
    relative = _required_string(raw, "path", location)
    path = PurePosixPath(relative)
    if path.is_absolute() or "." in path.parts or ".." in path.parts or str(path) != relative:
        raise PromotionEvidenceError(f"{location}.path must be normalized and relative")
    if any(part in {"", "/"} for part in path.parts):
        raise PromotionEvidenceError(f"{location}.path has an empty segment")
    sha256 = _required_string(raw, "sha256", location).lower()
    if not SHA256_PATTERN.fullmatch(sha256):
        raise PromotionEvidenceError(f"{location}.sha256 must be 64 hexadecimal characters")
    byte_count = raw.get("bytes")
    if not isinstance(byte_count, int) or isinstance(byte_count, bool) or byte_count <= 0:
        raise PromotionEvidenceError(f"{location}.bytes must be a positive integer")

    artifact_path = (report_dir / Path(*path.parts)).resolve()
    try:
        artifact_path.relative_to(report_dir)
    except ValueError as exc:
        raise PromotionEvidenceError(f"{location}.path escapes the report directory") from exc
    if not artifact_path.is_file():
        raise PromotionEvidenceError(f"{location}.path does not exist: {artifact_path}")
    if artifact_path.stat().st_size != byte_count:
        raise PromotionEvidenceError(f"{location}.bytes does not match the artifact")
    if _sha256_file(artifact_path) != sha256:
        raise PromotionEvidenceError(f"{location}.sha256 does not match the artifact")

    with artifact_path.open("rb") as source:
        header = source.read(12)
    if kind in {"catalog_page_screenshot", "populated_workspace_screenshot"}:
        if not header.startswith(b"\x89PNG\r\n\x1a\n"):
            raise PromotionEvidenceError(f"{location} screenshot is not a PNG")
    elif kind == "filled_pdf":
        if not header.startswith(b"%PDF-"):
            raise PromotionEvidenceError(f"{location} filled artifact is not a PDF")
    else:
        raise PromotionEvidenceError(f"{location}.kind is unsupported: {kind}")
    return kind, artifact_path


def _required_object(value: Any, location: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise PromotionEvidenceError(f"{location} must be an object")
    return value


def _positive_int(value: Any, location: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise PromotionEvidenceError(f"{location} must be a positive integer")
    return value


def _nonnegative_int(value: Any, location: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise PromotionEvidenceError(f"{location} must be a non-negative integer")
    return value


def _require_site_url(
    value: Any,
    *,
    site_origin: str,
    path: str,
    location: str,
) -> str:
    raw = _required_string({"value": value}, "value", location)
    parsed = urlsplit(raw)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if (
        origin != site_origin
        or unquote(parsed.path) != path
        or parsed.query
        or parsed.fragment
        or parsed.username
        or parsed.password
    ):
        raise PromotionEvidenceError(
            f"{location} must be the exact deployed site URL {site_origin}{path}"
        )
    return raw


def _require_asset_url(
    value: Any,
    *,
    asset_base_url: str,
    object_path: str,
    location: str,
) -> str:
    raw = _required_string({"value": value}, "value", location)
    actual = urlsplit(raw)
    base = urlsplit(asset_base_url)
    expected_path = (
        f"{base.path.rstrip('/')}/{str(object_path).lstrip('/')}"
    )
    if (
        actual.scheme != base.scheme
        or actual.netloc != base.netloc
        or unquote(actual.path) != unquote(expected_path)
        or actual.query
        or actual.fragment
        or actual.username
        or actual.password
    ):
        raise PromotionEvidenceError(
            f"{location} does not use the exact immutable asset URL"
        )
    return raw


def _png_dimensions(path: Path, location: str) -> tuple[int, int]:
    with path.open("rb") as source:
        header = source.read(24)
    if (
        len(header) < 24
        or not header.startswith(b"\x89PNG\r\n\x1a\n")
        or header[12:16] != b"IHDR"
    ):
        raise PromotionEvidenceError(f"{location} is not a decodable PNG header")
    width, height = struct.unpack(">II", header[16:24])
    if width < 800 or height < 600:
        raise PromotionEvidenceError(
            f"{location} must be at least 800 by 600 pixels"
        )
    return width, height


def _pdf_value(value: Any) -> str:
    if value is None:
        return ""
    normalized = str(value)
    return normalized[1:] if normalized.startswith("/") else normalized


def _pdf_checkbox_checked(value: Any) -> bool:
    return _pdf_value(value).strip().lower() not in {
        "",
        "0",
        "false",
        "none",
        "off",
    }


def _validate_browser_machine_result(
    result: dict[str, Any],
    *,
    sample: dict[str, Any],
    site_origin: str,
    asset_base_url: str,
    filled_pdf_path: Path,
    location: str,
) -> None:
    """Cross-check browser claims and independently reopen its filled PDF."""

    for key in ("catalogId", "slug", "sourceSection", "filename"):
        if result.get(key) != sample.get(key):
            raise PromotionEvidenceError(
                f"{location}.{key} does not match the deterministic sample"
            )
    observations = _required_object(
        result.get("observations"),
        f"{location}.observations",
    )
    catalog = _required_object(
        observations.get("catalogPage"),
        f"{location}.observations.catalogPage",
    )
    expected_catalog_path = f"/forms/{sample['slug']}"
    _require_site_url(
        catalog.get("url"),
        site_origin=site_origin,
        path=expected_catalog_path,
        location=f"{location}.observations.catalogPage.url",
    )
    _require_site_url(
        catalog.get("finalUrl"),
        site_origin=site_origin,
        path=expected_catalog_path,
        location=f"{location}.observations.catalogPage.finalUrl",
    )
    heading = _required_string(
        catalog,
        "heading",
        f"{location}.observations.catalogPage",
    )
    document_title = _required_string(
        catalog,
        "documentTitle",
        f"{location}.observations.catalogPage",
    )
    if heading not in document_title:
        raise PromotionEvidenceError(
            f"{location}.observations.catalogPage document title does not "
            "contain its visible heading"
        )
    expected_catalog_values = {
        "sourceSection": sample["sourceSection"],
        "filename": sample["filename"],
        "sha256": sample["sha256"],
        "immutablePdfPath": sample["pdfPath"],
        "pageCount": sample["pageCount"],
        "thumbnailPath": sample["thumbnailPath"],
        "sourceResponseStatus": 200,
    }
    for key, expected in expected_catalog_values.items():
        if catalog.get(key) != expected:
            raise PromotionEvidenceError(
                f"{location}.observations.catalogPage.{key} does not match "
                "the deterministic sample"
            )
    _require_asset_url(
        catalog.get("pdfUrl"),
        asset_base_url=asset_base_url,
        object_path=sample["pdfPath"],
        location=f"{location}.observations.catalogPage.pdfUrl",
    )
    _require_asset_url(
        catalog.get("thumbnailUrl"),
        asset_base_url=asset_base_url,
        object_path=sample["thumbnailPath"],
        location=f"{location}.observations.catalogPage.thumbnailUrl",
    )
    for key in (
        "thumbnailNaturalWidth",
        "thumbnailNaturalHeight",
        "previewCanvasWidth",
        "previewCanvasHeight",
    ):
        _positive_int(
            catalog.get(key),
            f"{location}.observations.catalogPage.{key}",
        )

    workspace = _required_object(
        observations.get("workspace"),
        f"{location}.observations.workspace",
    )
    _require_site_url(
        workspace.get("url"),
        site_origin=site_origin,
        path="/ui",
        location=f"{location}.observations.workspace.url",
    )
    if (
        workspace.get("immutablePdfPath") != sample["pdfPath"]
        or workspace.get("sourceResponseStatus") != 200
    ):
        raise PromotionEvidenceError(
            f"{location}.observations.workspace does not bind the immutable PDF"
        )
    _require_asset_url(
        workspace.get("sourceResponseUrl"),
        asset_base_url=asset_base_url,
        object_path=sample["pdfPath"],
        location=f"{location}.observations.workspace.sourceResponseUrl",
    )
    for key in (
        "fieldRowCount",
        "textFieldCount",
        "checkboxFieldCount",
        "fieldOverlayCount",
    ):
        _positive_int(
            workspace.get(key),
            f"{location}.observations.workspace.{key}",
        )
    if _nonnegative_int(
        workspace.get("errorAlertCount"),
        f"{location}.observations.workspace.errorAlertCount",
    ) != 0:
        raise PromotionEvidenceError(
            f"{location}.observations.workspace contains an error alert"
        )

    fill = _required_object(
        observations.get("fill"),
        f"{location}.observations.fill",
    )
    text_fill = _required_object(
        fill.get("text"),
        f"{location}.observations.fill.text",
    )
    checkbox_fill = _required_object(
        fill.get("checkbox"),
        f"{location}.observations.fill.checkbox",
    )
    text_field = _required_string(
        text_fill,
        "fieldName",
        f"{location}.observations.fill.text",
    )
    expected_text = _required_string(
        text_fill,
        "expectedValue",
        f"{location}.observations.fill.text",
    )
    if text_fill.get("observedValue") != expected_text:
        raise PromotionEvidenceError(
            f"{location}.observations.fill.text was not observed at its "
            "expected value"
        )
    checkbox_field = _required_string(
        checkbox_fill,
        "fieldName",
        f"{location}.observations.fill.checkbox",
    )
    if (
        checkbox_fill.get("expectedChecked") is not True
        or checkbox_fill.get("observedChecked") is not True
    ):
        raise PromotionEvidenceError(
            f"{location}.observations.fill.checkbox is not checked"
        )
    if text_field == checkbox_field:
        raise PromotionEvidenceError(
            f"{location}.observations.fill must use distinct text and checkbox fields"
        )

    download = _required_object(
        observations.get("download"),
        f"{location}.observations.download",
    )
    if download.get("exportMode") != "editable":
        raise PromotionEvidenceError(
            f"{location}.observations.download must use editable export"
        )
    suggested_filename = _required_string(
        download,
        "suggestedFilename",
        f"{location}.observations.download",
    )
    if not suggested_filename.lower().endswith(".pdf"):
        raise PromotionEvidenceError(
            f"{location}.observations.download.suggestedFilename must end in .pdf"
        )

    reopen = _required_object(
        observations.get("reopen"),
        f"{location}.observations.reopen",
    )
    browser_reopen = _required_object(
        reopen.get("browser"),
        f"{location}.observations.reopen.browser",
    )
    _require_site_url(
        browser_reopen.get("workspaceUrl"),
        site_origin=site_origin,
        path="/ui",
        location=f"{location}.observations.reopen.browser.workspaceUrl",
    )
    expected_browser_reopen = {
        "textFieldName": text_field,
        "textValue": expected_text,
        "checkboxFieldName": checkbox_field,
        "checkboxChecked": True,
        "errorAlertCount": 0,
    }
    for key, expected in expected_browser_reopen.items():
        if browser_reopen.get(key) != expected:
            raise PromotionEvidenceError(
                f"{location}.observations.reopen.browser.{key} does not "
                "confirm the representative fill"
            )

    pdf_reopen = _required_object(
        reopen.get("pdf"),
        f"{location}.observations.reopen.pdf",
    )
    if pdf_reopen.get("parser") != "pypdf":
        raise PromotionEvidenceError(
            f"{location}.observations.reopen.pdf must use pypdf"
        )
    recorded_sha256 = _required_string(
        pdf_reopen,
        "sha256",
        f"{location}.observations.reopen.pdf",
    ).lower()
    if (
        not SHA256_PATTERN.fullmatch(recorded_sha256)
        or recorded_sha256 != _sha256_file(filled_pdf_path)
        or pdf_reopen.get("bytes") != filled_pdf_path.stat().st_size
        or pdf_reopen.get("pageCount") != sample["pageCount"]
        or pdf_reopen.get("fieldCount") != sample["fieldCount"]
    ):
        raise PromotionEvidenceError(
            f"{location}.observations.reopen.pdf does not match the filled artifact"
        )
    recorded_text = _required_object(
        pdf_reopen.get("text"),
        f"{location}.observations.reopen.pdf.text",
    )
    if recorded_text != {
        "fieldName": text_field,
        "expectedValue": expected_text,
        "actualValue": expected_text,
        "matched": True,
    }:
        raise PromotionEvidenceError(
            f"{location}.observations.reopen.pdf.text does not confirm the exact value"
        )
    recorded_checkbox = _required_object(
        pdf_reopen.get("checkbox"),
        f"{location}.observations.reopen.pdf.checkbox",
    )
    if (
        recorded_checkbox.get("fieldName") != checkbox_field
        or recorded_checkbox.get("expectedChecked") is not True
        or recorded_checkbox.get("checked") is not True
        or not _pdf_checkbox_checked(recorded_checkbox.get("actualValue"))
    ):
        raise PromotionEvidenceError(
            f"{location}.observations.reopen.pdf.checkbox is not checked"
        )

    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise PromotionEvidenceError(
            f"{location} filled-PDF verification requires pypdf"
        ) from exc
    try:
        reader = PdfReader(filled_pdf_path, strict=False)
        fields = reader.get_fields() or {}
    except Exception as exc:
        raise PromotionEvidenceError(
            f"{location} filled PDF could not be independently reopened: {exc}"
        ) from exc
    if len(reader.pages) != sample["pageCount"] or len(fields) != sample["fieldCount"]:
        raise PromotionEvidenceError(
            f"{location} filled PDF page or field count differs from the sample"
        )
    if text_field not in fields or _pdf_value(fields[text_field].get("/V")) != expected_text:
        raise PromotionEvidenceError(
            f"{location} filled PDF does not contain the expected text value"
        )
    if (
        checkbox_field not in fields
        or not _pdf_checkbox_checked(fields[checkbox_field].get("/V"))
    ):
        raise PromotionEvidenceError(
            f"{location} filled PDF does not contain the checked checkbox value"
        )


def validate_promotion_evidence(
    *,
    hosting_evidence_path: str | Path,
    active_mapping_evidence_path: str | Path,
    active_release_path: str | Path,
    form_catalog_data_path: str | Path,
    live_report_path: str | Path,
    browser_report_path: str | Path,
    sample_plan_path: str | Path,
    selection_path: str | Path,
    build_report_path: str | Path,
    manifest_path: str | Path,
    release_id: str,
    source_commit: str,
    manifest_sha256: str,
    expected_selection_digest: str,
    expected_build_report_sha256: str,
    expected_project_id: str,
    expected_site: str,
    required_site_origins: tuple[str, ...],
    required_asset_base_urls: tuple[str, ...],
    expected_deployment_commit: str,
    expected_workflow_run_id: str,
    expected_workflow_run_attempt: str,
    require_committed_mapping: bool = False,
) -> ValidatedPromotionEvidence:
    """Validate all evidence required before changing the active pointer."""

    hosting_path = Path(hosting_evidence_path).resolve()
    live_path = Path(live_report_path).resolve()
    browser_path = Path(browser_report_path).resolve()
    active_mapping_path = Path(active_mapping_evidence_path).resolve()
    hosting = _load_json(hosting_path, "hosting evidence")
    active_mapping = _load_json(
        active_mapping_path,
        "active mapping evidence",
    )
    live = _load_json(live_path, "live HTTP report")
    browser = _load_json(browser_path, "browser canary report")
    sample_plan_path = Path(sample_plan_path).resolve()
    sample_plan = _load_json(sample_plan_path, "sample plan")
    try:
        expected_sample_plan = build_sample_plan(
            selection_path=selection_path,
            build_report_path=build_report_path,
            manifest_path=manifest_path,
            random_count=10,
        )
    except SamplingPlanError as exc:
        raise PromotionEvidenceError(
            f"Could not recompute the deterministic sample plan: {exc}"
        ) from exc
    if sample_plan != expected_sample_plan:
        raise PromotionEvidenceError(
            "sample plan does not exactly match the deterministic 10-random "
            "plus required-canary plan"
        )
    if sample_plan.get("selectionDigest") != expected_selection_digest:
        raise PromotionEvidenceError(
            "sample plan selectionDigest does not match the frozen ledger"
        )
    if sample_plan.get("buildReportSha256") != expected_build_report_sha256:
        raise PromotionEvidenceError(
            "sample plan buildReportSha256 does not match the frozen ledger"
        )
    sample_plan_sha256 = _sha256_file(sample_plan_path)

    repository_root = Path(__file__).resolve().parents[2]
    canonical_active_path = (
        repository_root / "form_catalog_releases" / "active.json"
    ).resolve()
    canonical_data_path = (
        repository_root / "frontend" / "src" / "config" / "formCatalogData.mjs"
    ).resolve()
    canonical_inputs = (
        Path(active_release_path).resolve() == canonical_active_path
        and Path(form_catalog_data_path).resolve() == canonical_data_path
    )
    require_git_head = canonical_inputs or require_committed_mapping
    try:
        expected_active_mapping = build_active_mapping_evidence(
            active_release_path=active_release_path,
            form_catalog_data_path=form_catalog_data_path,
            manifest_path=manifest_path,
            repo_root=repository_root,
            require_git_head=require_git_head,
            git_active_reference_path=(
                canonical_active_path
                if require_committed_mapping and not canonical_inputs
                else None
            ),
            git_data_reference_path=(
                canonical_data_path
                if require_committed_mapping and not canonical_inputs
                else None
            ),
            expected_git_commit=(
                expected_deployment_commit
                if require_committed_mapping
                else None
            ),
        )
    except ActiveMappingError as exc:
        raise PromotionEvidenceError(
            f"Could not recompute the committed active mapping: {exc}"
        ) from exc
    if not require_git_head:
        # Unit/integration fixtures live outside the repository. Production
        # promotion is pinned by the shell entrypoint to the two canonical
        # tracked paths and therefore always takes the Git-verified branch.
        expected_active_mapping["gitCommit"] = expected_deployment_commit
    if active_mapping != expected_active_mapping:
        raise PromotionEvidenceError(
            "active mapping evidence does not exactly match a fresh committed "
            "mapping verification"
        )
    active_mapping_evidence_sha256 = _sha256_file(active_mapping_path)

    for payload, label in (
        (hosting, "hosting evidence"),
        (live, "live HTTP report"),
        (browser, "browser canary report"),
    ):
        _require_binding(
            payload,
            label=label,
            release_id=release_id,
            source_commit=source_commit,
            manifest_sha256=manifest_sha256,
        )

    if hosting.get("reportType") != "form-catalog-hosting-deployment":
        raise PromotionEvidenceError("hosting evidence has an invalid reportType")
    if hosting.get("producer") != "controlled-deploy":
        raise PromotionEvidenceError("hosting evidence must be produced by controlled-deploy")
    if hosting.get("environment") != "production" or hosting.get("ok") is not True:
        raise PromotionEvidenceError("hosting evidence must record a successful production deploy")
    if hosting.get("projectId") != expected_project_id:
        raise PromotionEvidenceError(
            "hosting evidence.projectId does not match the production project"
        )
    if hosting.get("site") != expected_site:
        raise PromotionEvidenceError(
            "hosting evidence.site does not match the production Hosting site"
        )
    mapping_fields = (
        "activeContractSha256",
        "formCatalogDataSha256",
        "releaseManifestSha256",
        "activeMappingDigest",
        "manifestMappingDigest",
        "activeReplacementCount",
        "currentReleaseReplacementCount",
    )
    for field in mapping_fields:
        if hosting.get(field) != active_mapping.get(field):
            raise PromotionEvidenceError(
                f"hosting evidence.{field} does not match active mapping evidence"
            )
    if hosting.get("mappingGitCommit") != active_mapping.get("gitCommit"):
        raise PromotionEvidenceError(
            "hosting evidence.mappingGitCommit does not match active mapping evidence"
        )
    if hosting.get("activeMappingEvidenceSha256") != active_mapping_evidence_sha256:
        raise PromotionEvidenceError(
            "hosting evidence.activeMappingEvidenceSha256 does not match the "
            "supplied active mapping evidence"
        )
    deployment_commit = _required_string(
        hosting,
        "deploymentCommit",
        "hosting evidence",
    ).lower()
    if (
        not COMMIT_PATTERN.fullmatch(deployment_commit)
        or deployment_commit != expected_deployment_commit
    ):
        raise PromotionEvidenceError(
            "hosting evidence.deploymentCommit does not match the expected deploy commit"
        )
    if active_mapping.get("gitCommit") != deployment_commit:
        raise PromotionEvidenceError(
            "active mapping Git commit does not match the Hosting deployment commit"
        )
    workflow_run_id = _required_string(
        hosting,
        "workflowRunId",
        "hosting evidence",
    )
    workflow_run_attempt = _required_string(
        hosting,
        "workflowRunAttempt",
        "hosting evidence",
    )
    if (
        not WORKFLOW_RUN_PATTERN.fullmatch(workflow_run_id)
        or workflow_run_id != expected_workflow_run_id
        or not WORKFLOW_RUN_PATTERN.fullmatch(workflow_run_attempt)
        or workflow_run_attempt != expected_workflow_run_attempt
    ):
        raise PromotionEvidenceError(
            "hosting evidence workflow run identity does not match the expected "
            "controlled deploy"
        )
    hosting_release_name = _required_string(
        hosting,
        "hostingReleaseName",
        "hosting evidence",
    )
    expected_release_fragment = f"/sites/{expected_site}/channels/live/releases/"
    if (
        expected_release_fragment not in f"/{hosting_release_name.lstrip('/')}"
        or not hosting_release_name.rsplit("/", 1)[-1]
    ):
        raise PromotionEvidenceError(
            "hosting evidence.hostingReleaseName does not belong to the production "
            "live channel"
        )
    hosting_version = _required_string(hosting, "hostingVersion", "hosting evidence")
    rollback_version = _required_string(
        hosting,
        "rollbackHostingVersion",
        "hosting evidence",
    )
    if (
        not HOSTING_VERSION_PATTERN.fullmatch(hosting_version)
        or not HOSTING_VERSION_PATTERN.fullmatch(rollback_version)
    ):
        raise PromotionEvidenceError(
            "hosting evidence versions must be exact Firebase Hosting resource names"
        )
    if hosting_version == rollback_version:
        raise PromotionEvidenceError(
            "hostingVersion and rollbackHostingVersion must be different"
        )
    expected_version_prefix = f"sites/{expected_site}/versions/"
    if (
        not hosting_version.startswith(expected_version_prefix)
        or not rollback_version.startswith(expected_version_prefix)
    ):
        raise PromotionEvidenceError(
            "hosting evidence versions do not belong to the production Hosting site"
        )
    site_origins = _site_origins(hosting.get("siteOrigins"), "hosting evidence.siteOrigins")
    if site_origins != required_site_origins:
        raise PromotionEvidenceError(
            "hosting evidence.siteOrigins do not exactly match the required "
            "production origins"
        )
    deployed_at_value, deployed_at = _timestamp(
        hosting.get("deployedAt"),
        "hosting evidence.deployedAt",
    )

    if live.get("reportType") != "form-catalog-live-http" or live.get("ok") is not True:
        raise PromotionEvidenceError("live HTTP report is not successful")
    if live.get("hostingVersion") != hosting_version:
        raise PromotionEvidenceError(
            "live HTTP report hostingVersion does not match hosting evidence"
        )
    reported_sample_plan_sha256 = _required_string(
        live,
        "samplePlanSha256",
        "live HTTP report",
    ).lower()
    if not SHA256_PATTERN.fullmatch(reported_sample_plan_sha256):
        raise PromotionEvidenceError(
            "live HTTP report.samplePlanSha256 must be 64 hexadecimal characters"
        )
    if reported_sample_plan_sha256 != sample_plan_sha256:
        raise PromotionEvidenceError(
            "live HTTP report.samplePlanSha256 does not match the supplied sample plan"
        )
    live_origins = _site_origins(live.get("siteOrigins"), "live HTTP report.siteOrigins")
    if live_origins != site_origins:
        raise PromotionEvidenceError(
            "live HTTP report siteOrigins do not exactly match hosting evidence"
        )
    asset_bases = _asset_bases(
        live.get("assetBaseUrls"),
        "live HTTP report.assetBaseUrls",
    )
    if asset_bases != required_asset_base_urls:
        raise PromotionEvidenceError(
            "live HTTP report.assetBaseUrls do not exactly match the production "
            "catalog asset origin"
        )
    site_hosts = {urlsplit(origin).netloc for origin in site_origins}
    for base in asset_bases:
        parsed = urlsplit(base)
        if parsed.netloc in site_hosts:
            raise PromotionEvidenceError(
                "live HTTP asset bases must be distinct supported asset origins; "
                "a site-origin proxy requires an explicit implementation"
            )
    live_checked_at, live_checked = _timestamp(
        live.get("checkedAt"),
        "live HTTP report.checkedAt",
    )
    if live_checked < deployed_at:
        raise PromotionEvidenceError("live HTTP checks predate the hosting deployment")
    live_results = live.get("results")
    if (
        not isinstance(live_results, list)
        or not live_results
        or live.get("sampleCount") != len(live_results)
    ):
        raise PromotionEvidenceError("live HTTP report has an invalid result count")
    live_by_id: dict[str, dict[str, Any]] = {}
    expected_samples = sample_plan["samples"]
    expected_sample_ids = [
        str(sample["catalogId"])
        for sample in expected_samples
    ]
    actual_sample_ids = [
        str(result.get("catalogId"))
        for result in live_results
        if isinstance(result, dict)
    ]
    if actual_sample_ids != expected_sample_ids:
        raise PromotionEvidenceError(
            "live HTTP results do not exactly match the deterministic sample plan in order"
        )
    for index, result in enumerate(live_results):
        location = f"live HTTP report.results[{index}]"
        if not isinstance(result, dict) or result.get("ok") is not True:
            raise PromotionEvidenceError(f"{location} is not successful")
        catalog_id = _required_string(result, "catalogId", location)
        if catalog_id in live_by_id:
            raise PromotionEvidenceError("live HTTP report contains duplicate catalog IDs")
        _required_string(result, "slug", location)
        expected_sample = expected_samples[index]
        if (
            result.get("slug") != expected_sample.get("slug")
            or result.get("random") is not bool(expected_sample.get("random"))
            or result.get("canaryRoles") != expected_sample.get("canaryRoles")
            or result.get("browserCanary")
            is not bool(expected_sample.get("browserCanary"))
        ):
            raise PromotionEvidenceError(
                f"{location} does not match the deterministic sample metadata"
            )
        expected_collections = (
            ("catalogPages", "origin", site_origins),
            ("pdfAssets", "assetBase", asset_bases),
            ("thumbnailAssets", "assetBase", asset_bases),
        )
        for collection_key, identity_key, expected_identities in expected_collections:
            checks = result.get(collection_key)
            if (
                not isinstance(checks, list)
                or len(checks) != len(expected_identities)
            ):
                raise PromotionEvidenceError(
                    f"{location}.{collection_key} must exactly cover configured origins"
                )
            if any(not isinstance(check, dict) or check.get("ok") is not True for check in checks):
                raise PromotionEvidenceError(f"{location}.{collection_key} contains a failed check")
            actual_identities = tuple(check.get(identity_key) for check in checks)
            if actual_identities != expected_identities:
                raise PromotionEvidenceError(
                    f"{location}.{collection_key} does not exactly match configured origins"
                )
        live_by_id[catalog_id] = result

    planned_browser_ids = sample_plan.get("browserCatalogIds")
    if (
        not isinstance(planned_browser_ids, list)
        or not 1 <= len(planned_browser_ids) <= 3
        or len(set(planned_browser_ids)) != len(planned_browser_ids)
        or any(item not in live_by_id for item in planned_browser_ids)
    ):
        raise PromotionEvidenceError(
            "live HTTP report browserCatalogIds must contain 1 to 3 distinct sampled IDs"
        )
    if live.get("browserCatalogIds") != planned_browser_ids:
        raise PromotionEvidenceError(
            "live HTTP report browserCatalogIds do not match the deterministic sample plan"
        )

    if browser.get("reportType") != "form-catalog-browser-canary":
        raise PromotionEvidenceError("browser canary report has an invalid reportType")
    if browser.get("producer") != "playwright" or browser.get("ok") is not True:
        raise PromotionEvidenceError("browser canary report must be a successful Playwright report")
    if browser.get("producerVersion") != BROWSER_CANARY_PRODUCER_VERSION:
        raise PromotionEvidenceError(
            "browser canary report must come from the checked-in machine producer"
        )
    if browser.get("hostingEvidenceSha256") != _sha256_file(hosting_path):
        raise PromotionEvidenceError(
            "browser canary report hostingEvidenceSha256 does not match the "
            "controlled-deploy receipt"
        )
    if browser.get("hostingVersion") != hosting_version:
        raise PromotionEvidenceError(
            "browser canary report hostingVersion does not match hosting evidence"
        )
    if browser.get("hostingDeployedAt") != deployed_at_value:
        raise PromotionEvidenceError(
            "browser canary report hostingDeployedAt does not match hosting evidence"
        )
    if browser.get("samplePlanSha256") != sample_plan_sha256:
        raise PromotionEvidenceError(
            "browser canary report samplePlanSha256 does not match the live report"
        )
    browser_origin = _required_string(browser, "siteOrigin", "browser canary report").rstrip("/")
    if browser_origin not in site_origins:
        raise PromotionEvidenceError(
            "browser canary report siteOrigin is not in the deployed site origins"
        )
    browser_asset_base = _required_string(
        browser,
        "assetBaseUrl",
        "browser canary report",
    ).rstrip("/")
    if browser_asset_base not in asset_bases:
        raise PromotionEvidenceError(
            "browser canary report assetBaseUrl is not in the validated live "
            "asset origins"
        )
    automation = _required_object(
        browser.get("automation"),
        "browser canary report.automation",
    )
    if (
        automation.get("library") != BROWSER_AUTOMATION_LIBRARY
        or automation.get("browser") != "chromium"
        or not isinstance(automation.get("headless"), bool)
    ):
        raise PromotionEvidenceError(
            "browser canary report automation identity is invalid"
        )
    for key in ("libraryVersion", "browserVersion"):
        _required_string(
            automation,
            key,
            "browser canary report.automation",
        )
    viewport = _required_object(
        automation.get("viewport"),
        "browser canary report.automation.viewport",
    )
    if (
        _positive_int(
            viewport.get("width"),
            "browser canary report.automation.viewport.width",
        )
        < 800
        or _positive_int(
            viewport.get("height"),
            "browser canary report.automation.viewport.height",
        )
        < 600
    ):
        raise PromotionEvidenceError(
            "browser canary viewport must be at least 800 by 600"
        )
    _, browser_started = _timestamp(
        browser.get("startedAt"),
        "browser canary report.startedAt",
    )
    browser_completed_at, browser_completed = _timestamp(
        browser.get("completedAt"),
        "browser canary report.completedAt",
    )
    if browser_started < deployed_at or browser_completed < browser_started:
        raise PromotionEvidenceError(
            "browser canary timestamps do not follow the hosting deployment"
        )
    browser_results = browser.get("results")
    if not isinstance(browser_results, list) or not browser_results:
        raise PromotionEvidenceError("browser canary report results must be non-empty")
    if browser.get("resultCount") != len(browser_results):
        raise PromotionEvidenceError(
            "browser canary report resultCount does not match results"
        )
    browser_ids: list[str] = []
    artifact_paths: set[Path] = set()
    sample_by_id = {
        str(sample["catalogId"]): sample
        for sample in expected_samples
    }
    for index, result in enumerate(browser_results):
        location = f"browser canary report.results[{index}]"
        if not isinstance(result, dict) or result.get("ok") is not True:
            raise PromotionEvidenceError(f"{location} is not successful")
        catalog_id = _required_string(result, "catalogId", location)
        browser_ids.append(catalog_id)
        live_result = live_by_id.get(catalog_id)
        if live_result is None:
            raise PromotionEvidenceError(f"{location} is not in the live sample")
        if result.get("slug") != live_result.get("slug"):
            raise PromotionEvidenceError(f"{location}.slug does not match the live sample")
        _validate_successful_checks(
            result.get("checks"),
            location=f"{location}.checks",
            required_keys=REQUIRED_BROWSER_CHECKS,
        )
        artifacts = result.get("artifacts")
        if not isinstance(artifacts, list) or len(artifacts) != 3:
            raise PromotionEvidenceError(
                f"{location} is missing artifacts; the machine producer must "
                "emit exactly three"
            )
        artifact_kinds: set[str] = set()
        artifact_by_kind: dict[str, Path] = {}
        artifact_kind_order: list[str] = []
        for artifact_index, artifact in enumerate(artifacts):
            kind, artifact_path = _validate_artifact(
                artifact,
                report_dir=browser_path.parent,
                location=f"{location}.artifacts[{artifact_index}]",
            )
            if kind in artifact_kinds:
                raise PromotionEvidenceError(f"{location} contains duplicate artifact kinds")
            if artifact_path in artifact_paths:
                raise PromotionEvidenceError("browser reports reuse an artifact path")
            artifact_kinds.add(kind)
            artifact_by_kind[kind] = artifact_path
            artifact_kind_order.append(kind)
            artifact_paths.add(artifact_path)
        missing_kinds = REQUIRED_BROWSER_ARTIFACT_KINDS - artifact_kinds
        if missing_kinds:
            raise PromotionEvidenceError(
                f"{location} is missing artifacts: {', '.join(sorted(missing_kinds))}"
            )
        if tuple(artifact_kind_order) != BROWSER_ARTIFACT_KIND_ORDER:
            raise PromotionEvidenceError(
                f"{location}.artifacts are not in the machine-producer order"
            )
        _png_dimensions(
            artifact_by_kind["catalog_page_screenshot"],
            f"{location} catalog-page screenshot",
        )
        _png_dimensions(
            artifact_by_kind["populated_workspace_screenshot"],
            f"{location} populated-workspace screenshot",
        )
        expected_sample = sample_by_id.get(catalog_id)
        if expected_sample is None:
            raise PromotionEvidenceError(
                f"{location} is not in the deterministic sample plan"
            )
        _validate_browser_machine_result(
            result,
            sample=expected_sample,
            site_origin=browser_origin,
            asset_base_url=browser_asset_base,
            filled_pdf_path=artifact_by_kind["filled_pdf"],
            location=location,
        )
    if browser_ids != planned_browser_ids:
        raise PromotionEvidenceError(
            "browser canary results must exactly match browserCatalogIds in order"
        )

    return ValidatedPromotionEvidence(
        hosting_version=hosting_version,
        rollback_hosting_version=rollback_version,
        site_origins=site_origins,
        hosting_evidence_sha256=_sha256_file(hosting_path),
        live_report_sha256=_sha256_file(live_path),
        browser_report_sha256=_sha256_file(browser_path),
        sample_plan_sha256=sample_plan_sha256,
        active_mapping_evidence_sha256=active_mapping_evidence_sha256,
        active_contract_sha256=active_mapping["activeContractSha256"],
        form_catalog_data_sha256=active_mapping["formCatalogDataSha256"],
        active_mapping_digest=active_mapping["activeMappingDigest"],
        manifest_mapping_digest=active_mapping["manifestMappingDigest"],
        active_replacement_count=active_mapping["activeReplacementCount"],
        current_release_replacement_count=active_mapping[
            "currentReleaseReplacementCount"
        ],
        live_checked_at=live_checked_at,
        browser_completed_at=browser_completed_at,
        browser_catalog_ids=tuple(browser_ids),
        project_id=expected_project_id,
        site=expected_site,
        deployment_commit=deployment_commit,
        workflow_run_id=workflow_run_id,
        workflow_run_attempt=workflow_run_attempt,
        hosting_release_name=hosting_release_name,
        deployed_at=deployed_at_value,
    )
