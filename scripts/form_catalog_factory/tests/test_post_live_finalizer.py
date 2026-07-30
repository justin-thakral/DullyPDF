from __future__ import annotations

import hashlib
import json
import os
import shlex
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
FINALIZER = REPO_ROOT / "scripts" / "finalize-form-catalog-release.sh"


def _write_json(path: Path, payload: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_executable(path: Path, source: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(source, encoding="utf-8")
    path.chmod(0o755)
    return path


def _fixture(
    tmp_path: Path,
    *,
    previous_release_id: str | int | bool | None = "catalog-old",
) -> tuple[list[str], dict[str, str], Path]:
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    shutil.copy2(FINALIZER, scripts / FINALIZER.name)
    (scripts / FINALIZER.name).chmod(0o755)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log_path = tmp_path / "operations.log"

    _write_executable(
        scripts / "deploy-form-catalog-release.sh",
        """#!/usr/bin/env bash
set -euo pipefail
echo "deploy $*" >> "$FAKE_OPERATIONS_LOG"
action=""
inventory_report=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --action) action="$2"; shift 2 ;;
    --inventory-report) inventory_report="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [[ "$action" == "promote" ]]; then
  [[ -n "$inventory_report" ]]
  [[ -d "$(dirname "$inventory_report")" ]]
  printf '{"schemaVersion":1,"reportType":"form-catalog-gcs-inventory","ok":true}\\n' \
    > "$inventory_report"
fi
exit 0
""",
    )
    _write_executable(
        scripts / "form-catalog-production-lock.sh",
        """#!/usr/bin/env bash
set -euo pipefail
action=""
state=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --action) action="$2"; shift 2 ;;
    --state-file) state="$2"; shift 2 ;;
    *) shift ;;
  esac
done
echo "lock ${action}" >> "$FAKE_OPERATIONS_LOG"
case "$action" in
  acquire)
    printf '{"generation":"9"}\\n' > "$state"
    ;;
  verify)
    [[ -f "$state" ]]
    ;;
  release)
    rm -f "$state"
    ;;
  *) exit 1 ;;
esac
""",
    )
    _write_executable(bin_dir / "gcloud", "#!/usr/bin/env bash\nexit 0\n")
    _write_executable(
        bin_dir / "npm",
        """#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

args = sys.argv[1:]
output_dir = Path(args[args.index("--output-dir") + 1])
output_dir.mkdir(parents=True, exist_ok=True)
(output_dir / "browser-canary-report.json").write_text(
    json.dumps({"schemaVersion": 1, "ok": True}),
    encoding="utf-8",
)
with Path(os.environ["FAKE_OPERATIONS_LOG"]).open("a", encoding="utf-8") as log:
    log.write("browser\\n")
""",
    )
    _write_executable(
        bin_dir / "python3",
        f"""#!{sys.executable}
import json
import os
import subprocess
import sys
from pathlib import Path

if sys.argv[1:2] == ["-"]:
    producer_mode = os.environ.get("FAKE_IDENTITY_PRODUCER_MODE")
    if producer_mode:
        result = subprocess.run(
            [{sys.executable!r}, *sys.argv[1:]],
            input=sys.stdin.buffer.read(),
            check=False,
            capture_output=True,
        )
        sys.stderr.buffer.write(result.stderr)
        if result.returncode != 0:
            raise SystemExit(result.returncode)
        records = result.stdout.split(b"\\0")[:-1]
        if producer_mode == "nonzero-after-output":
            sys.stdout.buffer.write(result.stdout)
            raise SystemExit(17)
        if producer_mode == "eight-records":
            sys.stdout.buffer.write(b"\\0".join(records[:8]) + b"\\0")
            raise SystemExit(0)
        if producer_mode == "ten-records":
            sys.stdout.buffer.write(
                b"\\0".join([*records, b"unexpected"]) + b"\\0"
            )
            raise SystemExit(0)
        raise SystemExit(f"unsupported fake identity producer mode: {{producer_mode}}")
    os.execv({sys.executable!r}, [{sys.executable!r}, *sys.argv[1:]])
args = sys.argv[1:]
if args[:2] != ["-m", "scripts.form_catalog_factory"]:
    os.execv({sys.executable!r}, [{sys.executable!r}, *args])
command = args[2]

def option(name):
    return args[args.index(name) + 1]

if command == "verify-active-mapping":
    Path(option("--output")).write_text("{{}}", encoding="utf-8")
elif command == "snapshot-catalog-pointer":
    pointer_exists = os.environ.get("FAKE_POINTER_EXISTS", "1") == "1"
    Path(option("--output")).write_text(
        json.dumps({{
            "schemaVersion": 1,
            "reportType": "form-catalog-active-pointer-snapshot",
            "exists": pointer_exists,
            "generation": "4" if pointer_exists else None,
            "sha256": "f" * 64 if pointer_exists else None,
            "releaseId": "catalog-old" if pointer_exists else None,
        }}),
        encoding="utf-8",
    )
elif command == "snapshot-hosting":
    if os.environ.get("FAKE_SNAPSHOT_HOSTING_FAIL") == "1":
        raise SystemExit(8)
    version = os.environ.get(
        "FAKE_HOSTING_VERSION",
        "sites/dullypdf/versions/new-version",
    )
    Path(option("--output")).write_text(
        json.dumps({{
            "hostingVersion": version,
            "releaseName": "sites/dullypdf/channels/live/releases/new",
            "releaseTime": "2026-07-30T12:00:00Z",
        }}),
        encoding="utf-8",
    )
elif command == "validate-live":
    with Path(os.environ["FAKE_OPERATIONS_LOG"]).open("a", encoding="utf-8") as log:
        log.write("live\\n")
    if os.environ.get("FAKE_LIVE_SLEEP") == "1":
        import time
        time.sleep(30)
    if os.environ.get("FAKE_LIVE_FAIL") == "1":
        raise SystemExit(7)
    Path(option("--output")).write_text(
        json.dumps({{"schemaVersion": 1, "ok": True}}),
        encoding="utf-8",
    )
elif command == "rollback-hosting":
    if os.environ.get("FAKE_ROLLBACK_FAIL") == "1":
        with Path(os.environ["FAKE_OPERATIONS_LOG"]).open("a", encoding="utf-8") as log:
            log.write("rollback\\n")
        raise SystemExit(9)
    Path(option("--output")).write_text(
        json.dumps({{
            "schemaVersion": 1,
            "reportType": "form-catalog-hosting-rollback",
            "triggerStage": option("--trigger-stage"),
            "ok": True,
        }}),
        encoding="utf-8",
    )
    with Path(os.environ["FAKE_OPERATIONS_LOG"]).open("a", encoding="utf-8") as log:
        log.write("rollback\\n")
else:
    raise SystemExit(f"unsupported fake factory command: {{command}}")
""",
    )

    manifest = _write_json(
        tmp_path / "release.json",
        {
            "schemaVersion": 1,
            "releaseId": "catalog-new",
            "sourceCommit": "a" * 40,
            "previousReleaseId": previous_release_id,
            "forms": [{"catalogId": "section/form"}],
        },
    )
    active = _write_json(tmp_path / "active.json", {"schemaVersion": 1})
    data = tmp_path / "formCatalogData.mjs"
    data.write_text("const RAW_FORM_CATALOG_ENTRIES = [];\n", encoding="utf-8")
    mapping = _write_json(
        tmp_path / "mapping.json",
        {
            "schemaVersion": 1,
            "reportType": "form-catalog-active-mapping",
            "producer": "verify-active-mapping",
            "gitCommit": "c" * 40,
            "releaseId": "catalog-new",
            "sourceCommit": "a" * 40,
            "manifestSha256": _sha256(manifest),
            "releaseManifestSha256": _sha256(manifest),
            "activeContractSha256": _sha256(active),
            "formCatalogDataSha256": _sha256(data),
            "activeMappingDigest": "d" * 64,
            "manifestMappingDigest": "e" * 64,
            "activeReplacementCount": 2,
            "currentReleaseReplacementCount": 1,
            "ok": True,
        },
    )
    hosting = _write_json(
        tmp_path / "hosting.json",
        {
            "schemaVersion": 1,
            "reportType": "form-catalog-hosting-deployment",
            "producer": "controlled-deploy",
            "environment": "production",
            "releaseId": "catalog-new",
            "sourceCommit": "a" * 40,
            "manifestSha256": _sha256(manifest),
            "deploymentCommit": "c" * 40,
            "workflowRunId": "123",
            "workflowRunAttempt": "1",
            "activeMappingEvidenceSha256": _sha256(mapping),
            "activeContractSha256": _sha256(active),
            "formCatalogDataSha256": _sha256(data),
            "releaseManifestSha256": _sha256(manifest),
            "activeMappingDigest": "d" * 64,
            "manifestMappingDigest": "e" * 64,
            "activeReplacementCount": 2,
            "currentReleaseReplacementCount": 1,
            "mappingGitCommit": "c" * 40,
            "hostingVersion": "sites/dullypdf/versions/new-version",
            "rollbackHostingVersion": "sites/dullypdf/versions/old-version",
            "hostingReleaseName": "sites/dullypdf/channels/live/releases/new",
            "deployedAt": "2026-07-30T12:00:00Z",
            "ok": True,
        },
    )
    sample = _write_json(tmp_path / "samples.json", {"schemaVersion": 1})
    frozen = _write_json(tmp_path / "frozen.json", {"schemaVersion": 1})
    selection = _write_json(tmp_path / "selection.json", {"schemaVersion": 1})
    build = _write_json(tmp_path / "build.json", {"schemaVersion": 1})
    asset_root = tmp_path / "assets"
    asset_root.mkdir()
    browser_dir = tmp_path / "mcp" / "debugging" / "mcp-screenshots" / "catalog-new"
    args = [
        "bash",
        str(scripts / FINALIZER.name),
        "--manifest",
        str(manifest),
        "--frozen-ledger-manifest",
        str(frozen),
        "--asset-root",
        str(asset_root),
        "--hosting-evidence",
        str(hosting),
        "--active-mapping-evidence",
        str(mapping),
        "--active-release-contract",
        str(active),
        "--form-catalog-data",
        str(data),
        "--sample-plan",
        str(sample),
        "--selection",
        str(selection),
        "--build-report",
        str(build),
        "--live-report",
        str(tmp_path / "live.json"),
        "--browser-output-dir",
        str(browser_dir),
        "--rollback-receipt",
        str(tmp_path / "rollback.json"),
        "--expected-commit",
        "a" * 40,
        "--expected-deployment-commit",
        "c" * 40,
        "--expected-workflow-run-id",
        "123",
        "--expected-workflow-run-attempt",
        "1",
        "--execute",
    ]
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "FAKE_OPERATIONS_LOG": str(log_path),
    }
    return args, env, log_path


def test_first_release_preserves_empty_previous_release_identity(
    tmp_path: Path,
) -> None:
    args, env, log_path = _fixture(tmp_path, previous_release_id=None)
    env["FAKE_POINTER_EXISTS"] = "0"

    result = subprocess.run(
        args,
        cwd=tmp_path,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    operations = log_path.read_text(encoding="utf-8").splitlines()
    assert result.returncode == 0, result.stderr
    assert operations[1:4] == ["lock acquire", "live", "browser"]
    assert any(item.startswith("deploy --action promote") for item in operations)
    assert operations[-1] == "lock release"
    assert "rollback" not in operations


def test_identity_validation_failure_stops_before_production_operations(
    tmp_path: Path,
) -> None:
    args, env, log_path = _fixture(tmp_path)
    run_id_index = args.index("--expected-workflow-run-id") + 1
    args[run_id_index] = "999"

    result = subprocess.run(
        args,
        cwd=tmp_path,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "Hosting evidence workflowRunId mismatch" in result.stderr
    assert "Release finalization identity validation failed." in result.stderr
    assert not log_path.exists()


def test_identity_producer_nonzero_exit_is_not_hidden(
    tmp_path: Path,
) -> None:
    args, env, log_path = _fixture(tmp_path)
    env["FAKE_IDENTITY_PRODUCER_MODE"] = "nonzero-after-output"

    result = subprocess.run(
        args,
        cwd=tmp_path,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "Release finalization identity validation failed." in result.stderr
    assert not log_path.exists()


def test_identity_handoff_rejects_wrong_record_count(
    tmp_path: Path,
) -> None:
    for record_mode in ("eight-records", "ten-records"):
        case_dir = tmp_path / record_mode
        case_dir.mkdir()
        args, env, log_path = _fixture(case_dir)
        env["FAKE_IDENTITY_PRODUCER_MODE"] = record_mode

        result = subprocess.run(
            args,
            cwd=case_dir,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 1
        assert (
            "Release finalization identity handoff did not produce exactly nine fields."
            in result.stderr
        )
        assert not log_path.exists()


def test_identity_handoff_rejects_embedded_nul(
    tmp_path: Path,
) -> None:
    args, env, log_path = _fixture(tmp_path, previous_release_id="\0")

    result = subprocess.run(
        args,
        cwd=tmp_path,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "Release finalization identity contains a NUL byte" in result.stderr
    assert not log_path.exists()


def test_previous_release_id_must_be_null_or_nonempty(
    tmp_path: Path,
) -> None:
    invalid_values = ("", "   ", False, 0)
    for index, previous_release_id in enumerate(invalid_values):
        case_dir = tmp_path / f"invalid-{index}"
        case_dir.mkdir()
        args, env, log_path = _fixture(
            case_dir,
            previous_release_id=previous_release_id,
        )

        result = subprocess.run(
            args,
            cwd=case_dir,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 1
        assert (
            "Release manifest previousReleaseId must be null or a nonempty string"
            in result.stderr
        )
        assert not log_path.exists()


def test_post_live_failure_rolls_back_under_same_lock(tmp_path: Path) -> None:
    args, env, log_path = _fixture(tmp_path)
    env["FAKE_LIVE_FAIL"] = "1"

    result = subprocess.run(
        args,
        cwd=tmp_path,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    operations = log_path.read_text(encoding="utf-8").splitlines()
    assert result.returncode == 7, result.stderr
    assert operations[0].startswith("deploy --action validate --manifest ")
    assert f"--asset-root {tmp_path / 'assets'}" in operations[0]
    assert operations[1:] == [
        "lock acquire",
        "live",
        "lock verify",
        "rollback",
        "lock release",
    ]
    assert json.loads((tmp_path / "rollback.json").read_text())["ok"] is True


def test_changed_hosting_is_never_rolled_back(tmp_path: Path) -> None:
    args, env, log_path = _fixture(tmp_path)
    env["FAKE_HOSTING_VERSION"] = "sites/dullypdf/versions/unrelated"

    result = subprocess.run(
        args,
        cwd=tmp_path,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    operations = log_path.read_text(encoding="utf-8").splitlines()
    assert result.returncode == 1
    assert "Automatic rollback is forbidden" in result.stderr
    assert "rollback" not in operations
    assert operations[-1] == "lock release"


def test_failed_guarded_rollback_retains_production_lock(
    tmp_path: Path,
) -> None:
    args, env, log_path = _fixture(tmp_path)
    env["FAKE_LIVE_FAIL"] = "1"
    env["FAKE_ROLLBACK_FAIL"] = "1"

    result = subprocess.run(
        args,
        cwd=tmp_path,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    operations = log_path.read_text(encoding="utf-8").splitlines()
    assert result.returncode == 1
    assert operations.count("rollback") == 2
    assert "lock release" not in operations
    assert "Retaining the production lock lease" in result.stderr
    retained = tmp_path / "rollback.json.lock-state.json"
    assert json.loads(retained.read_text(encoding="utf-8"))["generation"] == "9"


def test_unclassified_hosting_snapshot_failure_retains_lock_without_mutation(
    tmp_path: Path,
) -> None:
    args, env, log_path = _fixture(tmp_path)
    env["FAKE_SNAPSHOT_HOSTING_FAIL"] = "1"

    result = subprocess.run(
        args,
        cwd=tmp_path,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    operations = log_path.read_text(encoding="utf-8").splitlines()
    assert result.returncode == 8
    assert "rollback" not in operations
    assert "lock release" not in operations
    assert "Retaining the production lock lease" in result.stderr
    retained = tmp_path / "rollback.json.lock-state.json"
    assert json.loads(retained.read_text(encoding="utf-8"))["generation"] == "9"


def test_successful_post_live_gate_promotes_with_external_lock(
    tmp_path: Path,
) -> None:
    args, env, log_path = _fixture(tmp_path)

    result = subprocess.run(
        args,
        cwd=tmp_path,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    operations = log_path.read_text(encoding="utf-8").splitlines()
    assert result.returncode == 0, result.stderr
    assert operations[1:4] == ["lock acquire", "live", "browser"]
    promote = next(
        item for item in operations if item.startswith("deploy --action promote")
    )
    promote_args = shlex.split(promote)
    build_report_snapshot = Path(
        promote_args[promote_args.index("--build-report") + 1]
    )
    assert build_report_snapshot != tmp_path / "build.json"
    assert build_report_snapshot.parent == tmp_path
    assert "--external-production-lock-state" in promote
    assert "--external-production-lock-owner" in promote
    inventory_report = (
        tmp_path
        / "mcp"
        / "debugging"
        / "mcp-screenshots"
        / "catalog-new"
        / "promotion-gcs-inventory.json"
    )
    assert f"--inventory-report {inventory_report}" in promote
    assert json.loads(inventory_report.read_text(encoding="utf-8")) == {
        "schemaVersion": 1,
        "reportType": "form-catalog-gcs-inventory",
        "ok": True,
    }
    assert (inventory_report.parent / "browser-canary-report.json").is_file()
    assert operations[-1] == "lock release"
    assert "rollback" not in operations


def test_unexpected_pre_cas_command_failure_uses_exit_trap_rollback(
    tmp_path: Path,
) -> None:
    args, env, log_path = _fixture(tmp_path)
    (tmp_path / "mcp").write_text("blocks browser output directory", encoding="utf-8")

    result = subprocess.run(
        args,
        cwd=tmp_path,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    operations = log_path.read_text(encoding="utf-8").splitlines()
    assert result.returncode == 1
    assert operations[-3:] == ["lock verify", "rollback", "lock release"]
    assert "Unexpected pre-promotion termination" in result.stderr
    assert json.loads((tmp_path / "rollback.json").read_text())["ok"] is True


def test_term_during_post_live_gate_uses_signal_trap_rollback(
    tmp_path: Path,
) -> None:
    args, env, log_path = _fixture(tmp_path)
    env["FAKE_LIVE_SLEEP"] = "1"
    process = subprocess.Popen(
        args,
        cwd=tmp_path,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if (
            log_path.exists()
            and "live" in log_path.read_text(encoding="utf-8").splitlines()
        ):
            break
        time.sleep(0.05)
    else:
        process.kill()
        raise AssertionError("Finalizer did not reach the armed live gate")

    os.killpg(process.pid, signal.SIGTERM)
    _, stderr = process.communicate(timeout=10)

    operations = log_path.read_text(encoding="utf-8").splitlines()
    assert process.returncode == 143
    assert operations[-3:] == ["lock verify", "rollback", "lock release"]
    assert "Unexpected pre-promotion termination" in stderr
    receipt = json.loads((tmp_path / "rollback.json").read_text())
    assert receipt["triggerStage"] == "unexpected-signal-TERM"
    assert receipt["ok"] is True
