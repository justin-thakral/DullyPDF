from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.form_catalog_factory import release_builder
from scripts.form_catalog_factory.release_builder import ReleaseBuildError, build_release


ROOT = Path(__file__).resolve().parents[3]
EXEMPLAR = (
    ROOT
    / "form_catalog_specs"
    / "candidates"
    / "longtail"
    / "field_service"
    / "dfs_1100__appliance_repair_service_call_intake_form.json"
)


def _test_source_verifier(**kwargs: object) -> dict[str, object]:
    return {
        "repositoryHead": kwargs["source_commit"],
        "workingTreeClean": True,
        "baseIsAncestor": True,
        "rendererIsAncestor": True,
        "filesTrackedAtSource": True,
        "filesByteIdentical": True,
    }


def _test_runtime_verifier() -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "requirementsPath": "backend/requirements.txt",
        "requirementsSha256": "1" * 64,
        "pythonImplementation": "CPython",
        "pythonVersion": "3.10.0",
        "pythonExecutable": "python",
        "pythonExecutableSha256": "2" * 64,
        "packages": {
            "pillow": "12.1.1",
            "pypdf": "6.9.2",
            "reportlab": "4.4.4",
        },
        "pdftoppmExecutable": "pdftoppm",
        "pdftoppmExecutableSha256": "3" * 64,
        "pdftoppmVersion": "pdftoppm version 25.01.0",
        "pillowLibraries": {
            "webp": {"available": True, "version": "1.5.0"},
            "zlib": {"available": True, "version": "1.3.1"},
        },
    }


def test_release_builder_produces_valid_immutable_assets(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    spec_root = repository / "specs"
    spec_root.mkdir(parents=True)
    spec_path = spec_root / EXEMPLAR.name
    spec_path.write_bytes(EXEMPLAR.read_bytes())
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    plan = {
        "schemaVersion": 1,
        "releaseId": "catalog-test-001",
        "targetCount": 1,
        "items": [
            {
                "catalogId": spec["catalog_id"],
                "sourceSection": spec["source_section"],
                "filename": spec["source_filename"],
                "slug": spec["slug"],
                "title": spec["title"],
                "riskTier": spec["risk_tier"],
            }
        ],
    }
    plan_path = repository / "selection.json"
    plan_path.write_text(json.dumps(plan), encoding="utf-8")
    subprocess.run(["git", "init", "-q", str(repository)], check=True)
    subprocess.run(
        ["git", "-C", str(repository), "config", "user.email", "test@example.com"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(repository), "config", "user.name", "Test User"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(repository), "add", "selection.json", "specs"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(repository), "commit", "-qm", "fixture"],
        check=True,
    )
    head = subprocess.run(
        ["git", "-C", str(repository), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()

    result = build_release(
        selection_path=plan_path,
        spec_root=spec_root,
        output_root=tmp_path / "release",
        source_commit=head,
        base_commit=head,
        renderer_commit=head,
        previous_release_id=None,
        created_at="2026-07-29T12:00:00Z",
        workers=1,
        _source_verifier=_test_source_verifier,
        _runtime_verifier=_test_runtime_verifier,
    )

    manifest = json.loads(Path(result["manifest"]).read_text(encoding="utf-8"))
    report_path = Path(result["build_report"])
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert manifest["sourceCommit"] == head
    assert manifest["baseCommit"] == head
    assert manifest["rendererCommit"] == head
    assert report["sourceCommit"] == head
    assert report["baseCommit"] == head
    assert report["rendererCommit"] == head
    assert report["rendererRuntime"] == _test_runtime_verifier()
    assert manifest["rendererRuntime"] == _test_runtime_verifier()
    assert report["sourceVerification"]["verified"] is True
    assert report["releaseManifestPath"] == "release.json"
    assert report["releaseManifestSha256"] == hashlib.sha256(
        Path(result["manifest"]).read_bytes()
    ).hexdigest()
    assert not report["sourceVerification"]["selection"]["path"].startswith("/")
    assert all(
        not item["path"].startswith("/")
        for item in report["sourceVerification"]["runtimeSources"]
    )
    assert all(
        not item["path"].startswith("/")
        for item in report["sourceVerification"]["specifications"]
    )
    form = manifest["forms"][0]
    assert form["catalogId"] == spec["catalog_id"]
    assert form["pageCount"] >= 2
    for key in ("pdf", "thumbnail"):
        asset = form[key]
        path = (tmp_path / "release" / asset["sourcePath"]).resolve()
        assert path.is_file()
        assert asset["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
        assert asset["objectPath"].startswith(
            "releases/catalog-test-001/assets/"
        )

    validation = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "validate-form-catalog-release.py"),
            "--manifest",
            result["manifest"],
            "--asset-root",
            str(tmp_path / "release"),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert validation.returncode == 0, validation.stderr


def test_release_builder_allows_descriptive_pdf_title(
    tmp_path: Path,
) -> None:
    spec_root = tmp_path / "specs"
    spec_root.mkdir()
    spec_path = spec_root / EXEMPLAR.name
    spec_path.write_bytes(EXEMPLAR.read_bytes())
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    plan = {
        "schemaVersion": 1,
        "releaseId": "catalog-test-title-drift",
        "targetCount": 1,
        "items": [
            {
                "catalogId": spec["catalog_id"],
                "sourceSection": spec["source_section"],
                "filename": spec["source_filename"],
                "slug": spec["slug"],
                "title": "A Different Tracked Title",
                "riskTier": spec["risk_tier"],
            }
        ],
    }
    plan_path = tmp_path / "selection.json"
    plan_path.write_text(json.dumps(plan), encoding="utf-8")

    result = build_release(
        selection_path=plan_path,
        spec_root=spec_root,
        output_root=tmp_path / "release",
        source_commit="a" * 40,
        base_commit="b" * 40,
        renderer_commit="a" * 40,
        previous_release_id=None,
        created_at="2026-07-29T12:00:00Z",
        workers=1,
        _source_verifier=_test_source_verifier,
        _runtime_verifier=_test_runtime_verifier,
    )

    assert Path(result["manifest"]).is_file()


def test_release_builder_requires_renderer_commit_to_equal_source(
    tmp_path: Path,
) -> None:
    with pytest.raises(ReleaseBuildError, match="renderer_commit must equal source_commit"):
        build_release(
            selection_path=tmp_path / "selection.json",
            spec_root=tmp_path / "specs",
            output_root=tmp_path / "release",
            source_commit="a" * 40,
            base_commit="a" * 40,
            renderer_commit="b" * 40,
            previous_release_id=None,
            _source_verifier=_test_source_verifier,
            _runtime_verifier=_test_runtime_verifier,
        )


def test_renderer_runtime_rejects_dependency_version_drift(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    versions = {
        "pillow": "12.1.1",
        "pypdf": "6.9.2",
        "reportlab": "0.0.0",
    }
    monkeypatch.setattr(
        release_builder.importlib.metadata,
        "version",
        lambda name: versions[name],
    )

    with pytest.raises(
        ReleaseBuildError,
        match="reportlab==0.0.0 does not match the tracked pin 4.4.4",
    ):
        release_builder._capture_renderer_runtime()


def test_release_builder_default_verifier_rejects_non_head_source(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repository"
    spec_root = repository / "specs"
    spec_root.mkdir(parents=True)
    spec_path = spec_root / EXEMPLAR.name
    spec_path.write_bytes(EXEMPLAR.read_bytes())
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    plan = {
        "schemaVersion": 1,
        "releaseId": "catalog-test-provenance",
        "targetCount": 1,
        "items": [
            {
                "catalogId": spec["catalog_id"],
                "sourceSection": spec["source_section"],
                "filename": spec["source_filename"],
                "slug": spec["slug"],
                "title": spec["title"],
                "riskTier": spec["risk_tier"],
            }
        ],
    }
    plan_path = repository / "selection.json"
    plan_path.write_text(json.dumps(plan), encoding="utf-8")
    subprocess.run(["git", "init", "-q", str(repository)], check=True)
    subprocess.run(
        ["git", "-C", str(repository), "config", "user.email", "test@example.com"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(repository), "config", "user.name", "Test User"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(repository), "add", "selection.json", "specs"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(repository), "commit", "-qm", "fixture"],
        check=True,
    )
    head = subprocess.run(
        ["git", "-C", str(repository), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()

    with pytest.raises(ReleaseBuildError, match="does not equal clean Git HEAD"):
        build_release(
            selection_path=plan_path,
            spec_root=spec_root,
            output_root=tmp_path / "release",
            source_commit="f" * 40,
            base_commit=head,
            renderer_commit="f" * 40,
            previous_release_id=None,
            workers=1,
        )

    with pytest.raises(
        ReleaseBuildError,
        match="source path is outside the verified Git worktree",
    ):
        build_release(
            selection_path=plan_path,
            spec_root=spec_root,
            output_root=tmp_path / "release-runtime-root",
            source_commit=head,
            base_commit=head,
            renderer_commit=head,
            previous_release_id=None,
            created_at="2026-07-29T12:00:00Z",
            workers=1,
        )
