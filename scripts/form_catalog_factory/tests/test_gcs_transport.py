from __future__ import annotations

import base64
from dataclasses import dataclass, replace
import hashlib
import io
import json
from pathlib import Path
import subprocess
import threading
import time
from typing import Any
from unittest.mock import patch

from google.api_core.exceptions import PreconditionFailed
from google.cloud import storage
from google.cloud.storage import retry as storage_retry
import pytest

from scripts.form_catalog_factory.gcs_transport import (
    DEFAULT_MAX_WORKERS,
    GcsInventoryError,
    GcsReleaseTransport,
    GcsTransportError,
    GcsUploadError,
    PLAN_REPORT_TYPE,
    REQUIRED_STORAGE_VERSION,
    ExpectedObject,
    ExpectedObjectPlanError,
    canonical_inventory_report_bytes,
    load_expected_object_plan,
    parse_expected_object_plan,
    stage_expected_objects,
    validate_storage_dependency_version,
    verify_expected_inventory,
)


_PREFIX = "releases/catalog-20260730-001/"
_CACHE_CONTROL = "public,max-age=31536000,immutable"
_SOURCE_COMMIT = "a" * 40


def _md5(data: bytes) -> str:
    return base64.b64encode(
        hashlib.md5(data, usedforsecurity=False).digest()
    ).decode("ascii")


def _plan_payload(
    tmp_path: Path,
    count: int,
    *,
    write_sources: bool,
) -> dict[str, Any]:
    objects: list[dict[str, Any]] = []
    for index in range(count):
        data = f"immutable-form-catalog-object-{index:04d}".encode()
        suffix = "pdf" if index % 2 == 0 else "webp"
        content_type = "application/pdf" if suffix == "pdf" else "image/webp"
        object_path = f"{_PREFIX}asset-{index:04d}.{suffix}"
        source_path = tmp_path / f"asset-{index:04d}.{suffix}"
        if write_sources:
            source_path.write_bytes(data)
        sha256_hex = hashlib.sha256(data).hexdigest()
        objects.append(
            {
                "objectPath": object_path,
                "sourcePath": str(source_path),
                "bytes": len(data),
                "sha256": sha256_hex,
                "md5Base64": _md5(data),
                "contentType": content_type,
                "cacheControl": _CACHE_CONTROL,
                "customMetadata": {
                    "catalog_asset_kind": (
                        "pdf" if content_type == "application/pdf" else "thumbnail"
                    ),
                    "catalog_release_id": "catalog-20260730-001",
                    "catalog_sha256": sha256_hex,
                    "catalog_source_commit": _SOURCE_COMMIT,
                },
            }
        )
    return {
        "schemaVersion": 1,
        "reportType": PLAN_REPORT_TYPE,
        "projectId": "dullypdf",
        "bucket": "dullypdf-form-catalog-assets-east4",
        "prefix": _PREFIX,
        "objects": objects,
    }


def _plan(
    tmp_path: Path,
    count: int,
    *,
    write_sources: bool = True,
):
    return parse_expected_object_plan(
        _plan_payload(tmp_path, count, write_sources=write_sources)
    )


@dataclass
class _RemoteObject:
    name: str
    size: int
    content_type: str
    cache_control: str
    md5_hash: str
    metadata: dict[str, str]
    generation: str
    metageneration: str = "1"

    @classmethod
    def from_expected(
        cls,
        expected: ExpectedObject,
        *,
        generation: str,
    ) -> "_RemoteObject":
        return cls(
            name=expected.object_path,
            size=expected.byte_count,
            content_type=expected.content_type,
            cache_control=expected.cache_control,
            md5_hash=expected.md5_base64,
            metadata=expected.metadata,
            generation=generation,
        )

    def clone(self) -> "_RemoteObject":
        return replace(self, metadata=dict(self.metadata))


class _FakeIterator:
    def __init__(
        self,
        objects: list[_RemoteObject],
        *,
        page_size: int,
        client: "_FakeClient",
    ) -> None:
        self._objects = objects
        self._page_size = page_size
        self._client = client

    @property
    def pages(self):
        for start in range(0, len(self._objects), self._page_size):
            self._client.page_count += 1
            yield [
                item.clone()
                for item in self._objects[start : start + self._page_size]
            ]


class _FakeUploadBlob:
    def __init__(self, client: "_FakeClient", name: str) -> None:
        self._client = client
        self.name = name
        self.size: int | None = None
        self.content_type: str | None = None
        self.cache_control: str | None = None
        self.md5_hash: str | None = None
        self.metadata: dict[str, str] = {}
        self.generation: str | None = None
        self.metageneration: str | None = None

    def _copy_remote(self, remote: _RemoteObject) -> None:
        self.size = remote.size
        self.content_type = remote.content_type
        self.cache_control = remote.cache_control
        self.md5_hash = remote.md5_hash
        self.metadata = dict(remote.metadata)
        self.generation = remote.generation
        self.metageneration = remote.metageneration

    def upload_from_file(self, file_obj: io.BytesIO, **kwargs: Any) -> None:
        client = self._client
        with client.lock:
            client.active_uploads += 1
            client.max_active_uploads = max(
                client.max_active_uploads,
                client.active_uploads,
            )
            client.upload_calls.append((self.name, dict(kwargs)))
        try:
            if client.upload_delay_seconds:
                time.sleep(client.upload_delay_seconds)
            if kwargs.get("if_generation_match") != 0:
                raise AssertionError("Fake upload was not create-only")
            if (
                kwargs.get("retry")
                is not storage_retry.DEFAULT_RETRY_IF_GENERATION_SPECIFIED
            ):
                raise AssertionError("Fake upload did not use conditional retry")
            data = file_obj.read()
            if len(data) != kwargs["size"]:
                raise AssertionError("Fake upload received the wrong byte count")
            with client.lock:
                existing = client.objects.get(self.name)
                if existing is not None:
                    raise PreconditionFailed("object already exists")
                generation = str(client.next_generation)
                client.next_generation += 1
                remote = _RemoteObject(
                    name=self.name,
                    size=len(data),
                    content_type=kwargs["content_type"],
                    cache_control=self.cache_control or "",
                    md5_hash=_md5(data),
                    metadata=dict(self.metadata),
                    generation=generation,
                )
                client.objects[self.name] = remote
                self._copy_remote(remote)
        finally:
            with client.lock:
                client.active_uploads -= 1

    def reload(self, **kwargs: Any) -> None:
        self._client.reload_calls.append((self.name, dict(kwargs)))
        remote = self._client.objects.get(self.name)
        if remote is None:
            raise AssertionError("Cannot reload a missing fake object")
        self._copy_remote(remote)


class _FakeBucket:
    def __init__(self, client: "_FakeClient", name: str) -> None:
        self.client = client
        self.name = name

    def blob(self, name: str) -> _FakeUploadBlob:
        return _FakeUploadBlob(self.client, name)


class _FakeClient:
    def __init__(self, *, upload_delay_seconds: float = 0) -> None:
        self.objects: dict[str, _RemoteObject] = {}
        self.upload_delay_seconds = upload_delay_seconds
        self.upload_calls: list[tuple[str, dict[str, Any]]] = []
        self.reload_calls: list[tuple[str, dict[str, Any]]] = []
        self.bucket_calls: list[str] = []
        self.list_calls: list[dict[str, Any]] = []
        self.page_count = 0
        self.active_uploads = 0
        self.max_active_uploads = 0
        self.next_generation = 1000
        self.lock = threading.Lock()
        self.list_override: list[_RemoteObject] | None = None

    def bucket(self, name: str) -> _FakeBucket:
        self.bucket_calls.append(name)
        return _FakeBucket(self, name)

    def list_blobs(self, bucket: _FakeBucket, **kwargs: Any) -> _FakeIterator:
        self.list_calls.append({"bucket": bucket.name, **kwargs})
        if self.list_override is None:
            prefix = kwargs["prefix"]
            objects = [
                item.clone()
                for name, item in sorted(self.objects.items())
                if name.startswith(prefix)
            ]
        else:
            objects = [item.clone() for item in self.list_override]
        return _FakeIterator(
            objects,
            page_size=kwargs["page_size"],
            client=self,
        )

    def add_plan(self, plan, *, start_generation: int = 1000) -> None:
        for offset, expected in enumerate(plan.objects):
            remote = _RemoteObject.from_expected(
                expected,
                generation=str(start_generation + offset),
            )
            self.objects[expected.object_path] = remote
        self.next_generation = start_generation + len(plan.objects)


def test_plan_parser_is_strict_and_storage_dependency_is_pinned(
    tmp_path: Path,
) -> None:
    payload = _plan_payload(tmp_path, 2, write_sources=False)
    plan = parse_expected_object_plan(payload)

    assert storage.__version__ == REQUIRED_STORAGE_VERSION == "3.9.0"
    assert validate_storage_dependency_version() == REQUIRED_STORAGE_VERSION
    assert DEFAULT_MAX_WORKERS == 12
    assert len(plan.objects) == 2
    assert len(plan.expected_inventory_digest) == 64

    payload["objects"] = list(reversed(payload["objects"]))
    with pytest.raises(ExpectedObjectPlanError, match="strictly sorted"):
        parse_expected_object_plan(payload)

    duplicate_path = tmp_path / "duplicate-plan.json"
    duplicate_path.write_text(
        (
            '{"schemaVersion":1,"schemaVersion":1,'
            f'"reportType":"{PLAN_REPORT_TYPE}"}}'
        ),
        encoding="utf-8",
    )
    with pytest.raises(ExpectedObjectPlanError, match="duplicate key"):
        load_expected_object_plan(duplicate_path)


def test_transport_fails_closed_on_storage_dependency_version_mismatch(
    tmp_path: Path,
) -> None:
    client = _FakeClient()

    with patch.object(storage, "__version__", "3.9.1"):
        with pytest.raises(GcsTransportError, match="exactly 3.9.0"):
            GcsReleaseTransport(_plan(tmp_path, 1), client=client)

    assert not client.bucket_calls


@pytest.mark.parametrize("max_workers", [0, 33, True])
def test_worker_bound_rejects_unsafe_values(
    tmp_path: Path,
    max_workers: Any,
) -> None:
    with pytest.raises(GcsTransportError, match="max_workers"):
        GcsReleaseTransport(
            _plan(tmp_path, 1),
            client=_FakeClient(),
            max_workers=max_workers,
        )


def test_stage_uses_one_client_bounded_workers_and_conditional_retries(
    tmp_path: Path,
) -> None:
    plan = _plan(tmp_path, 48)
    client = _FakeClient(upload_delay_seconds=0.005)

    with patch.object(
        subprocess,
        "run",
        side_effect=AssertionError("transport must not spawn subprocesses"),
    ):
        report = stage_expected_objects(
            plan,
            client=client,
            max_workers=4,
        )

    assert client.bucket_calls == [plan.bucket]
    assert len(client.upload_calls) == 48
    assert len(client.list_calls) == 1
    assert client.list_calls[0]["versions"] is False
    assert client.list_calls[0]["timeout"] == 60
    assert client.list_calls[0]["retry"] is storage_retry.DEFAULT_RETRY
    assert 2 <= client.max_active_uploads <= 4
    assert report["objectCount"] == 48
    assert report["createdObjectCount"] == 48
    assert report["existingObjectCount"] == 0
    assert report["maxWorkers"] == 4
    assert report["pageCount"] == 1
    assert report["expectedInventoryDigest"] == plan.expected_inventory_digest
    assert len(report["inventoryDigest"]) == 64
    assert canonical_inventory_report_bytes(report).endswith(b"\n")
    for _, kwargs in client.upload_calls:
        assert kwargs["if_generation_match"] == 0
        assert kwargs["checksum"] == "md5"
        assert (
            kwargs["retry"]
            is storage_retry.DEFAULT_RETRY_IF_GENERATION_SPECIFIED
        )


def test_default_client_is_constructed_once_for_uploads_and_inventory(
    tmp_path: Path,
) -> None:
    plan = _plan(tmp_path, 4)
    client = _FakeClient()

    with patch.object(storage, "Client", return_value=client) as constructor:
        report = stage_expected_objects(plan, max_workers=2)

    constructor.assert_called_once_with(project=plan.project_id)
    assert client.bucket_calls == [plan.bucket]
    assert len(client.upload_calls) == 4
    assert len(client.list_calls) == 1
    assert report["ok"] is True


def test_partial_retry_accepts_exact_412_objects_and_creates_the_rest(
    tmp_path: Path,
) -> None:
    plan = _plan(tmp_path, 5)
    client = _FakeClient()
    for index, expected in enumerate(plan.objects[:3]):
        client.objects[expected.object_path] = _RemoteObject.from_expected(
            expected,
            generation=str(700 + index),
        )

    report = stage_expected_objects(plan, client=client, max_workers=3)

    assert report["existingObjectCount"] == 3
    assert report["createdObjectCount"] == 2
    assert len(client.reload_calls) == 3
    assert report["objectCount"] == 5


@pytest.mark.parametrize(
    ("field", "bad_value"),
    [
        ("size", 999),
        ("content_type", "application/octet-stream"),
        ("cache_control", "no-cache"),
        ("md5_hash", "AAAAAAAAAAAAAAAAAAAAAA=="),
        ("metadata", {"catalog_sha256": "f" * 64}),
        ("generation", "0"),
        ("metageneration", None),
    ],
)
def test_412_is_idempotent_only_for_an_exact_remote_object(
    tmp_path: Path,
    field: str,
    bad_value: Any,
) -> None:
    plan = _plan(tmp_path, 1)
    client = _FakeClient()
    expected = plan.objects[0]
    remote = _RemoteObject.from_expected(expected, generation="91")
    setattr(remote, field, bad_value)
    client.objects[expected.object_path] = remote

    with pytest.raises(GcsUploadError, match="not an exact retry"):
        stage_expected_objects(plan, client=client)


def test_inventory_verifies_2002_objects_in_three_pages_without_subprocesses(
    tmp_path: Path,
) -> None:
    plan = _plan(tmp_path, 2002, write_sources=False)
    client = _FakeClient()
    client.add_plan(plan)
    generations = {
        name: remote.generation for name, remote in client.objects.items()
    }

    with patch.object(
        subprocess,
        "run",
        side_effect=AssertionError("inventory must not spawn subprocesses"),
    ):
        report = verify_expected_inventory(
            plan,
            client=client,
            expected_generations=generations,
        )

    assert report["objectCount"] == 2002
    assert report["pageCount"] == 3
    assert client.page_count == 3
    assert len(client.list_calls) == 1
    assert not client.upload_calls
    assert report["objects"][0]["objectPath"].endswith("asset-0000.pdf")
    assert report["objects"][-1]["objectPath"].endswith("asset-2001.webp")


def test_inventory_timeout_is_applied_to_paginated_sdk_requests(
    tmp_path: Path,
) -> None:
    plan = _plan(tmp_path, 3, write_sources=False)
    client = _FakeClient()
    client.add_plan(plan)

    report = verify_expected_inventory(
        plan,
        client=client,
        page_size=2,
        timeout_seconds=17,
    )

    assert report["pageCount"] == 2
    assert len(client.list_calls) == 1
    assert client.list_calls[0]["timeout"] == 17
    assert client.list_calls[0]["retry"] is storage_retry.DEFAULT_RETRY


@pytest.mark.parametrize(
    "mutation",
    [
        "missing",
        "extra",
        "duplicate",
        "size",
        "content_type",
        "cache_control",
        "md5",
        "metadata",
        "generation",
        "metageneration",
        "generation_changed",
    ],
)
def test_inventory_rejects_exact_set_metadata_and_generation_anomalies(
    tmp_path: Path,
    mutation: str,
) -> None:
    plan = _plan(tmp_path, 3, write_sources=False)
    client = _FakeClient()
    client.add_plan(plan)
    first = client.objects[plan.objects[0].object_path]
    generations = {
        name: remote.generation for name, remote in client.objects.items()
    }

    if mutation == "missing":
        client.objects.pop(plan.objects[0].object_path)
    elif mutation == "extra":
        extra = first.clone()
        extra.name = f"{_PREFIX}unexpected.pdf"
        client.objects[extra.name] = extra
    elif mutation == "duplicate":
        client.list_override = [
            *(item.clone() for item in client.objects.values()),
            first.clone(),
        ]
    elif mutation == "size":
        first.size += 1
    elif mutation == "content_type":
        first.content_type = "application/octet-stream"
    elif mutation == "cache_control":
        first.cache_control = "no-cache"
    elif mutation == "md5":
        first.md5_hash = "AAAAAAAAAAAAAAAAAAAAAA=="
    elif mutation == "metadata":
        first.metadata["unexpected"] = "value"
    elif mutation == "generation":
        first.generation = "0"
    elif mutation == "metageneration":
        first.metageneration = "00"
    elif mutation == "generation_changed":
        first.generation = "999999"

    with pytest.raises(GcsInventoryError):
        verify_expected_inventory(
            plan,
            client=client,
            expected_generations=generations,
        )
