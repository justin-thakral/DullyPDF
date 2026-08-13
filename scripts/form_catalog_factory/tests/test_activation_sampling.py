from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from scripts.form_catalog_factory.activation import ActivationError, build_active_contract
from scripts.form_catalog_factory.sampling import SamplingPlanError, build_sample_plan


def _write(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _renderer_runtime() -> dict:
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


def _active_contract(
    *,
    release_id: str | None = "catalog-old",
) -> dict:
    replacements = []
    if release_id is not None:
        replacements.append(
            {
                "sourceSection": "old",
                "filename": "old.pdf",
                "pdfPath": f"releases/{release_id}/assets/old/old.pdf",
                "thumbnailPath": f"releases/{release_id}/assets/old/old.webp",
                "sha256": "a" * 64,
                "bytes": 10,
                "pageCount": 1,
            }
        )
    return {
        "schemaVersion": 1,
        "releaseId": release_id,
        "sourceCommit": "a" * 40 if release_id is not None else None,
        "previousReleaseId": None,
        "activatedAt": (
            "2026-07-28T12:00:00Z" if release_id is not None else None
        ),
        "replacements": replacements,
    }


def _activation_manifest(
    *,
    release_id: str = "catalog-new",
    previous_release_id: str | None = "catalog-old",
    section: str = "new",
    filename: str = "new.pdf",
) -> dict:
    stem = Path(filename).stem
    return {
        "schemaVersion": 1,
        "releaseId": release_id,
        "sourceCommit": "b" * 40,
        "baseCommit": "a" * 40,
        "rendererCommit": "b" * 40,
        "rendererRuntime": _renderer_runtime(),
        "previousReleaseId": previous_release_id,
        "createdAt": "2026-07-29T11:00:00Z",
        "forms": [
            {
                "catalogId": f"{section}/{stem}",
                "slug": stem.replace("_", "-"),
                "sourceSection": section,
                "filename": filename,
                "pageCount": 2,
                "pdf": {
                    "sourcePath": filename,
                    "objectPath": (
                        f"releases/{release_id}/assets/{section}/{filename}"
                    ),
                    "contentType": "application/pdf",
                    "sha256": "b" * 64,
                    "bytes": 20,
                },
                "thumbnail": {
                    "sourcePath": f"{stem}.webp",
                    "objectPath": (
                        f"releases/{release_id}/assets/{section}/{stem}.webp"
                    ),
                    "contentType": "image/webp",
                    "sha256": "c" * 64,
                    "bytes": 10,
                },
            }
        ],
    }


def test_activation_merges_cumulative_replacements_and_enforces_order(tmp_path: Path) -> None:
    current = _active_contract()
    manifest = _activation_manifest()

    active = build_active_contract(
        manifest_path=_write(tmp_path / "release.json", manifest),
        current_active_path=_write(tmp_path / "active.json", current),
        activated_at="2026-07-29T12:00:00Z",
    )

    assert active["releaseId"] == "catalog-new"
    assert active["manifestSha256"] == hashlib.sha256(
        (tmp_path / "release.json").read_bytes()
    ).hexdigest()
    assert len(active["replacements"]) == 2
    manifest["previousReleaseId"] = "wrong-release"
    _write(tmp_path / "release.json", manifest)
    with pytest.raises(ActivationError, match="does not match"):
        build_active_contract(
            manifest_path=tmp_path / "release.json",
            current_active_path=tmp_path / "active.json",
            activated_at="2026-07-29T12:00:00Z",
        )

    manifest["previousReleaseId"] = "catalog-old"
    manifest["forms"][0]["catalogId"] = "new/not-new"
    _write(tmp_path / "release.json", manifest)
    with pytest.raises(ActivationError, match="exact source identity"):
        build_active_contract(
            manifest_path=tmp_path / "release.json",
            current_active_path=tmp_path / "active.json",
            activated_at="2026-07-29T12:00:00Z",
        )


def test_activation_rejects_replacing_an_existing_cumulative_identity(
    tmp_path: Path,
) -> None:
    current = _active_contract()
    manifest = _activation_manifest(section="old", filename="old.pdf")

    with pytest.raises(
        ActivationError,
        match="already exists in cumulative active replacements",
    ):
        build_active_contract(
            manifest_path=_write(tmp_path / "release.json", manifest),
            current_active_path=_write(tmp_path / "active.json", current),
            activated_at="2026-07-29T12:00:00Z",
        )


def test_activation_preserves_first_batch_schema_v1_contract_compatibility(
    tmp_path: Path,
) -> None:
    current = _active_contract(release_id=None)
    manifest = _activation_manifest(
        release_id="catalog-first",
        previous_release_id=None,
    )

    active = build_active_contract(
        manifest_path=_write(tmp_path / "release.json", manifest),
        current_active_path=_write(tmp_path / "active.json", current),
        activated_at="2026-07-29T12:00:00Z",
    )

    assert active["releaseId"] == "catalog-first"
    assert active["previousReleaseId"] is None
    assert len(active["replacements"]) == 1


def test_sampling_is_reproducible_and_includes_worst_case_canaries(tmp_path: Path) -> None:
    release_id = "catalog-test"
    source_commit = "d" * 40
    base_commit = "a" * 40
    renderer_commit = source_commit
    renderer_runtime = _renderer_runtime()
    items = []
    results = []
    forms = []
    (tmp_path / "qa").mkdir()
    for index in range(12):
        catalog_id = f"section/form_{index:02d}"
        items.append(
            {
                "catalogId": catalog_id,
                "slug": f"form-{index:02d}",
                "riskTier": (
                    "C"
                    if index in (9, 11)
                    else ("B" if index in (8, 10) else "A")
                ),
                "sourceSection": "section",
                "filename": f"form_{index:02d}.pdf",
            }
        )
        pdf = {
            "sourcePath": f"assets/section/form_{index:02d}.pdf",
            "objectPath": (
                f"releases/{release_id}/assets/section/form_{index:02d}.pdf"
            ),
            "contentType": "application/pdf",
            "sha256": f"{index:064x}",
            "bytes": 100 + index,
        }
        thumbnail = {
            "sourcePath": f"assets/section/form_{index:02d}.webp",
            "objectPath": (
                f"releases/{release_id}/assets/section/form_{index:02d}.webp"
            ),
            "contentType": "image/webp",
            "sha256": f"{index + 100:064x}",
            "bytes": 50 + index,
        }
        field_count = 50 + index
        field_types = {"/Tx": field_count}
        if index < 10:
            field_types = {"/Btn": 1, "/Tx": field_count - 1}
        qa_path = _write(
            tmp_path / "qa" / f"form_{index:02d}.json",
            {
                "pdfQa": {
                    "ok": True,
                    "sha256": pdf["sha256"],
                    "bytes": pdf["bytes"],
                    "metrics": {
                        "pages": index + 1,
                        "fields": field_count,
                        "field_types": field_types,
                    },
                }
            },
        )
        results.append(
            {
                "catalogId": catalog_id,
                "ok": True,
                "pageCount": index + 1,
                "fieldCount": field_count,
                "qaPath": qa_path.relative_to(tmp_path).as_posix(),
                "qaSha256": hashlib.sha256(qa_path.read_bytes()).hexdigest(),
                "pdf": pdf,
                "thumbnail": thumbnail,
            }
        )
        forms.append(
            {
                "catalogId": catalog_id,
                "slug": f"form-{index:02d}",
                "sourceSection": "section",
                "filename": f"form_{index:02d}.pdf",
                "pageCount": index + 1,
                "pdf": pdf,
                "thumbnail": thumbnail,
            }
        )
    selection_payload = {
        "schemaVersion": 1,
        "releaseId": release_id,
        "targetCount": len(items),
        "items": items,
    }
    selection = _write(
        tmp_path / "selection.json",
        selection_payload,
    )
    manifest = _write(
        tmp_path / "manifest.json",
        {
            "schemaVersion": 1,
            "releaseId": release_id,
            "sourceCommit": source_commit,
            "baseCommit": base_commit,
            "rendererCommit": renderer_commit,
            "rendererRuntime": renderer_runtime,
            "forms": forms,
        },
    )
    report = _write(
        tmp_path / "report.json",
        {
            "schemaVersion": 1,
            "releaseId": release_id,
            "sourceCommit": source_commit,
            "baseCommit": base_commit,
            "rendererCommit": renderer_commit,
            "rendererRuntime": renderer_runtime,
            "selectionDigest": hashlib.sha256(
                json.dumps(
                    selection_payload,
                    ensure_ascii=False,
                    separators=(",", ":"),
                    sort_keys=True,
                ).encode("utf-8")
            ).hexdigest(),
            "releaseManifestSha256": hashlib.sha256(
                manifest.read_bytes()
            ).hexdigest(),
            "count": len(results),
            "passed": True,
            "results": results,
        },
    )

    first = build_sample_plan(
        selection_path=selection,
        build_report_path=report,
        manifest_path=manifest,
        random_count=4,
    )
    second = build_sample_plan(
        selection_path=selection,
        build_report_path=report,
        manifest_path=manifest,
        random_count=4,
    )

    assert first == second
    assert first["canaryRoles"]["largest_page_count"] == "section/form_11"
    assert first["canaryRoles"]["risk_tier_c"] == "section/form_11"
    assert first["browserCatalogIds"][:2] == [
        "section/form_09",
        "section/form_08",
    ]
    assert "section/form_10" not in first["browserCatalogIds"]
    assert "section/form_11" not in first["browserCatalogIds"]
    assert first["browserCanaryCount"] == 3
    assert first["sourceCommit"] == source_commit
    assert first["manifestSha256"] == hashlib.sha256(
        manifest.read_bytes()
    ).hexdigest()

    qa_path = tmp_path / "qa" / "form_00.json"
    original_qa = qa_path.read_bytes()
    qa_path.write_text("{}", encoding="utf-8")
    with pytest.raises(SamplingPlanError, match="QA evidence hash differs"):
        build_sample_plan(
            selection_path=selection,
            build_report_path=report,
            manifest_path=manifest,
            random_count=4,
        )
    qa_path.write_bytes(original_qa)

    changed = json.loads(manifest.read_text(encoding="utf-8"))
    changed["forms"][0]["pdf"]["sha256"] = "f" * 64
    manifest.write_text(json.dumps(changed), encoding="utf-8")
    report_payload = json.loads(report.read_text(encoding="utf-8"))
    report_payload["releaseManifestSha256"] = hashlib.sha256(
        manifest.read_bytes()
    ).hexdigest()
    report.write_text(json.dumps(report_payload), encoding="utf-8")

    with pytest.raises(SamplingPlanError, match="pdf assets differ"):
        build_sample_plan(
            selection_path=selection,
            build_report_path=report,
            manifest_path=manifest,
            random_count=4,
        )
