"""Verify the committed cumulative catalog activation mapping.

The public frontend index is generated from a gitignored source catalog, so a
clean deploy checkout cannot regenerate it. This module instead proves that the
tracked activation contract and tracked generated module agree exactly. When a
release is active, it also binds the current immutable release manifest to the
subset of mappings introduced by that release.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path
from typing import Any


REPORT_TYPE = "form-catalog-active-mapping"
PRODUCER = "verify-active-mapping"
RELEASE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{4,79}$")
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
SECTION_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_]*$")
FILENAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$", re.I)
ASSET_PATH_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")
RAW_ENTRIES_PATTERN = re.compile(
    r"const RAW_FORM_CATALOG_ENTRIES = (\[\n[\s\S]*?\n\]);"
)


class ActiveMappingError(ValueError):
    """The activation contract, generated index, or manifest is inconsistent."""


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def _canonical_sha256(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return _sha256_bytes(encoded)


def _load_object(path: Path, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ActiveMappingError(f"Could not read {label} {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ActiveMappingError(f"{label} must be a JSON object")
    return payload


def _required_string(payload: dict[str, Any], key: str, location: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value or value != value.strip():
        raise ActiveMappingError(
            f"{location}.{key} must be a non-empty trimmed string"
        )
    return value


def _positive_integer(value: Any, location: str) -> int:
    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or value <= 0
    ):
        raise ActiveMappingError(f"{location} must be a positive integer")
    return value


def _asset_path(value: Any, location: str, suffix: str) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise ActiveMappingError(f"{location} must be a non-empty trimmed string")
    parts = value.split("/")
    if (
        not ASSET_PATH_PATTERN.fullmatch(value)
        or value.startswith("/")
        or "//" in value
        or "." in parts
        or ".." in parts
    ):
        raise ActiveMappingError(f"{location} must be a normalized relative path")
    if (
        len(parts) < 4
        or parts[0] != "releases"
        or not RELEASE_ID_PATTERN.fullmatch(parts[1])
        or parts[2] != "assets"
        or not value.lower().endswith(suffix)
    ):
        raise ActiveMappingError(
            f"{location} must use releases/<release-id>/assets/...{suffix}"
        )
    return value


def _mapping_from_active(
    raw: Any,
    *,
    location: str,
) -> tuple[tuple[str, str], dict[str, Any]]:
    if not isinstance(raw, dict):
        raise ActiveMappingError(f"{location} must be an object")
    source_section = _required_string(raw, "sourceSection", location)
    filename = _required_string(raw, "filename", location)
    if not SECTION_PATTERN.fullmatch(source_section):
        raise ActiveMappingError(f"{location}.sourceSection is invalid")
    if not FILENAME_PATTERN.fullmatch(filename):
        raise ActiveMappingError(f"{location}.filename must be a PDF basename")
    pdf_path = _asset_path(raw.get("pdfPath"), f"{location}.pdfPath", ".pdf")
    thumbnail_path = _asset_path(
        raw.get("thumbnailPath"),
        f"{location}.thumbnailPath",
        ".webp",
    )
    if pdf_path.split("/")[1] != thumbnail_path.split("/")[1]:
        raise ActiveMappingError(
            f"{location} PDF and thumbnail paths use different releases"
        )
    sha256 = _required_string(raw, "sha256", location).lower()
    if not SHA256_PATTERN.fullmatch(sha256):
        raise ActiveMappingError(f"{location}.sha256 is invalid")
    mapping = {
        "sourceSection": source_section,
        "filename": filename,
        "pdfPath": pdf_path,
        "thumbnailPath": thumbnail_path,
        "sha256": sha256,
        "bytes": _positive_integer(raw.get("bytes"), f"{location}.bytes"),
        "pageCount": _positive_integer(
            raw.get("pageCount"),
            f"{location}.pageCount",
        ),
    }
    return (source_section, filename), mapping


def _parse_generated_entries(path: Path) -> list[dict[str, Any]]:
    try:
        source = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ActiveMappingError(
            f"Could not read generated catalog module {path}: {exc}"
        ) from exc
    matches = RAW_ENTRIES_PATTERN.findall(source)
    if len(matches) != 1:
        raise ActiveMappingError(
            "Generated catalog module must contain exactly one "
            "RAW_FORM_CATALOG_ENTRIES declaration"
        )
    try:
        entries = json.loads(matches[0])
    except json.JSONDecodeError as exc:
        raise ActiveMappingError(
            f"Generated catalog entries are not valid JSON: {exc}"
        ) from exc
    if not isinstance(entries, list):
        raise ActiveMappingError("Generated catalog entries must be an array")
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise ActiveMappingError(
                f"Generated catalog entries[{index}] must be an object"
            )
    return entries


def _git_head_bytes(
    *,
    repo_root: Path,
    path: Path,
    label: str,
    git_reference_path: Path | None = None,
    expected_git_commit: str | None = None,
) -> tuple[str, str]:
    reference_path = git_reference_path or path
    try:
        relative = (
            reference_path.resolve()
            .relative_to(repo_root.resolve())
            .as_posix()
        )
    except ValueError as exc:
        raise ActiveMappingError(
            f"{label} must be inside the repository when git verification is required"
        ) from exc
    try:
        requested_commit = (
            expected_git_commit.lower()
            if expected_git_commit is not None
            else "HEAD"
        )
        if (
            expected_git_commit is not None
            and not COMMIT_PATTERN.fullmatch(requested_commit)
        ):
            raise ActiveMappingError(
                "Expected mapping Git commit is not a full commit identity"
            )
        head = subprocess.run(
            [
                "git",
                "-C",
                str(repo_root),
                "rev-parse",
                f"{requested_commit}^{{commit}}",
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip().lower()
        if (
            expected_git_commit is not None
            and head != requested_commit
        ):
            raise ActiveMappingError(
                "Expected mapping Git identity does not resolve to that commit"
            )
        committed = subprocess.run(
            ["git", "-C", str(repo_root), "show", f"{head}:{relative}"],
            check=True,
            capture_output=True,
        ).stdout
    except (OSError, subprocess.SubprocessError) as exc:
        raise ActiveMappingError(
            f"Could not read committed {label} bytes from Git: {exc}"
        ) from exc
    if not COMMIT_PATTERN.fullmatch(head):
        raise ActiveMappingError("Git HEAD is not a supported commit identity")
    try:
        worktree = path.read_bytes()
    except OSError as exc:
        raise ActiveMappingError(f"Could not read {label} {path}: {exc}") from exc
    if worktree != committed:
        raise ActiveMappingError(
            f"{label} does not exactly match Git commit {head}"
        )
    return head, relative


def _manifest_mappings(
    *,
    manifest: dict[str, Any],
    manifest_sha256: str,
    active: dict[str, Any],
) -> dict[tuple[str, str], dict[str, Any]]:
    if manifest.get("schemaVersion") != 1:
        raise ActiveMappingError("Release manifest must be a schemaVersion 1 object")
    if manifest.get("releaseId") != active["releaseId"]:
        raise ActiveMappingError(
            "Release manifest releaseId does not match the active contract"
        )
    if str(manifest.get("sourceCommit") or "").lower() != active["sourceCommit"]:
        raise ActiveMappingError(
            "Release manifest sourceCommit does not match the active contract"
        )
    if manifest.get("previousReleaseId") != active["previousReleaseId"]:
        raise ActiveMappingError(
            "Release manifest previousReleaseId does not match the active contract"
        )
    if manifest_sha256 != active["manifestSha256"]:
        raise ActiveMappingError(
            "Release manifest bytes do not match active manifestSha256"
        )
    forms = manifest.get("forms")
    if not isinstance(forms, list) or not forms:
        raise ActiveMappingError("Release manifest forms must be a non-empty array")

    mappings: dict[tuple[str, str], dict[str, Any]] = {}
    for index, raw in enumerate(forms):
        location = f"release manifest.forms[{index}]"
        if not isinstance(raw, dict):
            raise ActiveMappingError(f"{location} must be an object")
        source_section = _required_string(raw, "sourceSection", location)
        filename = _required_string(raw, "filename", location)
        catalog_id = _required_string(raw, "catalogId", location)
        if catalog_id != f"{source_section}/{filename[:-4]}":
            raise ActiveMappingError(
                f"{location}.catalogId does not match the exact source identity"
            )
        pdf = raw.get("pdf")
        thumbnail = raw.get("thumbnail")
        if not isinstance(pdf, dict) or not isinstance(thumbnail, dict):
            raise ActiveMappingError(f"{location} has incomplete asset objects")
        sha256 = _required_string(pdf, "sha256", f"{location}.pdf").lower()
        if not SHA256_PATTERN.fullmatch(sha256):
            raise ActiveMappingError(f"{location}.pdf.sha256 is invalid")
        mapping = {
            "sourceSection": source_section,
            "filename": filename,
            "pdfPath": _asset_path(
                pdf.get("objectPath"),
                f"{location}.pdf.objectPath",
                ".pdf",
            ),
            "thumbnailPath": _asset_path(
                thumbnail.get("objectPath"),
                f"{location}.thumbnail.objectPath",
                ".webp",
            ),
            "sha256": sha256,
            "bytes": _positive_integer(
                pdf.get("bytes"),
                f"{location}.pdf.bytes",
            ),
            "pageCount": _positive_integer(
                raw.get("pageCount"),
                f"{location}.pageCount",
            ),
        }
        key = (source_section, filename)
        if key in mappings:
            raise ActiveMappingError(
                f"Release manifest has a duplicate source identity: {'/'.join(key)}"
            )
        if (
            mapping["pdfPath"].split("/")[1] != active["releaseId"]
            or mapping["thumbnailPath"].split("/")[1] != active["releaseId"]
        ):
            raise ActiveMappingError(
                f"{location} does not use the current immutable release namespace"
            )
        mappings[key] = mapping
    return mappings


def build_active_mapping_evidence(
    *,
    active_release_path: str | Path,
    form_catalog_data_path: str | Path,
    manifest_path: str | Path | None = None,
    repo_root: str | Path = ".",
    require_git_head: bool = True,
    git_active_reference_path: str | Path | None = None,
    git_data_reference_path: str | Path | None = None,
    expected_git_commit: str | None = None,
) -> dict[str, Any]:
    """Build deterministic proof for active, generated, and manifest mappings.

    Every lookup is indexed once by ``(sourceSection, filename)``, so the
    comparison is O(n) in generated entries plus cumulative replacements.
    """

    root = Path(repo_root).resolve()
    active_path = Path(active_release_path).resolve()
    data_path = Path(form_catalog_data_path).resolve()
    active_payload = _load_object(active_path, "active contract")
    if active_payload.get("schemaVersion") != 1:
        raise ActiveMappingError("Active contract must be a schemaVersion 1 object")
    replacements = active_payload.get("replacements")
    if not isinstance(replacements, list):
        raise ActiveMappingError("Active contract replacements must be an array")

    git_commit: str | None = None
    active_relative = active_path.name
    data_relative = data_path.name
    if require_git_head:
        if (git_active_reference_path is None) != (
            git_data_reference_path is None
        ):
            raise ActiveMappingError(
                "Git reference paths must be supplied together"
            )
        git_commit, active_relative = _git_head_bytes(
            repo_root=root,
            path=active_path,
            label="active contract",
            git_reference_path=(
                Path(git_active_reference_path)
                if git_active_reference_path is not None
                else None
            ),
            expected_git_commit=expected_git_commit,
        )
        data_commit, data_relative = _git_head_bytes(
            repo_root=root,
            path=data_path,
            label="generated catalog module",
            git_reference_path=(
                Path(git_data_reference_path)
                if git_data_reference_path is not None
                else None
            ),
            expected_git_commit=expected_git_commit,
        )
        if data_commit != git_commit:
            raise ActiveMappingError("Tracked catalog inputs came from different commits")

    active_mappings: dict[tuple[str, str], dict[str, Any]] = {}
    for index, raw in enumerate(replacements):
        key, mapping = _mapping_from_active(
            raw,
            location=f"active contract.replacements[{index}]",
        )
        if key in active_mappings:
            raise ActiveMappingError(
                f"Active contract has a duplicate source identity: {'/'.join(key)}"
            )
        active_mappings[key] = mapping

    release_id = active_payload.get("releaseId")
    source_commit = active_payload.get("sourceCommit")
    manifest_sha256 = active_payload.get("manifestSha256")
    previous_release_id = active_payload.get("previousReleaseId")
    if not active_mappings:
        if any(
            value is not None
            for value in (
                release_id,
                source_commit,
                manifest_sha256,
                previous_release_id,
                active_payload.get("activatedAt"),
            )
        ):
            raise ActiveMappingError(
                "An empty active contract requires null release metadata"
            )
        if manifest_path is not None:
            raise ActiveMappingError(
                "A release manifest is not allowed when no release is active"
            )
    else:
        if (
            not isinstance(release_id, str)
            or not RELEASE_ID_PATTERN.fullmatch(release_id)
        ):
            raise ActiveMappingError("Active contract releaseId is invalid")
        source_commit = str(source_commit or "").lower()
        manifest_sha256 = str(manifest_sha256 or "").lower()
        if not COMMIT_PATTERN.fullmatch(source_commit):
            raise ActiveMappingError("Active contract sourceCommit is invalid")
        if not SHA256_PATTERN.fullmatch(manifest_sha256):
            raise ActiveMappingError("Active contract manifestSha256 is invalid")
        if previous_release_id is not None and (
            not isinstance(previous_release_id, str)
            or not RELEASE_ID_PATTERN.fullmatch(previous_release_id)
            or previous_release_id == release_id
        ):
            raise ActiveMappingError("Active contract previousReleaseId is invalid")
        if manifest_path is None:
            raise ActiveMappingError(
                "The current immutable release manifest is required"
            )

    entries = _parse_generated_entries(data_path)
    generated_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    generated_release_keys: set[tuple[str, str]] = set()
    for index, entry in enumerate(entries):
        location = f"generated catalog entries[{index}]"
        source_section = _required_string(entry, "sourceSection", location)
        filename = _required_string(entry, "filename", location)
        key = (source_section, filename)
        if key in generated_by_key:
            raise ActiveMappingError(
                f"Generated catalog has a duplicate source identity: {'/'.join(key)}"
            )
        generated_by_key[key] = entry
        pdf_path = entry.get("pdfPath")
        thumbnail_path = entry.get("thumbnailPath")
        if (
            isinstance(pdf_path, str)
            and pdf_path.startswith("releases/")
        ) or (
            isinstance(thumbnail_path, str)
            and thumbnail_path.startswith("releases/")
        ):
            generated_release_keys.add(key)

    for key, expected in active_mappings.items():
        actual = generated_by_key.get(key)
        identity = "/".join(key)
        if actual is None:
            raise ActiveMappingError(
                f"Active replacement is missing from the generated catalog: {identity}"
            )
        for field in (
            "pdfPath",
            "thumbnailPath",
            "sha256",
            "bytes",
            "pageCount",
        ):
            if actual.get(field) != expected[field]:
                raise ActiveMappingError(
                    f"Generated catalog {identity}.{field} does not match "
                    "the active contract"
                )
    uncontracted = generated_release_keys - active_mappings.keys()
    if uncontracted:
        raise ActiveMappingError(
            "Generated catalog contains uncontracted release asset mappings: "
            + ", ".join("/".join(key) for key in sorted(uncontracted))
        )
    if generated_release_keys != set(active_mappings):
        raise ActiveMappingError(
            "Generated release mappings do not exactly equal active replacements"
        )

    current_mappings: dict[tuple[str, str], dict[str, Any]] = {}
    release_manifest_sha256: str | None = None
    if manifest_path is not None:
        manifest_source = Path(manifest_path).resolve()
        manifest_payload = _load_object(manifest_source, "release manifest")
        release_manifest_sha256 = _sha256_file(manifest_source)
        current_mappings = _manifest_mappings(
            manifest=manifest_payload,
            manifest_sha256=release_manifest_sha256,
            active={
                "releaseId": release_id,
                "sourceCommit": source_commit,
                "manifestSha256": manifest_sha256,
                "previousReleaseId": previous_release_id,
            },
        )
        for key, expected in current_mappings.items():
            if active_mappings.get(key) != expected:
                raise ActiveMappingError(
                    "Current release manifest mapping does not exactly match active "
                    f"contract: {'/'.join(key)}"
                )
        current_asset_keys = {
            key
            for key, mapping in active_mappings.items()
            if (
                mapping["pdfPath"].split("/")[1] == release_id
                or mapping["thumbnailPath"].split("/")[1] == release_id
            )
        }
        if current_asset_keys != set(current_mappings):
            raise ActiveMappingError(
                "Active mappings in the current release namespace do not exactly "
                "equal the current release manifest forms"
            )

    active_list = [active_mappings[key] for key in sorted(active_mappings)]
    current_list = [current_mappings[key] for key in sorted(current_mappings)]
    active_mapping_digest = _canonical_sha256(active_list)
    manifest_mapping_digest = _canonical_sha256(current_list)
    return {
        "schemaVersion": 1,
        "reportType": REPORT_TYPE,
        "producer": PRODUCER,
        "gitCommit": git_commit,
        "releaseId": release_id,
        "sourceCommit": source_commit,
        "previousReleaseId": previous_release_id,
        "manifestSha256": manifest_sha256,
        "activeContractPath": active_relative,
        "activeContractSha256": _sha256_file(active_path),
        "formCatalogDataPath": data_relative,
        "formCatalogDataSha256": _sha256_file(data_path),
        "releaseManifestSha256": release_manifest_sha256,
        "generatedEntryCount": len(entries),
        "activeReplacementCount": len(active_list),
        "currentReleaseReplacementCount": len(current_list),
        "activeMappingDigest": active_mapping_digest,
        "manifestMappingDigest": manifest_mapping_digest,
        "ok": True,
    }


def verify_expected_active_mapping_evidence(
    actual: dict[str, Any],
    expected_path: str | Path,
) -> None:
    """Require an existing pre-deploy report to equal a fresh verification."""

    expected = _load_object(Path(expected_path).resolve(), "active mapping evidence")
    if expected != actual:
        raise ActiveMappingError(
            "Fresh active mapping verification does not exactly match the "
            "pre-deploy evidence"
        )


def write_active_mapping_evidence(
    path: str | Path,
    payload: dict[str, Any],
) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(destination)
