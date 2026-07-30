"""Tests for immutable form-catalog release validation and deployment planning."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
VALIDATOR = REPO_ROOT / "scripts" / "validate-form-catalog-release.py"
VALIDATOR_IMPLEMENTATION = (
    REPO_ROOT / "scripts" / "form_catalog_factory" / "release_validation.py"
)
DEPLOY_SCRIPT = REPO_ROOT / "scripts" / "deploy-form-catalog-release.sh"
LEGACY_ASSET_DEPLOY = REPO_ROOT / "scripts" / "deploy-form-catalog-assets.sh"
CONTROLLED_DEPLOY = REPO_ROOT / ".github" / "workflows" / "controlled-deploy.yml"
FRONTEND_DEPLOY = REPO_ROOT / "scripts" / "deploy-frontend.sh"
CATALOG_INDEX_BUILDER = REPO_ROOT / "scripts" / "build-form-catalog-index.mjs"
ACTIVE_RELEASE_CONTRACT = REPO_ROOT / "form_catalog_releases" / "active.json"
RELEASE_RUNBOOK = REPO_ROOT / "test" / "docs" / "form-catalog-release-runbook.md"
RELEASE_ID = "catalog-20260729-001"
SOURCE_COMMIT = "a" * 40


def _asset(path: Path, payload: bytes) -> dict[str, object]:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return {
        "sourcePath": path.name,
        "sha256": hashlib.sha256(payload).hexdigest(),
        "bytes": len(payload),
    }


def _write_release(tmp_path: Path) -> Path:
    pdf = _asset(tmp_path / "high-value-form.pdf", b"%PDF-1.7\ncatalog release test\n")
    thumbnail = _asset(
        tmp_path / "high-value-form.webp",
        b"RIFF\x04\x00\x00\x00WEBPtest",
    )
    manifest = {
        "schemaVersion": 1,
        "releaseId": RELEASE_ID,
        "sourceCommit": SOURCE_COMMIT,
        "previousReleaseId": "catalog-20260728-009",
        "createdAt": "2026-07-29T12:00:00Z",
        "forms": [
            {
                "catalogId": "construction_trades/dct_2700__contractor_payment",
                "slug": "contractor-payment-application",
                "sourceSection": "construction_trades",
                "filename": "dct_2700__contractor_payment.pdf",
                "pageCount": 2,
                "pdf": {
                    **pdf,
                    "objectPath": (
                        f"releases/{RELEASE_ID}/assets/"
                        "construction_trades/high-value-form.pdf"
                    ),
                    "contentType": "application/pdf",
                },
                "thumbnail": {
                    **thumbnail,
                    "objectPath": (
                        f"releases/{RELEASE_ID}/assets/"
                        "construction_trades/high-value-form.webp"
                    ),
                    "contentType": "image/webp",
                },
            }
        ],
    }
    manifest_path = tmp_path / "release.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return manifest_path


def _run_validator(manifest_path: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(VALIDATOR),
            "--manifest",
            str(manifest_path),
            "--asset-root",
            str(manifest_path.parent),
            *args,
        ],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def _run_active_release_contract(
    payload: dict[str, object],
    available_entries: list[dict[str, object]],
    *,
    raw_entry: dict[str, object] | None = None,
    page_count_cache: dict[str, int] | None = None,
    previous_slugs: list[list[str]] | None = None,
    use_tracked_catalog: bool = False,
) -> subprocess.CompletedProcess[str]:
    script = """
import {
  assertActiveReleaseSlugIdentity,
  buildActiveReleaseReplacementLookup,
  resolveCatalogAssetState,
} from './scripts/build-form-catalog-index.mjs';
import {
  FORM_CATALOG_ENTRIES,
} from './frontend/src/config/formCatalogData.mjs';

const input = JSON.parse(process.env.DULLYPDF_ACTIVE_RELEASE_TEST_INPUT);
const availableEntries = input.useTrackedCatalog
  ? FORM_CATALOG_ENTRIES.map((entry) => ({
      section: entry.sourceSection,
      filename: entry.filename,
    }))
  : input.availableEntries;
const previousSlugs = input.useTrackedCatalog
  ? FORM_CATALOG_ENTRIES.map((entry) => [
      `${entry.sourceSection}/${entry.filename}`,
      entry.slug,
    ])
  : input.previousSlugs;
const active = buildActiveReleaseReplacementLookup(input.payload, availableEntries);
const result = {
  releaseId: active.releaseId,
  manifestSha256: active.manifestSha256,
  replacementCount: active.replacements.size,
  replacements: Object.fromEntries(active.replacements),
};
if (previousSlugs) {
  assertActiveReleaseSlugIdentity(active.replacements, new Map(previousSlugs));
  result.slugIdentityPassed = true;
}
if (input.rawEntry) {
  result.assetState = resolveCatalogAssetState(
    input.rawEntry,
    input.pageCountCache || {},
    active.replacements,
  );
  result.rawEntry = input.rawEntry;
}
process.stdout.write(JSON.stringify(result));
"""
    test_input = {
        "payload": payload,
        "availableEntries": available_entries,
        "rawEntry": raw_entry,
        "pageCountCache": page_count_cache,
        "previousSlugs": previous_slugs,
        "useTrackedCatalog": use_tracked_catalog,
    }
    return subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPO_ROOT,
        env={
            **os.environ,
            "DULLYPDF_ACTIVE_RELEASE_TEST_INPUT": json.dumps(test_input),
        },
        check=False,
        capture_output=True,
        text=True,
    )


def _active_replacement_payload() -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "releaseId": RELEASE_ID,
        "sourceCommit": SOURCE_COMMIT,
        "manifestSha256": "d" * 64,
        "previousReleaseId": "catalog-20260728-009",
        "activatedAt": "2026-07-29T18:00:00Z",
        "replacements": [
            {
                "sourceSection": "construction_trades",
                "filename": "dct_2700__contractor_payment.pdf",
                "pdfPath": (
                    f"releases/{RELEASE_ID}/assets/"
                    "construction_trades/dct_2700__contractor_payment.pdf"
                ),
                "thumbnailPath": (
                    f"releases/{RELEASE_ID}/assets/"
                    "construction_trades/dct_2700__contractor_payment.webp"
                ),
                "sha256": "b" * 64,
                "bytes": 88001,
                "pageCount": 2,
            }
        ],
    }


def _write_json(path: Path, payload: dict[str, object]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _promotion_evidence(
    tmp_path: Path,
    manifest_path: Path,
) -> tuple[Path, Path, Path]:
    evidence_dir = tmp_path / "promotion-evidence"
    evidence_dir.mkdir()
    catalog_id = "construction_trades/dct_2700__contractor_payment"
    slug = "contractor-payment-application"
    manifest_sha256 = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    hosting_version = "sites/dullypdf/versions/catalog-release-new"
    sample_plan_sha256 = "e" * 64
    site_origins = [
        "https://dullypdf.com",
        "https://dullypdf.web.app",
    ]

    artifacts: list[dict[str, object]] = []
    artifact_payloads = (
        ("catalog_page_screenshot", "catalog-page.png", b"\x89PNG\r\n\x1a\ncatalog"),
        (
            "populated_workspace_screenshot",
            "populated-workspace.png",
            b"\x89PNG\r\n\x1a\nworkspace",
        ),
        ("filled_pdf", "filled.pdf", b"%PDF-1.7\nfilled\n"),
    )
    for kind, filename, content in artifact_payloads:
        artifact_path = evidence_dir / filename
        artifact_path.write_bytes(content)
        artifacts.append(
            {
                "kind": kind,
                "path": filename,
                "sha256": hashlib.sha256(content).hexdigest(),
                "bytes": len(content),
            }
        )

    binding = {
        "schemaVersion": 1,
        "releaseId": RELEASE_ID,
        "sourceCommit": SOURCE_COMMIT,
        "manifestSha256": manifest_sha256,
    }
    hosting = _write_json(
        evidence_dir / "hosting.json",
        {
            **binding,
            "reportType": "form-catalog-hosting-deployment",
            "producer": "controlled-deploy",
            "environment": "production",
            "ok": True,
            "hostingVersion": hosting_version,
            "rollbackHostingVersion": "sites/dullypdf/versions/catalog-release-old",
            "siteOrigins": site_origins,
            "deployedAt": "2026-07-29T18:00:00Z",
        },
    )
    live = _write_json(
        evidence_dir / "live.json",
        {
            **binding,
            "reportType": "form-catalog-live-http",
            "hostingVersion": hosting_version,
            "samplePlanSha256": sample_plan_sha256,
            "checkedAt": "2026-07-29T18:05:00Z",
            "siteOrigins": site_origins,
            "assetBaseUrls": [
                "https://storage.googleapis.com/dullypdf-form-catalog-assets-east4"
            ],
            "sampleCount": 1,
            "browserCatalogIds": [catalog_id],
            "ok": True,
            "results": [
                {
                    "catalogId": catalog_id,
                    "slug": slug,
                    "ok": True,
                    "catalogPages": [
                        {"ok": True, "origin": origin}
                        for origin in site_origins
                    ],
                    "pdfAssets": [
                        {
                            "ok": True,
                            "assetBase": (
                                "https://storage.googleapis.com/"
                                "dullypdf-form-catalog-assets-east4"
                            ),
                        }
                    ],
                    "thumbnailAssets": [
                        {
                            "ok": True,
                            "assetBase": (
                                "https://storage.googleapis.com/"
                                "dullypdf-form-catalog-assets-east4"
                            ),
                        }
                    ],
                }
            ],
        },
    )
    browser = _write_json(
        evidence_dir / "browser.json",
        {
            **binding,
            "reportType": "form-catalog-browser-canary",
            "producer": "playwright",
            "hostingVersion": hosting_version,
            "samplePlanSha256": sample_plan_sha256,
            "siteOrigin": "https://dullypdf.com",
            "startedAt": "2026-07-29T18:06:00Z",
            "completedAt": "2026-07-29T18:08:00Z",
            "ok": True,
            "results": [
                {
                    "catalogId": catalog_id,
                    "slug": slug,
                    "ok": True,
                    "checks": {
                        "catalogIdentity": True,
                        "immutablePdfPath": True,
                        "fieldOverlays": True,
                        "fillSaveReopen": True,
                    },
                    "artifacts": artifacts,
                }
            ],
        },
    )
    return hosting, live, browser


def test_validator_accepts_release_scoped_assets_and_reports_upload_plan(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)

    result = _run_validator(manifest_path, "--format", "json")

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["releaseId"] == RELEASE_ID
    assert payload["sourceCommit"] == SOURCE_COMMIT
    assert payload["formCount"] == 1
    assert payload["assetCount"] == 2
    assert all(
        asset["objectPath"].startswith(f"releases/{RELEASE_ID}/assets/")
        for asset in payload["assets"]
    )


def test_validator_rejects_asset_paths_outside_release_namespace(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    payload["forms"][0]["pdf"]["objectPath"] = "construction_trades/high-value-form.pdf"
    manifest_path.write_text(json.dumps(payload), encoding="utf-8")

    result = _run_validator(manifest_path)

    assert result.returncode == 1
    assert "must begin with immutable prefix" in result.stderr


def test_validator_rejects_local_hash_mismatch(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    (tmp_path / "high-value-form.pdf").write_bytes(b"%PDF-1.7\ntampered\n")

    result = _run_validator(manifest_path)

    assert result.returncode == 1
    assert (
        "does not match local file" in result.stderr
        or "local file has" in result.stderr
    )


def test_validator_rejects_catalog_id_that_does_not_match_source_identity(
    tmp_path: Path,
) -> None:
    manifest_path = _write_release(tmp_path)
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    payload["forms"][0]["catalogId"] = "construction_trades/dct-2700"
    manifest_path.write_text(json.dumps(payload), encoding="utf-8")

    result = _run_validator(manifest_path)

    assert result.returncode == 1
    assert "must preserve exact source identity" in result.stderr


def test_stage_is_dry_run_by_default_and_uses_additive_writes(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(DEPLOY_SCRIPT),
            "--action",
            "stage",
            "--manifest",
            str(manifest_path),
            "--asset-root",
            str(tmp_path),
            "--bucket",
            "gs://dullypdf-catalog-test",
            "--project",
            "dullypdf",
            "--expected-commit",
            SOURCE_COMMIT,
        ],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Dry run only" in result.stdout
    assert "--no-clobber" in result.stdout
    assert "--content-md5" in result.stdout
    assert "providerMd5=" in result.stdout
    assert str(tmp_path / "high-value-form.pdf") not in result.stdout
    assert f"releases/{RELEASE_ID}/assets/" in result.stdout
    assert f"releases/{RELEASE_ID}/release-manifest.json" in result.stdout


def test_promotion_dry_run_plans_guarded_active_pointer_update(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    hosting, live, browser = _promotion_evidence(tmp_path, manifest_path)

    result = subprocess.run(
        [
            "bash",
            str(DEPLOY_SCRIPT),
            "--action",
            "promote",
            "--manifest",
            str(manifest_path),
            "--asset-root",
            str(tmp_path),
            "--bucket",
            "gs://dullypdf-catalog-test",
            "--project",
            "dullypdf",
            "--expected-commit",
            SOURCE_COMMIT,
            "--hosting-evidence",
            str(hosting),
            "--live-report",
            str(live),
            "--browser-report",
            str(browser),
        ],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "compare gs://dullypdf-catalog-test/catalog-release-state/active.json" in result.stdout
    assert "previousReleaseId=catalog-20260728-009" in result.stdout
    assert "using its observed object generation" in result.stdout
    assert "hostingVersion=sites/dullypdf/versions/catalog-release-new" in result.stdout
    assert "validated artifact hashes" in result.stdout
    assert "active pointer was not changed" in result.stdout


def test_promotion_requires_complete_machine_evidence(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(DEPLOY_SCRIPT),
            "--action",
            "promote",
            "--manifest",
            str(manifest_path),
            "--asset-root",
            str(tmp_path),
            "--bucket",
            "gs://dullypdf-catalog-test",
            "--project",
            "dullypdf",
            "--expected-commit",
            SOURCE_COMMIT,
        ],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "requires --hosting-evidence, --live-report, and --browser-report" in result.stderr


def test_promotion_rejects_tampered_browser_artifact(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    hosting, live, browser = _promotion_evidence(tmp_path, manifest_path)
    (browser.parent / "filled.pdf").write_bytes(b"%PDF-1.7\ntampered\n")

    result = _run_validator(
        manifest_path,
        "--hosting-evidence",
        str(hosting),
        "--live-report",
        str(live),
        "--browser-report",
        str(browser),
    )

    assert result.returncode == 1
    assert (
        "does not match the artifact" in result.stderr
        or "bytes does not match" in result.stderr
    )


def test_promotion_rejects_ok_only_browser_claim_without_artifacts(
    tmp_path: Path,
) -> None:
    manifest_path = _write_release(tmp_path)
    hosting, live, browser = _promotion_evidence(tmp_path, manifest_path)
    browser_payload = json.loads(browser.read_text(encoding="utf-8"))
    browser_payload["results"][0]["artifacts"] = []
    browser.write_text(json.dumps(browser_payload), encoding="utf-8")

    result = _run_validator(
        manifest_path,
        "--hosting-evidence",
        str(hosting),
        "--live-report",
        str(live),
        "--browser-report",
        str(browser),
    )

    assert result.returncode == 1
    assert "is missing artifacts" in result.stderr


def test_promotion_requires_exact_planned_browser_canary_ids(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    hosting, live, browser = _promotion_evidence(tmp_path, manifest_path)
    live_payload = json.loads(live.read_text(encoding="utf-8"))
    second_live_result = dict(live_payload["results"][0])
    second_live_result["catalogId"] = "construction_trades/another_form"
    second_live_result["slug"] = "another-form"
    live_payload["results"].append(second_live_result)
    live_payload["sampleCount"] = 2
    live.write_text(json.dumps(live_payload), encoding="utf-8")

    browser_payload = json.loads(browser.read_text(encoding="utf-8"))
    browser_payload["results"][0]["catalogId"] = "construction_trades/another_form"
    browser_payload["results"][0]["slug"] = "another-form"
    browser.write_text(json.dumps(browser_payload), encoding="utf-8")

    result = _run_validator(
        manifest_path,
        "--hosting-evidence",
        str(hosting),
        "--live-report",
        str(live),
        "--browser-report",
        str(browser),
    )

    assert result.returncode == 1
    assert "must exactly match browserCatalogIds in order" in result.stderr


def test_deploy_script_has_guarded_promotion_and_no_destructive_sync() -> None:
    text = DEPLOY_SCRIPT.read_text(encoding="utf-8")
    validator_text = VALIDATOR_IMPLEMENTATION.read_text(encoding="utf-8")

    assert "rsync" not in text
    assert "--delete-unmatched-destination-objects" not in text
    assert "--no-clobber" in text
    assert "--if-generation-match" in text
    assert "--content-md5" in text
    assert "md5_hash" in text
    assert "TMP_SNAPSHOT_ROOT" in text
    assert '--expected-commit is required with --execute.' in text
    assert 'MAX_FORMS="1000"' in text
    assert "DEFAULT_MAX_FORMS = 1000" in validator_text


def test_legacy_asset_sync_cannot_delete_immutable_release_objects() -> None:
    text = LEGACY_ASSET_DEPLOY.read_text(encoding="utf-8")

    assert "--delete-unmatched-destination-objects" not in text
    assert "never deletes unmatched release or rollback assets" in text
    assert "**/*.pdf" not in text
    assert "**/*.webp" not in text
    assert "TMP_PDF_URLS" in text
    assert "TMP_WEBP_URLS" in text


def test_runbook_uses_supported_asset_origin_and_documents_evidence_gate() -> None:
    text = RELEASE_RUNBOOK.read_text(encoding="utf-8")

    assert "--hosting-version" in text
    assert "--hosting-evidence" in text
    assert "--live-report" in text
    assert "--browser-report" in text
    assert "https://storage.googleapis.com/dullypdf-form-catalog-assets-east4" in text
    assert "--asset-base-url https://dullypdf.com/form-catalog-assets" not in text
    assert "exactly `browserCatalogIds`, in the same order" in text
    assert "rollbackHostingVersion" in text


def test_tracked_active_release_contract_is_valid_for_empty_or_nonempty_state() -> None:
    payload = json.loads(ACTIVE_RELEASE_CONTRACT.read_text(encoding="utf-8"))

    result = _run_active_release_contract(
        payload,
        [],
        use_tracked_catalog=True,
    )

    assert result.returncode == 0, result.stderr
    output = json.loads(result.stdout)
    expected_count = len(payload["replacements"])
    assert output["releaseId"] == payload["releaseId"]
    assert output["replacementCount"] == expected_count
    assert len(output["replacements"]) == expected_count
    assert output["slugIdentityPassed"] is True


def test_empty_active_release_contract_fixture_is_valid() -> None:
    payload = {
        "schemaVersion": 1,
        "releaseId": None,
        "sourceCommit": None,
        "manifestSha256": None,
        "previousReleaseId": None,
        "activatedAt": None,
        "replacements": [],
    }

    result = _run_active_release_contract(payload, [])

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {
        "releaseId": None,
        "manifestSha256": None,
        "replacementCount": 0,
        "replacements": {},
    }


def test_active_release_overrides_only_immutable_asset_state() -> None:
    payload = _active_replacement_payload()
    raw_entry = {
        "section": "construction_trades",
        "filename": "dct_2700__contractor_payment.pdf",
        "title": "Contractor Payment Application",
        "form_number": "DCT 2700",
        "bytes": 35000,
        "sha256": "c" * 64,
    }

    result = _run_active_release_contract(
        payload,
        [raw_entry],
        raw_entry=raw_entry,
        page_count_cache={"c" * 64: 1},
        previous_slugs=[
            [
                "construction_trades/dct_2700__contractor_payment.pdf",
                "contractor-payment-application",
            ]
        ],
    )

    assert result.returncode == 0, result.stderr
    output = json.loads(result.stdout)
    assert output["assetState"] == {
        "bytes": 88001,
        "sha256": "b" * 64,
        "pageCount": 2,
        "pdfPath": (
            f"releases/{RELEASE_ID}/assets/"
            "construction_trades/dct_2700__contractor_payment.pdf"
        ),
        "thumbnailPath": (
            f"releases/{RELEASE_ID}/assets/"
            "construction_trades/dct_2700__contractor_payment.webp"
        ),
    }
    assert output["rawEntry"]["title"] == "Contractor Payment Application"
    assert output["rawEntry"]["form_number"] == "DCT 2700"
    assert output["slugIdentityPassed"] is True


def test_active_release_fails_closed_on_unknown_or_duplicate_target() -> None:
    payload = _active_replacement_payload()

    unknown = _run_active_release_contract(payload, [])
    assert unknown.returncode != 0
    assert "replacement target does not exist" in unknown.stderr

    payload["replacements"] = [
        payload["replacements"][0],
        dict(payload["replacements"][0]),
    ]
    duplicate = _run_active_release_contract(
        payload,
        [
            {
                "section": "construction_trades",
                "filename": "dct_2700__contractor_payment.pdf",
            }
        ],
    )
    assert duplicate.returncode != 0
    assert "duplicate replacement mapping" in duplicate.stderr


def test_active_release_fails_closed_on_non_release_asset_path() -> None:
    payload = _active_replacement_payload()
    payload["replacements"][0]["pdfPath"] = (
        "construction_trades/dct_2700__contractor_payment.pdf"
    )

    result = _run_active_release_contract(
        payload,
        [
            {
                "section": "construction_trades",
                "filename": "dct_2700__contractor_payment.pdf",
            }
        ],
    )

    assert result.returncode != 0
    assert "must use releases/<release-id>/assets/" in result.stderr


def test_active_release_requires_manifest_hash_binding() -> None:
    payload = _active_replacement_payload()
    payload.pop("manifestSha256")

    result = _run_active_release_contract(
        payload,
        [
            {
                "section": "construction_trades",
                "filename": "dct_2700__contractor_payment.pdf",
            }
        ],
    )

    assert result.returncode != 0
    assert "manifestSha256" in result.stderr


def test_active_release_requires_pdf_and_thumbnail_from_same_release() -> None:
    payload = _active_replacement_payload()
    payload["replacements"][0]["thumbnailPath"] = (
        "releases/catalog-20260730-002/assets/"
        "construction_trades/dct_2700__contractor_payment.webp"
    )

    result = _run_active_release_contract(
        payload,
        [
            {
                "section": "construction_trades",
                "filename": "dct_2700__contractor_payment.pdf",
            }
        ],
    )

    assert result.returncode != 0
    assert "PDF and thumbnail must come from the same immutable release" in result.stderr


def test_active_release_requires_an_existing_unambiguous_published_slug() -> None:
    payload = _active_replacement_payload()
    available = [
        {
            "section": "construction_trades",
            "filename": "dct_2700__contractor_payment.pdf",
        }
    ]

    missing = _run_active_release_contract(
        payload,
        available,
        previous_slugs=[],
    )
    assert missing.returncode != 0
    assert "has no published slug identity" in missing.stderr

    ambiguous = _run_active_release_contract(
        payload,
        available,
        previous_slugs=[
            [
                "construction_trades/dct_2700__contractor_payment.pdf",
                "contractor-payment-application",
            ],
            [
                "another_section/another.pdf",
                "contractor-payment-application",
            ],
        ],
    )
    assert ambiguous.returncode != 0
    assert "has an ambiguous published slug" in ambiguous.stderr


def test_controlled_deploys_share_one_non_cancelling_lock() -> None:
    text = CONTROLLED_DEPLOY.read_text(encoding="utf-8")
    frontend_deploy = FRONTEND_DEPLOY.read_text(encoding="utf-8")

    assert "group: controlled-deploy-global" in text
    assert "cancel-in-progress: false" in text
    assert "snapshot-hosting" in text
    assert "create-hosting-evidence" in text
    assert "form-catalog-hosting-evidence-" in text
    assert "actions/upload-artifact@v7" in text
    assert "firebase --json deploy" in frontend_deploy
    assert "FIREBASE_HOSTING_DEPLOY_RESULT_PATH" in frontend_deploy
