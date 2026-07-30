from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

import pytest

from scripts.form_catalog_factory.hosting_evidence import HostingRelease
from scripts.form_catalog_factory.hosting_rollback import (
    HostingRollbackError,
    PointerAlreadyPromoted,
    PointerSnapshot,
    PRODUCTION_POINTER_OBJECT_URL,
    ProductionLockVerifier,
    rollback_failed_hosting_release,
)


FAILED_VERSION = "sites/dullypdf/versions/failed-version"
ROLLBACK_VERSION = "sites/dullypdf/versions/rollback-version"


class _FakeClient:
    def __init__(self, releases: list[HostingRelease]):
        self.releases = list(releases)
        self.created: list[tuple[str, str]] = []

    def latest_live_release(self) -> HostingRelease:
        if len(self.releases) > 1:
            return self.releases.pop(0)
        return self.releases[0]

    def create_live_release(
        self,
        *,
        hosting_version: str,
        message: str,
    ) -> HostingRelease:
        self.created.append((hosting_version, message))
        return _release(hosting_version, "created")


class _FakePointerReader:
    def __init__(self, snapshots: list[PointerSnapshot]):
        self.snapshots = list(snapshots)

    def snapshot(self) -> PointerSnapshot:
        if len(self.snapshots) > 1:
            return self.snapshots.pop(0)
        return self.snapshots[0]


class _FakeLockVerifier:
    def __init__(self) -> None:
        self.minimum_remaining_seconds: list[int] = []

    def verify(self, *, minimum_remaining_seconds: int = 0) -> None:
        self.minimum_remaining_seconds.append(minimum_remaining_seconds)


def _release(version: str, name: str) -> HostingRelease:
    return HostingRelease(
        hosting_version=version,
        release_time="2026-07-30T12:00:00Z",
        release_name=f"sites/dullypdf/releases/{name}",
    )


def _hosting_evidence(tmp_path: Path) -> Path:
    path = tmp_path / "hosting.json"
    path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "reportType": "form-catalog-hosting-deployment",
                "producer": "controlled-deploy",
                "environment": "production",
                "projectId": "dullypdf",
                "site": "dullypdf",
                "releaseId": "catalog-new",
                "sourceCommit": "a" * 40,
                "manifestSha256": "b" * 64,
                "hostingVersion": FAILED_VERSION,
                "rollbackHostingVersion": ROLLBACK_VERSION,
                "ok": True,
            }
        ),
        encoding="utf-8",
    )
    return path


def _pointer(release_id: str = "catalog-old") -> PointerSnapshot:
    return PointerSnapshot(
        exists=True,
        generation="17",
        sha256="c" * 64,
        release_id=release_id,
    )


def test_rollback_releases_recorded_version_and_preserves_pointer(
    tmp_path: Path,
) -> None:
    evidence_path = _hosting_evidence(tmp_path)
    pointer = _pointer()
    client = _FakeClient(
        [
            _release(FAILED_VERSION, "failed"),
            _release(ROLLBACK_VERSION, "rollback"),
        ]
    )
    lock = _FakeLockVerifier()

    receipt = rollback_failed_hosting_release(
        hosting_evidence_path=evidence_path,
        previous_release_id="catalog-old",
        pointer_object_url=PRODUCTION_POINTER_OBJECT_URL,
        lock_owner="post-live:catalog-new:1",
        lock_generation="9",
        lock_state_path=tmp_path / "lock.json",
        trigger_stage="browser-canary",
        trigger_exit_code=1,
        client=client,
        pointer_reader=_FakePointerReader([pointer, pointer]),
        lock_verifier=lock,
        confirm_interval_seconds=0,
    )

    assert client.created[0][0] == ROLLBACK_VERSION
    assert receipt["rollbackAction"] == "released-recorded-version"
    assert receipt["pointerUnchanged"] is True
    assert receipt["pointerReleaseId"] == "catalog-old"
    assert receipt["hostingEvidenceSha256"] == hashlib.sha256(
        evidence_path.read_bytes()
    ).hexdigest()
    assert receipt["ok"] is True
    assert lock.minimum_remaining_seconds == [0, 300]


def test_rollback_retry_is_idempotent_when_recorded_version_is_live(
    tmp_path: Path,
) -> None:
    pointer = _pointer()
    client = _FakeClient([_release(ROLLBACK_VERSION, "rollback")])
    lock = _FakeLockVerifier()

    receipt = rollback_failed_hosting_release(
        hosting_evidence_path=_hosting_evidence(tmp_path),
        previous_release_id="catalog-old",
        pointer_object_url=PRODUCTION_POINTER_OBJECT_URL,
        lock_owner="post-live:catalog-new:1",
        lock_generation="9",
        lock_state_path=tmp_path / "lock.json",
        trigger_stage="live-http",
        trigger_exit_code=1,
        client=client,
        pointer_reader=_FakePointerReader([pointer, pointer]),
        lock_verifier=lock,
        confirm_interval_seconds=0,
    )

    assert not client.created
    assert receipt["rollbackAction"] == "already-serving-recorded-version"
    assert lock.minimum_remaining_seconds == [0]


def test_rollback_refuses_when_hosting_changed_to_unrelated_version(
    tmp_path: Path,
) -> None:
    pointer = _pointer()
    client = _FakeClient(
        [_release("sites/dullypdf/versions/unrelated", "unrelated")]
    )

    with pytest.raises(HostingRollbackError, match="changed away"):
        rollback_failed_hosting_release(
            hosting_evidence_path=_hosting_evidence(tmp_path),
            previous_release_id="catalog-old",
            pointer_object_url=PRODUCTION_POINTER_OBJECT_URL,
            lock_owner="post-live:catalog-new:1",
            lock_generation="9",
            lock_state_path=tmp_path / "lock.json",
            trigger_stage="live-http",
            trigger_exit_code=1,
            client=client,
            pointer_reader=_FakePointerReader([pointer]),
            lock_verifier=_FakeLockVerifier(),
            confirm_interval_seconds=0,
        )
    assert not client.created


def test_rollback_refuses_after_pointer_promotion(tmp_path: Path) -> None:
    client = _FakeClient([_release(FAILED_VERSION, "failed")])

    with pytest.raises(PointerAlreadyPromoted, match="already names"):
        rollback_failed_hosting_release(
            hosting_evidence_path=_hosting_evidence(tmp_path),
            previous_release_id="catalog-old",
            pointer_object_url=PRODUCTION_POINTER_OBJECT_URL,
            lock_owner="post-live:catalog-new:1",
            lock_generation="9",
            lock_state_path=tmp_path / "lock.json",
            trigger_stage="promotion",
            trigger_exit_code=1,
            client=client,
            pointer_reader=_FakePointerReader([_pointer("catalog-new")]),
            lock_verifier=_FakeLockVerifier(),
            confirm_interval_seconds=0,
        )
    assert not client.created


def test_rollback_refuses_pointer_change_during_release(tmp_path: Path) -> None:
    before = _pointer()
    after = PointerSnapshot(
        exists=True,
        generation="18",
        sha256="d" * 64,
        release_id="catalog-old",
    )
    client = _FakeClient(
        [
            _release(FAILED_VERSION, "failed"),
            _release(ROLLBACK_VERSION, "rollback"),
        ]
    )

    with pytest.raises(HostingRollbackError, match="pointer changed"):
        rollback_failed_hosting_release(
            hosting_evidence_path=_hosting_evidence(tmp_path),
            previous_release_id="catalog-old",
            pointer_object_url=PRODUCTION_POINTER_OBJECT_URL,
            lock_owner="post-live:catalog-new:1",
            lock_generation="9",
            lock_state_path=tmp_path / "lock.json",
            trigger_stage="promotion",
            trigger_exit_code=1,
            client=client,
            pointer_reader=_FakePointerReader([before, after]),
            lock_verifier=_FakeLockVerifier(),
            confirm_interval_seconds=0,
        )


def test_lock_verifier_rejects_local_state_identity_mismatch(
    tmp_path: Path,
) -> None:
    state_path = tmp_path / "lock.json"
    state_path.write_text(
        json.dumps(
            {
                "owner": "different-owner",
                "generation": "8",
            }
        ),
        encoding="utf-8",
    )
    verifier = ProductionLockVerifier(
        project_id="dullypdf",
        pointer_object_url=(
            PRODUCTION_POINTER_OBJECT_URL
        ),
        owner="expected-owner",
        generation="9",
        state_path=state_path,
    )

    with pytest.raises(HostingRollbackError, match="does not match"):
        verifier.verify()


def test_lock_verifier_requires_remaining_lease_at_mutation_boundary(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state_path = tmp_path / "lock.json"
    state_path.write_text(
        json.dumps(
            {
                "owner": "expected-owner",
                "generation": "9",
            }
        ),
        encoding="utf-8",
    )
    calls: list[list[str]] = []

    def fake_run(
        arguments: list[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        calls.append(arguments)
        return subprocess.CompletedProcess(arguments, 0, "", "")

    monkeypatch.setattr(
        "scripts.form_catalog_factory.hosting_rollback.subprocess.run",
        fake_run,
    )
    verifier = ProductionLockVerifier(
        project_id="dullypdf",
        pointer_object_url=PRODUCTION_POINTER_OBJECT_URL,
        owner="expected-owner",
        generation="9",
        state_path=state_path,
    )

    verifier.verify(minimum_remaining_seconds=300)

    assert calls
    option_index = calls[0].index("--minimum-remaining-seconds")
    assert calls[0][option_index + 1] == "300"


def test_rollback_rejects_nonproduction_pointer_and_lock_bucket(
    tmp_path: Path,
) -> None:
    with pytest.raises(HostingRollbackError, match="production catalog pointer"):
        rollback_failed_hosting_release(
            hosting_evidence_path=_hosting_evidence(tmp_path),
            previous_release_id="catalog-old",
            pointer_object_url="gs://attacker-controlled/catalog-release-state/active.json",
            lock_owner="post-live:catalog-new:1",
            lock_generation="9",
            lock_state_path=tmp_path / "lock.json",
            trigger_stage="live-http",
            trigger_exit_code=1,
            client=_FakeClient([_release(FAILED_VERSION, "failed")]),
            pointer_reader=_FakePointerReader([_pointer()]),
            lock_verifier=_FakeLockVerifier(),
            confirm_interval_seconds=0,
        )
