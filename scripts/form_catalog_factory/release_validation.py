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
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any

from .promotion_evidence import (
    PromotionEvidenceError,
    ValidatedPromotionEvidence,
    validate_promotion_evidence,
)


SCHEMA_VERSION = 1
DEFAULT_MAX_FORMS = 1000
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
class ValidatedRelease:
    """Validated release metadata and deterministic upload plan."""

    release_id: str
    source_commit: str
    previous_release_id: str | None
    created_at: str
    manifest_path: Path
    manifest_sha256: str
    manifest_bytes: int
    asset_root: Path
    assets: tuple[ValidatedAsset, ...]
    form_count: int

    @property
    def manifest_object_path(self) -> str:
        return f"releases/{self.release_id}/release-manifest.json"

    def summary(self) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "releaseId": self.release_id,
            "sourceCommit": self.source_commit,
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

    sha256 = _require_nonempty_string(asset["sha256"], f"{location}.sha256").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", sha256):
        raise ManifestValidationError(f"{location}.sha256 must contain 64 hexadecimal characters")

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

    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        raise ManifestValidationError(f"schemaVersion must equal {SCHEMA_VERSION}")

    release_id = _require_nonempty_string(manifest.get("releaseId"), "releaseId")
    if not RELEASE_ID_PATTERN.fullmatch(release_id):
        raise ManifestValidationError(
            "releaseId must be 5-80 lowercase letters, digits, '.', '_', or '-'"
        )

    source_commit = _require_nonempty_string(manifest.get("sourceCommit"), "sourceCommit").lower()
    if not COMMIT_PATTERN.fullmatch(source_commit):
        raise ManifestValidationError("sourceCommit must be a 40- or 64-character Git object ID")

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
        page_count = form.get("pageCount")
        if not isinstance(page_count, int) or isinstance(page_count, bool) or page_count <= 0:
            raise ManifestValidationError(f"{location}.pageCount must be a positive integer")
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

    return ValidatedRelease(
        release_id=release_id,
        source_commit=source_commit,
        previous_release_id=previous_release_id,
        created_at=created_at,
        manifest_path=resolved_manifest,
        manifest_sha256=hashlib.sha256(manifest_bytes).hexdigest(),
        manifest_bytes=len(manifest_bytes),
        asset_root=resolved_asset_root,
        assets=tuple(validated_assets),
        form_count=len(forms),
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
        ),
        help="Print one validated metadata field for deployment orchestration.",
    )
    parser.add_argument(
        "--hosting-evidence",
        help="Successful exact-hosting deployment evidence required for promotion.",
    )
    parser.add_argument(
        "--live-report",
        help="Successful release-bound HTTP sample report required for promotion.",
    )
    parser.add_argument(
        "--browser-report",
        help="Successful release-bound browser-canary report required for promotion.",
    )
    return parser.parse_args()


def _print_release(
    release: ValidatedRelease,
    output_format: str,
    promotion_evidence: ValidatedPromotionEvidence | None,
) -> None:
    if output_format == "json":
        payload = {
            **release.summary(),
            "assets": [asset.as_dict() for asset in release.assets],
        }
        if promotion_evidence is not None:
            payload["promotionEvidence"] = promotion_evidence.as_dict()
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


def main() -> int:
    args = parse_args()
    evidence_paths = (
        args.hosting_evidence,
        args.live_report,
        args.browser_report,
    )
    if any(evidence_paths) and not all(evidence_paths):
        print(
            "Form catalog release validation failed: --hosting-evidence, "
            "--live-report, and --browser-report must be supplied together",
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
        promotion_evidence = None
        if all(evidence_paths):
            promotion_evidence = validate_promotion_evidence(
                hosting_evidence_path=args.hosting_evidence,
                live_report_path=args.live_report,
                browser_report_path=args.browser_report,
                release_id=release.release_id,
                source_commit=release.source_commit,
                manifest_sha256=release.manifest_sha256,
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
        }
        print(values[args.get_field])
        return 0

    _print_release(release, args.format, promotion_evidence)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
