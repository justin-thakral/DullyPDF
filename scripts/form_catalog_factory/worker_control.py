"""Fenced claim files for form-catalog authoring workers.

The SQLite ledger remains authoritative. Claim files are short-lived runtime
capabilities stored under ``tmp/`` so an agent can heartbeat or complete its
lease without copying tokens through prompts. A stale claim cannot publish
because the ledger verifies its owner, random token, fence epoch, stage, and
unexpired deadline in one transaction.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .ledger import CatalogFactoryLedger, Stage, WorkItem, WorkLease
from .models import FormSpec, SpecValidationError, load_form_spec
from .spec_qa import validate_spec_batch


CLAIM_SCHEMA_VERSION = 1


class WorkerControlError(RuntimeError):
    """A worker claim or candidate specification is invalid."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_sha256(value: str, *, name: str) -> None:
    if (
        len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise WorkerControlError(f"{name} must be a lowercase SHA-256 digest")


def _read_spec_snapshot(path: Path) -> tuple[FormSpec, str]:
    """Parse and hash one immutable read of a specification."""

    try:
        raw = path.read_bytes()
        payload = json.loads(raw.decode("utf-8"))
        spec = FormSpec.from_dict(payload)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, SpecValidationError) as exc:
        raise WorkerControlError(f"Could not load specification {path}: {exc}") from exc
    return spec, hashlib.sha256(raw).hexdigest()


def _write_private_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(payload, output, ensure_ascii=False, indent=2, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary_path, 0o600)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def _lease_payload(lease: WorkLease) -> dict[str, Any]:
    payload = asdict(lease)
    payload["claimed_stage"] = lease.claimed_stage.value
    return payload


def _lease_from_payload(payload: dict[str, Any]) -> WorkLease:
    lease = payload.get("lease")
    if not isinstance(lease, dict):
        raise WorkerControlError("Claim file has no lease object")
    try:
        return WorkLease(
            catalog_id=str(lease["catalog_id"]),
            worker_id=str(lease["worker_id"]),
            token=str(lease["token"]),
            fence_epoch=int(lease["fence_epoch"]),
            claimed_stage=Stage(str(lease["claimed_stage"])),
            expires_at=float(lease["expires_at"]),
            attempt_count=int(lease["attempt_count"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise WorkerControlError(f"Claim file contains an invalid lease: {exc}") from exc


def load_claim(path: str | Path) -> dict[str, Any]:
    claim_path = Path(path)
    try:
        payload = json.loads(claim_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise WorkerControlError(f"Could not read claim file {claim_path}: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("schemaVersion") != CLAIM_SCHEMA_VERSION:
        raise WorkerControlError("Claim file has an unsupported schema version")
    _lease_from_payload(payload)
    return payload


def claim_spec(
    ledger: CatalogFactoryLedger,
    *,
    batch_id: str,
    worker_id: str,
    lease_seconds: float,
    idempotency_key: str,
    output_path: str | Path,
    catalog_id: str | None = None,
) -> dict[str, Any] | None:
    """Atomically claim one specification and persist its fenced capability."""

    lease = ledger.claim_next(
        worker_id=worker_id,
        claimed_stage=Stage.SPEC_CLAIMED,
        lease_seconds=lease_seconds,
        batch_id=batch_id,
        catalog_id=catalog_id,
        idempotency_key=idempotency_key,
    )
    if lease is None:
        return None
    item = ledger.get_item(lease.catalog_id)
    if item is None or item.batch_id != batch_id:
        raise WorkerControlError("Claimed item disappeared or left the requested batch")
    payload = {
        "schemaVersion": CLAIM_SCHEMA_VERSION,
        "status": "active",
        "createdAt": _utc_now(),
        "batchId": batch_id,
        "item": {
            "catalogId": item.catalog_id,
            "sourceSection": item.section,
            "sourceFilename": item.filename,
            "slug": item.slug,
            "ownership": item.ownership,
            "priority": item.priority,
            "payload": item.payload,
        },
        "lease": _lease_payload(lease),
    }
    destination = Path(output_path)
    _write_private_json(destination, payload)
    return {
        "claim": str(destination.resolve()),
        "catalog_id": item.catalog_id,
        "source_section": item.section,
        "source_filename": item.filename,
        "slug": item.slug,
        "title": item.payload.get("title"),
        "risk_tier": item.payload.get("risk_tier"),
        "expires_at": lease.expires_at,
    }


def heartbeat_claim(
    ledger: CatalogFactoryLedger,
    *,
    claim_path: str | Path,
    lease_seconds: float,
) -> dict[str, Any]:
    payload = load_claim(claim_path)
    if payload.get("status") != "active":
        raise WorkerControlError("Only an active claim can be heartbeated")
    lease = ledger.heartbeat(
        _lease_from_payload(payload),
        lease_seconds=lease_seconds,
    )
    payload["lease"] = _lease_payload(lease)
    payload["heartbeatAt"] = _utc_now()
    _write_private_json(Path(claim_path), payload)
    return {
        "catalog_id": lease.catalog_id,
        "worker_id": lease.worker_id,
        "expires_at": lease.expires_at,
    }


def complete_spec_claim(
    ledger: CatalogFactoryLedger,
    *,
    claim_path: str | Path,
    spec_path: str | Path,
    idempotency_key: str,
    expected_spec_sha256: str | None = None,
) -> dict[str, Any]:
    """Validate a claimed specification and publish only its content hash."""

    if expected_spec_sha256 is not None:
        _validate_sha256(
            expected_spec_sha256,
            name="expected_spec_sha256",
        )
    claim = load_claim(claim_path)
    if claim.get("status") not in {"active", "completed"}:
        raise WorkerControlError("Claim is not active or completed")
    lease = _lease_from_payload(claim)
    if lease.claimed_stage is not Stage.SPEC_CLAIMED:
        raise WorkerControlError("Claim does not own a specification-authoring lease")

    raw_candidate_path = Path(spec_path).expanduser()
    if raw_candidate_path.is_symlink():
        raise WorkerControlError("Specification path must not be a symlink")
    candidate_path = raw_candidate_path.resolve()
    spec, spec_hash = _read_spec_snapshot(candidate_path)
    if expected_spec_sha256 is not None and spec_hash != expected_spec_sha256:
        raise WorkerControlError(
            "Specification bytes do not match expected_spec_sha256"
        )
    item = claim.get("item") or {}
    expected = {
        "catalog_id": item.get("catalogId"),
        "source_section": item.get("sourceSection"),
        "source_filename": item.get("sourceFilename"),
        "slug": item.get("slug"),
    }
    actual = {
        "catalog_id": spec.catalog_id,
        "source_section": spec.source_section,
        "source_filename": spec.source_filename,
        "slug": spec.slug,
    }
    if actual != expected:
        raise WorkerControlError(
            "Specification changes the claimed catalog identity: "
            f"expected {expected!r}, received {actual!r}"
        )

    qa = validate_spec_batch([candidate_path])
    warnings = [
        warning
        for result in qa.get("results", [])
        for warning in result.get("warnings", [])
    ]
    if not qa.get("passed") or warnings:
        raise WorkerControlError(
            "Specification must pass content QA with zero warnings before completion"
        )

    if _sha256_file(candidate_path) != spec_hash:
        raise WorkerControlError(
            "Specification changed while its content QA was running"
        )
    completion = ledger.complete_lease(
        lease,
        idempotency_key=idempotency_key,
        artifact_updates={"spec_hash": spec_hash},
    )
    claim["status"] = "completed"
    claim["completedAt"] = _utc_now()
    claim["specPath"] = str(candidate_path)
    claim["specSha256"] = spec_hash
    _write_private_json(Path(claim_path), claim)
    return {
        "catalog_id": completion.item.catalog_id,
        "stage": completion.item.stage.value,
        "spec_path": str(candidate_path),
        "spec_sha256": spec_hash,
        "idempotent_replay": completion.idempotent_replay,
    }


def fail_claim(
    ledger: CatalogFactoryLedger,
    *,
    claim_path: str | Path,
    error: str,
    retryable: bool,
    retry_delay_seconds: float,
    idempotency_key: str,
) -> dict[str, Any]:
    claim = load_claim(claim_path)
    if claim.get("status") not in {"active", "failed"}:
        raise WorkerControlError("Claim is not active or failed")
    completion = ledger.fail_lease(
        _lease_from_payload(claim),
        error=error,
        retryable=retryable,
        retry_delay_seconds=retry_delay_seconds,
        idempotency_key=idempotency_key,
    )
    claim["status"] = "failed"
    claim["failedAt"] = _utc_now()
    claim["failure"] = {
        "error": error,
        "retryable": retryable,
        "retryDelaySeconds": retry_delay_seconds,
    }
    _write_private_json(Path(claim_path), claim)
    return {
        "catalog_id": completion.item.catalog_id,
        "stage": completion.item.stage.value,
        "idempotent_replay": completion.idempotent_replay,
    }


def reopen_specs_for_revision(
    ledger: CatalogFactoryLedger,
    *,
    batch_id: str,
    spec_paths: Iterable[str | Path],
    expected_base_commit: str,
    expected_renderer_commit: str,
    expected_batch_version: int,
    expected_state_digest: str,
    reason: str,
    actor: str,
    idempotency_key: str,
) -> dict[str, Any]:
    """Reopen exact, hash-bound specs at the safe pre-render batch boundary."""

    resolved_paths = sorted({Path(path).resolve() for path in spec_paths})
    if not resolved_paths:
        raise WorkerControlError("No specification paths were provided")
    expected_spec_hashes: dict[str, str] = {}
    for path in resolved_paths:
        spec = load_form_spec(path)
        if spec.catalog_id in expected_spec_hashes:
            raise WorkerControlError(
                f"Duplicate revision catalog identity {spec.catalog_id!r}"
            )
        expected_spec_hashes[spec.catalog_id] = _sha256_file(path)
    result = ledger.reopen_spec_ready_items_for_revision(
        batch_id=batch_id,
        expected_base_commit=expected_base_commit,
        expected_renderer_commit=expected_renderer_commit,
        expected_batch_version=expected_batch_version,
        expected_state_digest=expected_state_digest,
        expected_spec_hashes=expected_spec_hashes,
        reason=reason,
        actor=actor,
        idempotency_key=idempotency_key,
    )
    return {
        "batch_id": result.batch.batch_id,
        "batch_version": result.batch.version,
        "reopened": result.reopened_count,
        "stage": Stage.QUEUED.value,
        "catalog_ids_digest": result.catalog_ids_digest,
        "previous_spec_hashes_digest": result.previous_spec_hashes_digest,
        "previous_state_digest": result.previous_state_digest,
        "current_state_digest": result.current_state_digest,
        "idempotent_replay": result.idempotent_replay,
    }


def publish_spec_revision(
    ledger: CatalogFactoryLedger,
    *,
    claim_path: str | Path,
    draft_path: str | Path,
    destination_path: str | Path,
    expected_previous_sha256: str,
    expected_draft_sha256: str,
    idempotency_key: str,
) -> dict[str, Any]:
    """Atomically replace one rejected spec and complete its fenced claim.

    A crash after the filesystem replacement but before ledger completion is
    resumable because the destination may equal either the audited previous
    hash or the immutable draft hash. Any third byte state fails closed.
    """

    _validate_sha256(
        expected_previous_sha256,
        name="expected_previous_sha256",
    )
    _validate_sha256(
        expected_draft_sha256,
        name="expected_draft_sha256",
    )
    claim = load_claim(claim_path)
    if claim.get("status") not in {"active", "completed"}:
        raise WorkerControlError("Claim is not active or completed")
    lease = _lease_from_payload(claim)
    if lease.claimed_stage is not Stage.SPEC_CLAIMED:
        raise WorkerControlError("Claim does not own a specification-authoring lease")
    batch_id = claim.get("batchId")
    revision_events = [
        event
        for event in ledger.list_events(catalog_id=lease.catalog_id, batch_id=batch_id)
        if event["event_type"] == "spec_reopened_for_revision"
        and event["fence_epoch"] < lease.fence_epoch
    ]
    if not revision_events:
        raise WorkerControlError(
            "Claim has no prior audited spec-revision reopen event"
        )
    audited_previous_hash = revision_events[-1]["details"].get("previous_spec_hash")
    if audited_previous_hash != expected_previous_sha256:
        raise WorkerControlError(
            "Expected previous hash does not match the audited revision event"
        )

    raw_draft = Path(draft_path).expanduser()
    raw_destination = Path(destination_path).expanduser()
    if raw_draft.is_symlink() or raw_destination.is_symlink():
        raise WorkerControlError("Revision draft and destination must not be symlinks")
    draft = raw_draft.resolve()
    destination = raw_destination.resolve()
    if draft == destination:
        raise WorkerControlError("Revision draft and destination must be different files")
    try:
        draft_bytes = draft.read_bytes()
    except OSError as exc:
        raise WorkerControlError(f"Could not read revision draft {draft}: {exc}") from exc
    draft_hash = hashlib.sha256(draft_bytes).hexdigest()
    if draft_hash != expected_draft_sha256:
        raise WorkerControlError(
            "Revision draft bytes do not match expected_draft_sha256"
        )
    if draft_hash == expected_previous_sha256:
        raise WorkerControlError("Revision draft is byte-identical to the rejected spec")
    if not destination.is_file():
        raise WorkerControlError(
            f"Revision destination does not exist as a regular file: {destination}"
        )

    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.revision.",
        suffix=".tmp",
        dir=destination.parent,
    )
    temporary_path = Path(temporary_name)
    replaced = False
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(draft_bytes)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary_path, 0o644)
        spec = load_form_spec(temporary_path)
        item = claim.get("item") or {}
        expected_identity = {
            "catalog_id": item.get("catalogId"),
            "source_section": item.get("sourceSection"),
            "source_filename": item.get("sourceFilename"),
            "slug": item.get("slug"),
        }
        actual_identity = {
            "catalog_id": spec.catalog_id,
            "source_section": spec.source_section,
            "source_filename": spec.source_filename,
            "slug": spec.slug,
        }
        if actual_identity != expected_identity:
            raise WorkerControlError(
                "Revision draft changes the claimed catalog identity: "
                f"expected {expected_identity!r}, received {actual_identity!r}"
            )
        qa = validate_spec_batch([spec])
        warnings = [
            warning
            for result in qa.get("results", [])
            for warning in result.get("warnings", [])
        ]
        if not qa.get("passed") or warnings:
            raise WorkerControlError(
                "Revision draft must pass content QA with zero warnings"
            )

        current_hash = _sha256_file(destination)
        if current_hash not in {expected_previous_sha256, draft_hash}:
            raise WorkerControlError(
                "Revision destination matches neither the audited previous bytes "
                "nor the immutable draft bytes"
            )
        if current_hash == expected_previous_sha256:
            os.replace(temporary_path, destination)
            replaced = True
            directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
            directory_descriptor = os.open(destination.parent, directory_flags)
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
        else:
            temporary_path.unlink(missing_ok=True)

        completion = complete_spec_claim(
            ledger,
            claim_path=claim_path,
            spec_path=destination,
            idempotency_key=idempotency_key,
            expected_spec_sha256=draft_hash,
        )
        if completion["spec_sha256"] != draft_hash:
            raise WorkerControlError(
                "Completed revision hash does not match the immutable draft bytes"
            )
        return {
            **completion,
            "destination": str(destination),
            "previous_spec_sha256": expected_previous_sha256,
            "revised_spec_sha256": draft_hash,
            "filesystem_replaced": replaced,
        }
    finally:
        temporary_path.unlink(missing_ok=True)


def _restore_active_claim_file(
    *,
    item: WorkItem,
    batch_id: str,
    worker_id: str,
    claim_path: Path,
) -> None:
    """Rebuild a crash-lost capability from the authoritative active lease."""

    if (
        item.stage is not Stage.SPEC_CLAIMED
        or item.batch_id != batch_id
        or item.lease_owner != worker_id
        or not item.lease_token
        or item.lease_expires_at is None
    ):
        raise WorkerControlError(
            f"Active claim for {item.catalog_id!r} is not resumable by "
            f"worker {worker_id!r}"
        )
    lease = WorkLease(
        catalog_id=item.catalog_id,
        worker_id=worker_id,
        token=item.lease_token,
        fence_epoch=item.fence_epoch,
        claimed_stage=Stage.SPEC_CLAIMED,
        expires_at=item.lease_expires_at,
        attempt_count=item.attempt_count,
    )
    payload = {
        "schemaVersion": CLAIM_SCHEMA_VERSION,
        "status": "active",
        "createdAt": _utc_now(),
        "resumedAt": _utc_now(),
        "batchId": batch_id,
        "item": {
            "catalogId": item.catalog_id,
            "sourceSection": item.section,
            "sourceFilename": item.filename,
            "slug": item.slug,
            "ownership": item.ownership,
            "priority": item.priority,
            "payload": item.payload,
        },
        "lease": _lease_payload(lease),
    }
    _write_private_json(claim_path, payload)


def _claim_or_resume_spec(
    ledger: CatalogFactoryLedger,
    *,
    item: WorkItem,
    batch_id: str,
    worker_id: str,
    lease_seconds: float,
    claim_path: Path,
    operation: str,
    content_hash: str,
) -> WorkLease:
    """Return the exact active lease, using fence-aware retry identities."""

    if item.stage is Stage.SPEC_CLAIMED:
        _restore_active_claim_file(
            item=item,
            batch_id=batch_id,
            worker_id=worker_id,
            claim_path=claim_path,
        )
    elif item.stage is Stage.QUEUED:
        next_fence_epoch = item.fence_epoch + 1
        claim_key = (
            f"{batch_id}:{item.catalog_id}:{operation}:{content_hash}:"
            f"claim:{next_fence_epoch}"
        )
        claim = claim_spec(
            ledger,
            batch_id=batch_id,
            worker_id=worker_id,
            lease_seconds=lease_seconds,
            idempotency_key=claim_key,
            output_path=claim_path,
            catalog_id=item.catalog_id,
        )
        if claim is None:
            raise WorkerControlError(
                f"Could not claim queued specification {item.catalog_id!r}"
            )
    else:
        raise WorkerControlError(
            f"Specification {item.catalog_id!r} is in non-authoring stage "
            f"{item.stage.value!r}"
        )
    return _lease_from_payload(load_claim(claim_path))


def publish_spec_revisions(
    ledger: CatalogFactoryLedger,
    *,
    batch_id: str,
    worker_id: str,
    draft_paths: Iterable[str | Path],
    destination_root: str | Path,
    claim_root: str | Path,
    lease_seconds: float = 900,
) -> dict[str, Any]:
    """Publish an independently reviewed revision set through fenced claims.

    Every draft and destination is preflighted before the first mutation. The
    per-form publisher remains the only code that replaces bytes, so each
    revision retains its audited previous-hash binding and crash-safe replay
    behavior. The preflight is O(n) in the number of drafts plus their bytes.
    """

    raw_paths = sorted(
        {Path(path).expanduser() for path in draft_paths},
        key=lambda path: str(path),
    )
    if not raw_paths:
        raise WorkerControlError("No revision draft paths were provided")
    resolved_paths: list[Path] = []
    seen_paths: set[Path] = set()
    for raw_path in raw_paths:
        if raw_path.is_symlink():
            raise WorkerControlError(
                f"Revision draft must not be a symlink: {raw_path}"
            )
        resolved = raw_path.resolve()
        if resolved in seen_paths:
            continue
        seen_paths.add(resolved)
        resolved_paths.append(resolved)

    snapshots = [
        {
            "path": path,
            "spec": spec,
            "hash": content_hash,
        }
        for path in resolved_paths
        for spec, content_hash in [_read_spec_snapshot(path)]
    ]
    batch_qa = validate_spec_batch(
        snapshot["spec"] for snapshot in snapshots
    )
    warnings = [
        warning
        for result in batch_qa.get("results", [])
        for warning in result.get("warnings", [])
    ]
    if not batch_qa.get("passed") or warnings:
        raise WorkerControlError(
            "Revision drafts must pass peer content QA with zero warnings"
        )
    for snapshot in snapshots:
        if _sha256_file(snapshot["path"]) != snapshot["hash"]:
            raise WorkerControlError(
                f"Revision draft changed during peer content QA: "
                f"{snapshot['path']}"
            )

    destination_directory = Path(destination_root).expanduser().resolve()
    if not destination_directory.is_dir():
        raise WorkerControlError(
            f"Revision destination root is not a directory: {destination_directory}"
        )
    claims_directory = Path(claim_root).expanduser()
    planned: list[dict[str, Any]] = []
    unchanged: list[str] = []
    seen_catalog_ids: set[str] = set()
    ledger.requeue_expired(actor=f"{worker_id}:revision-reaper")

    for snapshot in snapshots:
        draft_path = snapshot["path"]
        spec = snapshot["spec"]
        if spec.catalog_id in seen_catalog_ids:
            raise WorkerControlError(
                f"Duplicate revision catalog identity {spec.catalog_id!r}"
            )
        seen_catalog_ids.add(spec.catalog_id)
        item = ledger.get_item(spec.catalog_id)
        if item is None or item.batch_id != batch_id:
            raise WorkerControlError(
                f"Revision {spec.catalog_id!r} is not assigned to batch {batch_id!r}"
            )

        source_family = item.payload.get("source_family", item.ownership)
        if source_family not in {"first_party", "longtail"}:
            raise WorkerControlError(
                f"Revision {spec.catalog_id!r} has unsupported source family "
                f"{source_family!r}"
            )
        relative_destination = (
            Path(source_family)
            / Path(*spec.catalog_id.split("/")).with_suffix(".json")
        )
        raw_destination = destination_directory / relative_destination
        if raw_destination.is_symlink():
            raise WorkerControlError(
                f"Revision destination must not be a symlink: {raw_destination}"
            )
        destination = raw_destination.resolve()
        try:
            destination.relative_to(destination_directory)
        except ValueError as exc:
            raise WorkerControlError(
                f"Revision destination escapes its root: {raw_destination}"
            ) from exc
        if not destination.is_file():
            raise WorkerControlError(
                f"Revision destination does not exist: {destination}"
            )

        draft_hash = snapshot["hash"]
        destination_hash = _sha256_file(destination)
        if item.stage is Stage.SPEC_READY:
            if item.spec_hash != draft_hash or destination_hash != draft_hash:
                raise WorkerControlError(
                    f"Completed revision {spec.catalog_id!r} does not match its "
                    "draft, destination, and ledger hash"
                )
            unchanged.append(spec.catalog_id)
            continue
        if item.stage not in {Stage.QUEUED, Stage.SPEC_CLAIMED}:
            raise WorkerControlError(
                f"Revision {spec.catalog_id!r} is in stage {item.stage.value!r}, "
                "not queued, actively claimed, or matching spec_ready"
            )
        if item.stage is Stage.SPEC_CLAIMED and item.lease_owner != worker_id:
            raise WorkerControlError(
                f"Revision {spec.catalog_id!r} is actively claimed by "
                f"{item.lease_owner!r}, not {worker_id!r}"
            )

        revision_events = [
            event
            for event in ledger.list_events(
                catalog_id=spec.catalog_id,
                batch_id=batch_id,
            )
            if event["event_type"] == "spec_reopened_for_revision"
        ]
        if not revision_events:
            raise WorkerControlError(
                f"Revision {spec.catalog_id!r} has no audited reopen event"
            )
        previous_hash = revision_events[-1]["details"].get("previous_spec_hash")
        if (
            not isinstance(previous_hash, str)
            or len(previous_hash) != 64
            or any(character not in "0123456789abcdef" for character in previous_hash)
        ):
            raise WorkerControlError(
                f"Revision {spec.catalog_id!r} has an invalid audited previous hash"
            )
        if draft_hash == previous_hash:
            raise WorkerControlError(
                f"Revision {spec.catalog_id!r} is byte-identical to the rejected spec"
            )
        if destination_hash not in {previous_hash, draft_hash}:
            raise WorkerControlError(
                f"Revision destination for {spec.catalog_id!r} matches neither "
                "the audited previous bytes nor the reviewed draft"
            )
        planned.append(
            {
                "catalog_id": spec.catalog_id,
                "draft_path": draft_path,
                "draft_hash": draft_hash,
                "destination": destination,
                "previous_hash": previous_hash,
                "item": item,
            }
        )

    published: list[str] = []
    for revision in planned:
        catalog_id = revision["catalog_id"]
        identity_digest = hashlib.sha256(catalog_id.encode("utf-8")).hexdigest()[:16]
        claim_path = claims_directory / f"{identity_digest}.json"
        lease = _claim_or_resume_spec(
            ledger,
            item=revision["item"],
            batch_id=batch_id,
            worker_id=worker_id,
            lease_seconds=lease_seconds,
            claim_path=claim_path,
            operation="revision-register",
            content_hash=revision["draft_hash"],
        )
        completion_key = (
            f"{batch_id}:{catalog_id}:revision-register:"
            f"{revision['draft_hash']}:complete:{lease.fence_epoch}"
        )
        publish_spec_revision(
            ledger,
            claim_path=claim_path,
            draft_path=revision["draft_path"],
            destination_path=revision["destination"],
            expected_previous_sha256=revision["previous_hash"],
            expected_draft_sha256=revision["draft_hash"],
            idempotency_key=completion_key,
        )
        published.append(catalog_id)

    return {
        "batch_id": batch_id,
        "count": len(resolved_paths),
        "published": published,
        "unchanged": unchanged,
    }


def register_existing_specs(
    ledger: CatalogFactoryLedger,
    *,
    batch_id: str,
    worker_id: str,
    spec_paths: Iterable[str | Path],
    claim_root: str | Path,
    lease_seconds: float = 900,
) -> dict[str, Any]:
    """Reconcile already-reviewed specs through exact fenced ledger claims."""

    raw_paths = sorted(
        {Path(path).expanduser() for path in spec_paths},
        key=lambda path: str(path),
    )
    resolved_paths: list[Path] = []
    seen_paths: set[Path] = set()
    for raw_path in raw_paths:
        if raw_path.is_symlink():
            raise WorkerControlError(
                f"Specification path must not be a symlink: {raw_path}"
            )
        resolved = raw_path.resolve()
        if resolved in seen_paths:
            continue
        seen_paths.add(resolved)
        resolved_paths.append(resolved)
    if not resolved_paths:
        raise WorkerControlError("No specification paths were provided")
    snapshots = [
        {
            "path": path,
            "spec": spec,
            "hash": content_hash,
        }
        for path in resolved_paths
        for spec, content_hash in [_read_spec_snapshot(path)]
    ]
    batch_qa = validate_spec_batch(
        snapshot["spec"] for snapshot in snapshots
    )
    warnings = [
        warning
        for result in batch_qa.get("results", [])
        for warning in result.get("warnings", [])
    ]
    if not batch_qa.get("passed") or warnings:
        raise WorkerControlError(
            "Existing specifications must pass peer content QA with zero warnings"
        )
    for snapshot in snapshots:
        if _sha256_file(snapshot["path"]) != snapshot["hash"]:
            raise WorkerControlError(
                f"Specification changed during peer content QA: "
                f"{snapshot['path']}"
            )

    registered: list[str] = []
    unchanged: list[str] = []
    claims_directory = Path(claim_root)
    planned: list[dict[str, Any]] = []
    seen_catalog_ids: set[str] = set()
    ledger.requeue_expired(actor=f"{worker_id}:registration-reaper")
    for snapshot in snapshots:
        spec_path = snapshot["path"]
        spec = snapshot["spec"]
        spec_hash = snapshot["hash"]
        if spec.catalog_id in seen_catalog_ids:
            raise WorkerControlError(
                f"Duplicate specification catalog identity {spec.catalog_id!r}"
            )
        seen_catalog_ids.add(spec.catalog_id)
        item = ledger.get_item(spec.catalog_id)
        if item is None or item.batch_id != batch_id:
            raise WorkerControlError(
                f"Specification {spec.catalog_id!r} is not assigned to batch {batch_id!r}"
            )
        if item.stage is Stage.SPEC_READY and item.spec_hash == spec_hash:
            unchanged.append(spec.catalog_id)
            continue
        if item.stage not in {Stage.QUEUED, Stage.SPEC_CLAIMED}:
            raise WorkerControlError(
                f"Specification {spec.catalog_id!r} is in stage {item.stage.value!r}, "
                "not queued, actively claimed, or matching spec_ready"
            )
        if item.stage is Stage.SPEC_CLAIMED and item.lease_owner != worker_id:
            raise WorkerControlError(
                f"Specification {spec.catalog_id!r} is actively claimed by "
                f"{item.lease_owner!r}, not {worker_id!r}"
            )

        identity_digest = hashlib.sha256(spec.catalog_id.encode("utf-8")).hexdigest()[:16]
        claim_path = claims_directory / f"{identity_digest}.json"
        planned.append(
            {
                "catalog_id": spec.catalog_id,
                "spec_path": spec_path,
                "spec_hash": spec_hash,
                "item": item,
                "claim_path": claim_path,
            }
        )

    for registration in planned:
        lease = _claim_or_resume_spec(
            ledger,
            item=registration["item"],
            batch_id=batch_id,
            worker_id=worker_id,
            lease_seconds=lease_seconds,
            claim_path=registration["claim_path"],
            operation="register",
            content_hash=registration["spec_hash"],
        )
        completion_key = (
            f"{batch_id}:{registration['catalog_id']}:register:"
            f"{registration['spec_hash']}:complete:{lease.fence_epoch}"
        )
        if _sha256_file(registration["spec_path"]) != registration["spec_hash"]:
            raise WorkerControlError(
                f"Specification changed before ledger completion: "
                f"{registration['spec_path']}"
            )
        complete_spec_claim(
            ledger,
            claim_path=registration["claim_path"],
            spec_path=registration["spec_path"],
            idempotency_key=completion_key,
            expected_spec_sha256=registration["spec_hash"],
        )
        registered.append(registration["catalog_id"])

    return {
        "batch_id": batch_id,
        "count": len(resolved_paths),
        "registered": registered,
        "unchanged": unchanged,
    }
