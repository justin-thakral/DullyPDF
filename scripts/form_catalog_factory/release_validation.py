"""Validate an immutable DullyPDF form-catalog release manifest.

The validator intentionally has no cloud dependencies. CI can validate the
release package before authentication, and the deployment wrapper consumes the
same validated upload plan. Validation is O(f + b), where ``f`` is the number
of forms and ``b`` is the total number of local asset bytes hashed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any, Mapping

from .promotion_evidence import (
    PromotionEvidenceError,
    ValidatedPromotionEvidence,
    validate_promotion_evidence,
)
from .themes import ThemeError, validate_theme_provenance


SCHEMA_VERSION = 1
DEFAULT_MAX_FORMS = 1000
PRODUCTION_PROJECT_ID = "dullypdf"
PRODUCTION_HOSTING_SITE = "dullypdf"
PRODUCTION_SITE_ORIGINS = (
    "https://dullypdf.com",
    "https://dullypdf.web.app",
)
PRODUCTION_ASSET_BASE_URLS = (
    "https://storage.googleapis.com/dullypdf-form-catalog-assets-east4",
)
RELEASE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{4,79}$")
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
CATALOG_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._/-]{2,159}$")
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SOURCE_SECTION_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_]*$")
SOURCE_FILENAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$", re.IGNORECASE)
SAFE_PATH_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")
ASSET_SPECS = {
    "pdf": {
        "content_type": "application/pdf",
        "suffix": ".pdf",
    },
    "thumbnail": {
        "content_type": "image/webp",
        "suffix": ".webp",
    },
}
FROZEN_ATTESTATION_HASH_FIELDS = (
    "intent_fingerprint",
    "current_asset_hash",
    "spec_hash",
    "pdf_hash",
    "thumbnail_hash",
    "schema_hash",
    "qa_evidence_hash",
    "review_evidence_hash",
)
FROZEN_ATTESTATION_URI_FIELDS = (
    "pdf_uri",
    "thumbnail_uri",
    "qa_evidence_uri",
    "review_evidence_uri",
)


class ManifestValidationError(ValueError):
    """Raised when a release manifest cannot be deployed safely."""


@dataclass(frozen=True)
class ValidatedAsset:
    """One local file and its immutable release-scoped destination."""

    catalog_id: str
    slug: str
    kind: str
    source_path: Path
    object_path: str
    content_type: str
    sha256: str
    byte_count: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "catalogId": self.catalog_id,
            "slug": self.slug,
            "kind": self.kind,
            "sourcePath": str(self.source_path),
            "objectPath": self.object_path,
            "contentType": self.content_type,
            "sha256": self.sha256,
            "bytes": self.byte_count,
        }


@dataclass(frozen=True)
class ValidatedForm:
    """Stable catalog identity and both immutable assets for one form."""

    catalog_id: str
    slug: str
    source_section: str
    filename: str
    pdf: ValidatedAsset
    thumbnail: ValidatedAsset


@dataclass(frozen=True)
class ValidatedRelease:
    """Validated release metadata and deterministic upload plan."""

    release_id: str
    source_commit: str
    base_commit: str | None
    renderer_commit: str | None
    renderer_runtime: dict[str, Any]
    render_theme: dict[str, Any] | None
    previous_release_id: str | None
    created_at: str
    manifest_path: Path
    manifest_sha256: str
    manifest_bytes: int
    asset_root: Path
    assets: tuple[ValidatedAsset, ...]
    forms: tuple[ValidatedForm, ...]
    form_count: int

    @property
    def manifest_object_path(self) -> str:
        return f"releases/{self.release_id}/release-manifest.json"

    def summary(self) -> dict[str, Any]:
        summary = {
            "schemaVersion": SCHEMA_VERSION,
            "releaseId": self.release_id,
            "sourceCommit": self.source_commit,
            "baseCommit": self.base_commit,
            "rendererCommit": self.renderer_commit,
            "rendererRuntime": self.renderer_runtime,
            "previousReleaseId": self.previous_release_id,
            "createdAt": self.created_at,
            "formCount": self.form_count,
            "assetCount": len(self.assets),
            "assetBytes": sum(asset.byte_count for asset in self.assets),
            "manifestPath": str(self.manifest_path),
            "manifestSha256": self.manifest_sha256,
            "manifestBytes": self.manifest_bytes,
            "manifestObjectPath": self.manifest_object_path,
        }
        if self.render_theme is not None:
            summary["renderTheme"] = self.render_theme
        return summary


@dataclass(frozen=True)
class ValidatedFrozenAttestation:
    """Hash-bound ledger freeze proving every release form was approved."""

    path: Path
    sha256: str
    byte_count: int
    batch_id: str
    target_count: int
    base_commit: str
    renderer_commit: str
    source_commit: str
    frozen_digest: str
    frozen_at: str | int | float
    selection_digest: str
    build_report_hash: str
    release_manifest_hash: str
    items: tuple[dict[str, Any], ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "path": str(self.path),
            "sha256": self.sha256,
            "bytes": self.byte_count,
            "batchId": self.batch_id,
            "targetCount": self.target_count,
            "baseCommit": self.base_commit,
            "rendererCommit": self.renderer_commit,
            "sourceCommit": self.source_commit,
            "frozenDigest": self.frozen_digest,
            "frozenAt": self.frozen_at,
            "selectionDigest": self.selection_digest,
            "buildReportHash": self.build_report_hash,
            "releaseManifestHash": self.release_manifest_hash,
        }


def _require_mapping(value: Any, location: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ManifestValidationError(f"{location} must be a JSON object")
    return value


def _require_nonempty_string(value: Any, location: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ManifestValidationError(f"{location} must be a non-empty string")
    if value != value.strip():
        raise ManifestValidationError(f"{location} must not contain leading or trailing whitespace")
    return value


def _require_integer(value: Any, location: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise ManifestValidationError(f"{location} must be a positive integer")
    return value


def _require_schema_version(value: Any, location: str) -> None:
    if type(value) is not int or value != SCHEMA_VERSION:
        raise ManifestValidationError(f"{location} must equal {SCHEMA_VERSION}")


def _validate_render_theme(value: Any, location: str) -> dict[str, Any]:
    """Validate an immutable theme provenance object against the registry."""

    try:
        return validate_theme_provenance(value, location=location)
    except ThemeError as exc:
        raise ManifestValidationError(f"{location} is invalid: {exc}") from exc


def _require_matching_render_theme(
    *,
    expected: dict[str, Any] | None,
    payload: Mapping[str, Any],
    location: str,
) -> None:
    """Require all themed evidence to carry the same registry provenance."""

    supplied = "renderTheme" in payload
    if expected is None and not supplied:
        return
    if expected is None or not supplied:
        raise ManifestValidationError(
            f"{location}.renderTheme must be present exactly when the release "
            "manifest supplies renderTheme"
        )
    actual = _validate_render_theme(
        payload["renderTheme"],
        f"{location}.renderTheme",
    )
    if actual != expected:
        raise ManifestValidationError(
            f"{location}.renderTheme does not match the release manifest"
        )


def _require_sha256(value: Any, location: str) -> str:
    digest = _require_nonempty_string(value, location)
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ManifestValidationError(
            f"{location} must contain exactly 64 lowercase hexadecimal characters"
        )
    return digest


def _require_commit(value: Any, location: str) -> str:
    commit = _require_nonempty_string(value, location)
    if not COMMIT_PATTERN.fullmatch(commit):
        raise ManifestValidationError(
            f"{location} must be a 40- or 64-character lowercase Git object ID"
        )
    return commit


def _optional_commit(value: Any, location: str) -> str | None:
    if value is None:
        return None
    return _require_commit(value, location)


def _validate_safe_relative_path(value: Any, location: str) -> str:
    raw = _require_nonempty_string(value, location)
    if not SAFE_PATH_PATTERN.fullmatch(raw):
        raise ManifestValidationError(
            f"{location} must contain only letters, digits, '.', '_', '-', and '/'"
        )
    path = PurePosixPath(raw)
    if path.is_absolute() or ".." in path.parts or "." in path.parts:
        raise ManifestValidationError(f"{location} must be a normalized relative path")
    if str(path) != raw or "//" in raw:
        raise ManifestValidationError(f"{location} must be a normalized relative path")
    return raw


def _validate_created_at(value: Any) -> str:
    raw = _require_nonempty_string(value, "createdAt")
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ManifestValidationError("createdAt must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None:
        raise ManifestValidationError("createdAt must include a timezone")
    return raw


def _validate_renderer_runtime(value: Any) -> dict[str, Any]:
    runtime = _require_mapping(value, "rendererRuntime")
    expected_keys = {
        "schemaVersion",
        "requirementsPath",
        "requirementsSha256",
        "pythonImplementation",
        "pythonVersion",
        "pythonExecutable",
        "pythonExecutableSha256",
        "packages",
        "pdftoppmExecutable",
        "pdftoppmExecutableSha256",
        "pdftoppmVersion",
        "pillowLibraries",
    }
    if set(runtime) != expected_keys:
        raise ManifestValidationError(
            "rendererRuntime must contain the exact observed runtime fingerprint"
        )
    _require_schema_version(runtime.get("schemaVersion"), "rendererRuntime.schemaVersion")
    if runtime.get("requirementsPath") != "backend/requirements.txt":
        raise ManifestValidationError(
            "rendererRuntime.requirementsPath must equal backend/requirements.txt"
        )
    _require_sha256(
        runtime.get("requirementsSha256"),
        "rendererRuntime.requirementsSha256",
    )
    for key in (
        "pythonImplementation",
        "pythonVersion",
        "pythonExecutable",
        "pdftoppmExecutable",
        "pdftoppmVersion",
    ):
        _require_nonempty_string(runtime.get(key), f"rendererRuntime.{key}")
    for key in ("pythonExecutableSha256", "pdftoppmExecutableSha256"):
        _require_sha256(runtime.get(key), f"rendererRuntime.{key}")
    packages = _require_mapping(runtime.get("packages"), "rendererRuntime.packages")
    if set(packages) != {"pillow", "pypdf", "reportlab"}:
        raise ManifestValidationError(
            "rendererRuntime.packages must exactly cover Pillow, pypdf, and ReportLab"
        )
    for name, version in packages.items():
        _require_nonempty_string(version, f"rendererRuntime.packages.{name}")
    libraries = _require_mapping(
        runtime.get("pillowLibraries"),
        "rendererRuntime.pillowLibraries",
    )
    if set(libraries) != {"webp", "zlib"}:
        raise ManifestValidationError(
            "rendererRuntime.pillowLibraries must exactly cover webp and zlib"
        )
    for name, raw_library in libraries.items():
        library = _require_mapping(
            raw_library,
            f"rendererRuntime.pillowLibraries.{name}",
        )
        if set(library) != {"available", "version"} or not isinstance(
            library.get("available"),
            bool,
        ):
            raise ManifestValidationError(
                f"rendererRuntime.pillowLibraries.{name} is invalid"
            )
        version = library.get("version")
        if library["available"]:
            _require_nonempty_string(
                version,
                f"rendererRuntime.pillowLibraries.{name}.version",
            )
        elif version is not None:
            raise ManifestValidationError(
                f"rendererRuntime.pillowLibraries.{name}.version must be null "
                "when unavailable"
            )
    return dict(runtime)


def _validate_frozen_at(value: Any) -> str | int | float:
    if isinstance(value, bool):
        raise ManifestValidationError(
            "frozen ledger attestation frozenAt must be a timestamp"
        )
    if isinstance(value, (int, float)):
        if not math.isfinite(value) or value <= 0:
            raise ManifestValidationError(
                "frozen ledger attestation frozenAt must be a positive timestamp"
            )
        return value
    raw = _require_nonempty_string(
        value,
        "frozen ledger attestation frozenAt",
    )
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ManifestValidationError(
            "frozen ledger attestation frozenAt must be an ISO-8601 timestamp"
        ) from exc
    if parsed.tzinfo is None:
        raise ManifestValidationError(
            "frozen ledger attestation frozenAt must include a timezone"
        )
    return raw


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ManifestValidationError(
                f"frozen ledger attestation contains duplicate key {key!r}"
            )
        result[key] = value
    return result


def _reject_nonfinite_json(value: str) -> None:
    raise ManifestValidationError(
        f"frozen ledger attestation contains non-standard JSON value {value}"
    )


def _resolve_local_asset(asset_root: Path, source_path: str, location: str) -> Path:
    candidate = (asset_root / source_path).resolve()
    try:
        candidate.relative_to(asset_root)
    except ValueError as exc:
        raise ManifestValidationError(f"{location} escapes the configured asset root") from exc
    return candidate


def _validate_magic_bytes(path: Path, kind: str, location: str) -> None:
    with path.open("rb") as handle:
        header = handle.read(12)
    if kind == "pdf" and not header.startswith(b"%PDF-"):
        raise ManifestValidationError(f"{location} does not begin with a PDF header")
    if kind == "thumbnail" and not (
        len(header) >= 12 and header.startswith(b"RIFF") and header[8:12] == b"WEBP"
    ):
        raise ManifestValidationError(f"{location} does not begin with a WebP header")


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_asset(
    *,
    payload: Any,
    kind: str,
    location: str,
    release_id: str,
    catalog_id: str,
    slug: str,
    asset_root: Path,
    check_files: bool,
) -> ValidatedAsset:
    asset = _require_mapping(payload, location)
    expected_keys = {"sourcePath", "objectPath", "contentType", "sha256", "bytes"}
    missing = expected_keys - asset.keys()
    if missing:
        raise ManifestValidationError(f"{location} is missing: {', '.join(sorted(missing))}")

    source_path = _validate_safe_relative_path(asset["sourcePath"], f"{location}.sourcePath")
    object_path = _validate_safe_relative_path(asset["objectPath"], f"{location}.objectPath")
    required_prefix = f"releases/{release_id}/assets/"
    if not object_path.startswith(required_prefix):
        raise ManifestValidationError(
            f"{location}.objectPath must begin with immutable prefix {required_prefix}"
        )

    spec = ASSET_SPECS[kind]
    if not source_path.lower().endswith(spec["suffix"]):
        raise ManifestValidationError(f"{location}.sourcePath must end in {spec['suffix']}")
    if not object_path.lower().endswith(spec["suffix"]):
        raise ManifestValidationError(f"{location}.objectPath must end in {spec['suffix']}")

    content_type = _require_nonempty_string(asset["contentType"], f"{location}.contentType")
    if content_type != spec["content_type"]:
        raise ManifestValidationError(
            f"{location}.contentType must equal {spec['content_type']}"
        )

    sha256 = _require_sha256(asset["sha256"], f"{location}.sha256")

    byte_count = asset["bytes"]
    if not isinstance(byte_count, int) or isinstance(byte_count, bool) or byte_count <= 0:
        raise ManifestValidationError(f"{location}.bytes must be a positive integer")

    local_path = _resolve_local_asset(asset_root, source_path, f"{location}.sourcePath")
    if check_files:
        if not local_path.is_file():
            raise ManifestValidationError(f"{location}.sourcePath does not exist: {local_path}")
        actual_bytes = local_path.stat().st_size
        if actual_bytes != byte_count:
            raise ManifestValidationError(
                f"{location}.bytes is {byte_count}, but local file has {actual_bytes} bytes"
            )
        actual_sha256 = _hash_file(local_path)
        if actual_sha256 != sha256:
            raise ManifestValidationError(
                f"{location}.sha256 does not match local file {source_path}"
            )
        _validate_magic_bytes(local_path, kind, f"{location}.sourcePath")

    return ValidatedAsset(
        catalog_id=catalog_id,
        slug=slug,
        kind=kind,
        source_path=local_path,
        object_path=object_path,
        content_type=content_type,
        sha256=sha256,
        byte_count=byte_count,
    )


def validate_release_manifest(
    manifest_path: Path,
    *,
    asset_root: Path | None = None,
    check_files: bool = True,
    max_forms: int = DEFAULT_MAX_FORMS,
) -> ValidatedRelease:
    """Load and validate one release manifest and its local assets."""

    resolved_manifest = manifest_path.resolve()
    if not resolved_manifest.is_file():
        raise ManifestValidationError(f"manifest does not exist: {resolved_manifest}")
    try:
        manifest_bytes = resolved_manifest.read_bytes()
        raw = json.loads(manifest_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ManifestValidationError(f"manifest is not valid JSON: {exc}") from exc
    manifest = _require_mapping(raw, "manifest")

    _require_schema_version(manifest.get("schemaVersion"), "schemaVersion")

    release_id = _require_nonempty_string(manifest.get("releaseId"), "releaseId")
    if not RELEASE_ID_PATTERN.fullmatch(release_id):
        raise ManifestValidationError(
            "releaseId must be 5-80 lowercase letters, digits, '.', '_', or '-'"
        )

    source_commit = _require_commit(manifest.get("sourceCommit"), "sourceCommit")
    base_commit = _optional_commit(manifest.get("baseCommit"), "baseCommit")
    renderer_commit = _optional_commit(
        manifest.get("rendererCommit"),
        "rendererCommit",
    )
    if renderer_commit != source_commit:
        raise ManifestValidationError(
            "rendererCommit must equal sourceCommit for the in-tree renderer"
        )
    renderer_runtime = _validate_renderer_runtime(manifest.get("rendererRuntime"))
    render_theme = (
        _validate_render_theme(manifest["renderTheme"], "renderTheme")
        if "renderTheme" in manifest
        else None
    )

    previous_raw = manifest.get("previousReleaseId")
    previous_release_id: str | None
    if previous_raw is None:
        previous_release_id = None
    else:
        previous_release_id = _require_nonempty_string(previous_raw, "previousReleaseId")
        if not RELEASE_ID_PATTERN.fullmatch(previous_release_id):
            raise ManifestValidationError("previousReleaseId has an invalid release ID")
        if previous_release_id == release_id:
            raise ManifestValidationError("previousReleaseId must differ from releaseId")

    created_at = _validate_created_at(manifest.get("createdAt"))
    forms = manifest.get("forms")
    if not isinstance(forms, list) or not forms:
        raise ManifestValidationError("forms must be a non-empty JSON array")
    if max_forms <= 0:
        raise ManifestValidationError("max_forms must be positive")
    if len(forms) > max_forms:
        raise ManifestValidationError(
            f"release contains {len(forms)} forms; maximum allowed is {max_forms}"
        )

    resolved_asset_root = (asset_root or resolved_manifest.parent).resolve()
    if not resolved_asset_root.is_dir():
        raise ManifestValidationError(f"asset root does not exist: {resolved_asset_root}")

    catalog_ids: set[str] = set()
    slugs: set[str] = set()
    replacement_targets: set[str] = set()
    object_paths: set[str] = set()
    source_paths: set[Path] = set()
    validated_assets: list[ValidatedAsset] = []
    validated_forms: list[ValidatedForm] = []

    for index, form_payload in enumerate(forms):
        location = f"forms[{index}]"
        form = _require_mapping(form_payload, location)
        catalog_id = _require_nonempty_string(form.get("catalogId"), f"{location}.catalogId")
        if not CATALOG_ID_PATTERN.fullmatch(catalog_id):
            raise ManifestValidationError(f"{location}.catalogId has an invalid stable ID")
        slug = _require_nonempty_string(form.get("slug"), f"{location}.slug")
        if not SLUG_PATTERN.fullmatch(slug):
            raise ManifestValidationError(f"{location}.slug must be a canonical lowercase slug")
        source_section = _require_nonempty_string(
            form.get("sourceSection"),
            f"{location}.sourceSection",
        )
        if not SOURCE_SECTION_PATTERN.fullmatch(source_section):
            raise ManifestValidationError(f"{location}.sourceSection has an invalid section key")
        filename = _require_nonempty_string(form.get("filename"), f"{location}.filename")
        if not SOURCE_FILENAME_PATTERN.fullmatch(filename):
            raise ManifestValidationError(f"{location}.filename must be a PDF basename")
        expected_catalog_id = f"{source_section}/{filename[:-4]}"
        if catalog_id != expected_catalog_id:
            raise ManifestValidationError(
                f"{location}.catalogId must preserve exact source identity "
                f"{expected_catalog_id}"
            )
        _require_integer(form.get("pageCount"), f"{location}.pageCount")
        if catalog_id in catalog_ids:
            raise ManifestValidationError(f"duplicate catalogId: {catalog_id}")
        if slug in slugs:
            raise ManifestValidationError(f"duplicate slug: {slug}")
        replacement_target = f"{source_section}/{filename}"
        if replacement_target in replacement_targets:
            raise ManifestValidationError(
                f"duplicate sourceSection/filename target: {replacement_target}"
            )
        catalog_ids.add(catalog_id)
        slugs.add(slug)
        replacement_targets.add(replacement_target)

        form_assets: dict[str, ValidatedAsset] = {}
        for kind in ASSET_SPECS:
            asset = _validate_asset(
                payload=form.get(kind),
                kind=kind,
                location=f"{location}.{kind}",
                release_id=release_id,
                catalog_id=catalog_id,
                slug=slug,
                asset_root=resolved_asset_root,
                check_files=check_files,
            )
            if asset.object_path in object_paths:
                raise ManifestValidationError(f"duplicate objectPath: {asset.object_path}")
            if asset.source_path in source_paths:
                raise ManifestValidationError(f"duplicate sourcePath: {asset.source_path}")
            object_paths.add(asset.object_path)
            source_paths.add(asset.source_path)
            validated_assets.append(asset)
            form_assets[kind] = asset
        validated_forms.append(
            ValidatedForm(
                catalog_id=catalog_id,
                slug=slug,
                source_section=source_section,
                filename=filename,
                pdf=form_assets["pdf"],
                thumbnail=form_assets["thumbnail"],
            )
        )

    return ValidatedRelease(
        release_id=release_id,
        source_commit=source_commit,
        base_commit=base_commit,
        renderer_commit=renderer_commit,
        renderer_runtime=renderer_runtime,
        render_theme=render_theme,
        previous_release_id=previous_release_id,
        created_at=created_at,
        manifest_path=resolved_manifest,
        manifest_sha256=hashlib.sha256(manifest_bytes).hexdigest(),
        manifest_bytes=len(manifest_bytes),
        asset_root=resolved_asset_root,
        assets=tuple(validated_assets),
        forms=tuple(validated_forms),
        form_count=len(forms),
    )


def validate_frozen_ledger_attestation(
    attestation_path: Path,
    *,
    release: ValidatedRelease,
) -> ValidatedFrozenAttestation:
    """Validate one canonical ledger freeze against the exact release bytes.

    The item comparison is O(f), where ``f`` is the release form count. Both
    sides are indexed once by stable catalog ID so substitutions and omissions
    are detected without a quadratic cross-product.
    """

    resolved_path = attestation_path.resolve()
    if not resolved_path.is_file():
        raise ManifestValidationError(
            f"frozen ledger attestation does not exist: {resolved_path}"
        )
    try:
        attestation_bytes = resolved_path.read_bytes()
        raw = json.loads(
            attestation_bytes.decode("utf-8"),
            object_pairs_hook=_reject_duplicate_keys,
            parse_constant=_reject_nonfinite_json,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ManifestValidationError(
            f"frozen ledger attestation is not valid JSON: {exc}"
        ) from exc
    wrapper = _require_mapping(raw, "frozen ledger attestation")
    _require_schema_version(
        wrapper.get("schemaVersion"),
        "frozen ledger attestation schemaVersion",
    )
    if wrapper.get("status") != "frozen":
        raise ManifestValidationError(
            "frozen ledger attestation status must equal frozen"
        )

    batch_id = _require_nonempty_string(
        wrapper.get("batchId"),
        "frozen ledger attestation batchId",
    )
    if not RELEASE_ID_PATTERN.fullmatch(batch_id):
        raise ManifestValidationError(
            "frozen ledger attestation batchId has an invalid release ID"
        )
    if batch_id != release.release_id:
        raise ManifestValidationError(
            "frozen ledger attestation batchId does not match releaseId"
        )
    target_count = _require_integer(
        wrapper.get("targetCount"),
        "frozen ledger attestation targetCount",
    )
    if target_count != release.form_count:
        raise ManifestValidationError(
            "frozen ledger attestation targetCount does not match release form count"
        )
    base_commit = _require_commit(
        wrapper.get("baseCommit"),
        "frozen ledger attestation baseCommit",
    )
    renderer_commit = _require_commit(
        wrapper.get("rendererCommit"),
        "frozen ledger attestation rendererCommit",
    )
    source_commit = _require_commit(
        wrapper.get("sourceCommit"),
        "frozen ledger attestation sourceCommit",
    )
    if release.base_commit is None or base_commit != release.base_commit:
        raise ManifestValidationError(
            "frozen ledger attestation baseCommit does not match release baseCommit"
        )
    if release.renderer_commit is None or renderer_commit != release.renderer_commit:
        raise ManifestValidationError(
            "frozen ledger attestation rendererCommit does not match release rendererCommit"
        )
    if source_commit != release.source_commit:
        raise ManifestValidationError(
            "frozen ledger attestation sourceCommit does not match release sourceCommit"
        )
    frozen_at = _validate_frozen_at(wrapper.get("frozenAt"))
    frozen_digest = _require_sha256(
        wrapper.get("frozenDigest"),
        "frozen ledger attestation frozenDigest",
    )
    manifest = _require_mapping(
        wrapper.get("manifest"),
        "frozen ledger attestation manifest",
    )
    actual_frozen_digest = hashlib.sha256(
        _canonical_json(manifest).encode("utf-8")
    ).hexdigest()
    if frozen_digest != actual_frozen_digest:
        raise ManifestValidationError(
            "frozen ledger attestation frozenDigest does not match canonical manifest"
        )

    _require_schema_version(
        manifest.get("schema_version"),
        "frozen ledger manifest schema_version",
    )
    if manifest.get("batch_id") != batch_id:
        raise ManifestValidationError(
            "frozen ledger manifest batch_id does not match wrapper batchId"
        )
    inner_target_count = _require_integer(
        manifest.get("target_count"),
        "frozen ledger manifest target_count",
    )
    if inner_target_count != target_count:
        raise ManifestValidationError(
            "frozen ledger manifest target_count does not match wrapper targetCount"
        )
    if manifest.get("base_commit") != base_commit:
        raise ManifestValidationError(
            "frozen ledger manifest base_commit does not match wrapper baseCommit"
        )
    if manifest.get("renderer_commit") != renderer_commit:
        raise ManifestValidationError(
            "frozen ledger manifest renderer_commit does not match wrapper rendererCommit"
        )
    if manifest.get("source_commit") != source_commit:
        raise ManifestValidationError(
            "frozen ledger manifest source_commit does not match wrapper sourceCommit"
        )
    selection_digest = _require_sha256(
        manifest.get("selection_digest"),
        "frozen ledger manifest selection_digest",
    )
    build_report_hash = _require_sha256(
        manifest.get("build_report_hash"),
        "frozen ledger manifest build_report_hash",
    )
    release_manifest_hash = _require_sha256(
        manifest.get("release_manifest_hash"),
        "frozen ledger manifest release_manifest_hash",
    )
    if release_manifest_hash != release.manifest_sha256:
        raise ManifestValidationError(
            "frozen ledger manifest release_manifest_hash does not match release.json"
        )
    outer_hash_bindings = {
        "selectionDigest": selection_digest,
        "buildReportHash": build_report_hash,
        "releaseManifestHash": release_manifest_hash,
    }
    for field_name, expected in outer_hash_bindings.items():
        if field_name in wrapper and _require_sha256(
            wrapper[field_name],
            f"frozen ledger attestation {field_name}",
        ) != expected:
            raise ManifestValidationError(
                f"frozen ledger attestation {field_name} does not match manifest"
            )

    raw_items = manifest.get("items")
    if not isinstance(raw_items, list):
        raise ManifestValidationError("frozen ledger manifest items must be an array")
    if len(raw_items) != target_count:
        raise ManifestValidationError(
            "frozen ledger manifest item count does not match target_count"
        )
    release_forms = {form.catalog_id: form for form in release.forms}
    release_ids = set(release_forms)
    attested_ids: list[str] = []
    attested_id_set: set[str] = set()
    for index, raw_item in enumerate(raw_items):
        location = f"frozen ledger manifest items[{index}]"
        item = _require_mapping(raw_item, location)
        catalog_id = _require_nonempty_string(
            item.get("catalog_id"),
            f"{location}.catalog_id",
        )
        section = _require_nonempty_string(item.get("section"), f"{location}.section")
        filename = _require_nonempty_string(
            item.get("filename"),
            f"{location}.filename",
        )
        slug = _require_nonempty_string(item.get("slug"), f"{location}.slug")
        if not CATALOG_ID_PATTERN.fullmatch(catalog_id):
            raise ManifestValidationError(f"{location}.catalog_id has an invalid stable ID")
        if not SOURCE_SECTION_PATTERN.fullmatch(section):
            raise ManifestValidationError(f"{location}.section has an invalid section key")
        if not SOURCE_FILENAME_PATTERN.fullmatch(filename):
            raise ManifestValidationError(f"{location}.filename must be a PDF basename")
        if not SLUG_PATTERN.fullmatch(slug):
            raise ManifestValidationError(f"{location}.slug must be a canonical lowercase slug")
        if catalog_id != f"{section}/{filename[:-4]}":
            raise ManifestValidationError(
                f"{location}.catalog_id does not match section and filename"
            )
        if item.get("ownership") != "first_party":
            raise ManifestValidationError(f"{location}.ownership must equal first_party")
        for field_name in FROZEN_ATTESTATION_HASH_FIELDS:
            _require_sha256(item.get(field_name), f"{location}.{field_name}")
        for field_name in FROZEN_ATTESTATION_URI_FIELDS:
            _require_nonempty_string(item.get(field_name), f"{location}.{field_name}")
        if catalog_id in attested_id_set:
            raise ManifestValidationError(
                f"frozen ledger manifest contains duplicate catalog_id {catalog_id}"
            )
        attested_ids.append(catalog_id)
        attested_id_set.add(catalog_id)
        release_form = release_forms.get(catalog_id)
        if release_form is None:
            raise ManifestValidationError(
                f"{location}.catalog_id is not present in release.json"
            )
        identity = (section, filename, slug)
        expected_identity = (
            release_form.source_section,
            release_form.filename,
            release_form.slug,
        )
        if identity != expected_identity:
            raise ManifestValidationError(
                f"{location} stable identity does not match release.json"
            )
        exact_asset_bindings = {
            "pdf_hash": release_form.pdf.sha256,
            "thumbnail_hash": release_form.thumbnail.sha256,
            "pdf_uri": release_form.pdf.object_path,
            "thumbnail_uri": release_form.thumbnail.object_path,
        }
        for field_name, expected in exact_asset_bindings.items():
            if item.get(field_name) != expected:
                raise ManifestValidationError(
                    f"{location}.{field_name} does not match release.json"
                )

    if any(
        left >= right
        for left, right in zip(attested_ids, attested_ids[1:])
    ):
        raise ManifestValidationError(
            "frozen ledger manifest items must be sorted by catalog_id"
        )
    if attested_id_set != release_ids:
        missing = sorted(release_ids - attested_id_set)
        extra = sorted(attested_id_set - release_ids)
        raise ManifestValidationError(
            "frozen ledger manifest items do not exactly match release forms "
            f"(missing={missing[:5]}, extra={extra[:5]})"
        )

    return ValidatedFrozenAttestation(
        path=resolved_path,
        sha256=hashlib.sha256(attestation_bytes).hexdigest(),
        byte_count=len(attestation_bytes),
        batch_id=batch_id,
        target_count=target_count,
        base_commit=base_commit,
        renderer_commit=renderer_commit,
        source_commit=source_commit,
        frozen_digest=frozen_digest,
        frozen_at=frozen_at,
        selection_digest=selection_digest,
        build_report_hash=build_report_hash,
        release_manifest_hash=release_manifest_hash,
        items=tuple(dict(item) for item in raw_items),
    )


def validate_frozen_evidence_files(
    *,
    attestation: ValidatedFrozenAttestation,
    release: ValidatedRelease,
    build_report_path: Path,
) -> None:
    """Open every attested build, QA, and visual-review byte before promotion."""

    resolved_report = build_report_path.resolve()
    if not resolved_report.is_file() or _hash_file(resolved_report) != (
        attestation.build_report_hash
    ):
        raise ManifestValidationError(
            "frozen ledger build_report_hash does not match the supplied build report"
        )
    try:
        report = json.loads(resolved_report.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestValidationError(
            f"supplied build report is not valid JSON: {exc}"
        ) from exc
    if not isinstance(report, dict):
        raise ManifestValidationError("supplied build report must be a JSON object")
    _require_matching_render_theme(
        expected=release.render_theme,
        payload=report,
        location="build report",
    )
    results = report.get("results")
    if not isinstance(results, list):
        raise ManifestValidationError("supplied build report has no results array")
    result_by_id = {
        result.get("catalogId"): result
        for result in results
        if isinstance(result, dict)
    }
    if (
        len(result_by_id) != len(results)
        or set(result_by_id) != {form.catalog_id for form in release.forms}
    ):
        raise ManifestValidationError(
            "supplied build report does not exactly cover release forms"
        )

    build_root = resolved_report.parent
    release_form_by_id = {form.catalog_id: form for form in release.forms}
    manifest_payload = json.loads(
        release.manifest_path.read_text(encoding="utf-8")
    )
    page_count_by_id = {
        form["catalogId"]: form["pageCount"]
        for form in manifest_payload["forms"]
    }
    review_receipts: dict[Path, tuple[str, dict[str, Any]]] = {}
    for item in attestation.items:
        catalog_id = item["catalog_id"]
        result = result_by_id[catalog_id]
        exact_build_fields = {
            "spec_hash": result.get("specSha256"),
            "schema_hash": result.get("schemaSha256"),
            "qa_evidence_hash": result.get("qaSha256"),
        }
        for field_name, expected in exact_build_fields.items():
            if item.get(field_name) != expected:
                raise ManifestValidationError(
                    f"{catalog_id}: frozen {field_name} does not match build report"
                )
        qa_value = result.get("qaPath")
        if not isinstance(qa_value, str) or not qa_value:
            raise ManifestValidationError(f"{catalog_id}: build QA path is invalid")
        qa_candidate = Path(qa_value)
        qa_path = (
            qa_candidate.resolve()
            if qa_candidate.is_absolute()
            else (build_root / qa_candidate).resolve()
        )
        attested_qa_candidate = Path(item["qa_evidence_uri"])
        attested_qa_path = (
            attested_qa_candidate.resolve()
            if attested_qa_candidate.is_absolute()
            else (build_root / attested_qa_candidate).resolve()
        )
        if (
            qa_path != attested_qa_path
            or not qa_path.is_file()
            or _hash_file(qa_path) != item["qa_evidence_hash"]
        ):
            raise ManifestValidationError(
                f"{catalog_id}: frozen QA evidence bytes do not match"
            )

        review_candidate = Path(item["review_evidence_uri"])
        review_path = (
            review_candidate.resolve()
            if review_candidate.is_absolute()
            else (build_root / review_candidate).resolve()
        )
        if review_path not in review_receipts:
            if not review_path.is_file():
                raise ManifestValidationError(
                    f"{catalog_id}: frozen visual-review receipt is missing"
                )
            review_hash = _hash_file(review_path)
            try:
                receipt = json.loads(review_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise ManifestValidationError(
                    f"visual-review receipt is not valid JSON: {exc}"
                ) from exc
            if not isinstance(receipt, dict):
                raise ManifestValidationError(
                    "visual-review receipt must be a JSON object"
                )
            _require_matching_render_theme(
                expected=release.render_theme,
                payload=receipt,
                location=f"visual-review receipt {review_path}",
            )
            review_receipts[review_path] = (review_hash, receipt)
        review_hash, receipt = review_receipts[review_path]
        if review_hash != item["review_evidence_hash"]:
            raise ManifestValidationError(
                f"{catalog_id}: frozen visual-review hash does not match bytes"
            )
        if (
            receipt.get("schemaVersion") != 1
            or receipt.get("reportType") != "form-catalog-visual-review"
            or receipt.get("releaseId") != release.release_id
            or receipt.get("sourceCommit") != release.source_commit
            or receipt.get("buildReportSha256") != attestation.build_report_hash
            or receipt.get("passed") is not True
        ):
            raise ManifestValidationError(
                f"{catalog_id}: visual-review receipt binding is invalid"
            )
        receipt_items = receipt.get("items")
        if not isinstance(receipt_items, list):
            raise ManifestValidationError(
                f"{catalog_id}: visual-review receipt has no items"
            )
        matching = [
            raw
            for raw in receipt_items
            if isinstance(raw, dict) and raw.get("catalogId") == catalog_id
        ]
        release_form = release_form_by_id[catalog_id]
        page_count = page_count_by_id[catalog_id]
        if (
            len(matching) != 1
            or matching[0].get("status") != "approved"
            or matching[0].get("defects") != []
            or matching[0].get("pdfSha256") != release_form.pdf.sha256
            or matching[0].get("pageCount") != page_count
            or matching[0].get("pagesReviewed")
            != list(range(1, page_count + 1))
        ):
            raise ManifestValidationError(
                f"{catalog_id}: visual-review item is not an exact page-complete approval"
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate an immutable form-catalog release manifest.",
    )
    parser.add_argument("--manifest", required=True, help="Release manifest JSON path.")
    parser.add_argument(
        "--asset-root",
        help="Base directory for sourcePath values. Defaults to the manifest directory.",
    )
    parser.add_argument(
        "--max-forms",
        type=int,
        default=DEFAULT_MAX_FORMS,
        help=f"Maximum forms allowed in one release. Defaults to {DEFAULT_MAX_FORMS}.",
    )
    parser.add_argument(
        "--skip-files",
        action="store_true",
        help="Validate schema and paths without hashing local files.",
    )
    parser.add_argument(
        "--frozen-ledger-manifest",
        help=(
            "Frozen ledger attestation to bind approved QA/review evidence and "
            "exact assets to this release. Deployment always requires it."
        ),
    )
    parser.add_argument(
        "--format",
        choices=("summary", "json", "assets-tsv"),
        default="summary",
        help="Output a human summary, JSON summary, or tab-separated upload plan.",
    )
    parser.add_argument(
        "--get-field",
        choices=(
            "releaseId",
            "sourceCommit",
            "previousReleaseId",
            "manifestObjectPath",
            "manifestSha256",
            "manifestBytes",
            "hostingVersion",
            "rollbackHostingVersion",
            "hostingEvidenceSha256",
            "liveReportSha256",
            "browserReportSha256",
            "frozenDigest",
            "frozenAttestationSha256",
        ),
        help="Print one validated metadata field for deployment orchestration.",
    )
    parser.add_argument(
        "--hosting-evidence",
        help="Successful exact-hosting deployment evidence required for promotion.",
    )
    parser.add_argument(
        "--active-mapping-evidence",
        help=(
            "Controlled-deploy proof that active.json, formCatalogData.mjs, "
            "and the current release manifest agree exactly."
        ),
    )
    parser.add_argument(
        "--active-release-contract",
        help="Tracked cumulative form catalog activation contract.",
    )
    parser.add_argument(
        "--form-catalog-data",
        help="Tracked generated frontend form catalog module.",
    )
    parser.add_argument(
        "--require-committed-active-mapping",
        action="store_true",
        help=(
            "Verify supplied active/index snapshot bytes against their canonical "
            "paths in Git HEAD. Required by executed production promotion."
        ),
    )
    parser.add_argument(
        "--live-report",
        help="Successful release-bound HTTP sample report required for promotion.",
    )
    parser.add_argument(
        "--browser-report",
        help="Successful release-bound browser-canary report required for promotion.",
    )
    parser.add_argument(
        "--sample-plan",
        help="Exact deterministic sample plan consumed by live and browser checks.",
    )
    parser.add_argument(
        "--selection",
        help="Tracked release selection used to recompute the promotion sample.",
    )
    parser.add_argument(
        "--build-report",
        help="Exact passing build report used to recompute the promotion sample.",
    )
    parser.add_argument(
        "--expected-deployment-commit",
        help="Exact commit deployed by the controlled production Hosting workflow.",
    )
    parser.add_argument(
        "--expected-workflow-run-id",
        help="GitHub Actions run ID that produced the Hosting evidence artifact.",
    )
    parser.add_argument(
        "--expected-workflow-run-attempt",
        help="GitHub Actions run attempt that produced the Hosting evidence artifact.",
    )
    return parser.parse_args()


def _print_release(
    release: ValidatedRelease,
    output_format: str,
    frozen_attestation: ValidatedFrozenAttestation | None,
    promotion_evidence: ValidatedPromotionEvidence | None,
) -> None:
    if output_format == "json":
        payload = {
            **release.summary(),
            "assets": [asset.as_dict() for asset in release.assets],
        }
        if promotion_evidence is not None:
            payload["promotionEvidence"] = promotion_evidence.as_dict()
        if frozen_attestation is not None:
            payload["frozenLedgerAttestation"] = frozen_attestation.as_dict()
        print(json.dumps(payload, indent=2, sort_keys=True))
        return
    if output_format == "assets-tsv":
        for asset in release.assets:
            print(
                "\t".join(
                    (
                        str(asset.source_path),
                        asset.object_path,
                        asset.content_type,
                        asset.sha256,
                        str(asset.byte_count),
                    )
                )
            )
        return

    summary = release.summary()
    print(
        "Validated form-catalog release "
        f"{summary['releaseId']}: forms={summary['formCount']} "
        f"assets={summary['assetCount']} bytes={summary['assetBytes']}"
    )
    if frozen_attestation is not None:
        print(
            "Validated frozen ledger attestation "
            f"{frozen_attestation.frozen_digest} "
            f"(sha256={frozen_attestation.sha256})"
        )


def main() -> int:
    args = parse_args()
    evidence_paths = (
        args.hosting_evidence,
        args.active_mapping_evidence,
        args.active_release_contract,
        args.form_catalog_data,
        args.live_report,
        args.browser_report,
        args.sample_plan,
        args.selection,
        args.build_report,
        args.expected_deployment_commit,
        args.expected_workflow_run_id,
        args.expected_workflow_run_attempt,
    )
    if any(evidence_paths) and not all(evidence_paths):
        print(
            "Form catalog release validation failed: --hosting-evidence, "
            "--active-mapping-evidence, --active-release-contract, "
            "--form-catalog-data, --live-report, --browser-report, "
            "--sample-plan, --selection, "
            "--build-report, --expected-deployment-commit, "
            "--expected-workflow-run-id, and --expected-workflow-run-attempt "
            "must be supplied together",
            file=sys.stderr,
        )
        return 1
    try:
        release = validate_release_manifest(
            Path(args.manifest),
            asset_root=Path(args.asset_root) if args.asset_root else None,
            check_files=not args.skip_files,
            max_forms=args.max_forms,
        )
        frozen_attestation = None
        if args.frozen_ledger_manifest:
            frozen_attestation = validate_frozen_ledger_attestation(
                Path(args.frozen_ledger_manifest),
                release=release,
            )
        promotion_evidence = None
        if all(evidence_paths):
            if frozen_attestation is None:
                raise ManifestValidationError(
                    "promotion requires a frozen ledger attestation"
                )
            validate_frozen_evidence_files(
                attestation=frozen_attestation,
                release=release,
                build_report_path=Path(args.build_report),
            )
            promotion_evidence = validate_promotion_evidence(
                hosting_evidence_path=args.hosting_evidence,
                active_mapping_evidence_path=args.active_mapping_evidence,
                active_release_path=args.active_release_contract,
                form_catalog_data_path=args.form_catalog_data,
                live_report_path=args.live_report,
                browser_report_path=args.browser_report,
                sample_plan_path=args.sample_plan,
                selection_path=args.selection,
                build_report_path=args.build_report,
                manifest_path=release.manifest_path,
                release_id=release.release_id,
                source_commit=release.source_commit,
                manifest_sha256=release.manifest_sha256,
                expected_selection_digest=frozen_attestation.selection_digest,
                expected_build_report_sha256=frozen_attestation.build_report_hash,
                expected_project_id=PRODUCTION_PROJECT_ID,
                expected_site=PRODUCTION_HOSTING_SITE,
                required_site_origins=PRODUCTION_SITE_ORIGINS,
                required_asset_base_urls=PRODUCTION_ASSET_BASE_URLS,
                expected_deployment_commit=args.expected_deployment_commit.lower(),
                expected_workflow_run_id=args.expected_workflow_run_id,
                expected_workflow_run_attempt=args.expected_workflow_run_attempt,
                require_committed_mapping=args.require_committed_active_mapping,
            )
    except (ManifestValidationError, PromotionEvidenceError, OSError) as exc:
        print(f"Form catalog release validation failed: {exc}", file=sys.stderr)
        return 1

    if args.get_field:
        values = {
            "releaseId": release.release_id,
            "sourceCommit": release.source_commit,
            "previousReleaseId": release.previous_release_id or "",
            "manifestObjectPath": release.manifest_object_path,
            "manifestSha256": release.manifest_sha256,
            "manifestBytes": str(release.manifest_bytes),
            "hostingVersion": (
                promotion_evidence.hosting_version if promotion_evidence else ""
            ),
            "rollbackHostingVersion": (
                promotion_evidence.rollback_hosting_version
                if promotion_evidence
                else ""
            ),
            "hostingEvidenceSha256": (
                promotion_evidence.hosting_evidence_sha256
                if promotion_evidence
                else ""
            ),
            "liveReportSha256": (
                promotion_evidence.live_report_sha256 if promotion_evidence else ""
            ),
            "browserReportSha256": (
                promotion_evidence.browser_report_sha256
                if promotion_evidence
                else ""
            ),
            "frozenDigest": (
                frozen_attestation.frozen_digest if frozen_attestation else ""
            ),
            "frozenAttestationSha256": (
                frozen_attestation.sha256 if frozen_attestation else ""
            ),
        }
        print(values[args.get_field])
        return 0

    _print_release(
        release,
        args.format,
        frozen_attestation,
        promotion_evidence,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
