from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
LOCK_SCRIPT = REPO_ROOT / "scripts" / "form-catalog-production-lock.sh"
BUCKET = "gs://dullypdf-form-catalog-assets-east4"
PROJECT = "dullypdf"
LOCK_OBJECT = "catalog-release-state/production-deployment.lock"


def _fake_gcloud(tmp_path: Path) -> tuple[Path, dict[str, str]]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    cloud_root = tmp_path / "cloud"
    executable = bin_dir / "gcloud"
    executable.write_text(
        """#!/usr/bin/env python3
import os
import shutil
import sys
from pathlib import Path

root = Path(os.environ["FAKE_GCLOUD_ROOT"])
args = sys.argv[1:]

def cloud_path(url):
    if not url.startswith("gs://"):
        raise SystemExit("expected cloud URL")
    return root / url.removeprefix("gs://")

def option(name):
    for index, value in enumerate(args):
        if value == name:
            return args[index + 1]
        if value.startswith(name + "="):
            return value.split("=", 1)[1]
    return None

def generation_path(path):
    return path.with_name(path.name + ".generation")

if args[:2] == ["storage", "cp"]:
    positional = [value for value in args[2:] if not value.startswith("-")]
    source, destination = positional[:2]
    if destination.startswith("gs://"):
        target = cloud_path(destination)
        expected = option("--if-generation-match")
        if expected == "0" and target.exists():
            raise SystemExit(1)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        counter = root / ".generation-counter"
        generation = int(counter.read_text()) + 1 if counter.exists() else 1
        counter.parent.mkdir(parents=True, exist_ok=True)
        counter.write_text(str(generation))
        generation_path(target).write_text(str(generation))
    else:
        shutil.copyfile(cloud_path(source), destination)
    raise SystemExit(0)

if args[:3] == ["storage", "objects", "describe"]:
    target = cloud_path(args[3])
    if not target.exists():
        raise SystemExit(1)
    print(generation_path(target).read_text())
    raise SystemExit(0)

if args[:2] == ["storage", "rm"]:
    target = cloud_path(args[2])
    expected = option("--if-generation-match")
    if not target.exists() or generation_path(target).read_text() != expected:
        raise SystemExit(1)
    target.unlink()
    generation_path(target).unlink()
    raise SystemExit(0)

raise SystemExit(f"unsupported fake gcloud invocation: {args}")
""",
        encoding="utf-8",
    )
    executable.chmod(0o755)
    return cloud_root, {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "FAKE_GCLOUD_ROOT": str(cloud_root),
    }


def _run_lock(
    env: dict[str, str],
    *,
    action: str,
    owner: str,
    state_file: Path,
    wait_seconds: int = 2,
    minimum_remaining_seconds: int | None = None,
) -> subprocess.CompletedProcess[str]:
    arguments = [
        "bash",
        str(LOCK_SCRIPT),
        "--action",
        action,
        "--bucket",
        BUCKET,
        "--project",
        PROJECT,
        "--owner",
        owner,
        "--state-file",
        str(state_file),
        "--wait-seconds",
        str(wait_seconds),
        "--lease-seconds",
        "120",
        "--poll-seconds",
        "1",
    ]
    if minimum_remaining_seconds is not None:
        arguments.extend(
            [
                "--minimum-remaining-seconds",
                str(minimum_remaining_seconds),
            ]
        )
    return subprocess.run(
        arguments,
        cwd=REPO_ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


def test_lock_acquire_and_release_are_generation_and_owner_bound(
    tmp_path: Path,
) -> None:
    cloud_root, env = _fake_gcloud(tmp_path)
    state_file = tmp_path / "state.json"
    owner = "controlled-deploy:12345:1"

    acquired = _run_lock(
        env,
        action="acquire",
        owner=owner,
        state_file=state_file,
    )
    verified = _run_lock(
        env,
        action="verify",
        owner=owner,
        state_file=state_file,
    )
    released_with_wrong_owner = _run_lock(
        env,
        action="release",
        owner="controlled-deploy:12345:2",
        state_file=state_file,
    )
    released = _run_lock(
        env,
        action="release",
        owner=owner,
        state_file=state_file,
    )

    remote = cloud_root / "dullypdf-form-catalog-assets-east4" / LOCK_OBJECT
    assert acquired.returncode == 0, acquired.stderr
    assert verified.returncode == 0, verified.stderr
    assert "Verified production deployment lock" in verified.stdout
    assert released_with_wrong_owner.returncode == 1
    assert "does not belong" in released_with_wrong_owner.stderr
    assert released.returncode == 0, released.stderr
    assert not remote.exists()
    assert not state_file.exists()


def test_lock_takes_over_only_an_expired_generation(tmp_path: Path) -> None:
    cloud_root, env = _fake_gcloud(tmp_path)
    remote = cloud_root / "dullypdf-form-catalog-assets-east4" / LOCK_OBJECT
    remote.parent.mkdir(parents=True)
    remote.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "lockType": "dullypdf-production-deployment",
                "objectUrl": f"{BUCKET}/{LOCK_OBJECT}",
                "owner": "stale-owner:123",
                "createdEpoch": 1,
                "expiresEpoch": 2,
            }
        ),
        encoding="utf-8",
    )
    remote.with_name(remote.name + ".generation").write_text("7")
    (cloud_root / ".generation-counter").write_text("7")
    state_file = tmp_path / "state.json"

    result = _run_lock(
        env,
        action="acquire",
        owner="catalog-promote:release:456",
        state_file=state_file,
    )

    assert result.returncode == 0, result.stderr
    assert "Removing expired production lock owned by stale-owner:123" in result.stdout
    assert json.loads(remote.read_text(encoding="utf-8"))["owner"] == (
        "catalog-promote:release:456"
    )
    assert json.loads(state_file.read_text(encoding="utf-8"))["generation"] == "8"


def test_lock_verify_requires_the_requested_remaining_lease(
    tmp_path: Path,
) -> None:
    _cloud_root, env = _fake_gcloud(tmp_path)
    state_file = tmp_path / "state.json"
    owner = "catalog-promote:release:789"

    acquired = _run_lock(
        env,
        action="acquire",
        owner=owner,
        state_file=state_file,
    )
    enough_time = _run_lock(
        env,
        action="verify",
        owner=owner,
        state_file=state_file,
        minimum_remaining_seconds=60,
    )
    insufficient_time = _run_lock(
        env,
        action="verify",
        owner=owner,
        state_file=state_file,
        minimum_remaining_seconds=300,
    )

    assert acquired.returncode == 0, acquired.stderr
    assert enough_time.returncode == 0, enough_time.stderr
    assert insufficient_time.returncode == 1
    assert (
        "does not have the required remaining lease time"
        in insufficient_time.stderr
    )
