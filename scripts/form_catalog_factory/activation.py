"""Build cumulative frontend activation contracts for staged catalog releases."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from .release_validation import ManifestValidationError, validate_release_manifest


class ActivationError(RuntimeError):
    """Raised when activation order or manifest identity is invalid."""


def _read_object(path: str | Path, label: str) -> dict[str, Any]:
    source = Path(path)
    try:
        payload = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ActivationError(f"Could not load {label} {source}: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise ActivationError(f"{label} must be a schemaVersion 1 object")
    return payload


def build_active_contract(
    *,
    manifest_path: str | Path,
    current_active_path: str | Path,
    activated_at: str,
) -> dict[str, Any]:
    """Merge one staged release into the cumulative build-time pointer."""

    try:
        validated_manifest = validate_release_manifest(
            Path(manifest_path),
            check_files=False,
        )
    except (ManifestValidationError, OSError) as exc:
        raise ActivationError(f"Release manifest validation failed: {exc}") from exc
    manifest_source = Path(manifest_path)
    manifest = _read_object(manifest_source, "release manifest")
    manifest_sha256 = hashlib.sha256(manifest_source.read_bytes()).hexdigest()
    if manifest_sha256 != validated_manifest.manifest_sha256:
        raise ActivationError("Release manifest changed during activation validation")
    current = _read_object(current_active_path, "active contract")
    release_id = validated_manifest.release_id
    source_commit = validated_manifest.source_commit
    previous_release_id = validated_manifest.previous_release_id
    if not isinstance(activated_at, str) or not activated_at.strip():
        raise ActivationError("activated_at must be a non-empty ISO-8601 timestamp")
    try:
        parsed_activation = datetime.fromisoformat(
            activated_at.strip().replace("Z", "+00:00")
        )
    except ValueError as exc:
        raise ActivationError(
            "activated_at must be an ISO-8601 timestamp"
        ) from exc
    if parsed_activation.tzinfo is None:
        raise ActivationError("activated_at must include a timezone")
    if previous_release_id != current.get("releaseId"):
        raise ActivationError(
            "Release manifest previousReleaseId does not match the current active release"
        )
    current_replacements = current.get("replacements")
    forms = manifest.get("forms")
    if not isinstance(current_replacements, list) or not isinstance(forms, list):
        raise ActivationError("Manifest and active contract must contain arrays")

    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for index, raw in enumerate(current_replacements):
        if not isinstance(raw, dict):
            raise ActivationError(f"active replacements[{index}] is not an object")
        key = (str(raw.get("sourceSection") or ""), str(raw.get("filename") or ""))
        if not all(key) or key in merged:
            raise ActivationError("Current active contract has a missing or duplicate identity")
        merged[key] = dict(raw)

    for index, raw in enumerate(forms):
        if not isinstance(raw, dict):
            raise ActivationError(f"manifest forms[{index}] is not an object")
        section = str(raw.get("sourceSection") or "")
        filename = str(raw.get("filename") or "")
        pdf = raw.get("pdf")
        thumbnail = raw.get("thumbnail")
        if (
            not section
            or not filename
            or not isinstance(pdf, dict)
            or not isinstance(thumbnail, dict)
        ):
            raise ActivationError(f"manifest forms[{index}] has incomplete asset identity")
        key = (section, filename)
        if key in merged:
            raise ActivationError(
                f"manifest forms[{index}] identity {section!r}/{filename!r} "
                "already exists in cumulative active replacements; explicit "
                "revision activation is not supported"
            )
        merged[key] = {
            "sourceSection": section,
            "filename": filename,
            "pdfPath": pdf.get("objectPath"),
            "thumbnailPath": thumbnail.get("objectPath"),
            "sha256": pdf.get("sha256"),
            "bytes": pdf.get("bytes"),
            "pageCount": raw.get("pageCount"),
        }

    return {
        "schemaVersion": 1,
        "releaseId": release_id,
        "sourceCommit": source_commit,
        "manifestSha256": manifest_sha256,
        "previousReleaseId": current.get("releaseId"),
        "activatedAt": activated_at.strip(),
        "replacements": [merged[key] for key in sorted(merged)],
    }


def write_active_contract(path: str | Path, payload: dict[str, Any]) -> None:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
