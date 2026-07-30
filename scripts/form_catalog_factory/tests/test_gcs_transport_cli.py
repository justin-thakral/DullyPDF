"""Tests for the dependency-light GCS transport command boundary."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from typing import Any
from unittest.mock import Mock, patch

import pytest

from scripts.form_catalog_factory import gcs_transport_cli


REPO_ROOT = Path(__file__).resolve().parents[3]
_EXPECTED_DIGEST = "a" * 64
_INVENTORY_DIGEST = "b" * 64


def _args(
    tmp_path: Path,
    *,
    action: str,
    output: Path | None = None,
) -> argparse.Namespace:
    return argparse.Namespace(
        action=action,
        plan=tmp_path / "expected-plan.json",
        output=output or tmp_path / "inventory-report.json",
        max_workers=7,
        page_size=321,
        timeout_seconds=45,
    )


def _report(
    *,
    created: int | None = None,
    existing: int | None = None,
) -> dict[str, Any]:
    report: dict[str, Any] = {
        "schemaVersion": 1,
        "reportType": "form-catalog-gcs-inventory",
        "ok": True,
        "objectCount": 2,
        "pageCount": 1,
        "expectedInventoryDigest": _EXPECTED_DIGEST,
        "inventoryDigest": _INVENTORY_DIGEST,
        "objects": [
            {
                "objectPath": "releases/private-object.pdf",
                "sourcePath": "/private/upload-source.pdf",
            }
        ],
    }
    if created is not None:
        report["createdObjectCount"] = created
    if existing is not None:
        report["existingObjectCount"] = existing
    return report


def _plan(tmp_path: Path) -> SimpleNamespace:
    return SimpleNamespace(
        objects=(
            SimpleNamespace(source_path=tmp_path / "source-a.pdf"),
            SimpleNamespace(source_path=tmp_path / "source-b.webp"),
        )
    )


def test_stage_uses_helper_writes_canonical_report_and_returns_safe_summary(
    tmp_path: Path,
) -> None:
    args = _args(tmp_path, action="stage")
    plan = _plan(tmp_path)
    report = _report(created=1, existing=1)
    transport = SimpleNamespace(
        load_expected_object_plan=Mock(return_value=plan),
        stage_expected_objects=Mock(return_value=report),
        canonical_inventory_report_bytes=Mock(
            side_effect=lambda value: (
                json.dumps(value, sort_keys=True).encode("utf-8") + b"\n"
            )
        ),
    )

    summary = gcs_transport_cli.execute(args, transport_module=transport)

    transport.load_expected_object_plan.assert_called_once_with(args.plan)
    transport.stage_expected_objects.assert_called_once_with(
        plan,
        max_workers=7,
        page_size=321,
        timeout_seconds=45,
    )
    serialized_report = (
        transport.canonical_inventory_report_bytes.call_args.args[0]
    )
    assert serialized_report == {**report, "operation": "stage"}
    assert json.loads(args.output.read_bytes())["operation"] == "stage"
    assert summary == (
        "stage ok objects=2 pages=1 created=1 existing=1 "
        f"expected-digest={_EXPECTED_DIGEST} "
        f"inventory-digest={_INVENTORY_DIGEST}"
    )
    assert "private-object" not in summary
    assert "upload-source" not in summary


def test_verify_constructs_one_transport_and_never_calls_upload(
    tmp_path: Path,
) -> None:
    args = _args(tmp_path, action="verify")
    plan = _plan(tmp_path)
    report = _report()
    instance = Mock()
    instance.verify_inventory.return_value = report
    constructor = Mock(return_value=instance)
    stage = Mock(side_effect=AssertionError("verify must never stage uploads"))
    transport = SimpleNamespace(
        load_expected_object_plan=Mock(return_value=plan),
        stage_expected_objects=stage,
        GcsReleaseTransport=constructor,
        canonical_inventory_report_bytes=Mock(
            side_effect=lambda value: (
                json.dumps(value, sort_keys=True).encode("utf-8") + b"\n"
            )
        ),
    )

    summary = gcs_transport_cli.execute(args, transport_module=transport)

    constructor.assert_called_once_with(
        plan,
        max_workers=7,
        page_size=321,
        timeout_seconds=45,
    )
    instance.verify_inventory.assert_called_once_with()
    assert not instance.upload.called
    assert not instance.stage.called
    assert not stage.called
    serialized_report = (
        transport.canonical_inventory_report_bytes.call_args.args[0]
    )
    assert serialized_report["operation"] == "verify"
    assert json.loads(args.output.read_bytes())["operation"] == "verify"
    assert summary.startswith("verify ok objects=2 pages=1 ")
    assert "created=" not in summary


def test_atomic_write_replaces_existing_report_without_temp_residue(
    tmp_path: Path,
) -> None:
    output = tmp_path / "inventory.json"
    output.write_bytes(b"old-complete-report\n")

    with patch.object(os, "fsync", wraps=os.fsync) as fsync:
        gcs_transport_cli._atomic_write(output, b"new-complete-report\n")

    assert output.read_bytes() == b"new-complete-report\n"
    assert list(tmp_path.glob(".inventory.json.*.tmp")) == []
    assert fsync.call_count == 2


def test_atomic_replace_failure_preserves_existing_report(
    tmp_path: Path,
) -> None:
    output = tmp_path / "inventory.json"
    output.write_bytes(b"old-complete-report\n")

    with (
        patch.object(os, "replace", side_effect=OSError("replace failed")),
        pytest.raises(OSError, match="replace failed"),
    ):
        gcs_transport_cli._atomic_write(output, b"new-complete-report\n")

    assert output.read_bytes() == b"old-complete-report\n"
    assert list(tmp_path.glob(".inventory.json.*.tmp")) == []


def test_transport_failure_preserves_report_and_does_not_print_paths(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    args = _args(tmp_path, action="stage")
    args.output.write_bytes(b"prior-report\n")
    transport = SimpleNamespace(
        load_expected_object_plan=Mock(return_value=_plan(tmp_path)),
        stage_expected_objects=Mock(
            side_effect=RuntimeError(
                "failed /private/upload-source.pdf at releases/private-object.pdf"
            )
        ),
    )

    with patch.object(
        gcs_transport_cli,
        "_load_transport_module",
        return_value=transport,
    ):
        result = gcs_transport_cli.main(
            [
                "--action",
                "stage",
                "--plan",
                str(args.plan),
                "--output",
                str(args.output),
            ]
        )

    captured = capsys.readouterr()
    assert result == 1
    assert captured.out == ""
    assert "RuntimeError" in captured.err
    assert "upload-source" not in captured.err
    assert "private-object" not in captured.err
    assert args.output.read_bytes() == b"prior-report\n"


@pytest.mark.parametrize(
    ("flag", "value"),
    [
        ("--max-workers", "0"),
        ("--max-workers", "33"),
        ("--page-size", "0"),
        ("--page-size", "1001"),
        ("--timeout-seconds", "0"),
        ("--timeout-seconds", "not-an-integer"),
    ],
)
def test_argument_bounds_fail_before_transport_loading(
    tmp_path: Path,
    flag: str,
    value: str,
) -> None:
    with (
        patch.object(
            gcs_transport_cli,
            "_load_transport_module",
            side_effect=AssertionError("arguments must fail before dependency load"),
        ),
        pytest.raises(SystemExit) as raised,
    ):
        gcs_transport_cli.main(
            [
                "--action",
                "verify",
                "--plan",
                str(tmp_path / "plan.json"),
                "--output",
                str(tmp_path / "report.json"),
                flag,
                value,
            ]
        )

    assert raised.value.code == 2


def test_missing_storage_dependency_has_concise_error(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    with patch.object(
        gcs_transport_cli,
        "_load_transport_module",
        side_effect=gcs_transport_cli.GcsTransportDependencyError(
            "google-cloud-storage dependency is unavailable"
        ),
    ):
        result = gcs_transport_cli.main(
            [
                "--action",
                "verify",
                "--plan",
                str(tmp_path / "plan.json"),
                "--output",
                str(tmp_path / "report.json"),
            ]
        )

    captured = capsys.readouterr()
    assert result == 1
    assert captured.out == ""
    assert captured.err == (
        "error: google-cloud-storage dependency is unavailable\n"
    )


def test_module_import_and_help_do_not_require_google_storage_runtime() -> None:
    script = """
import importlib.abc
import sys


class BlockGoogleRuntime(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split(".", 1)[0] == "google":
            raise ModuleNotFoundError(
                f"blocked optional dependency: {fullname}",
                name=fullname,
            )
        return None


sys.meta_path.insert(0, BlockGoogleRuntime())
from scripts.form_catalog_factory import gcs_transport_cli

assert callable(gcs_transport_cli.main)
assert "--action" in gcs_transport_cli.build_argument_parser().format_help()
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
