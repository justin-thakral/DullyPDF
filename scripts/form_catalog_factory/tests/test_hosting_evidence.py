from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.form_catalog_factory.hosting_evidence import (
    HostingEvidenceError,
    HostingRelease,
    build_hosting_evidence,
    capture_live_snapshot,
    normalize_hosting_version,
    parse_firebase_deploy_result,
    parse_live_release,
)


class _FakeClient:
    def __init__(self, releases: list[HostingRelease]):
        self._releases = list(releases)

    def latest_live_release(self) -> HostingRelease:
        if len(self._releases) > 1:
            return self._releases.pop(0)
        return self._releases[0]


def _write(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _release(version: str, release_time: str) -> HostingRelease:
    version_id = version.rsplit("/", 1)[-1]
    return HostingRelease(
        hosting_version=version,
        release_time=release_time,
        release_name=(
            "projects/916039292611/sites/dullypdf/channels/live/releases/"
            f"{version_id}"
        ),
    )


def test_hosting_version_parsers_accept_api_and_cli_resource_names() -> None:
    expected = "sites/dullypdf/versions/new-version"
    assert normalize_hosting_version(expected, expected_site="dullypdf") == expected
    assert normalize_hosting_version(
        "projects/916039292611/sites/dullypdf/versions/new-version",
        expected_site="dullypdf",
    ) == expected

    live = parse_live_release(
        {
            "releases": [
                {
                    "name": (
                        "projects/916039292611/sites/dullypdf/channels/live/"
                        "releases/123"
                    ),
                    "version": {
                        "name": (
                            "projects/916039292611/sites/dullypdf/versions/"
                            "new-version"
                        )
                    },
                    "releaseTime": "2026-07-30T12:01:00Z",
                }
            ]
        },
        expected_site="dullypdf",
    )
    assert live.hosting_version == expected
    assert parse_firebase_deploy_result(
        {"status": "success", "result": {"hosting": expected}},
        expected_site="dullypdf",
    ) == expected


def test_capture_and_build_hosting_evidence_bind_exact_release(tmp_path: Path) -> None:
    old_version = "sites/dullypdf/versions/old-version"
    new_version = "sites/dullypdf/versions/new-version"
    old_release = _release(old_version, "2026-07-30T11:00:00Z")
    new_release = _release(new_version, "2026-07-30T12:01:00Z")
    snapshot = capture_live_snapshot(
        project_id="dullypdf",
        site="dullypdf",
        client=_FakeClient([old_release]),
    )
    active = {
        "schemaVersion": 1,
        "releaseId": "catalog-20260729-001",
        "sourceCommit": "a" * 40,
        "manifestSha256": "b" * 64,
        "previousReleaseId": None,
        "activatedAt": "2026-07-30T11:30:00Z",
        "replacements": [{"sourceSection": "section", "filename": "form.pdf"}],
    }
    deploy_result = {
        "status": "success",
        "result": {"hosting": new_version},
    }

    evidence = build_hosting_evidence(
        active_release_path=_write(tmp_path / "active.json", active),
        before_snapshot_path=_write(tmp_path / "before.json", snapshot),
        deploy_result_path=_write(tmp_path / "deploy.json", deploy_result),
        project_id="dullypdf",
        site="dullypdf",
        site_origins=["https://dullypdf.com", "https://dullypdf.web.app"],
        deployment_commit="c" * 40,
        workflow_run_id="12345",
        workflow_run_attempt="2",
        client=_FakeClient([old_release, new_release]),
        confirm_attempts=2,
        confirm_interval_seconds=0,
    )

    assert evidence["releaseId"] == "catalog-20260729-001"
    assert evidence["sourceCommit"] == "a" * 40
    assert evidence["manifestSha256"] == "b" * 64
    assert evidence["hostingVersion"] == new_version
    assert evidence["rollbackHostingVersion"] == old_version
    assert evidence["deploymentCommit"] == "c" * 40
    assert evidence["deployedAt"] == "2026-07-30T12:01:00Z"
    assert evidence["ok"] is True


def test_hosting_evidence_rejects_unchanged_live_version(tmp_path: Path) -> None:
    version = "sites/dullypdf/versions/same-version"
    release = _release(version, "2026-07-30T12:01:00Z")
    snapshot = capture_live_snapshot(
        project_id="dullypdf",
        site="dullypdf",
        client=_FakeClient([release]),
    )
    active = {
        "schemaVersion": 1,
        "releaseId": "catalog-20260729-001",
        "sourceCommit": "a" * 40,
        "manifestSha256": "b" * 64,
        "replacements": [{}],
    }

    with pytest.raises(HostingEvidenceError, match="did not produce a new"):
        build_hosting_evidence(
            active_release_path=_write(tmp_path / "active.json", active),
            before_snapshot_path=_write(tmp_path / "before.json", snapshot),
            deploy_result_path=_write(
                tmp_path / "deploy.json",
                {"status": "success", "result": {"hosting": version}},
            ),
            project_id="dullypdf",
            site="dullypdf",
            site_origins=["https://dullypdf.com"],
            deployment_commit="c" * 40,
            workflow_run_id="12345",
            workflow_run_attempt="1",
            client=_FakeClient([release]),
        )
