"""Validate release-bound hosting, HTTP, and browser promotion evidence."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlsplit


SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
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
    live_checked_at: str
    browser_completed_at: str
    browser_catalog_ids: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "hostingVersion": self.hosting_version,
            "rollbackHostingVersion": self.rollback_hosting_version,
            "siteOrigins": list(self.site_origins),
            "hostingEvidenceSha256": self.hosting_evidence_sha256,
            "liveReportSha256": self.live_report_sha256,
            "browserReportSha256": self.browser_report_sha256,
            "samplePlanSha256": self.sample_plan_sha256,
            "liveCheckedAt": self.live_checked_at,
            "browserCompletedAt": self.browser_completed_at,
            "browserCatalogIds": list(self.browser_catalog_ids),
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


def validate_promotion_evidence(
    *,
    hosting_evidence_path: str | Path,
    live_report_path: str | Path,
    browser_report_path: str | Path,
    release_id: str,
    source_commit: str,
    manifest_sha256: str,
) -> ValidatedPromotionEvidence:
    """Validate all evidence required before changing the active pointer."""

    hosting_path = Path(hosting_evidence_path).resolve()
    live_path = Path(live_report_path).resolve()
    browser_path = Path(browser_report_path).resolve()
    hosting = _load_json(hosting_path, "hosting evidence")
    live = _load_json(live_path, "live HTTP report")
    browser = _load_json(browser_path, "browser canary report")

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
    site_origins = _site_origins(hosting.get("siteOrigins"), "hosting evidence.siteOrigins")
    _, deployed_at = _timestamp(hosting.get("deployedAt"), "hosting evidence.deployedAt")

    if live.get("reportType") != "form-catalog-live-http" or live.get("ok") is not True:
        raise PromotionEvidenceError("live HTTP report is not successful")
    if live.get("hostingVersion") != hosting_version:
        raise PromotionEvidenceError(
            "live HTTP report hostingVersion does not match hosting evidence"
        )
    sample_plan_sha256 = _required_string(
        live,
        "samplePlanSha256",
        "live HTTP report",
    ).lower()
    if not SHA256_PATTERN.fullmatch(sample_plan_sha256):
        raise PromotionEvidenceError(
            "live HTTP report.samplePlanSha256 must be 64 hexadecimal characters"
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
    for index, result in enumerate(live_results):
        location = f"live HTTP report.results[{index}]"
        if not isinstance(result, dict) or result.get("ok") is not True:
            raise PromotionEvidenceError(f"{location} is not successful")
        catalog_id = _required_string(result, "catalogId", location)
        if catalog_id in live_by_id:
            raise PromotionEvidenceError("live HTTP report contains duplicate catalog IDs")
        _required_string(result, "slug", location)
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

    planned_browser_ids = live.get("browserCatalogIds")
    if (
        not isinstance(planned_browser_ids, list)
        or not 1 <= len(planned_browser_ids) <= 3
        or len(set(planned_browser_ids)) != len(planned_browser_ids)
        or any(item not in live_by_id for item in planned_browser_ids)
    ):
        raise PromotionEvidenceError(
            "live HTTP report browserCatalogIds must contain 1 to 3 distinct sampled IDs"
        )

    if browser.get("reportType") != "form-catalog-browser-canary":
        raise PromotionEvidenceError("browser canary report has an invalid reportType")
    if browser.get("producer") != "playwright" or browser.get("ok") is not True:
        raise PromotionEvidenceError("browser canary report must be a successful Playwright report")
    if browser.get("hostingVersion") != hosting_version:
        raise PromotionEvidenceError(
            "browser canary report hostingVersion does not match hosting evidence"
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
    browser_ids: list[str] = []
    artifact_paths: set[Path] = set()
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
        if not isinstance(artifacts, list):
            raise PromotionEvidenceError(f"{location}.artifacts must be an array")
        artifact_kinds: set[str] = set()
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
            artifact_paths.add(artifact_path)
        missing_kinds = REQUIRED_BROWSER_ARTIFACT_KINDS - artifact_kinds
        if missing_kinds:
            raise PromotionEvidenceError(
                f"{location} is missing artifacts: {', '.join(sorted(missing_kinds))}"
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
        live_checked_at=live_checked_at,
        browser_completed_at=browser_completed_at,
        browser_catalog_ids=tuple(browser_ids),
    )
