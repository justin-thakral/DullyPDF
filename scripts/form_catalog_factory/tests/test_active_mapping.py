from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

import pytest

from scripts.form_catalog_factory.active_mapping import (
    ActiveMappingError,
    build_active_mapping_evidence,
    verify_expected_active_mapping_evidence,
)


def _write_json(path: Path, payload: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def _write_data(path: Path, entries: list[dict]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = ",\n".join(f"  {json.dumps(entry)}" for entry in entries)
    path.write_text(
        "// generated\n"
        "const RAW_FORM_CATALOG_ENTRIES = [\n"
        f"{body}\n"
        "];\n",
        encoding="utf-8",
    )
    return path


def _mapping(release_id: str, section: str, filename: str, seed: str) -> dict:
    stem = filename.removesuffix(".pdf")
    return {
        "sourceSection": section,
        "filename": filename,
        "pdfPath": f"releases/{release_id}/assets/{section}/{filename}",
        "thumbnailPath": (
            f"releases/{release_id}/assets/{section}/{stem}.webp"
        ),
        "sha256": seed * 64,
        "bytes": 100,
        "pageCount": 2,
    }


def _manifest_form(mapping: dict) -> dict:
    section = mapping["sourceSection"]
    filename = mapping["filename"]
    return {
        "catalogId": f"{section}/{filename.removesuffix('.pdf')}",
        "slug": filename.removesuffix(".pdf"),
        "sourceSection": section,
        "filename": filename,
        "pageCount": mapping["pageCount"],
        "pdf": {
            "objectPath": mapping["pdfPath"],
            "sha256": mapping["sha256"],
            "bytes": mapping["bytes"],
        },
        "thumbnail": {
            "objectPath": mapping["thumbnailPath"],
            "sha256": "f" * 64,
            "bytes": 20,
        },
    }


def _active_fixture(tmp_path: Path) -> tuple[Path, Path, Path, dict]:
    old = _mapping("catalog-old", "old_section", "old.pdf", "a")
    current = _mapping("catalog-new", "new_section", "new.pdf", "b")
    manifest = {
        "schemaVersion": 1,
        "releaseId": "catalog-new",
        "sourceCommit": "c" * 40,
        "previousReleaseId": "catalog-old",
        "forms": [_manifest_form(current)],
    }
    manifest_path = _write_json(tmp_path / "release.json", manifest)
    active = {
        "schemaVersion": 1,
        "releaseId": "catalog-new",
        "sourceCommit": "c" * 40,
        "manifestSha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        "previousReleaseId": "catalog-old",
        "activatedAt": "2026-07-30T12:00:00Z",
        "replacements": [old, current],
    }
    active_path = _write_json(tmp_path / "active.json", active)
    entries = [
        {
            "slug": "unchanged",
            "sourceSection": "base",
            "filename": "unchanged.pdf",
            "pdfPath": "base/unchanged.pdf",
            "thumbnailPath": "base/unchanged.webp",
            "sha256": "d" * 64,
            "bytes": 50,
            "pageCount": 1,
        },
        {"slug": "old", **old},
        {"slug": "new", **current},
    ]
    data_path = _write_data(tmp_path / "formCatalogData.mjs", entries)
    return active_path, data_path, manifest_path, active


def test_active_mapping_binds_cumulative_index_and_current_manifest(
    tmp_path: Path,
) -> None:
    active_path, data_path, manifest_path, active = _active_fixture(tmp_path)

    evidence = build_active_mapping_evidence(
        active_release_path=active_path,
        form_catalog_data_path=data_path,
        manifest_path=manifest_path,
        repo_root=tmp_path,
        require_git_head=False,
    )

    assert evidence["ok"] is True
    assert evidence["activeContractSha256"] == hashlib.sha256(
        active_path.read_bytes()
    ).hexdigest()
    assert evidence["formCatalogDataSha256"] == hashlib.sha256(
        data_path.read_bytes()
    ).hexdigest()
    assert evidence["releaseManifestSha256"] == active["manifestSha256"]
    assert evidence["activeReplacementCount"] == 2
    assert evidence["currentReleaseReplacementCount"] == 1
    assert evidence["generatedEntryCount"] == 3


@pytest.mark.parametrize(
    "command",
    (
        "verify-active-mapping",
        "snapshot-hosting",
        "create-hosting-evidence",
        "rollback-hosting",
    ),
)
def test_deploy_control_cli_help_does_not_import_pdf_runtime(
    command: str,
) -> None:
    blocker = """
import builtins
import runpy
import sys

blocked = ("PIL", "pypdf", "reportlab")
original_import = builtins.__import__

def guarded_import(name, *args, **kwargs):
    if name in blocked or name.startswith(tuple(item + "." for item in blocked)):
        raise RuntimeError(f"unexpected PDF runtime import: {name}")
    return original_import(name, *args, **kwargs)

builtins.__import__ = guarded_import
sys.argv = ["form-catalog-factory", sys.argv[1], "--help"]
runpy.run_module("scripts.form_catalog_factory", run_name="__main__")
"""
    result = subprocess.run(
        ["python3", "-c", blocker, command],
        cwd=Path(__file__).resolve().parents[3],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_verify_active_mapping_cli_runs_without_pdf_runtime(
    tmp_path: Path,
) -> None:
    active_path = _write_json(
        tmp_path / "form_catalog_releases" / "active.json",
        {
            "schemaVersion": 1,
            "releaseId": None,
            "sourceCommit": None,
            "manifestSha256": None,
            "previousReleaseId": None,
            "activatedAt": None,
            "replacements": [],
        },
    )
    data_path = _write_data(
        tmp_path / "frontend" / "src" / "config" / "formCatalogData.mjs",
        [],
    )
    for command in (
        ["git", "init", "-q"],
        ["git", "config", "user.email", "catalog-test@example.invalid"],
        ["git", "config", "user.name", "Catalog Test"],
        ["git", "add", "."],
        ["git", "commit", "-qm", "fixture"],
    ):
        subprocess.run(command, cwd=tmp_path, check=True, capture_output=True)
    output = tmp_path / "active-mapping.json"
    source_root = Path(__file__).resolve().parents[3]
    blocker = """
import builtins
import runpy
import sys

blocked = ("PIL", "pypdf", "reportlab")
original_import = builtins.__import__

def guarded_import(name, *args, **kwargs):
    if name in blocked or name.startswith(tuple(item + "." for item in blocked)):
        raise RuntimeError(f"unexpected PDF runtime import: {name}")
    return original_import(name, *args, **kwargs)

builtins.__import__ = guarded_import
sys.path.insert(0, sys.argv[1])
sys.argv = [
    "form-catalog-factory",
    "verify-active-mapping",
    "--active-release", sys.argv[2],
    "--form-catalog-data", sys.argv[3],
    "--repo-root", sys.argv[4],
    "--output", sys.argv[5],
]
runpy.run_module("scripts.form_catalog_factory", run_name="__main__")
"""
    result = subprocess.run(
        [
            "python3",
            "-c",
            blocker,
            str(source_root),
            str(active_path),
            str(data_path),
            str(tmp_path),
            str(output),
        ],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(output.read_text(encoding="utf-8"))["ok"] is True


def test_git_references_bind_private_mapping_snapshots(
    tmp_path: Path,
) -> None:
    repo = tmp_path / "repo"
    active_path = _write_json(
        repo / "form_catalog_releases" / "active.json",
        {
            "schemaVersion": 1,
            "releaseId": None,
            "sourceCommit": None,
            "manifestSha256": None,
            "previousReleaseId": None,
            "activatedAt": None,
            "replacements": [],
        },
    )
    data_path = _write_data(
        repo / "frontend" / "src" / "config" / "formCatalogData.mjs",
        [],
    )
    for command in (
        ["git", "init", "-q"],
        ["git", "config", "user.email", "catalog-test@example.invalid"],
        ["git", "config", "user.name", "Catalog Test"],
        ["git", "add", "."],
        ["git", "commit", "-qm", "fixture"],
    ):
        subprocess.run(command, cwd=repo, check=True, capture_output=True)
    snapshots = tmp_path / "snapshots"
    active_snapshot = _write_json(
        snapshots / "active.json",
        json.loads(active_path.read_text(encoding="utf-8")),
    )
    data_snapshot = snapshots / "formCatalogData.mjs"
    data_snapshot.parent.mkdir(parents=True, exist_ok=True)
    data_snapshot.write_bytes(data_path.read_bytes())
    deployed_commit = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    future_active = json.loads(active_path.read_text(encoding="utf-8"))
    future_active["futureCommitMarker"] = True
    _write_json(active_path, future_active)
    subprocess.run(
        ["git", "add", "."],
        cwd=repo,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "commit", "-qm", "future unrelated controller commit"],
        cwd=repo,
        check=True,
        capture_output=True,
    )

    evidence = build_active_mapping_evidence(
        active_release_path=active_snapshot,
        form_catalog_data_path=data_snapshot,
        repo_root=repo,
        git_active_reference_path=active_path,
        git_data_reference_path=data_path,
        expected_git_commit=deployed_commit,
    )

    assert evidence["gitCommit"] == deployed_commit
    assert evidence["activeContractPath"] == "form_catalog_releases/active.json"
    assert (
        evidence["formCatalogDataPath"]
        == "frontend/src/config/formCatalogData.mjs"
    )
    active_snapshot.write_text(
        active_snapshot.read_text(encoding="utf-8") + "\n",
        encoding="utf-8",
    )
    with pytest.raises(ActiveMappingError, match="does not exactly match Git commit"):
        build_active_mapping_evidence(
            active_release_path=active_snapshot,
            form_catalog_data_path=data_snapshot,
            repo_root=repo,
            git_active_reference_path=active_path,
            git_data_reference_path=data_path,
            expected_git_commit=deployed_commit,
        )


def test_active_mapping_rejects_uncontracted_release_asset(tmp_path: Path) -> None:
    active_path, data_path, manifest_path, _ = _active_fixture(tmp_path)
    source = data_path.read_text(encoding="utf-8")
    extra = _mapping("catalog-other", "rogue", "rogue.pdf", "e")
    source = source.replace(
        "\n];",
        f",\n  {json.dumps({'slug': 'rogue', **extra})}\n];",
    )
    data_path.write_text(source, encoding="utf-8")

    with pytest.raises(ActiveMappingError, match="uncontracted"):
        build_active_mapping_evidence(
            active_release_path=active_path,
            form_catalog_data_path=data_path,
            manifest_path=manifest_path,
            repo_root=tmp_path,
            require_git_head=False,
        )


def test_active_mapping_rejects_manifest_mapping_drift(tmp_path: Path) -> None:
    active_path, data_path, manifest_path, active = _active_fixture(tmp_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["forms"][0]["pdf"]["bytes"] = 101
    _write_json(manifest_path, manifest)
    active["manifestSha256"] = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    _write_json(active_path, active)

    with pytest.raises(ActiveMappingError, match="does not exactly match active"):
        build_active_mapping_evidence(
            active_release_path=active_path,
            form_catalog_data_path=data_path,
            manifest_path=manifest_path,
            repo_root=tmp_path,
            require_git_head=False,
        )


def test_empty_contract_rejects_generated_release_mapping(tmp_path: Path) -> None:
    active_path = _write_json(
        tmp_path / "active.json",
        {
            "schemaVersion": 1,
            "releaseId": None,
            "sourceCommit": None,
            "manifestSha256": None,
            "previousReleaseId": None,
            "activatedAt": None,
            "replacements": [],
        },
    )
    rogue = _mapping("catalog-rogue", "rogue", "rogue.pdf", "e")
    data_path = _write_data(
        tmp_path / "formCatalogData.mjs",
        [{"slug": "rogue", **rogue}],
    )

    with pytest.raises(ActiveMappingError, match="uncontracted"):
        build_active_mapping_evidence(
            active_release_path=active_path,
            form_catalog_data_path=data_path,
            repo_root=tmp_path,
            require_git_head=False,
        )


def test_active_mapping_requires_exact_git_head_bytes(tmp_path: Path) -> None:
    active_path = _write_json(
        tmp_path / "active.json",
        {
            "schemaVersion": 1,
            "releaseId": None,
            "sourceCommit": None,
            "manifestSha256": None,
            "previousReleaseId": None,
            "activatedAt": None,
            "replacements": [],
        },
    )
    data_path = _write_data(tmp_path / "formCatalogData.mjs", [])
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=tmp_path,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        cwd=tmp_path,
        check=True,
    )
    subprocess.run(["git", "add", "."], cwd=tmp_path, check=True)
    subprocess.run(["git", "commit", "-qm", "fixture"], cwd=tmp_path, check=True)

    evidence = build_active_mapping_evidence(
        active_release_path=active_path,
        form_catalog_data_path=data_path,
        repo_root=tmp_path,
    )
    active_path.write_text(active_path.read_text(encoding="utf-8") + "\n")

    assert evidence["gitCommit"]
    with pytest.raises(ActiveMappingError, match="does not exactly match Git commit"):
        build_active_mapping_evidence(
            active_release_path=active_path,
            form_catalog_data_path=data_path,
            repo_root=tmp_path,
        )


def test_expected_active_mapping_report_must_match_exactly(tmp_path: Path) -> None:
    active_path, data_path, manifest_path, _ = _active_fixture(tmp_path)
    evidence = build_active_mapping_evidence(
        active_release_path=active_path,
        form_catalog_data_path=data_path,
        manifest_path=manifest_path,
        repo_root=tmp_path,
        require_git_head=False,
    )
    report_path = _write_json(tmp_path / "evidence.json", evidence)
    verify_expected_active_mapping_evidence(evidence, report_path)
    changed = dict(evidence)
    changed["formCatalogDataSha256"] = "0" * 64

    with pytest.raises(ActiveMappingError, match="does not exactly match"):
        verify_expected_active_mapping_evidence(changed, report_path)
