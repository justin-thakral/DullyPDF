"""Scalable create-only transport for immutable form-catalog release objects.

The transport deliberately has no command-line or subprocess integration.  A
caller supplies one canonical object plan, and this module uses one long-lived
``google-cloud-storage`` client for bounded uploads and one paginated inventory
scan.  Cloud interactions are dependency-injected so the safety contract can be
tested without mutating a bucket.
"""

from __future__ import annotations

import base64
import binascii
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
from typing import Any, Mapping

from google.api_core.exceptions import PreconditionFailed
from google.cloud import storage
from google.cloud.storage import retry as storage_retry


PLAN_SCHEMA_VERSION = 1
PLAN_REPORT_TYPE = "form-catalog-gcs-expected-object-plan"
INVENTORY_REPORT_TYPE = "form-catalog-gcs-inventory"
INVENTORY_PRODUCER = "google-cloud-storage"
REQUIRED_STORAGE_VERSION = "3.9.0"
DEFAULT_MAX_WORKERS = 12
MIN_MAX_WORKERS = 1
MAX_MAX_WORKERS = 32
DEFAULT_PAGE_SIZE = 1000
MIN_PAGE_SIZE = 1
MAX_PAGE_SIZE = 1000
DEFAULT_TIMEOUT_SECONDS = 60

_PROJECT_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]{4,61}[a-z0-9]$")
_BUCKET_PATTERN = re.compile(
    r"^(?=.{3,222}$)(?!goog)(?!.*google)[a-z0-9]"
    r"(?:[a-z0-9._-]*[a-z0-9])?$"
)
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
_CONTENT_TYPE_PATTERN = re.compile(
    r"^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$"
)
_METADATA_KEY_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,127}$")
_PLAN_KEYS = frozenset(
    {
        "schemaVersion",
        "reportType",
        "projectId",
        "bucket",
        "prefix",
        "objects",
    }
)
_OBJECT_KEYS = frozenset(
    {
        "objectPath",
        "sourcePath",
        "bytes",
        "sha256",
        "md5Base64",
        "contentType",
        "cacheControl",
        "customMetadata",
    }
)


class GcsTransportError(RuntimeError):
    """The expected-object plan, upload, or remote inventory is unsafe."""


class ExpectedObjectPlanError(GcsTransportError):
    """The canonical expected-object plan is malformed or ambiguous."""


class GcsUploadError(GcsTransportError):
    """An immutable object could not be created or proven identical."""


class GcsInventoryError(GcsTransportError):
    """The remote release prefix does not exactly match the expected plan."""


@dataclass(frozen=True)
class ExpectedObject:
    """One local byte source and its complete expected remote representation."""

    object_path: str
    source_path: Path
    byte_count: int
    sha256_hex: str
    md5_base64: str
    content_type: str
    cache_control: str
    custom_metadata: tuple[tuple[str, str], ...]

    @property
    def metadata(self) -> dict[str, str]:
        """Return a mutable copy suitable for a fresh SDK ``Blob`` instance."""

        return dict(self.custom_metadata)

    def expected_inventory_entry(self) -> dict[str, Any]:
        """Return the canonical remote fields, excluding local source location."""

        return {
            "objectPath": self.object_path,
            "bytes": self.byte_count,
            "sha256": self.sha256_hex,
            "md5Base64": self.md5_base64,
            "contentType": self.content_type,
            "cacheControl": self.cache_control,
            "customMetadata": self.metadata,
        }


@dataclass(frozen=True)
class ExpectedObjectPlan:
    """A validated, deterministically ordered release-prefix upload plan."""

    project_id: str
    bucket: str
    prefix: str
    objects: tuple[ExpectedObject, ...]

    @property
    def expected_inventory_digest(self) -> str:
        """Bind the target bucket, prefix, and every expected remote field."""

        return _canonical_digest(
            {
                "projectId": self.project_id,
                "bucket": self.bucket,
                "prefix": self.prefix,
                "objects": [
                    item.expected_inventory_entry() for item in self.objects
                ],
            }
        )


@dataclass(frozen=True)
class UploadOutcome:
    """The immutable generation observed after one create-or-verify operation."""

    object_path: str
    generation: str
    disposition: str


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _canonical_digest(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def validate_storage_dependency_version(version: Any | None = None) -> str:
    """Fail closed unless the runtime matches the audited storage SDK exactly."""

    actual = storage.__version__ if version is None else version
    if actual != REQUIRED_STORAGE_VERSION:
        raise GcsTransportError(
            "google-cloud-storage runtime version must be exactly "
            f"{REQUIRED_STORAGE_VERSION}; found {actual!r}"
        )
    return actual


def _reject_duplicate_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ExpectedObjectPlanError(f"JSON contains duplicate key {key!r}")
        result[key] = value
    return result


def _exact_keys(
    value: Mapping[str, Any],
    *,
    expected: frozenset[str],
    location: str,
) -> None:
    actual = set(value)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing or extra:
        details: list[str] = []
        if missing:
            details.append(f"missing {', '.join(missing)}")
        if extra:
            details.append(f"unexpected {', '.join(extra)}")
        raise ExpectedObjectPlanError(f"{location} has {'; '.join(details)}")


def _required_trimmed_string(value: Any, location: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or value != value.strip()
        or any(ord(character) < 32 or ord(character) == 127 for character in value)
    ):
        raise ExpectedObjectPlanError(
            f"{location} must be a non-empty trimmed string"
        )
    return value


def _normalized_object_path(value: Any, location: str) -> str:
    raw = _required_trimmed_string(value, location)
    path = PurePosixPath(raw)
    if (
        path.is_absolute()
        or raw.endswith("/")
        or str(path) != raw
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise ExpectedObjectPlanError(
            f"{location} must be a normalized relative object path"
        )
    return raw


def _normalized_prefix(value: Any) -> str:
    raw = _required_trimmed_string(value, "plan.prefix")
    if not raw.endswith("/"):
        raise ExpectedObjectPlanError("plan.prefix must end with '/'")
    without_slash = raw[:-1]
    if not without_slash:
        raise ExpectedObjectPlanError("plan.prefix cannot be the bucket root")
    normalized = _normalized_object_path(without_slash, "plan.prefix")
    return f"{normalized}/"


def _absolute_source_path(value: Any, location: str) -> Path:
    raw = _required_trimmed_string(value, location)
    path = Path(raw)
    if (
        not path.is_absolute()
        or str(path) != raw
        or any(part in {".", ".."} for part in path.parts)
    ):
        raise ExpectedObjectPlanError(
            f"{location} must be a normalized absolute filesystem path"
        )
    return path


def _positive_int(value: Any, location: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ExpectedObjectPlanError(f"{location} must be a positive integer")
    return value


def _md5_base64(value: Any, location: str) -> str:
    raw = _required_trimmed_string(value, location)
    try:
        decoded = base64.b64decode(raw, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ExpectedObjectPlanError(
            f"{location} must be canonical base64"
        ) from exc
    if len(decoded) != 16 or base64.b64encode(decoded).decode("ascii") != raw:
        raise ExpectedObjectPlanError(
            f"{location} must encode exactly one MD5 digest"
        )
    return raw


def _custom_metadata(value: Any, location: str) -> tuple[tuple[str, str], ...]:
    if not isinstance(value, dict) or not value:
        raise ExpectedObjectPlanError(f"{location} must be a non-empty object")
    normalized: list[tuple[str, str]] = []
    for raw_key, raw_value in value.items():
        key = _required_trimmed_string(raw_key, f"{location} key")
        if not _METADATA_KEY_PATTERN.fullmatch(key):
            raise ExpectedObjectPlanError(
                f"{location} key {key!r} is not normalized"
            )
        metadata_value = _required_trimmed_string(
            raw_value,
            f"{location}.{key}",
        )
        normalized.append((key, metadata_value))
    return tuple(sorted(normalized))


def parse_expected_object_plan(payload: Mapping[str, Any]) -> ExpectedObjectPlan:
    """Validate an already decoded canonical expected-object plan.

    Object rows must be sorted by ``objectPath``.  Enforcing order at the
    boundary prevents two semantically identical plans from producing different
    operator review diffs, while digests independently sort object metadata
    keys.
    """

    if not isinstance(payload, Mapping):
        raise ExpectedObjectPlanError("Expected-object plan must be a JSON object")
    _exact_keys(payload, expected=_PLAN_KEYS, location="plan")
    if payload["schemaVersion"] != PLAN_SCHEMA_VERSION:
        raise ExpectedObjectPlanError(
            f"plan.schemaVersion must be {PLAN_SCHEMA_VERSION}"
        )
    if payload["reportType"] != PLAN_REPORT_TYPE:
        raise ExpectedObjectPlanError(
            f"plan.reportType must be {PLAN_REPORT_TYPE!r}"
        )

    project_id = _required_trimmed_string(payload["projectId"], "plan.projectId")
    if not _PROJECT_ID_PATTERN.fullmatch(project_id):
        raise ExpectedObjectPlanError("plan.projectId is invalid")
    bucket = _required_trimmed_string(payload["bucket"], "plan.bucket")
    if bucket.startswith("gs://") or not _BUCKET_PATTERN.fullmatch(bucket):
        raise ExpectedObjectPlanError(
            "plan.bucket must be a normalized bucket name without gs://"
        )
    prefix = _normalized_prefix(payload["prefix"])

    raw_objects = payload["objects"]
    if not isinstance(raw_objects, list) or not raw_objects:
        raise ExpectedObjectPlanError("plan.objects must be a non-empty array")

    objects: list[ExpectedObject] = []
    previous_path = ""
    for index, raw in enumerate(raw_objects):
        location = f"plan.objects[{index}]"
        if not isinstance(raw, Mapping):
            raise ExpectedObjectPlanError(f"{location} must be an object")
        _exact_keys(raw, expected=_OBJECT_KEYS, location=location)
        object_path = _normalized_object_path(
            raw["objectPath"],
            f"{location}.objectPath",
        )
        if not object_path.startswith(prefix):
            raise ExpectedObjectPlanError(
                f"{location}.objectPath is outside plan.prefix"
            )
        if previous_path and object_path <= previous_path:
            raise ExpectedObjectPlanError(
                "plan.objects must have unique, strictly sorted objectPath values"
            )
        previous_path = object_path
        sha256_hex = _required_trimmed_string(
            raw["sha256"],
            f"{location}.sha256",
        )
        if not _SHA256_PATTERN.fullmatch(sha256_hex):
            raise ExpectedObjectPlanError(
                f"{location}.sha256 must be 64 lowercase hexadecimal characters"
            )
        content_type = _required_trimmed_string(
            raw["contentType"],
            f"{location}.contentType",
        )
        if not _CONTENT_TYPE_PATTERN.fullmatch(content_type):
            raise ExpectedObjectPlanError(
                f"{location}.contentType is not a normalized media type"
            )
        metadata = _custom_metadata(
            raw["customMetadata"],
            f"{location}.customMetadata",
        )
        metadata_dict = dict(metadata)
        if metadata_dict.get("catalog_sha256") != sha256_hex:
            raise ExpectedObjectPlanError(
                f"{location}.customMetadata.catalog_sha256 must equal sha256"
            )
        objects.append(
            ExpectedObject(
                object_path=object_path,
                source_path=_absolute_source_path(
                    raw["sourcePath"],
                    f"{location}.sourcePath",
                ),
                byte_count=_positive_int(raw["bytes"], f"{location}.bytes"),
                sha256_hex=sha256_hex,
                md5_base64=_md5_base64(
                    raw["md5Base64"],
                    f"{location}.md5Base64",
                ),
                content_type=content_type,
                cache_control=_required_trimmed_string(
                    raw["cacheControl"],
                    f"{location}.cacheControl",
                ),
                custom_metadata=metadata,
            )
        )

    return ExpectedObjectPlan(
        project_id=project_id,
        bucket=bucket,
        prefix=prefix,
        objects=tuple(objects),
    )


def load_expected_object_plan(path: str | Path) -> ExpectedObjectPlan:
    """Read JSON with duplicate-key rejection, then validate its canonical schema."""

    source = Path(path)
    try:
        payload = json.loads(
            source.read_text(encoding="utf-8"),
            object_pairs_hook=_reject_duplicate_pairs,
        )
    except ExpectedObjectPlanError:
        raise
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ExpectedObjectPlanError(
            f"Could not read expected-object plan {source}: {exc}"
        ) from exc
    return parse_expected_object_plan(payload)


def _validate_worker_count(value: int) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value < MIN_MAX_WORKERS
        or value > MAX_MAX_WORKERS
    ):
        raise GcsTransportError(
            f"max_workers must be from {MIN_MAX_WORKERS} through {MAX_MAX_WORKERS}"
        )
    return value


def _validate_page_size(value: int) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value < MIN_PAGE_SIZE
        or value > MAX_PAGE_SIZE
    ):
        raise GcsTransportError(
            f"page_size must be from {MIN_PAGE_SIZE} through {MAX_PAGE_SIZE}"
        )
    return value


def _positive_generation(value: Any, location: str) -> str:
    if isinstance(value, bool):
        raise GcsInventoryError(f"{location} must be a positive generation")
    raw = str(value) if value is not None else ""
    if not raw.isdigit() or int(raw) <= 0 or str(int(raw)) != raw:
        raise GcsInventoryError(f"{location} must be a canonical positive generation")
    return raw


def _blob_inventory_entry(blob: Any) -> dict[str, Any]:
    name = getattr(blob, "name", None)
    if not isinstance(name, str) or not name:
        raise GcsInventoryError("Listed object has no normalized name")
    size = getattr(blob, "size", None)
    if isinstance(size, bool):
        raise GcsInventoryError(f"Remote object {name} has invalid size")
    try:
        normalized_size = int(size)
    except (TypeError, ValueError) as exc:
        raise GcsInventoryError(f"Remote object {name} has invalid size") from exc
    if normalized_size <= 0 or str(normalized_size) != str(size):
        raise GcsInventoryError(f"Remote object {name} has noncanonical size")
    metadata = getattr(blob, "metadata", None)
    if not isinstance(metadata, dict):
        raise GcsInventoryError(f"Remote object {name} has invalid custom metadata")
    if any(
        not isinstance(key, str) or not isinstance(value, str)
        for key, value in metadata.items()
    ):
        raise GcsInventoryError(f"Remote object {name} has invalid custom metadata")
    sha256_hex = metadata.get("catalog_sha256")
    if not isinstance(sha256_hex, str):
        raise GcsInventoryError(
            f"Remote object {name} has no catalog_sha256 metadata"
        )
    return {
        "objectPath": name,
        "bytes": normalized_size,
        "sha256": sha256_hex,
        "md5Base64": getattr(blob, "md5_hash", None),
        "contentType": getattr(blob, "content_type", None),
        "cacheControl": getattr(blob, "cache_control", None),
        "customMetadata": dict(sorted(metadata.items())),
        "generation": _positive_generation(
            getattr(blob, "generation", None),
            f"Remote object {name} generation",
        ),
        "metageneration": _positive_generation(
            getattr(blob, "metageneration", None),
            f"Remote object {name} metageneration",
        ),
    }


def _validate_remote_entry(
    expected: ExpectedObject,
    actual: Mapping[str, Any],
) -> None:
    expected_entry = expected.expected_inventory_entry()
    mismatches = [
        key
        for key, expected_value in expected_entry.items()
        if actual.get(key) != expected_value
    ]
    if mismatches:
        raise GcsInventoryError(
            f"Remote object {expected.object_path} mismatched fields: "
            f"{', '.join(sorted(mismatches))}"
        )


def _inventory_report(
    plan: ExpectedObjectPlan,
    *,
    client: Any,
    bucket: Any,
    expected_generations: Mapping[str, str] | None,
    page_size: int,
    timeout_seconds: int,
    producer_version: str,
) -> dict[str, Any]:
    expected_by_name = {item.object_path: item for item in plan.objects}
    if expected_generations is not None and set(expected_generations) != set(
        expected_by_name
    ):
        raise GcsInventoryError(
            "Expected generation observations do not cover the exact object plan"
        )

    try:
        iterator = client.list_blobs(
            bucket,
            prefix=plan.prefix,
            page_size=page_size,
            versions=False,
            timeout=timeout_seconds,
            retry=storage_retry.DEFAULT_RETRY,
        )
        remote_by_name: dict[str, dict[str, Any]] = {}
        page_count = 0
        for page in iterator.pages:
            page_count += 1
            for blob in page:
                entry = _blob_inventory_entry(blob)
                name = entry["objectPath"]
                if name in remote_by_name:
                    raise GcsInventoryError(
                        f"Remote inventory contains duplicate object {name}"
                    )
                remote_by_name[name] = entry
    except GcsInventoryError:
        raise
    except Exception as exc:
        raise GcsInventoryError(
            f"Could not list release prefix gs://{plan.bucket}/{plan.prefix}: {exc}"
        ) from exc

    expected_names = set(expected_by_name)
    remote_names = set(remote_by_name)
    missing = sorted(expected_names - remote_names)
    extra = sorted(remote_names - expected_names)
    if missing or extra:
        details: list[str] = []
        if missing:
            details.append(
                f"missing {len(missing)} ({', '.join(missing[:3])})"
            )
        if extra:
            details.append(f"extra {len(extra)} ({', '.join(extra[:3])})")
        raise GcsInventoryError(
            f"Remote inventory exact-set mismatch: {'; '.join(details)}"
        )

    objects: list[dict[str, Any]] = []
    for expected in plan.objects:
        actual = remote_by_name[expected.object_path]
        _validate_remote_entry(expected, actual)
        if (
            expected_generations is not None
            and actual["generation"] != expected_generations[expected.object_path]
        ):
            raise GcsInventoryError(
                f"Remote object {expected.object_path} generation changed after upload"
            )
        objects.append(actual)

    # Listing and exact-set comparison are O(n) time and O(n) evidence memory.
    # Network pagination is O(ceil(n / page_size)); there is no per-object
    # describe call or subprocess.
    inventory_identity = {
        "projectId": plan.project_id,
        "bucket": plan.bucket,
        "prefix": plan.prefix,
        "objects": objects,
    }
    return {
        "schemaVersion": 1,
        "reportType": INVENTORY_REPORT_TYPE,
        "producer": INVENTORY_PRODUCER,
        "producerVersion": producer_version,
        "projectId": plan.project_id,
        "bucket": plan.bucket,
        "prefix": plan.prefix,
        "objectCount": len(objects),
        "pageCount": page_count,
        "expectedInventoryDigest": plan.expected_inventory_digest,
        "inventoryDigest": _canonical_digest(inventory_identity),
        "objects": objects,
        "ok": True,
    }


class GcsReleaseTransport:
    """Upload and verify one immutable expected-object plan with one client."""

    def __init__(
        self,
        plan: ExpectedObjectPlan,
        *,
        client: Any | None = None,
        max_workers: int = DEFAULT_MAX_WORKERS,
        page_size: int = DEFAULT_PAGE_SIZE,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.plan = plan
        self.storage_version = validate_storage_dependency_version()
        self.max_workers = _validate_worker_count(max_workers)
        self.page_size = _validate_page_size(page_size)
        if (
            isinstance(timeout_seconds, bool)
            or not isinstance(timeout_seconds, int)
            or timeout_seconds <= 0
        ):
            raise GcsTransportError("timeout_seconds must be a positive integer")
        self.timeout_seconds = timeout_seconds
        # The same client and bucket handles are shared by every worker and the
        # final inventory listing.  No worker constructs a connection client.
        self.client = (
            client
            if client is not None
            else storage.Client(project=plan.project_id)
        )
        self.bucket = self.client.bucket(plan.bucket)

    def _load_exact_local_bytes(self, expected: ExpectedObject) -> bytes:
        try:
            data = expected.source_path.read_bytes()
        except OSError as exc:
            raise GcsUploadError(
                f"Could not read upload source for {expected.object_path}: {exc}"
            ) from exc
        if len(data) != expected.byte_count:
            raise GcsUploadError(
                f"Local byte count changed for {expected.object_path}"
            )
        sha256_hex = hashlib.sha256(data).hexdigest()
        md5_base64 = base64.b64encode(
            hashlib.md5(data, usedforsecurity=False).digest()
        ).decode("ascii")
        if sha256_hex != expected.sha256_hex:
            raise GcsUploadError(f"Local SHA-256 changed for {expected.object_path}")
        if md5_base64 != expected.md5_base64:
            raise GcsUploadError(f"Local MD5 changed for {expected.object_path}")
        return data

    def _reload_existing(self, blob: Any, expected: ExpectedObject) -> UploadOutcome:
        try:
            blob.reload(
                client=self.client,
                timeout=self.timeout_seconds,
                retry=storage_retry.DEFAULT_RETRY,
            )
            actual = _blob_inventory_entry(blob)
            _validate_remote_entry(expected, actual)
        except GcsInventoryError as exc:
            raise GcsUploadError(
                f"Create-only collision is not an exact retry for "
                f"{expected.object_path}: {exc}"
            ) from exc
        except Exception as exc:
            raise GcsUploadError(
                f"Could not verify create-only collision for "
                f"{expected.object_path}: {exc}"
            ) from exc
        return UploadOutcome(
            object_path=expected.object_path,
            generation=actual["generation"],
            disposition="existing",
        )

    def _upload_one(self, expected: ExpectedObject) -> UploadOutcome:
        data = self._load_exact_local_bytes(expected)
        blob = self.bucket.blob(expected.object_path)
        blob.cache_control = expected.cache_control
        blob.metadata = expected.metadata
        try:
            blob.upload_from_file(
                io.BytesIO(data),
                rewind=True,
                size=len(data),
                content_type=expected.content_type,
                client=self.client,
                if_generation_match=0,
                timeout=self.timeout_seconds,
                checksum="md5",
                retry=storage_retry.DEFAULT_RETRY_IF_GENERATION_SPECIFIED,
            )
        except PreconditionFailed:
            return self._reload_existing(blob, expected)
        except Exception as exc:
            raise GcsUploadError(
                f"Create-only upload failed for {expected.object_path}: {exc}"
            ) from exc
        try:
            generation = _positive_generation(
                getattr(blob, "generation", None),
                f"Uploaded object {expected.object_path} generation",
            )
        except GcsInventoryError as exc:
            raise GcsUploadError(str(exc)) from exc
        return UploadOutcome(
            object_path=expected.object_path,
            generation=generation,
            disposition="created",
        )

    def upload(self) -> tuple[UploadOutcome, ...]:
        """Run at most ``max_workers`` uploads and keep only that many in flight.

        The scheduler performs O(n) submissions and stores O(max_workers)
        futures.  On the first failure it stops submitting new objects and
        cancels work that has not started; already running create-only requests
        may complete and are safe to verify on a later retry.
        """

        objects = iter(self.plan.objects)
        outcomes: list[UploadOutcome] = []
        with ThreadPoolExecutor(
            max_workers=self.max_workers,
            thread_name_prefix="form-catalog-gcs",
        ) as executor:
            in_flight: dict[Future[UploadOutcome], ExpectedObject] = {}

            def submit_next() -> bool:
                try:
                    expected = next(objects)
                except StopIteration:
                    return False
                future = executor.submit(self._upload_one, expected)
                in_flight[future] = expected
                return True

            for _ in range(min(self.max_workers, len(self.plan.objects))):
                submit_next()

            try:
                while in_flight:
                    completed, _ = wait(
                        tuple(in_flight),
                        return_when=FIRST_COMPLETED,
                    )
                    for future in completed:
                        in_flight.pop(future)
                        outcomes.append(future.result())
                        submit_next()
            except Exception:
                for future in in_flight:
                    future.cancel()
                raise

        return tuple(sorted(outcomes, key=lambda item: item.object_path))

    def verify_inventory(
        self,
        *,
        expected_generations: Mapping[str, str] | None = None,
    ) -> dict[str, Any]:
        """List the prefix once and prove its exact current object inventory."""

        return _inventory_report(
            self.plan,
            client=self.client,
            bucket=self.bucket,
            expected_generations=expected_generations,
            page_size=self.page_size,
            timeout_seconds=self.timeout_seconds,
            producer_version=self.storage_version,
        )

    def stage(self) -> dict[str, Any]:
        """Create-or-verify all objects, then return canonical inventory evidence."""

        outcomes = self.upload()
        generations = {
            outcome.object_path: outcome.generation for outcome in outcomes
        }
        report = self.verify_inventory(expected_generations=generations)
        report["maxWorkers"] = self.max_workers
        report["createdObjectCount"] = sum(
            outcome.disposition == "created" for outcome in outcomes
        )
        report["existingObjectCount"] = sum(
            outcome.disposition == "existing" for outcome in outcomes
        )
        return report


def verify_expected_inventory(
    plan: ExpectedObjectPlan,
    *,
    client: Any,
    page_size: int = DEFAULT_PAGE_SIZE,
    expected_generations: Mapping[str, str] | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Verify a plan through one injected client without attempting uploads."""

    transport = GcsReleaseTransport(
        plan,
        client=client,
        max_workers=DEFAULT_MAX_WORKERS,
        page_size=page_size,
        timeout_seconds=timeout_seconds,
    )
    return transport.verify_inventory(
        expected_generations=expected_generations,
    )


def stage_expected_objects(
    plan: ExpectedObjectPlan,
    *,
    client: Any | None = None,
    max_workers: int = DEFAULT_MAX_WORKERS,
    page_size: int = DEFAULT_PAGE_SIZE,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Create and verify every planned object through one long-lived client."""

    transport = GcsReleaseTransport(
        plan,
        client=client,
        max_workers=max_workers,
        page_size=page_size,
        timeout_seconds=timeout_seconds,
    )
    return transport.stage()


def canonical_inventory_report_bytes(report: Mapping[str, Any]) -> bytes:
    """Serialize a completed report deterministically for immutable evidence."""

    if (
        report.get("schemaVersion") != 1
        or report.get("reportType") != INVENTORY_REPORT_TYPE
        or report.get("ok") is not True
    ):
        raise GcsInventoryError("Only a successful inventory report is serializable")
    return _canonical_bytes(report) + b"\n"
