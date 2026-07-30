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

from .ledger import CatalogFactoryLedger, Stage, WorkLease
from .models import load_form_spec
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
) -> dict[str, Any]:
    """Validate a claimed specification and publish only its content hash."""

    claim = load_claim(claim_path)
    if claim.get("status") not in {"active", "completed"}:
        raise WorkerControlError("Claim is not active or completed")
    lease = _lease_from_payload(claim)
    if lease.claimed_stage is not Stage.SPEC_CLAIMED:
        raise WorkerControlError("Claim does not own a specification-authoring lease")

    candidate_path = Path(spec_path).resolve()
    spec = load_form_spec(candidate_path)
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

    spec_hash = _sha256_file(candidate_path)
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

    resolved_paths = sorted({Path(path).resolve() for path in spec_paths})
    if not resolved_paths:
        raise WorkerControlError("No specification paths were provided")
    batch_qa = validate_spec_batch(resolved_paths)
    warnings = [
        warning
        for result in batch_qa.get("results", [])
        for warning in result.get("warnings", [])
    ]
    if not batch_qa.get("passed") or warnings:
        raise WorkerControlError(
            "Existing specifications must pass peer content QA with zero warnings"
        )

    registered: list[str] = []
    unchanged: list[str] = []
    claims_directory = Path(claim_root)
    for spec_path in resolved_paths:
        spec = load_form_spec(spec_path)
        spec_hash = _sha256_file(spec_path)
        item = ledger.get_item(spec.catalog_id)
        if item is None or item.batch_id != batch_id:
            raise WorkerControlError(
                f"Specification {spec.catalog_id!r} is not assigned to batch {batch_id!r}"
            )
        if item.stage is Stage.SPEC_READY and item.spec_hash == spec_hash:
            unchanged.append(spec.catalog_id)
            continue
        if item.stage is not Stage.QUEUED:
            raise WorkerControlError(
                f"Specification {spec.catalog_id!r} is in stage {item.stage.value!r}, "
                "not queued or matching spec_ready"
            )

        identity_digest = hashlib.sha256(spec.catalog_id.encode("utf-8")).hexdigest()[:16]
        claim_path = claims_directory / f"{identity_digest}.json"
        claim_key = f"{batch_id}:{spec.catalog_id}:register:{spec_hash}:claim"
        completion_key = f"{batch_id}:{spec.catalog_id}:register:{spec_hash}:complete"
        claim = claim_spec(
            ledger,
            batch_id=batch_id,
            worker_id=worker_id,
            lease_seconds=lease_seconds,
            idempotency_key=claim_key,
            output_path=claim_path,
            catalog_id=spec.catalog_id,
        )
        if claim is None:
            raise WorkerControlError(
                f"Could not claim queued specification {spec.catalog_id!r}"
            )
        complete_spec_claim(
            ledger,
            claim_path=claim_path,
            spec_path=spec_path,
            idempotency_key=completion_key,
        )
        registered.append(spec.catalog_id)

    return {
        "batch_id": batch_id,
        "count": len(resolved_paths),
        "registered": registered,
        "unchanged": unchanged,
    }
