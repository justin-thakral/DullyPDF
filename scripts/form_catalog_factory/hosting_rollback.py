"""Fail-closed Firebase Hosting rollback for a failed post-live catalog gate."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .hosting_evidence import (
    FirebaseHostingClient,
    HostingEvidenceError,
    HostingRelease,
)


SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
RELEASE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{4,79}$")
MISSING_OBJECT_PATTERNS = (
    "not found",
    "no urls matched",
    "matched no objects",
    "404",
)
PRODUCTION_POINTER_OBJECT_URL = (
    "gs://dullypdf-form-catalog-assets-east4/catalog-release-state/active.json"
)


class HostingRollbackError(RuntimeError):
    """Rollback is unsafe, failed, or could not be verified."""


class PointerAlreadyPromoted(HostingRollbackError):
    """The catalog pointer crossed the promotion CAS before rollback."""


@dataclass(frozen=True)
class PointerSnapshot:
    """Generation-bound active pointer identity."""

    exists: bool
    generation: str | None
    sha256: str | None
    release_id: str | None


class GcloudPointerReader:
    """Read a GCS JSON pointer with a stable before/after generation check."""

    def __init__(
        self,
        *,
        project_id: str,
        object_url: str,
        timeout_seconds: float = 30,
    ):
        if not object_url.startswith("gs://") or object_url.endswith("/"):
            raise HostingRollbackError("Active pointer must be an exact gs:// object URL")
        if timeout_seconds <= 0:
            raise HostingRollbackError("Pointer timeout must be positive")
        self.project_id = project_id
        self.object_url = object_url
        self.timeout_seconds = timeout_seconds

    def _run(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                args,
                check=False,
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise HostingRollbackError(
                f"Could not inspect the active catalog pointer: {exc}"
            ) from exc

    def snapshot(self) -> PointerSnapshot:
        describe_args = [
            "gcloud",
            "storage",
            "objects",
            "describe",
            self.object_url,
            "--project",
            self.project_id,
            "--format=value(generation)",
        ]
        described = self._run(describe_args)
        if described.returncode != 0:
            error = f"{described.stdout}\n{described.stderr}".lower()
            if any(pattern in error for pattern in MISSING_OBJECT_PATTERNS):
                return PointerSnapshot(False, None, None, None)
            raise HostingRollbackError(
                "Could not distinguish a missing active pointer from a GCS "
                f"inspection failure: {described.stderr.strip()}"
            )
        generation = described.stdout.strip()
        if not generation:
            raise HostingRollbackError("Active pointer has an empty GCS generation")

        with tempfile.TemporaryDirectory(prefix="catalog-pointer-") as directory:
            local_path = Path(directory) / "active.json"
            copied = self._run(
                [
                    "gcloud",
                    "storage",
                    "cp",
                    self.object_url,
                    str(local_path),
                    "--project",
                    self.project_id,
                    "--quiet",
                ]
            )
            if copied.returncode != 0:
                raise HostingRollbackError(
                    f"Could not download the active pointer: {copied.stderr.strip()}"
                )
            confirmed = self._run(describe_args)
            if (
                confirmed.returncode != 0
                or confirmed.stdout.strip() != generation
            ):
                raise HostingRollbackError(
                    "Active pointer generation changed while it was downloaded"
                )
            try:
                raw = local_path.read_bytes()
                payload = json.loads(raw)
            except (OSError, json.JSONDecodeError) as exc:
                raise HostingRollbackError(
                    f"Active pointer is not valid JSON: {exc}"
                ) from exc
        if not isinstance(payload, dict):
            raise HostingRollbackError("Active pointer must be a JSON object")
        release_id = payload.get("releaseId")
        if not isinstance(release_id, str) or not RELEASE_ID_PATTERN.fullmatch(
            release_id
        ):
            raise HostingRollbackError("Active pointer has an invalid releaseId")
        return PointerSnapshot(
            True,
            generation,
            hashlib.sha256(raw).hexdigest(),
            release_id,
        )


class ProductionLockVerifier:
    """Verify the canonical remote lock through the shared lock implementation."""

    def __init__(
        self,
        *,
        project_id: str,
        pointer_object_url: str,
        owner: str,
        generation: str,
        state_path: str | Path,
        timeout_seconds: float = 60,
    ):
        if not pointer_object_url.startswith("gs://"):
            raise HostingRollbackError("Pointer URL must use gs://")
        bucket_suffix = pointer_object_url.removeprefix("gs://")
        bucket_name = bucket_suffix.split("/", 1)[0]
        if not bucket_name:
            raise HostingRollbackError("Pointer URL has no bucket")
        self.bucket_url = f"gs://{bucket_name}"
        self.project_id = project_id
        self.owner = owner
        self.generation = generation
        self.state_path = Path(state_path).resolve()
        self.timeout_seconds = timeout_seconds
        self.lock_script = (
            Path(__file__).resolve().parents[1]
            / "form-catalog-production-lock.sh"
        )

    def verify(self, *, minimum_remaining_seconds: int = 0) -> None:
        if (
            isinstance(minimum_remaining_seconds, bool)
            or not isinstance(minimum_remaining_seconds, int)
            or minimum_remaining_seconds < 0
        ):
            raise HostingRollbackError(
                "minimum_remaining_seconds must be a non-negative integer"
            )
        try:
            state = json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise HostingRollbackError(
                f"Could not read production lock state {self.state_path}: {exc}"
            ) from exc
        if (
            not isinstance(state, dict)
            or state.get("owner") != self.owner
            or str(state.get("generation") or "") != self.generation
        ):
            raise HostingRollbackError(
                "Production lock state does not match the supplied owner and generation"
            )
        try:
            arguments = [
                "bash",
                str(self.lock_script),
                "--action",
                "verify",
                "--bucket",
                self.bucket_url,
                "--project",
                self.project_id,
                "--owner",
                self.owner,
                "--state-file",
                str(self.state_path),
            ]
            if minimum_remaining_seconds:
                arguments.extend(
                    [
                        "--minimum-remaining-seconds",
                        str(minimum_remaining_seconds),
                    ]
                )
            result = subprocess.run(
                arguments,
                check=False,
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise HostingRollbackError(
                f"Could not verify the production lock: {exc}"
            ) from exc
        if result.returncode != 0:
            raise HostingRollbackError(
                "Remote production lock verification failed: "
                f"{result.stderr.strip()}"
            )


def pointer_snapshot_as_dict(snapshot: PointerSnapshot) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "reportType": "form-catalog-active-pointer-snapshot",
        "exists": snapshot.exists,
        "generation": snapshot.generation,
        "sha256": snapshot.sha256,
        "releaseId": snapshot.release_id,
    }


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _load_json(path: Path, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HostingRollbackError(f"Could not read {label} {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise HostingRollbackError(f"{label} must be a JSON object")
    return payload


def _sha256_file(path: Path) -> str:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError as exc:
        raise HostingRollbackError(f"Could not hash {path}: {exc}") from exc


def _required_string(payload: dict[str, Any], key: str, label: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise HostingRollbackError(f"{label}.{key} must be a trimmed string")
    return value


def _assert_pointer_is_pre_promotion(
    snapshot: PointerSnapshot,
    *,
    target_release_id: str,
    previous_release_id: str | None,
) -> None:
    if snapshot.release_id == target_release_id:
        raise PointerAlreadyPromoted(
            "Catalog pointer already names the target release; rollback is forbidden"
        )
    if previous_release_id is None:
        if snapshot.exists:
            raise HostingRollbackError(
                "A first-release rollback requires the active pointer to remain absent"
            )
        return
    if not snapshot.exists or snapshot.release_id != previous_release_id:
        raise HostingRollbackError(
            "Active catalog pointer no longer matches previousReleaseId"
        )


def rollback_failed_hosting_release(
    *,
    hosting_evidence_path: str | Path,
    previous_release_id: str | None,
    pointer_object_url: str,
    lock_owner: str,
    lock_generation: str,
    lock_state_path: str | Path,
    trigger_stage: str,
    trigger_exit_code: int,
    client: FirebaseHostingClient | None = None,
    pointer_reader: GcloudPointerReader | None = None,
    lock_verifier: ProductionLockVerifier | None = None,
    confirm_attempts: int = 10,
    confirm_interval_seconds: float = 2,
) -> dict[str, Any]:
    """Release the recorded rollback version only while the old pointer remains.

    The pointer and live Hosting lookups are constant-time remote operations.
    Retries are idempotent after the rollback boundary: serving the exact
    recorded rollback version with the unchanged old pointer emits a receipt
    without creating another release.
    """

    if (
        confirm_attempts <= 0
        or confirm_interval_seconds < 0
        or not isinstance(trigger_exit_code, int)
        or isinstance(trigger_exit_code, bool)
    ):
        raise HostingRollbackError("Rollback retry or trigger settings are invalid")
    evidence_path = Path(hosting_evidence_path).resolve()
    evidence = _load_json(evidence_path, "Hosting evidence")
    if (
        evidence.get("schemaVersion") != 1
        or evidence.get("reportType") != "form-catalog-hosting-deployment"
        or evidence.get("producer") != "controlled-deploy"
        or evidence.get("environment") != "production"
        or evidence.get("ok") is not True
    ):
        raise HostingRollbackError("Hosting evidence is not a successful production receipt")
    release_id = _required_string(evidence, "releaseId", "Hosting evidence")
    source_commit = _required_string(
        evidence,
        "sourceCommit",
        "Hosting evidence",
    )
    manifest_sha256 = _required_string(
        evidence,
        "manifestSha256",
        "Hosting evidence",
    )
    if not SHA256_PATTERN.fullmatch(manifest_sha256):
        raise HostingRollbackError("Hosting evidence.manifestSha256 is invalid")
    failed_version = _required_string(
        evidence,
        "hostingVersion",
        "Hosting evidence",
    )
    rollback_version = _required_string(
        evidence,
        "rollbackHostingVersion",
        "Hosting evidence",
    )
    if failed_version == rollback_version:
        raise HostingRollbackError("Hosting evidence records no distinct rollback version")
    project_id = _required_string(evidence, "projectId", "Hosting evidence")
    site = _required_string(evidence, "site", "Hosting evidence")
    if project_id != "dullypdf" or site != "dullypdf":
        raise HostingRollbackError("Automatic rollback is pinned to production Hosting")
    if pointer_object_url != PRODUCTION_POINTER_OBJECT_URL:
        raise HostingRollbackError(
            "Automatic rollback is pinned to the production catalog pointer"
        )
    if not lock_owner or not lock_generation:
        raise HostingRollbackError("Rollback requires the verified shared lock identity")
    if not trigger_stage or trigger_stage != trigger_stage.strip():
        raise HostingRollbackError("Rollback trigger_stage must be a trimmed string")
    if previous_release_id is not None and not RELEASE_ID_PATTERN.fullmatch(
        previous_release_id
    ):
        raise HostingRollbackError("previous_release_id is invalid")

    verified_lock = lock_verifier or ProductionLockVerifier(
        project_id=project_id,
        pointer_object_url=pointer_object_url,
        owner=lock_owner,
        generation=lock_generation,
        state_path=lock_state_path,
    )
    verified_lock.verify()
    reader = pointer_reader or GcloudPointerReader(
        project_id=project_id,
        object_url=pointer_object_url,
    )
    before_pointer = reader.snapshot()
    _assert_pointer_is_pre_promotion(
        before_pointer,
        target_release_id=release_id,
        previous_release_id=previous_release_id,
    )

    hosting_client = client or FirebaseHostingClient(
        project_id=project_id,
        site=site,
    )
    before_hosting = hosting_client.latest_live_release()
    created_release: HostingRelease | None = None
    if before_hosting.hosting_version == rollback_version:
        action = "already-serving-recorded-version"
    elif before_hosting.hosting_version == failed_version:
        action = "released-recorded-version"
        # Verify again at the mutation boundary so a lease that expired during
        # the initial reads cannot authorize a new production release.
        verified_lock.verify(minimum_remaining_seconds=300)
        try:
            created_release = hosting_client.create_live_release(
                hosting_version=rollback_version,
                message=(
                    f"Automatic DullyPDF catalog rollback for {release_id} "
                    f"after {trigger_stage} failed"
                ),
            )
        except HostingEvidenceError as exc:
            raise HostingRollbackError(
                f"Could not create the recorded Hosting rollback release: {exc}"
            ) from exc
        if created_release.hosting_version != rollback_version:
            raise HostingRollbackError(
                "Firebase created a release for an unexpected Hosting version"
            )
    else:
        raise HostingRollbackError(
            "Live Hosting changed away from both the failed and recorded rollback "
            "versions; automatic rollback is forbidden"
        )

    verified_release: HostingRelease | None = None
    for attempt in range(confirm_attempts):
        candidate = hosting_client.latest_live_release()
        if candidate.hosting_version == rollback_version:
            verified_release = candidate
            break
        if attempt + 1 < confirm_attempts:
            time.sleep(confirm_interval_seconds)
    if verified_release is None:
        raise HostingRollbackError(
            "Firebase Hosting did not confirm the recorded rollback version"
        )

    after_pointer = reader.snapshot()
    if after_pointer != before_pointer:
        raise HostingRollbackError(
            "Active catalog pointer changed while Hosting rollback was in progress"
        )
    _assert_pointer_is_pre_promotion(
        after_pointer,
        target_release_id=release_id,
        previous_release_id=previous_release_id,
    )

    return {
        "schemaVersion": 1,
        "reportType": "form-catalog-hosting-rollback",
        "producer": "locked-post-live-gate",
        "environment": "production",
        "releaseId": release_id,
        "sourceCommit": source_commit,
        "manifestSha256": manifest_sha256,
        "hostingEvidenceSha256": _sha256_file(evidence_path),
        "failedHostingVersion": failed_version,
        "rollbackHostingVersion": rollback_version,
        "rollbackAction": action,
        "createdReleaseName": (
            created_release.release_name if created_release else None
        ),
        "createdReleaseTime": (
            created_release.release_time if created_release else None
        ),
        "verifiedReleaseName": verified_release.release_name,
        "verifiedReleaseTime": verified_release.release_time,
        "pointerObjectUrl": pointer_object_url,
        "pointerReleaseId": before_pointer.release_id,
        "pointerGenerationBefore": before_pointer.generation,
        "pointerGenerationAfter": after_pointer.generation,
        "pointerSha256Before": before_pointer.sha256,
        "pointerSha256After": after_pointer.sha256,
        "pointerUnchanged": True,
        "triggerStage": trigger_stage,
        "triggerExitCode": trigger_exit_code,
        "productionLockOwner": lock_owner,
        "productionLockGeneration": lock_generation,
        "verifiedAt": _utc_now(),
        "ok": True,
    }


def write_rollback_receipt(path: str | Path, payload: dict[str, Any]) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(destination)
