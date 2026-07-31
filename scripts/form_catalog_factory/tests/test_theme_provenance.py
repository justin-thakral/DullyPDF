from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from scripts.form_catalog_factory.sampling import SamplingPlanError, build_sample_plan
from scripts.form_catalog_factory.themes import get_theme


RENDER_THEME = get_theme("charcoal-deep-green-gold-v1").provenance()


def _relative_luminance(hex_color: str) -> float:
    channels = [
        int(hex_color[index : index + 2], 16) / 255
        for index in (1, 3, 5)
    ]
    linear = [
        channel / 12.92
        if channel <= 0.04045
        else ((channel + 0.055) / 1.055) ** 2.4
        for channel in channels
    ]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def _contrast_ratio(foreground: str, background: str) -> float:
    light, dark = sorted(
        (_relative_luminance(foreground), _relative_luminance(background)),
        reverse=True,
    )
    return (light + 0.05) / (dark + 0.05)


def test_charcoal_green_gold_theme_keeps_small_text_contrast_above_4_5() -> None:
    theme = get_theme("charcoal-deep-green-gold-v1")
    pairs = (
        (theme.header_text, theme.header_background),
        (theme.header_subtitle, theme.header_background),
        (theme.section_text, theme.section_background),
        (theme.header_text, theme.section_badge),
        (theme.body_text, "#FFFFFF"),
        (theme.muted_text, "#FFFFFF"),
        (theme.field_text, theme.field_background),
        (theme.table_header_text, theme.table_header),
        (theme.notice_text, theme.notice_background),
    )

    assert min(_contrast_ratio(*pair) for pair in pairs) >= 4.5


def _canonical_hash(payload: object) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _write(path: Path, payload: object) -> Path:
    path.write_text(json.dumps(payload) + "\n", encoding="utf-8")
    return path


def _sampling_fixture(
    tmp_path: Path,
    *,
    themed: bool,
) -> tuple[Path, Path, Path]:
    release_id = "catalog-theme-test"
    catalog_id = "section/example"
    source_commit = "d" * 40
    base_commit = "a" * 40
    pdf = {
        "sourcePath": "assets/section/example.pdf",
        "objectPath": f"releases/{release_id}/assets/section/example.pdf",
        "contentType": "application/pdf",
        "sha256": "1" * 64,
        "bytes": 101,
    }
    thumbnail = {
        "sourcePath": "assets/section/example.webp",
        "objectPath": f"releases/{release_id}/assets/section/example.webp",
        "contentType": "image/webp",
        "sha256": "2" * 64,
        "bytes": 51,
    }
    selection_payload = {
        "schemaVersion": 1,
        "releaseId": release_id,
        "targetCount": 1,
        "items": [
            {
                "catalogId": catalog_id,
                "slug": "example",
                "riskTier": "A",
                "sourceSection": "section",
                "filename": "example.pdf",
            }
        ],
    }
    manifest_payload = {
        "schemaVersion": 1,
        "releaseId": release_id,
        "sourceCommit": source_commit,
        "baseCommit": base_commit,
        "rendererCommit": source_commit,
        "rendererRuntime": {"schemaVersion": 1},
        "forms": [
            {
                "catalogId": catalog_id,
                "slug": "example",
                "sourceSection": "section",
                "filename": "example.pdf",
                "pageCount": 1,
                "pdf": pdf,
                "thumbnail": thumbnail,
            }
        ],
    }
    if themed:
        selection_payload["renderTheme"] = RENDER_THEME
        manifest_payload["renderTheme"] = RENDER_THEME
    selection_path = _write(tmp_path / "selection.json", selection_payload)
    manifest_path = _write(tmp_path / "release.json", manifest_payload)
    report_payload = {
        "schemaVersion": 1,
        "releaseId": release_id,
        "sourceCommit": source_commit,
        "baseCommit": base_commit,
        "rendererCommit": source_commit,
        "rendererRuntime": {"schemaVersion": 1},
        "selectionDigest": _canonical_hash(selection_payload),
        "releaseManifestSha256": hashlib.sha256(
            manifest_path.read_bytes()
        ).hexdigest(),
        "count": 1,
        "passed": True,
        "results": [
            {
                "catalogId": catalog_id,
                "ok": True,
                "riskTier": "A",
                "pageCount": 1,
                "fieldCount": 5,
                "pdf": pdf,
                "thumbnail": thumbnail,
            }
        ],
    }
    if themed:
        report_payload["renderTheme"] = RENDER_THEME
    report_path = _write(tmp_path / "build-report.json", report_payload)
    return selection_path, report_path, manifest_path


def test_sample_plan_propagates_exact_shared_render_theme(tmp_path: Path) -> None:
    selection, report, manifest = _sampling_fixture(tmp_path, themed=True)

    plan = build_sample_plan(
        selection_path=selection,
        build_report_path=report,
        manifest_path=manifest,
        random_count=1,
    )

    assert plan["renderTheme"] == RENDER_THEME


def test_sample_plan_keeps_all_absent_historical_evidence_readable(
    tmp_path: Path,
) -> None:
    selection, report, manifest = _sampling_fixture(tmp_path, themed=False)

    plan = build_sample_plan(
        selection_path=selection,
        build_report_path=report,
        manifest_path=manifest,
        random_count=1,
    )

    assert "renderTheme" not in plan


def test_sample_plan_rejects_missing_or_registry_drifted_theme(
    tmp_path: Path,
) -> None:
    selection, report, manifest = _sampling_fixture(tmp_path, themed=True)
    report_payload = json.loads(report.read_text(encoding="utf-8"))
    report_payload.pop("renderTheme")
    _write(report, report_payload)

    with pytest.raises(SamplingPlanError, match="missing from build report"):
        build_sample_plan(
            selection_path=selection,
            build_report_path=report,
            manifest_path=manifest,
            random_count=1,
        )

    report_payload["renderTheme"] = {
        **RENDER_THEME,
        "paletteSha256": "0" * 64,
    }
    _write(report, report_payload)
    with pytest.raises(SamplingPlanError, match="registered theme provenance"):
        build_sample_plan(
            selection_path=selection,
            build_report_path=report,
            manifest_path=manifest,
            random_count=1,
        )
