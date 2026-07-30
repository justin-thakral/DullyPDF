"""Capture Firebase Hosting state and emit release-bound deployment evidence."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


HOSTING_SITE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{2,62}$")
PROJECT_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]{4,61}[a-z0-9]$")
SOURCE_COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
HOSTING_VERSION_PATTERN = re.compile(
    r"^(?:projects/[^/]+/)?sites/"
    r"(?P<site>[a-z0-9][a-z0-9-]{2,62})/"
    r"versions/(?P<version>[A-Za-z0-9._-]+)$"
)


class HostingEvidenceError(RuntimeError):
    """Firebase Hosting state or deploy output cannot prove a release."""


@dataclass(frozen=True)
class HostingRelease:
    """The exact version currently released to a Hosting live channel."""

    hosting_version: str
    release_time: str
    release_name: str


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _load_json(path: str | Path, label: str) -> dict[str, Any]:
    source = Path(path)
    try:
        payload = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HostingEvidenceError(f"Could not read {label} {source}: {exc}") from exc
    if not isinstance(payload, dict):
        raise HostingEvidenceError(f"{label} must be a JSON object")
    return payload


def _sha256_file(path: str | Path, label: str) -> str:
    source = Path(path)
    try:
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
    except OSError as exc:
        raise HostingEvidenceError(f"Could not read {label} {source}: {exc}") from exc
    return digest


def _required_string(payload: dict[str, Any], key: str, label: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise HostingEvidenceError(f"{label}.{key} must be a non-empty trimmed string")
    return value


def _timestamp(value: Any, location: str) -> str:
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise HostingEvidenceError(f"{location} must be an ISO-8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HostingEvidenceError(f"{location} must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None:
        raise HostingEvidenceError(f"{location} must include a timezone")
    return value


def normalize_hosting_version(value: Any, *, expected_site: str) -> str:
    """Normalize full API and Firebase CLI version names to one stable identity."""

    if not isinstance(value, str) or value != value.strip():
        raise HostingEvidenceError("Firebase Hosting version must be a trimmed string")
    match = HOSTING_VERSION_PATTERN.fullmatch(value)
    if not match or match.group("site") != expected_site:
        raise HostingEvidenceError(
            f"Firebase Hosting version does not belong to site {expected_site}: {value}"
        )
    return f"sites/{expected_site}/versions/{match.group('version')}"


def parse_live_release(payload: dict[str, Any], *, expected_site: str) -> HostingRelease:
    """Parse the newest release returned by the live-channel list endpoint."""

    releases = payload.get("releases")
    if not isinstance(releases, list) or not releases:
        raise HostingEvidenceError("Firebase Hosting live channel has no releases")
    release = releases[0]
    if not isinstance(release, dict):
        raise HostingEvidenceError("Firebase Hosting live release is not an object")
    raw_version = release.get("version")
    if isinstance(raw_version, dict):
        raw_version = raw_version.get("name")
    version = normalize_hosting_version(raw_version, expected_site=expected_site)
    release_time = _timestamp(
        release.get("releaseTime"),
        "Firebase Hosting live release.releaseTime",
    )
    release_name = _required_string(
        release,
        "name",
        "Firebase Hosting live release",
    )
    return HostingRelease(
        hosting_version=version,
        release_time=release_time,
        release_name=release_name,
    )


def parse_created_release(
    payload: dict[str, Any],
    *,
    expected_site: str,
) -> HostingRelease:
    """Parse the release returned by the official releases.create endpoint."""

    raw_version = payload.get("version")
    if isinstance(raw_version, dict):
        raw_version = raw_version.get("name")
    version = normalize_hosting_version(raw_version, expected_site=expected_site)
    release_time = _timestamp(
        payload.get("releaseTime"),
        "Firebase Hosting created release.releaseTime",
    )
    release_name = _required_string(
        payload,
        "name",
        "Firebase Hosting created release",
    )
    return HostingRelease(
        hosting_version=version,
        release_time=release_time,
        release_name=release_name,
    )


def parse_firebase_deploy_result(
    payload: dict[str, Any],
    *,
    expected_site: str,
) -> str:
    """Extract the exact Hosting version returned by ``firebase --json deploy``."""

    if payload.get("status") != "success":
        raise HostingEvidenceError("Firebase deploy result is not successful")
    result = payload.get("result")
    if not isinstance(result, dict):
        raise HostingEvidenceError("Firebase deploy result.result must be an object")
    hosting = result.get("hosting")
    if isinstance(hosting, list):
        if len(hosting) != 1:
            raise HostingEvidenceError(
                "Firebase deploy result must contain exactly one Hosting version"
            )
        hosting = hosting[0]
    return normalize_hosting_version(hosting, expected_site=expected_site)


class FirebaseHostingClient:
    """Read and release Hosting versions with the authenticated gcloud identity."""

    def __init__(self, *, project_id: str, site: str, timeout_seconds: float = 30):
        if not PROJECT_ID_PATTERN.fullmatch(project_id):
            raise HostingEvidenceError(f"Invalid Google Cloud project ID: {project_id}")
        if not HOSTING_SITE_PATTERN.fullmatch(site):
            raise HostingEvidenceError(f"Invalid Firebase Hosting site: {site}")
        if timeout_seconds <= 0:
            raise HostingEvidenceError("timeout_seconds must be positive")
        self.project_id = project_id
        self.site = site
        self.timeout_seconds = timeout_seconds

    def _access_token(self) -> str:
        try:
            result = subprocess.run(
                ["gcloud", "auth", "print-access-token"],
                check=True,
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise HostingEvidenceError(
                f"Could not obtain a gcloud access token: {exc}"
            ) from exc
        token = result.stdout.strip()
        if not token:
            raise HostingEvidenceError("gcloud returned an empty access token")
        return token

    def latest_live_release(self) -> HostingRelease:
        site = urllib.parse.quote(self.site, safe="")
        url = (
            "https://firebasehosting.googleapis.com/v1beta1/"
            f"projects/-/sites/{site}/channels/live/releases?pageSize=1"
        )
        request = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {self._access_token()}",
                "x-goog-user-project": self.project_id,
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(
                request,
                timeout=self.timeout_seconds,
            ) as response:
                payload = json.load(response)
        except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
            raise HostingEvidenceError(
                f"Could not read Firebase Hosting live release: {exc}"
            ) from exc
        if not isinstance(payload, dict):
            raise HostingEvidenceError("Firebase Hosting API returned a non-object")
        return parse_live_release(payload, expected_site=self.site)

    def create_live_release(
        self,
        *,
        hosting_version: str,
        message: str,
    ) -> HostingRelease:
        """Create a new live release serving an exact finalized same-site version."""

        version = normalize_hosting_version(
            hosting_version,
            expected_site=self.site,
        )
        if (
            not isinstance(message, str)
            or not message.strip()
            or message != message.strip()
            or len(message) > 512
        ):
            raise HostingEvidenceError(
                "Firebase Hosting release message must contain 1 to 512 "
                "trimmed characters"
            )
        site = urllib.parse.quote(self.site, safe="")
        version_name = urllib.parse.quote(version, safe="")
        url = (
            "https://firebasehosting.googleapis.com/v1beta1/"
            f"sites/{site}/releases?versionName={version_name}"
        )
        request = urllib.request.Request(
            url,
            data=json.dumps({"message": message}).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {self._access_token()}",
                "x-goog-user-project": self.project_id,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(
                request,
                timeout=self.timeout_seconds,
            ) as response:
                payload = json.load(response)
        except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
            raise HostingEvidenceError(
                f"Could not create Firebase Hosting live release: {exc}"
            ) from exc
        if not isinstance(payload, dict):
            raise HostingEvidenceError(
                "Firebase Hosting release API returned a non-object"
            )
        return parse_created_release(payload, expected_site=self.site)


def capture_live_snapshot(
    *,
    project_id: str,
    site: str,
    client: FirebaseHostingClient | None = None,
) -> dict[str, Any]:
    """Capture the rollback version immediately before a controlled deploy."""

    hosting_client = client or FirebaseHostingClient(project_id=project_id, site=site)
    release = hosting_client.latest_live_release()
    return {
        "schemaVersion": 1,
        "reportType": "firebase-hosting-live-snapshot",
        "projectId": project_id,
        "site": site,
        "hostingVersion": release.hosting_version,
        "releaseName": release.release_name,
        "releaseTime": release.release_time,
        "capturedAt": _utc_now(),
    }


def _validate_active_release(
    payload: dict[str, Any],
) -> tuple[str, str, str]:
    if payload.get("schemaVersion") != 1:
        raise HostingEvidenceError("active release must be a schemaVersion 1 object")
    release_id = _required_string(payload, "releaseId", "active release")
    source_commit = _required_string(payload, "sourceCommit", "active release").lower()
    manifest_sha256 = _required_string(
        payload,
        "manifestSha256",
        "active release",
    ).lower()
    if not SOURCE_COMMIT_PATTERN.fullmatch(source_commit):
        raise HostingEvidenceError("active release.sourceCommit is invalid")
    if not SHA256_PATTERN.fullmatch(manifest_sha256):
        raise HostingEvidenceError("active release.manifestSha256 is invalid")
    replacements = payload.get("replacements")
    if not isinstance(replacements, list) or not replacements:
        raise HostingEvidenceError("active release has no replacement mappings")
    return release_id, source_commit, manifest_sha256


def _validate_snapshot(
    payload: dict[str, Any],
    *,
    project_id: str,
    site: str,
) -> str:
    if (
        payload.get("schemaVersion") != 1
        or payload.get("reportType") != "firebase-hosting-live-snapshot"
        or payload.get("projectId") != project_id
        or payload.get("site") != site
    ):
        raise HostingEvidenceError("pre-deploy Hosting snapshot identity is invalid")
    _timestamp(payload.get("capturedAt"), "pre-deploy snapshot.capturedAt")
    _timestamp(payload.get("releaseTime"), "pre-deploy snapshot.releaseTime")
    return normalize_hosting_version(
        payload.get("hostingVersion"),
        expected_site=site,
    )


def _validate_active_mapping_evidence(
    *,
    payload: dict[str, Any],
    evidence_path: str | Path,
    active_release_path: str | Path,
    form_catalog_data_path: str | Path,
    release_manifest_path: str | Path,
    release_id: str,
    source_commit: str,
    manifest_sha256: str,
    deployment_commit: str,
    active_replacement_count: int,
) -> dict[str, Any]:
    if (
        payload.get("schemaVersion") != 1
        or payload.get("reportType") != "form-catalog-active-mapping"
        or payload.get("producer") != "verify-active-mapping"
        or payload.get("ok") is not True
    ):
        raise HostingEvidenceError("active mapping evidence identity is invalid")
    expected_strings = {
        "releaseId": release_id,
        "sourceCommit": source_commit,
        "manifestSha256": manifest_sha256,
        "releaseManifestSha256": manifest_sha256,
        "gitCommit": deployment_commit,
        "activeContractSha256": _sha256_file(
            active_release_path,
            "active release",
        ),
        "formCatalogDataSha256": _sha256_file(
            form_catalog_data_path,
            "generated form catalog data",
        ),
    }
    release_manifest_sha256 = _sha256_file(
        release_manifest_path,
        "release manifest",
    )
    if release_manifest_sha256 != manifest_sha256:
        raise HostingEvidenceError(
            "release manifest bytes do not match active manifestSha256"
        )
    for key, expected in expected_strings.items():
        if payload.get(key) != expected:
            raise HostingEvidenceError(
                f"active mapping evidence.{key} does not match deployed inputs"
            )
    if payload.get("activeReplacementCount") != active_replacement_count:
        raise HostingEvidenceError(
            "active mapping evidence.activeReplacementCount does not match "
            "the active contract"
        )
    current_count = payload.get("currentReleaseReplacementCount")
    if (
        not isinstance(current_count, int)
        or isinstance(current_count, bool)
        or current_count <= 0
    ):
        raise HostingEvidenceError(
            "active mapping evidence.currentReleaseReplacementCount is invalid"
        )
    for key in ("activeMappingDigest", "manifestMappingDigest"):
        value = payload.get(key)
        if not isinstance(value, str) or not SHA256_PATTERN.fullmatch(value):
            raise HostingEvidenceError(f"active mapping evidence.{key} is invalid")
    return {
        "activeMappingEvidenceSha256": _sha256_file(
            evidence_path,
            "active mapping evidence",
        ),
        "activeContractSha256": payload["activeContractSha256"],
        "formCatalogDataSha256": payload["formCatalogDataSha256"],
        "releaseManifestSha256": release_manifest_sha256,
        "activeMappingDigest": payload["activeMappingDigest"],
        "manifestMappingDigest": payload["manifestMappingDigest"],
        "activeReplacementCount": active_replacement_count,
        "currentReleaseReplacementCount": current_count,
        "mappingGitCommit": deployment_commit,
    }


def build_hosting_evidence(
    *,
    active_release_path: str | Path,
    active_mapping_evidence_path: str | Path,
    form_catalog_data_path: str | Path,
    release_manifest_path: str | Path,
    before_snapshot_path: str | Path,
    deploy_result_path: str | Path,
    project_id: str,
    site: str,
    site_origins: list[str],
    deployment_commit: str,
    workflow_run_id: str,
    workflow_run_attempt: str,
    client: FirebaseHostingClient | None = None,
    confirm_attempts: int = 10,
    confirm_interval_seconds: float = 2,
) -> dict[str, Any]:
    """Bind the deploy result and live channel to the staged catalog release."""

    if confirm_attempts <= 0 or confirm_interval_seconds < 0:
        raise HostingEvidenceError("Hosting confirmation retry settings are invalid")
    active = _load_json(active_release_path, "active release")
    active_mapping = _load_json(
        active_mapping_evidence_path,
        "active mapping evidence",
    )
    before = _load_json(before_snapshot_path, "pre-deploy Hosting snapshot")
    deploy_result = _load_json(deploy_result_path, "Firebase deploy result")
    release_id, source_commit, manifest_sha256 = _validate_active_release(active)
    normalized_deployment_commit = deployment_commit.lower()
    if not SOURCE_COMMIT_PATTERN.fullmatch(normalized_deployment_commit):
        raise HostingEvidenceError("deployment_commit must be a Git object ID")
    active_replacements = active["replacements"]
    mapping_binding = _validate_active_mapping_evidence(
        payload=active_mapping,
        evidence_path=active_mapping_evidence_path,
        active_release_path=active_release_path,
        form_catalog_data_path=form_catalog_data_path,
        release_manifest_path=release_manifest_path,
        release_id=release_id,
        source_commit=source_commit,
        manifest_sha256=manifest_sha256,
        deployment_commit=normalized_deployment_commit,
        active_replacement_count=len(active_replacements),
    )
    rollback_version = _validate_snapshot(
        before,
        project_id=project_id,
        site=site,
    )
    deployed_version = parse_firebase_deploy_result(
        deploy_result,
        expected_site=site,
    )
    if deployed_version == rollback_version:
        raise HostingEvidenceError(
            "Firebase deploy did not produce a new Hosting version"
        )

    normalized_origins: list[str] = []
    for index, raw_origin in enumerate(site_origins):
        if not isinstance(raw_origin, str) or raw_origin != raw_origin.strip():
            raise HostingEvidenceError(f"site_origins[{index}] must be a trimmed URL")
        parsed = urllib.parse.urlsplit(raw_origin)
        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            raise HostingEvidenceError(
                f"site_origins[{index}] must be an HTTPS origin"
            )
        origin = raw_origin.rstrip("/")
        if origin in normalized_origins:
            raise HostingEvidenceError("site_origins contains a duplicate")
        normalized_origins.append(origin)
    if not normalized_origins:
        raise HostingEvidenceError("site_origins must not be empty")

    hosting_client = client or FirebaseHostingClient(project_id=project_id, site=site)
    live_release: HostingRelease | None = None
    for attempt in range(confirm_attempts):
        candidate = hosting_client.latest_live_release()
        if candidate.hosting_version == deployed_version:
            live_release = candidate
            break
        if attempt + 1 < confirm_attempts:
            time.sleep(confirm_interval_seconds)
    if live_release is None:
        raise HostingEvidenceError(
            f"Firebase Hosting live channel did not serve {deployed_version}"
        )

    if not workflow_run_id.strip() or not workflow_run_attempt.strip():
        raise HostingEvidenceError("workflow run identity must be non-empty")

    return {
        "schemaVersion": 1,
        "reportType": "form-catalog-hosting-deployment",
        "producer": "controlled-deploy",
        "environment": "production",
        "projectId": project_id,
        "site": site,
        "releaseId": release_id,
        "sourceCommit": source_commit,
        "manifestSha256": manifest_sha256,
        "hostingVersion": deployed_version,
        "rollbackHostingVersion": rollback_version,
        "siteOrigins": normalized_origins,
        "deployedAt": live_release.release_time,
        "deploymentCommit": normalized_deployment_commit,
        "workflowRunId": workflow_run_id,
        "workflowRunAttempt": workflow_run_attempt,
        "hostingReleaseName": live_release.release_name,
        **mapping_binding,
        "ok": True,
    }


def write_json(path: str | Path, payload: dict[str, Any]) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
