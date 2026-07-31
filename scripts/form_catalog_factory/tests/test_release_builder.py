from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.form_catalog_factory import release_builder
from scripts.form_catalog_factory.models import FormSpec
from scripts.form_catalog_factory.release_builder import (
    ReleaseBuildError,
    build_release,
    validate_release_selection_specs,
)
from scripts.form_catalog_factory.spec_qa import usability_profile_for_spec
from scripts.form_catalog_factory.themes import DEFAULT_THEME_ID, get_theme


ROOT = Path(__file__).resolve().parents[3]
EXEMPLAR = (
    ROOT
    / "form_catalog_specs"
    / "candidates"
    / "longtail"
    / "field_service"
    / "dfs_1100__appliance_repair_service_call_intake_form.json"
)
THEME_ID = "charcoal-deep-green-gold-v1"
RENDER_THEME = get_theme(THEME_ID).provenance()


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


def test_rendered_page_budget_fails_closed_above_profile_ceiling() -> None:
    spec = FormSpec.from_dict(json.loads(EXEMPLAR.read_text(encoding="utf-8")))
    profile = usability_profile_for_spec(spec)
    at_ceiling = {
        "ok": True,
        "errors": [],
        "metrics": {"pages": profile.max_pages},
    }
    over_ceiling = {
        "ok": True,
        "errors": [],
        "metrics": {"pages": profile.max_pages + 1},
    }

    release_builder._apply_task_page_budget(
        spec,
        at_ceiling,
        location=spec.catalog_id,
    )
    release_builder._apply_task_page_budget(
        spec,
        over_ceiling,
        location=spec.catalog_id,
    )

    assert at_ceiling == {
        "ok": True,
        "errors": [],
        "metrics": {"pages": profile.max_pages},
    }
    assert over_ceiling["ok"] is False
    assert over_ceiling["errors"][0]["code"] == "task_scope_exceeds_page_budget"


def test_page_balance_rejects_sparse_last_page_with_more_than_six_widgets() -> None:
    pdf_qa = {
        "ok": True,
        "errors": [],
        "metrics": {
            "pages": 2,
            "widgets_per_page": [18, 12],
            "lowest_widget_bottom_ratio_per_page": [0.12, 0.46],
            "last_page_lowest_widget_bottom_ratio": 0.46,
        },
    }

    release_builder._apply_page_balance_qa(pdf_qa, location="example.pdf")

    assert pdf_qa["ok"] is False
    assert pdf_qa["errors"] == [
        {
            "code": "sparse_last_page",
            "message": (
                "The last page keeps every interactive control in its upper "
                "region and leaves a large lower region unused; rebalance "
                "adjacent workflow content."
            ),
            "location": "example.pdf",
        }
    ]


def test_page_balance_preserves_orphan_last_page_diagnostic() -> None:
    pdf_qa = {
        "ok": True,
        "errors": [],
        "metrics": {
            "pages": 2,
            "widgets_per_page": [18, 6],
            "lowest_widget_bottom_ratio_per_page": [0.12, 0.46],
            "last_page_lowest_widget_bottom_ratio": 0.46,
        },
    }

    release_builder._apply_page_balance_qa(pdf_qa, location="example.pdf")

    assert pdf_qa["ok"] is False
    assert [error["code"] for error in pdf_qa["errors"]] == ["orphan_last_page"]


def test_page_balance_accepts_dense_last_page_at_threshold() -> None:
    pdf_qa = {
        "ok": True,
        "errors": [],
        "metrics": {
            "pages": 2,
            "widgets_per_page": [18, 12],
            "lowest_widget_bottom_ratio_per_page": [0.12, 0.45],
            "last_page_lowest_widget_bottom_ratio": 0.45,
        },
    }

    release_builder._apply_page_balance_qa(pdf_qa, location="example.pdf")

    assert pdf_qa == {
        "ok": True,
        "errors": [],
        "metrics": {
            "pages": 2,
            "widgets_per_page": [18, 12],
            "lowest_widget_bottom_ratio_per_page": [0.12, 0.45],
            "last_page_lowest_widget_bottom_ratio": 0.45,
        },
    }


def test_release_builder_produces_valid_immutable_assets(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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
        "renderTheme": RENDER_THEME,
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
    rendered_theme_ids: list[str] = []
    real_render_form = release_builder.render_form

    def tracked_render_form(
        form_spec: object,
        output_path: str | Path,
        *,
        theme_id: str,
    ) -> Path:
        rendered_theme_ids.append(theme_id)
        return real_render_form(form_spec, output_path, theme_id=theme_id)

    monkeypatch.setattr(release_builder, "render_form", tracked_render_form)
    monkeypatch.setattr(
        release_builder,
        "MAX_SPARSE_LAST_PAGE_LOWEST_WIDGET_RATIO",
        0.60,
    )

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
    assert report["renderTheme"] == RENDER_THEME
    assert manifest["renderTheme"] == RENDER_THEME
    assert report["renderTheme"] == manifest["renderTheme"]
    assert rendered_theme_ids == [THEME_ID]
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
    assert any(
        item["path"].endswith("form_catalog_factory/themes.py")
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


def test_selection_bound_qa_reports_exact_workset(
    tmp_path: Path,
) -> None:
    spec_root = tmp_path / "specs"
    spec_root.mkdir()
    spec_path = spec_root / EXEMPLAR.name
    spec_path.write_bytes(EXEMPLAR.read_bytes())
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    selection_path = tmp_path / "selection.json"
    selection_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "releaseId": "catalog-selection-qa-test",
                "targetCount": 1,
                "renderTheme": RENDER_THEME,
                "items": [
                    {
                        "catalogId": spec["catalog_id"],
                        "sourceSection": spec["source_section"],
                        "filename": spec["source_filename"],
                        "slug": spec["slug"],
                        "riskTier": spec["risk_tier"],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    report = validate_release_selection_specs(
        selection_path=selection_path,
        spec_root=spec_root,
    )

    assert report["passed"] is True
    assert report["releaseId"] == "catalog-selection-qa-test"
    assert report["count"] == 1
    assert report["selectionSha256"] == hashlib.sha256(
        selection_path.read_bytes()
    ).hexdigest()
    assert report["renderTheme"] == RENDER_THEME


def test_release_builder_allows_descriptive_pdf_title(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
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
        "renderTheme": RENDER_THEME,
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
    monkeypatch.setattr(
        release_builder,
        "MAX_SPARSE_LAST_PAGE_LOWEST_WIDGET_RATIO",
        0.60,
    )

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


def test_release_builder_reproduces_historical_selection_with_legacy_theme(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    spec_root = tmp_path / "specs"
    spec_root.mkdir()
    spec_path = spec_root / EXEMPLAR.name
    spec_path.write_bytes(EXEMPLAR.read_bytes())
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    plan = {
        "schemaVersion": 1,
        "releaseId": "catalog-historical-no-theme",
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
    plan_path = tmp_path / "selection.json"
    plan_path.write_text(json.dumps(plan), encoding="utf-8")
    rendered_theme_ids: list[str] = []
    real_render_form = release_builder.render_form

    def tracked_render_form(
        form_spec: object,
        output_path: str | Path,
        *,
        theme_id: str,
    ) -> Path:
        rendered_theme_ids.append(theme_id)
        return real_render_form(form_spec, output_path, theme_id=theme_id)

    monkeypatch.setattr(release_builder, "render_form", tracked_render_form)
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

    report = json.loads(Path(result["build_report"]).read_text(encoding="utf-8"))
    manifest = json.loads(Path(result["manifest"]).read_text(encoding="utf-8"))
    assert rendered_theme_ids == [DEFAULT_THEME_ID]
    assert "renderTheme" not in report
    assert "renderTheme" not in manifest


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


def test_release_builder_supports_historical_absence_and_requires_exact_registered_theme(
    tmp_path: Path,
) -> None:
    selection_path = tmp_path / "selection.json"
    selection = {
        "schemaVersion": 1,
        "releaseId": "catalog-test-theme",
        "targetCount": 1,
        "items": [{}],
    }
    selection_path.write_text(json.dumps(selection), encoding="utf-8")

    loaded = release_builder._load_selection(selection_path)
    assert "renderTheme" not in loaded

    selection["renderTheme"] = {
        **RENDER_THEME,
        "paletteSha256": "0" * 64,
    }
    selection_path.write_text(json.dumps(selection), encoding="utf-8")
    with pytest.raises(ReleaseBuildError, match="does not exactly match"):
        release_builder._load_selection(selection_path)


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
        "renderTheme": RENDER_THEME,
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
