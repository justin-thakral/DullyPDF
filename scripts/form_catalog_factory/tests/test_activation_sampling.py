from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from scripts.form_catalog_factory.activation import ActivationError, build_active_contract
from scripts.form_catalog_factory.sampling import build_sample_plan


def _write(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_activation_merges_cumulative_replacements_and_enforces_order(tmp_path: Path) -> None:
    current = {
        "schemaVersion": 1,
        "releaseId": "catalog-old",
        "sourceCommit": "a" * 40,
        "previousReleaseId": None,
        "activatedAt": "2026-07-28T12:00:00Z",
        "replacements": [
            {
                "sourceSection": "old",
                "filename": "old.pdf",
                "pdfPath": "releases/catalog-old/assets/old/old.pdf",
                "thumbnailPath": "releases/catalog-old/assets/old/old.webp",
                "sha256": "a" * 64,
                "bytes": 10,
                "pageCount": 1,
            }
        ],
    }
    manifest = {
        "schemaVersion": 1,
        "releaseId": "catalog-new",
        "sourceCommit": "b" * 40,
        "previousReleaseId": "catalog-old",
        "createdAt": "2026-07-29T11:00:00Z",
        "forms": [
            {
                "catalogId": "new/new",
                "slug": "new",
                "sourceSection": "new",
                "filename": "new.pdf",
                "pageCount": 2,
                "pdf": {
                    "sourcePath": "new.pdf",
                    "objectPath": "releases/catalog-new/assets/new/new.pdf",
                    "contentType": "application/pdf",
                    "sha256": "b" * 64,
                    "bytes": 20,
                },
                "thumbnail": {
                    "sourcePath": "new.webp",
                    "objectPath": "releases/catalog-new/assets/new/new.webp",
                    "contentType": "image/webp",
                    "sha256": "c" * 64,
                    "bytes": 10,
                },
            }
        ],
    }

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


def test_sampling_is_reproducible_and_includes_worst_case_canaries(tmp_path: Path) -> None:
    release_id = "catalog-test"
    source_commit = "d" * 40
    items = []
    results = []
    forms = []
    for index in range(12):
        catalog_id = f"section/form_{index:02d}"
        items.append(
            {
                "catalogId": catalog_id,
                "slug": f"form-{index:02d}",
                "riskTier": "C" if index == 11 else ("B" if index == 10 else "A"),
                "sourceSection": "section",
                "filename": f"form_{index:02d}.pdf",
            }
        )
        results.append(
            {
                "catalogId": catalog_id,
                "pageCount": index + 1,
                "fieldCount": 50 + index,
            }
        )
        forms.append(
            {
                "catalogId": catalog_id,
                "slug": f"form-{index:02d}",
                "sourceSection": "section",
                "filename": f"form_{index:02d}.pdf",
                "pdf": {
                    "objectPath": (
                        f"releases/{release_id}/assets/section/form_{index:02d}.pdf"
                    ),
                    "sha256": f"{index:064x}",
                    "bytes": 100 + index,
                },
                "thumbnail": {
                    "objectPath": (
                        f"releases/{release_id}/assets/section/form_{index:02d}.webp"
                    ),
                    "sha256": f"{index + 100:064x}",
                    "bytes": 50 + index,
                },
            }
        )
    selection = _write(
        tmp_path / "selection.json",
        {"releaseId": release_id, "items": items},
    )
    report = _write(
        tmp_path / "report.json",
        {
            "releaseId": release_id,
            "sourceCommit": source_commit,
            "results": results,
        },
    )
    manifest = _write(
        tmp_path / "manifest.json",
        {
            "releaseId": release_id,
            "sourceCommit": source_commit,
            "forms": forms,
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
    assert first["browserCanaryCount"] == 3
    assert first["sourceCommit"] == source_commit
    assert first["manifestSha256"] == hashlib.sha256(
        manifest.read_bytes()
    ).hexdigest()
