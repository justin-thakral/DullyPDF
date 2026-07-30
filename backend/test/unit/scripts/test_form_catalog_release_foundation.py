"""Tests for immutable form-catalog release validation and deployment planning."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image
from reportlab.pdfgen import canvas


REPO_ROOT = Path(__file__).resolve().parents[4]
VALIDATOR = REPO_ROOT / "scripts" / "validate-form-catalog-release.py"
VALIDATOR_IMPLEMENTATION = (
    REPO_ROOT / "scripts" / "form_catalog_factory" / "release_validation.py"
)
DEPLOY_SCRIPT = REPO_ROOT / "scripts" / "deploy-form-catalog-release.sh"
GCS_TRANSPORT = REPO_ROOT / "scripts" / "form_catalog_factory" / "gcs_transport.py"
GCS_TRANSPORT_CLI = (
    REPO_ROOT / "scripts" / "form_catalog_factory" / "gcs_transport_cli.py"
)
PRODUCTION_LOCK_SCRIPT = REPO_ROOT / "scripts" / "form-catalog-production-lock.sh"
LEGACY_ASSET_DEPLOY = REPO_ROOT / "scripts" / "deploy-form-catalog-assets.sh"
CONTROLLED_DEPLOY = REPO_ROOT / ".github" / "workflows" / "controlled-deploy.yml"
HYBRID_QA = REPO_ROOT / ".github" / "workflows" / "hybrid-qa.yml"
FRONTEND_DEPLOY = REPO_ROOT / "scripts" / "deploy-frontend.sh"
CATALOG_INDEX_BUILDER = REPO_ROOT / "scripts" / "build-form-catalog-index.mjs"
ACTIVE_RELEASE_CONTRACT = REPO_ROOT / "form_catalog_releases" / "active.json"
RELEASE_RUNBOOK = REPO_ROOT / "test" / "docs" / "form-catalog-release-runbook.md"
RELEASE_ID = "catalog-20260729-001"
SOURCE_COMMIT = "a" * 40
BASE_COMMIT = "b" * 40
RENDERER_COMMIT = SOURCE_COMMIT
DEPLOYMENT_COMMIT = "c" * 40
WORKFLOW_RUN_ID = "12345"
WORKFLOW_RUN_ATTEMPT = "1"
RENDERER_RUNTIME = {
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
        "baseCommit": BASE_COMMIT,
        "rendererCommit": RENDERER_COMMIT,
        "rendererRuntime": RENDERER_RUNTIME,
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
    _write_frozen_attestation(manifest_path)
    return manifest_path


def _canonical_hash(payload: object) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _frozen_attestation_path(manifest_path: Path) -> Path:
    return manifest_path.with_name("frozen-ledger-manifest.json")


def _write_frozen_attestation(manifest_path: Path) -> Path:
    release = json.loads(manifest_path.read_text(encoding="utf-8"))
    form = release["forms"][0]
    inner = {
        "schema_version": 1,
        "batch_id": release["releaseId"],
        "target_count": len(release["forms"]),
        "base_commit": release["baseCommit"],
        "renderer_commit": release["rendererCommit"],
        "source_commit": release["sourceCommit"],
        "selection_digest": "1" * 64,
        "build_report_hash": "2" * 64,
        "release_manifest_hash": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        "items": [
            {
                "catalog_id": form["catalogId"],
                "section": form["sourceSection"],
                "filename": form["filename"],
                "slug": form["slug"],
                "ownership": "first_party",
                "intent_fingerprint": "3" * 64,
                "current_asset_hash": "4" * 64,
                "spec_hash": "5" * 64,
                "pdf_hash": form["pdf"]["sha256"],
                "thumbnail_hash": form["thumbnail"]["sha256"],
                "schema_hash": "6" * 64,
                "pdf_uri": form["pdf"]["objectPath"],
                "thumbnail_uri": form["thumbnail"]["objectPath"],
                "qa_evidence_uri": "evidence/qa/form.json",
                "qa_evidence_hash": "7" * 64,
                "review_evidence_uri": "evidence/review/form.json",
                "review_evidence_hash": "8" * 64,
            }
        ],
    }
    wrapper = {
        "schemaVersion": 1,
        "batchId": release["releaseId"],
        "targetCount": len(release["forms"]),
        "baseCommit": release["baseCommit"],
        "rendererCommit": release["rendererCommit"],
        "sourceCommit": release["sourceCommit"],
        "status": "frozen",
        "frozenDigest": _canonical_hash(inner),
        "frozenAt": "2026-07-29T17:00:00Z",
        "manifest": inner,
    }
    path = _frozen_attestation_path(manifest_path)
    path.write_text(json.dumps(wrapper, indent=2) + "\n", encoding="utf-8")
    return path


def _rewrite_attestation(path: Path, payload: dict[str, object]) -> None:
    payload["frozenDigest"] = _canonical_hash(payload["manifest"])
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _run_validator(manifest_path: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(VALIDATOR),
            "--manifest",
            str(manifest_path),
            "--frozen-ledger-manifest",
            str(_frozen_attestation_path(manifest_path)),
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
) -> tuple[Path, Path, Path, Path, Path, Path]:
    evidence_dir = tmp_path / "promotion-evidence"
    evidence_dir.mkdir()
    catalog_id = "construction_trades/dct_2700__contractor_payment"
    slug = "contractor-payment-application"
    manifest_sha256 = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    hosting_version = "sites/dullypdf/versions/catalog-release-new"
    site_origins = [
        "https://dullypdf.com",
        "https://dullypdf.web.app",
    ]
    release = json.loads(manifest_path.read_text(encoding="utf-8"))
    form = release["forms"][0]
    selection_payload = {
        "schemaVersion": 1,
        "releaseId": RELEASE_ID,
        "targetCount": 1,
        "items": [
            {
                "catalogId": catalog_id,
                "slug": slug,
                "sourceSection": form["sourceSection"],
                "filename": form["filename"],
                "title": "Contractor Payment Application",
                "riskTier": "C",
            }
        ],
    }
    selection = _write_json(evidence_dir / "selection.json", selection_payload)
    selection_digest = _canonical_hash(selection_payload)
    spec_path = evidence_dir / "spec.json"
    spec_path.write_text('{"fixture":"spec"}\n', encoding="utf-8")
    spec_sha256 = hashlib.sha256(spec_path.read_bytes()).hexdigest()
    schema_sha256 = hashlib.sha256(b"fixture-schema").hexdigest()
    qa_path = _write_json(
        evidence_dir / "qa.json",
        {"schemaVersion": 1, "catalogId": catalog_id, "ok": True},
    )
    qa_sha256 = hashlib.sha256(qa_path.read_bytes()).hexdigest()
    build_report = _write_json(
        evidence_dir / "build-report.json",
        {
            "schemaVersion": 1,
            "releaseId": RELEASE_ID,
            "selectionDigest": selection_digest,
            "sourceCommit": SOURCE_COMMIT,
            "baseCommit": BASE_COMMIT,
            "rendererCommit": RENDERER_COMMIT,
            "rendererRuntime": RENDERER_RUNTIME,
            "count": 1,
            "passed": True,
            "releaseManifestSha256": manifest_sha256,
            "results": [
                {
                    "catalogId": catalog_id,
                    "ok": True,
                    "riskTier": "C",
                    "specPath": spec_path.name,
                    "specSha256": spec_sha256,
                    "schemaSha256": schema_sha256,
                    "qaPath": qa_path.name,
                    "qaSha256": qa_sha256,
                    "pageCount": form["pageCount"],
                    "fieldCount": 4,
                    "pdf": form["pdf"],
                    "thumbnail": form["thumbnail"],
                }
            ],
        },
    )
    build_report_sha256 = hashlib.sha256(build_report.read_bytes()).hexdigest()
    visual_review = _write_json(
        evidence_dir / "visual-review.json",
        {
            "schemaVersion": 1,
            "reportType": "form-catalog-visual-review",
            "releaseId": RELEASE_ID,
            "sourceCommit": SOURCE_COMMIT,
            "buildReportSha256": build_report_sha256,
            "reviewer": "test-reviewer",
            "generatedAt": "2026-07-29T17:50:00Z",
            "reviewedAt": "2026-07-29T17:55:00Z",
            "passed": True,
            "items": [
                {
                    "catalogId": catalog_id,
                    "pdfSha256": form["pdf"]["sha256"],
                    "pageCount": form["pageCount"],
                    "pagesReviewed": list(range(1, form["pageCount"] + 1)),
                    "status": "approved",
                    "defects": [],
                    "notes": "Fixture review.",
                }
            ],
        },
    )
    visual_review_sha256 = hashlib.sha256(
        visual_review.read_bytes()
    ).hexdigest()
    attestation_path = _frozen_attestation_path(manifest_path)
    attestation = json.loads(attestation_path.read_text(encoding="utf-8"))
    attestation["manifest"]["selection_digest"] = selection_digest
    attestation["manifest"]["build_report_hash"] = build_report_sha256
    frozen_item = attestation["manifest"]["items"][0]
    frozen_item["spec_hash"] = spec_sha256
    frozen_item["schema_hash"] = schema_sha256
    frozen_item["qa_evidence_uri"] = str(qa_path.resolve())
    frozen_item["qa_evidence_hash"] = qa_sha256
    frozen_item["review_evidence_uri"] = str(visual_review.resolve())
    frozen_item["review_evidence_hash"] = visual_review_sha256
    _rewrite_attestation(attestation_path, attestation)
    sample_plan = evidence_dir / "sample-plan.json"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.form_catalog_factory",
            "plan-samples",
            "--selection",
            str(selection),
            "--build-report",
            str(build_report),
            "--manifest",
            str(manifest_path),
            "--random-count",
            "10",
            "--output",
            str(sample_plan),
        ],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    sample_plan_payload = json.loads(sample_plan.read_text(encoding="utf-8"))
    sample_plan_sha256 = hashlib.sha256(sample_plan.read_bytes()).hexdigest()
    sample = sample_plan_payload["samples"][0]

    catalog_screenshot = evidence_dir / "catalog-page.png"
    workspace_screenshot = evidence_dir / "populated-workspace.png"
    Image.new("RGB", (1200, 800), color=(250, 250, 250)).save(
        catalog_screenshot,
        format="PNG",
    )
    Image.new("RGB", (1200, 800), color=(245, 248, 252)).save(
        workspace_screenshot,
        format="PNG",
    )
    filled_pdf = evidence_dir / "filled.pdf"
    pdf = canvas.Canvas(str(filled_pdf), pagesize=(612, 792))
    pdf.drawString(72, 750, "Catalog browser canary fixture")
    pdf.acroForm.textfield(
        name="canary_text",
        value="Catalog canary value",
        x=72,
        y=700,
        width=240,
        height=24,
    )
    pdf.acroForm.checkbox(
        name="canary_checkbox",
        checked=True,
        x=72,
        y=650,
        size=18,
    )
    pdf.showPage()
    pdf.drawString(72, 750, "Catalog browser canary fixture page 2")
    pdf.acroForm.textfield(
        name="secondary_text",
        value="",
        x=72,
        y=700,
        width=240,
        height=24,
    )
    pdf.acroForm.checkbox(
        name="secondary_checkbox",
        checked=False,
        x=72,
        y=650,
        size=18,
    )
    pdf.save()
    artifacts: list[dict[str, object]] = []
    artifact_payloads = (
        ("catalog_page_screenshot", catalog_screenshot),
        ("populated_workspace_screenshot", workspace_screenshot),
        ("filled_pdf", filled_pdf),
    )
    for kind, artifact_path in artifact_payloads:
        content = artifact_path.read_bytes()
        artifacts.append(
            {
                "kind": kind,
                "path": artifact_path.name,
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
    active_mapping_value = {
        "sourceSection": form["sourceSection"],
        "filename": form["filename"],
        "pdfPath": form["pdf"]["objectPath"],
        "thumbnailPath": form["thumbnail"]["objectPath"],
        "sha256": form["pdf"]["sha256"],
        "bytes": form["pdf"]["bytes"],
        "pageCount": form["pageCount"],
    }
    active_contract = _write_json(
        evidence_dir / "active.json",
        {
            "schemaVersion": 1,
            "releaseId": RELEASE_ID,
            "sourceCommit": SOURCE_COMMIT,
            "manifestSha256": manifest_sha256,
            "previousReleaseId": release["previousReleaseId"],
            "activatedAt": "2026-07-29T17:58:00Z",
            "replacements": [active_mapping_value],
        },
    )
    form_catalog_data = evidence_dir / "formCatalogData.mjs"
    form_catalog_data.write_text(
        "// fixture\n"
        "const RAW_FORM_CATALOG_ENTRIES = [\n"
        f"  {json.dumps({'slug': slug, **active_mapping_value})}\n"
        "];\n",
        encoding="utf-8",
    )
    active_mapping_payload = {
        "schemaVersion": 1,
        "reportType": "form-catalog-active-mapping",
        "producer": "verify-active-mapping",
        "gitCommit": DEPLOYMENT_COMMIT,
        "releaseId": RELEASE_ID,
        "sourceCommit": SOURCE_COMMIT,
        "previousReleaseId": release["previousReleaseId"],
        "manifestSha256": manifest_sha256,
        "activeContractPath": active_contract.name,
        "activeContractSha256": hashlib.sha256(
            active_contract.read_bytes()
        ).hexdigest(),
        "formCatalogDataPath": form_catalog_data.name,
        "formCatalogDataSha256": hashlib.sha256(
            form_catalog_data.read_bytes()
        ).hexdigest(),
        "releaseManifestSha256": manifest_sha256,
        "generatedEntryCount": 1,
        "activeReplacementCount": 1,
        "currentReleaseReplacementCount": 1,
        "activeMappingDigest": _canonical_hash([active_mapping_value]),
        "manifestMappingDigest": _canonical_hash([active_mapping_value]),
        "ok": True,
    }
    active_mapping = _write_json(
        evidence_dir / "active-mapping.json",
        active_mapping_payload,
    )
    hosting = _write_json(
        evidence_dir / "hosting.json",
        {
            **binding,
            "reportType": "form-catalog-hosting-deployment",
            "producer": "controlled-deploy",
            "environment": "production",
            "projectId": "dullypdf",
            "site": "dullypdf",
            "ok": True,
            "hostingVersion": hosting_version,
            "rollbackHostingVersion": "sites/dullypdf/versions/catalog-release-old",
            "siteOrigins": site_origins,
            "deployedAt": "2026-07-29T18:00:00Z",
            "deploymentCommit": DEPLOYMENT_COMMIT,
            "workflowRunId": WORKFLOW_RUN_ID,
            "workflowRunAttempt": WORKFLOW_RUN_ATTEMPT,
            "activeMappingEvidenceSha256": hashlib.sha256(
                active_mapping.read_bytes()
            ).hexdigest(),
            "activeContractSha256": active_mapping_payload[
                "activeContractSha256"
            ],
            "formCatalogDataSha256": active_mapping_payload[
                "formCatalogDataSha256"
            ],
            "releaseManifestSha256": active_mapping_payload[
                "releaseManifestSha256"
            ],
            "activeMappingDigest": active_mapping_payload[
                "activeMappingDigest"
            ],
            "manifestMappingDigest": active_mapping_payload[
                "manifestMappingDigest"
            ],
            "activeReplacementCount": active_mapping_payload[
                "activeReplacementCount"
            ],
            "currentReleaseReplacementCount": active_mapping_payload[
                "currentReleaseReplacementCount"
            ],
            "mappingGitCommit": DEPLOYMENT_COMMIT,
            "hostingReleaseName": (
                "projects/916039292611/sites/dullypdf/channels/live/releases/"
                "catalog-release-new"
            ),
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
            "browserCatalogIds": sample_plan_payload["browserCatalogIds"],
            "ok": True,
            "results": [
                {
                    "catalogId": catalog_id,
                    "slug": slug,
                    "random": sample["random"],
                    "canaryRoles": sample["canaryRoles"],
                    "browserCanary": sample["browserCanary"],
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
            "producerVersion": "form-catalog-browser-canary-v1",
            "hostingVersion": hosting_version,
            "hostingEvidenceSha256": hashlib.sha256(hosting.read_bytes()).hexdigest(),
            "hostingDeployedAt": "2026-07-29T18:00:00Z",
            "samplePlanSha256": sample_plan_sha256,
            "siteOrigin": "https://dullypdf.com",
            "assetBaseUrl": (
                "https://storage.googleapis.com/"
                "dullypdf-form-catalog-assets-east4"
            ),
            "startedAt": "2026-07-29T18:06:00Z",
            "completedAt": "2026-07-29T18:08:00Z",
            "automation": {
                "library": "@playwright/test",
                "libraryVersion": "1.57.0",
                "browser": "chromium",
                "browserVersion": "140.0.0",
                "headless": True,
                "viewport": {"width": 1600, "height": 1200},
            },
            "resultCount": 1,
            "ok": True,
            "results": [
                {
                    "catalogId": catalog_id,
                    "slug": slug,
                    "sourceSection": form["sourceSection"],
                    "filename": form["filename"],
                    "ok": True,
                    "checks": {
                        "catalogIdentity": True,
                        "immutablePdfPath": True,
                        "fieldOverlays": True,
                        "fillSaveReopen": True,
                    },
                    "observations": {
                        "catalogPage": {
                            "url": f"https://dullypdf.com/forms/{slug}",
                            "finalUrl": f"https://dullypdf.com/forms/{slug}",
                            "documentTitle": (
                                "Contractor Payment Application | DullyPDF Form Catalog"
                            ),
                            "heading": "Contractor Payment Application",
                            "sourceSection": form["sourceSection"],
                            "filename": form["filename"],
                            "sha256": form["pdf"]["sha256"],
                            "immutablePdfPath": form["pdf"]["objectPath"],
                            "pdfUrl": (
                                "https://storage.googleapis.com/"
                                "dullypdf-form-catalog-assets-east4/"
                                f"{form['pdf']['objectPath']}"
                            ),
                            "pageCount": form["pageCount"],
                            "thumbnailPath": form["thumbnail"]["objectPath"],
                            "thumbnailUrl": (
                                "https://storage.googleapis.com/"
                                "dullypdf-form-catalog-assets-east4/"
                                f"{form['thumbnail']['objectPath']}"
                            ),
                            "thumbnailNaturalWidth": 850,
                            "thumbnailNaturalHeight": 1100,
                            "previewCanvasWidth": 680,
                            "previewCanvasHeight": 880,
                            "sourceResponseStatus": 200,
                        },
                        "workspace": {
                            "url": "https://dullypdf.com/ui",
                            "immutablePdfPath": form["pdf"]["objectPath"],
                            "sourceResponseUrl": (
                                "https://storage.googleapis.com/"
                                "dullypdf-form-catalog-assets-east4/"
                                f"{form['pdf']['objectPath']}"
                            ),
                            "sourceResponseStatus": 200,
                            "fieldRowCount": 4,
                            "textFieldCount": 2,
                            "checkboxFieldCount": 2,
                            "fieldOverlayCount": 2,
                            "errorAlertCount": 0,
                        },
                        "fill": {
                            "text": {
                                "fieldName": "canary_text",
                                "expectedValue": "Catalog canary value",
                                "observedValue": "Catalog canary value",
                            },
                            "checkbox": {
                                "fieldName": "canary_checkbox",
                                "expectedChecked": True,
                                "observedChecked": True,
                            },
                        },
                        "download": {
                            "exportMode": "editable",
                            "suggestedFilename": "contractor-payment-editable.pdf",
                        },
                        "reopen": {
                            "browser": {
                                "workspaceUrl": "https://dullypdf.com/ui",
                                "textFieldName": "canary_text",
                                "textValue": "Catalog canary value",
                                "checkboxFieldName": "canary_checkbox",
                                "checkboxChecked": True,
                                "errorAlertCount": 0,
                            },
                            "pdf": {
                                "parser": "pypdf",
                                "sha256": hashlib.sha256(
                                    filled_pdf.read_bytes()
                                ).hexdigest(),
                                "bytes": filled_pdf.stat().st_size,
                                "pageCount": 2,
                                "fieldCount": 4,
                                "text": {
                                    "fieldName": "canary_text",
                                    "expectedValue": "Catalog canary value",
                                    "actualValue": "Catalog canary value",
                                    "matched": True,
                                },
                                "checkbox": {
                                    "fieldName": "canary_checkbox",
                                    "expectedChecked": True,
                                    "actualValue": "Yes",
                                    "checked": True,
                                },
                            },
                        },
                    },
                    "artifacts": artifacts,
                }
            ],
        },
    )
    return hosting, live, browser, sample_plan, selection, build_report


def _promotion_validation_args(
    evidence: tuple[Path, Path, Path, Path, Path, Path],
) -> list[str]:
    hosting, live, browser, sample_plan, selection, build_report = evidence
    return [
        "--hosting-evidence",
        str(hosting),
        "--active-mapping-evidence",
        str(hosting.parent / "active-mapping.json"),
        "--active-release-contract",
        str(hosting.parent / "active.json"),
        "--form-catalog-data",
        str(hosting.parent / "formCatalogData.mjs"),
        "--live-report",
        str(live),
        "--browser-report",
        str(browser),
        "--sample-plan",
        str(sample_plan),
        "--selection",
        str(selection),
        "--build-report",
        str(build_report),
        "--expected-deployment-commit",
        DEPLOYMENT_COMMIT,
        "--expected-workflow-run-id",
        WORKFLOW_RUN_ID,
        "--expected-workflow-run-attempt",
        WORKFLOW_RUN_ATTEMPT,
    ]


def test_validator_accepts_release_scoped_assets_and_reports_upload_plan(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)

    result = _run_validator(manifest_path, "--format", "json")

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["releaseId"] == RELEASE_ID
    assert payload["sourceCommit"] == SOURCE_COMMIT
    assert payload["formCount"] == 1
    assert payload["assetCount"] == 2
    assert payload["frozenLedgerAttestation"]["batchId"] == RELEASE_ID
    assert payload["frozenLedgerAttestation"]["targetCount"] == 1
    assert len(payload["frozenLedgerAttestation"]["frozenDigest"]) == 64
    assert len(payload["frozenLedgerAttestation"]["sha256"]) == 64
    assert all(
        asset["objectPath"].startswith(f"releases/{RELEASE_ID}/assets/")
        for asset in payload["assets"]
    )


def test_validator_rejects_tampered_frozen_digest(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    attestation_path = _frozen_attestation_path(manifest_path)
    payload = json.loads(attestation_path.read_text(encoding="utf-8"))
    payload["frozenDigest"] = "f" * 64
    attestation_path.write_text(json.dumps(payload), encoding="utf-8")

    result = _run_validator(manifest_path)

    assert result.returncode == 1
    assert "frozenDigest does not match canonical manifest" in result.stderr


def test_validator_rejects_missing_review_hash_in_validly_encoded_freeze(
    tmp_path: Path,
) -> None:
    manifest_path = _write_release(tmp_path)
    attestation_path = _frozen_attestation_path(manifest_path)
    payload = json.loads(attestation_path.read_text(encoding="utf-8"))
    payload["manifest"]["items"][0].pop("review_evidence_hash")
    _rewrite_attestation(attestation_path, payload)

    result = _run_validator(manifest_path)

    assert result.returncode == 1
    assert "review_evidence_hash must be a non-empty string" in result.stderr


def test_validator_rejects_release_asset_hash_substitution(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    replacement = b"%PDF-1.7\nsubstituted release asset\n"
    (tmp_path / "high-value-form.pdf").write_bytes(replacement)
    release = json.loads(manifest_path.read_text(encoding="utf-8"))
    release["forms"][0]["pdf"]["sha256"] = hashlib.sha256(replacement).hexdigest()
    release["forms"][0]["pdf"]["bytes"] = len(replacement)
    manifest_path.write_text(json.dumps(release), encoding="utf-8")

    attestation_path = _frozen_attestation_path(manifest_path)
    attestation = json.loads(attestation_path.read_text(encoding="utf-8"))
    attestation["manifest"]["release_manifest_hash"] = hashlib.sha256(
        manifest_path.read_bytes()
    ).hexdigest()
    _rewrite_attestation(attestation_path, attestation)

    result = _run_validator(manifest_path)

    assert result.returncode == 1
    assert "pdf_hash does not match release.json" in result.stderr


def test_validator_rejects_release_asset_uri_substitution(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    release = json.loads(manifest_path.read_text(encoding="utf-8"))
    release["forms"][0]["thumbnail"]["objectPath"] = (
        f"releases/{RELEASE_ID}/assets/construction_trades/substituted.webp"
    )
    manifest_path.write_text(json.dumps(release), encoding="utf-8")

    attestation_path = _frozen_attestation_path(manifest_path)
    attestation = json.loads(attestation_path.read_text(encoding="utf-8"))
    attestation["manifest"]["release_manifest_hash"] = hashlib.sha256(
        manifest_path.read_bytes()
    ).hexdigest()
    _rewrite_attestation(attestation_path, attestation)

    result = _run_validator(manifest_path)

    assert result.returncode == 1
    assert "thumbnail_uri does not match release.json" in result.stderr


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


def test_stage_dry_run_plans_one_bounded_create_only_operation(
    tmp_path: Path,
) -> None:
    manifest_path = _write_release(tmp_path)
    inventory_report = tmp_path / "stage-gcs-inventory.json"

    result = subprocess.run(
        [
            "bash",
            str(DEPLOY_SCRIPT),
            "--action",
            "stage",
            "--manifest",
            str(manifest_path),
            "--frozen-ledger-manifest",
            str(_frozen_attestation_path(manifest_path)),
            "--asset-root",
            str(tmp_path),
            "--bucket",
            "gs://dullypdf-catalog-test",
            "--project",
            "dullypdf",
            "--expected-commit",
            SOURCE_COMMIT,
            "--inventory-report",
            str(inventory_report),
        ],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Dry run only" in result.stdout
    assert "GCS stage: objects=4" in result.stdout
    assert f"prefix=releases/{RELEASE_ID}/" in result.stdout
    assert "expectedInventoryDigest=" in result.stdout
    assert "boundedWorkers=12 pageSize=1000 timeoutSeconds=60" in result.stdout
    assert f"inventoryReport={inventory_report}" in result.stdout
    assert str(tmp_path / "high-value-form.pdf") not in result.stdout
    assert "no cloud objects were created" in result.stdout
    assert not inventory_report.exists()


def test_executed_stage_builds_exact_private_plan_and_persists_inventory(
    tmp_path: Path,
) -> None:
    manifest_path = _write_release(tmp_path)
    fake_python = tmp_path / "fake-form-catalog-python"
    captured_plan = tmp_path / "captured-gcs-plan.json"
    inventory_report = tmp_path / "stage-gcs-inventory.json"
    fake_python.write_text(
        """#!/usr/bin/env python3
import hashlib
import json
import os
import sys
from pathlib import Path

if len(sys.argv) == 2 and sys.argv[1] == "-":
    sys.stdin.read()
    print("dullypdf-gcs-preflight-ok")
    raise SystemExit(0)

arguments = sys.argv[2:]


def option(name):
    return arguments[arguments.index(name) + 1]


plan = json.loads(Path(option("--plan")).read_text(encoding="utf-8"))
Path(os.environ["CAPTURED_GCS_PLAN"]).write_text(
    json.dumps(plan, indent=2, sort_keys=True) + "\\n",
    encoding="utf-8",
)
expected_objects = [
    {
        key: item[key]
        for key in (
            "objectPath",
            "bytes",
            "sha256",
            "md5Base64",
            "contentType",
            "cacheControl",
            "customMetadata",
        )
    }
    for item in plan["objects"]
]
expected_identity = {
    "projectId": plan["projectId"],
    "bucket": plan["bucket"],
    "prefix": plan["prefix"],
    "objects": expected_objects,
}
expected_digest = hashlib.sha256(
    json.dumps(
        expected_identity,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
).hexdigest()
remote_objects = []
for index, item in enumerate(expected_objects, start=1):
    remote_objects.append(
        {
            **item,
            "generation": str(index),
            "metageneration": "1",
        }
    )
inventory_identity = {
    "projectId": plan["projectId"],
    "bucket": plan["bucket"],
    "prefix": plan["prefix"],
    "objects": remote_objects,
}
inventory_digest = hashlib.sha256(
    json.dumps(
        inventory_identity,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
).hexdigest()
report = {
    "schemaVersion": 1,
    "reportType": "form-catalog-gcs-inventory",
    "producer": "google-cloud-storage",
    "producerVersion": "3.9.0",
    "operation": option("--action"),
    "projectId": plan["projectId"],
    "bucket": plan["bucket"],
    "prefix": plan["prefix"],
    "objectCount": len(remote_objects),
    "pageCount": 1,
    "expectedInventoryDigest": expected_digest,
    "inventoryDigest": inventory_digest,
    "objects": remote_objects,
    "maxWorkers": int(option("--max-workers")),
    "createdObjectCount": len(remote_objects),
    "existingObjectCount": 0,
    "ok": True,
}
Path(option("--output")).write_text(
    json.dumps(report, sort_keys=True, separators=(",", ":")) + "\\n",
    encoding="utf-8",
)
print(
    f"operation={report['operation']} objects={report['objectCount']} "
    f"pages={report['pageCount']} inventoryDigest={inventory_digest}"
)
""",
        encoding="utf-8",
    )
    fake_python.chmod(0o755)
    env = {
        **os.environ,
        "FORM_CATALOG_PYTHON_BIN": str(fake_python),
        "CAPTURED_GCS_PLAN": str(captured_plan),
    }

    result = subprocess.run(
        [
            "bash",
            str(DEPLOY_SCRIPT),
            "--action",
            "stage",
            "--manifest",
            str(manifest_path),
            "--frozen-ledger-manifest",
            str(_frozen_attestation_path(manifest_path)),
            "--asset-root",
            str(tmp_path),
            "--bucket",
            "gs://dullypdf-catalog-test",
            "--project",
            "dullypdf",
            "--expected-commit",
            SOURCE_COMMIT,
            "--inventory-report",
            str(inventory_report),
            "--gcs-workers",
            "4",
            "--execute",
        ],
        cwd=REPO_ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    plan = json.loads(captured_plan.read_text(encoding="utf-8"))
    assert plan["projectId"] == "dullypdf"
    assert plan["bucket"] == "dullypdf-catalog-test"
    assert plan["prefix"] == f"releases/{RELEASE_ID}/"
    assert len(plan["objects"]) == 4
    object_paths = [item["objectPath"] for item in plan["objects"]]
    assert object_paths == sorted(object_paths)
    assert object_paths == [
        f"releases/{RELEASE_ID}/assets/construction_trades/high-value-form.pdf",
        f"releases/{RELEASE_ID}/assets/construction_trades/high-value-form.webp",
        f"releases/{RELEASE_ID}/frozen-ledger-manifest.json",
        f"releases/{RELEASE_ID}/release-manifest.json",
    ]
    mutable_sources = {
        str(manifest_path.resolve()),
        str(_frozen_attestation_path(manifest_path).resolve()),
        str((tmp_path / "high-value-form.pdf").resolve()),
        str((tmp_path / "high-value-form.webp").resolve()),
    }
    for item in plan["objects"]:
        assert Path(item["sourcePath"]).is_absolute()
        assert item["sourcePath"] not in mutable_sources
        assert item["cacheControl"] == "public,max-age=31536000,immutable"
        assert item["customMetadata"]["catalog_release_id"] == RELEASE_ID
        assert item["customMetadata"]["catalog_source_commit"] == SOURCE_COMMIT
        assert item["customMetadata"]["catalog_sha256"] == item["sha256"]
    by_kind = {
        item["customMetadata"]["catalog_asset_kind"]: item
        for item in plan["objects"]
    }
    assert set(by_kind) == {
        "pdf",
        "thumbnail",
        "frozen_ledger_attestation",
        "release_manifest",
    }
    assert (
        by_kind["frozen_ledger_attestation"]["customMetadata"][
            "catalog_frozen_digest"
        ]
        == json.loads(
            _frozen_attestation_path(manifest_path).read_text(encoding="utf-8")
        )["frozenDigest"]
    )
    for kind, item in by_kind.items():
        if kind != "frozen_ledger_attestation":
            assert "catalog_frozen_digest" not in item["customMetadata"]
    persisted = json.loads(inventory_report.read_text(encoding="utf-8"))
    assert persisted["operation"] == "stage"
    assert persisted["objectCount"] == 4
    assert "GCS stage inventory report sha256=" in result.stdout


def test_executed_stage_requires_durable_inventory_report(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(DEPLOY_SCRIPT),
            "--action",
            "stage",
            "--manifest",
            str(manifest_path),
            "--frozen-ledger-manifest",
            str(_frozen_attestation_path(manifest_path)),
            "--asset-root",
            str(tmp_path),
            "--bucket",
            "gs://dullypdf-catalog-test",
            "--project",
            "dullypdf",
            "--expected-commit",
            SOURCE_COMMIT,
            "--execute",
        ],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert (
        "--inventory-report is required for executed stage and promotion"
        in result.stderr
    )


def test_inventory_report_cannot_overwrite_release_inputs_or_assets(
    tmp_path: Path,
) -> None:
    manifest_path = _write_release(tmp_path)
    sentinel_python = tmp_path / "sentinel-python"
    sentinel_python.write_text(
        """#!/usr/bin/env bash
if [[ "${1:-}" == "-" ]]; then
  printf 'dullypdf-gcs-preflight-ok\\n'
fi
exit 0
""",
        encoding="utf-8",
    )
    sentinel_python.chmod(0o755)
    protected_paths = (
        manifest_path,
        _frozen_attestation_path(manifest_path),
        tmp_path / "high-value-form.pdf",
    )

    for protected_path in protected_paths:
        result = subprocess.run(
            [
                "bash",
                str(DEPLOY_SCRIPT),
                "--action",
                "stage",
                "--manifest",
                str(manifest_path),
                "--frozen-ledger-manifest",
                str(_frozen_attestation_path(manifest_path)),
                "--asset-root",
                str(tmp_path),
                "--bucket",
                "gs://dullypdf-catalog-test",
                "--project",
                "dullypdf",
                "--expected-commit",
                SOURCE_COMMIT,
                "--inventory-report",
                str(protected_path),
                "--execute",
            ],
            cwd=REPO_ROOT,
            env={
                **os.environ,
                # The collision check runs after the interpreter/ADC preflight
                # and before transport. A no-op interpreter isolates that gate.
                "FORM_CATALOG_PYTHON_BIN": str(sentinel_python),
            },
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 1
        assert (
            "--inventory-report cannot overwrite release inputs, evidence, "
            "lock state, or source assets"
            in result.stderr
        )


def test_executed_stage_cannot_reuse_stale_durable_inventory_evidence(
    tmp_path: Path,
) -> None:
    manifest_path = _write_release(tmp_path)
    release = json.loads(manifest_path.read_text(encoding="utf-8"))
    frozen_path = _frozen_attestation_path(manifest_path)
    frozen = json.loads(frozen_path.read_text(encoding="utf-8"))
    prefix = f"releases/{RELEASE_ID}/"
    cache_control = "public,max-age=31536000,immutable"
    expected_objects: list[dict[str, object]] = []

    def add_expected(
        source: Path,
        object_path: str,
        content_type: str,
        kind: str,
        extra_metadata: dict[str, str] | None = None,
    ) -> None:
        data = source.read_bytes()
        sha256 = hashlib.sha256(data).hexdigest()
        metadata = {
            "catalog_asset_kind": kind,
            "catalog_release_id": RELEASE_ID,
            "catalog_sha256": sha256,
            "catalog_source_commit": SOURCE_COMMIT,
        }
        if extra_metadata:
            metadata.update(extra_metadata)
        expected_objects.append(
            {
                "objectPath": object_path,
                "bytes": len(data),
                "sha256": sha256,
                "md5Base64": base64.b64encode(
                    hashlib.md5(data, usedforsecurity=False).digest()
                ).decode("ascii"),
                "contentType": content_type,
                "cacheControl": cache_control,
                "customMetadata": metadata,
            }
        )

    form = release["forms"][0]
    add_expected(
        tmp_path / form["pdf"]["sourcePath"],
        form["pdf"]["objectPath"],
        "application/pdf",
        "pdf",
    )
    add_expected(
        tmp_path / form["thumbnail"]["sourcePath"],
        form["thumbnail"]["objectPath"],
        "image/webp",
        "thumbnail",
    )
    add_expected(
        manifest_path,
        f"{prefix}release-manifest.json",
        "application/json",
        "release_manifest",
    )
    add_expected(
        frozen_path,
        f"{prefix}frozen-ledger-manifest.json",
        "application/json",
        "frozen_ledger_attestation",
        {"catalog_frozen_digest": frozen["frozenDigest"]},
    )
    expected_objects.sort(key=lambda item: str(item["objectPath"]))
    expected_identity = {
        "projectId": "dullypdf",
        "bucket": "dullypdf-catalog-test",
        "prefix": prefix,
        "objects": expected_objects,
    }
    remote_objects = [
        {
            **item,
            "generation": str(index),
            "metageneration": "1",
        }
        for index, item in enumerate(expected_objects, start=1)
    ]
    inventory_identity = {
        "projectId": "dullypdf",
        "bucket": "dullypdf-catalog-test",
        "prefix": prefix,
        "objects": remote_objects,
    }
    inventory_report = tmp_path / "stage-gcs-inventory.json"
    inventory_report.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "reportType": "form-catalog-gcs-inventory",
                "producer": "google-cloud-storage",
                "producerVersion": "3.9.0",
                "operation": "stage",
                "projectId": "dullypdf",
                "bucket": "dullypdf-catalog-test",
                "prefix": prefix,
                "objectCount": len(remote_objects),
                "pageCount": 1,
                "expectedInventoryDigest": _canonical_hash(expected_identity),
                "inventoryDigest": _canonical_hash(inventory_identity),
                "objects": remote_objects,
                "maxWorkers": 12,
                "createdObjectCount": len(remote_objects),
                "existingObjectCount": 0,
                "ok": True,
            },
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    stale_bytes = inventory_report.read_bytes()
    no_op_python = tmp_path / "no-op-form-catalog-python"
    no_op_python.write_text(
        """#!/usr/bin/env bash
if [[ "${1:-}" == "-" ]]; then
  printf 'dullypdf-gcs-preflight-ok\\n'
fi
exit 0
""",
        encoding="utf-8",
    )
    no_op_python.chmod(0o755)

    result = subprocess.run(
        [
            "bash",
            str(DEPLOY_SCRIPT),
            "--action",
            "stage",
            "--manifest",
            str(manifest_path),
            "--frozen-ledger-manifest",
            str(frozen_path),
            "--asset-root",
            str(tmp_path),
            "--bucket",
            "gs://dullypdf-catalog-test",
            "--project",
            "dullypdf",
            "--expected-commit",
            SOURCE_COMMIT,
            "--inventory-report",
            str(inventory_report),
            "--execute",
        ],
        cwd=REPO_ROOT,
        env={
            **os.environ,
            "FORM_CATALOG_PYTHON_BIN": str(no_op_python),
        },
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert (
        "returned without producing fresh private inventory evidence"
        in result.stderr
    )
    assert inventory_report.read_bytes() == stale_bytes


def test_every_deploy_action_requires_frozen_ledger_attestation(
    tmp_path: Path,
) -> None:
    manifest_path = _write_release(tmp_path)

    for action in ("validate", "stage", "promote"):
        result = subprocess.run(
            [
                "bash",
                str(DEPLOY_SCRIPT),
                "--action",
                action,
                "--manifest",
                str(manifest_path),
                "--asset-root",
                str(tmp_path),
            ],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 1
        assert (
            "--frozen-ledger-manifest is required for every deployment action"
            in result.stderr
        )


def test_validate_action_accepts_frozen_ledger_attestation(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(DEPLOY_SCRIPT),
            "--action",
            "validate",
            "--manifest",
            str(manifest_path),
            "--frozen-ledger-manifest",
            str(_frozen_attestation_path(manifest_path)),
            "--asset-root",
            str(tmp_path),
        ],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Local release validation passed." in result.stdout
    assert "Frozen ledger attestation:" in result.stdout
    assert "frozenDigest=" in result.stdout
    assert "sha256=" in result.stdout


def test_promotion_dry_run_plans_guarded_active_pointer_update(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    evidence = _promotion_evidence(tmp_path, manifest_path)

    result = subprocess.run(
        [
            "bash",
            str(DEPLOY_SCRIPT),
            "--action",
            "promote",
            "--manifest",
            str(manifest_path),
            "--frozen-ledger-manifest",
            str(_frozen_attestation_path(manifest_path)),
            "--asset-root",
            str(tmp_path),
            "--bucket",
            "gs://dullypdf-form-catalog-assets-east4",
            "--project",
            "dullypdf",
            "--expected-commit",
            SOURCE_COMMIT,
            *_promotion_validation_args(evidence),
        ],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "compare gs://dullypdf-form-catalog-assets-east4/catalog-release-state/active.json" in result.stdout
    assert "previousReleaseId=catalog-20260728-009" in result.stdout
    assert "using its observed object generation" in result.stdout
    assert "hostingVersion=sites/dullypdf/versions/catalog-release-new" in result.stdout
    assert "exact deterministic sample" in result.stdout
    assert "acquire the shared production Hosting deployment lock" in result.stdout
    assert "re-query dullypdf live Hosting" in result.stdout
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
            "--frozen-ledger-manifest",
            str(_frozen_attestation_path(manifest_path)),
            "--asset-root",
            str(tmp_path),
            "--bucket",
            "gs://dullypdf-form-catalog-assets-east4",
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
    assert "Promotion requires Hosting, live, browser, sample-plan" in result.stderr


def test_promotion_rejects_tampered_browser_artifact(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    evidence = _promotion_evidence(tmp_path, manifest_path)
    hosting, live, browser, _sample_plan, _selection, _build_report = evidence
    (browser.parent / "filled.pdf").write_bytes(b"%PDF-1.7\ntampered\n")

    result = _run_validator(
        manifest_path,
        *_promotion_validation_args(evidence),
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
    evidence = _promotion_evidence(tmp_path, manifest_path)
    hosting, live, browser, _sample_plan, _selection, _build_report = evidence
    browser_payload = json.loads(browser.read_text(encoding="utf-8"))
    browser_payload["results"][0]["artifacts"] = []
    browser.write_text(json.dumps(browser_payload), encoding="utf-8")

    result = _run_validator(
        manifest_path,
        *_promotion_validation_args(evidence),
    )

    assert result.returncode == 1
    assert "is missing artifacts" in result.stderr


def test_promotion_rejects_manual_browser_booleans_without_machine_contract(
    tmp_path: Path,
) -> None:
    manifest_path = _write_release(tmp_path)
    evidence = _promotion_evidence(tmp_path, manifest_path)
    browser = evidence[2]
    browser_payload = json.loads(browser.read_text(encoding="utf-8"))
    browser_payload.pop("producerVersion")
    browser_payload["results"][0].pop("observations")
    browser.write_text(json.dumps(browser_payload), encoding="utf-8")

    result = _run_validator(
        manifest_path,
        *_promotion_validation_args(evidence),
    )

    assert result.returncode == 1
    assert "checked-in machine producer" in result.stderr


def test_promotion_independently_reopens_browser_filled_pdf(
    tmp_path: Path,
) -> None:
    manifest_path = _write_release(tmp_path)
    evidence = _promotion_evidence(tmp_path, manifest_path)
    browser = evidence[2]
    browser_payload = json.loads(browser.read_text(encoding="utf-8"))
    observations = browser_payload["results"][0]["observations"]
    observations["fill"]["text"]["expectedValue"] = "Invented report value"
    observations["fill"]["text"]["observedValue"] = "Invented report value"
    observations["reopen"]["browser"]["textValue"] = "Invented report value"
    observations["reopen"]["pdf"]["text"]["expectedValue"] = "Invented report value"
    observations["reopen"]["pdf"]["text"]["actualValue"] = "Invented report value"
    browser.write_text(json.dumps(browser_payload), encoding="utf-8")

    result = _run_validator(
        manifest_path,
        *_promotion_validation_args(evidence),
    )

    assert result.returncode == 1
    assert "does not contain the expected text value" in result.stderr


def test_promotion_requires_exact_planned_browser_canary_ids(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    evidence = _promotion_evidence(tmp_path, manifest_path)
    hosting, live, browser, _sample_plan, _selection, _build_report = evidence
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
        *_promotion_validation_args(evidence),
    )

    assert result.returncode == 1
    assert "do not exactly match the deterministic sample plan" in result.stderr


def test_promotion_rejects_dev_hosting_identity(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    evidence = _promotion_evidence(tmp_path, manifest_path)
    hosting = evidence[0]
    payload = json.loads(hosting.read_text(encoding="utf-8"))
    payload["projectId"] = "dullypdf-dev"
    payload["site"] = "dullypdf-dev"
    hosting.write_text(json.dumps(payload), encoding="utf-8")

    result = _run_validator(
        manifest_path,
        *_promotion_validation_args(evidence),
    )

    assert result.returncode == 1
    assert "does not match the production project" in result.stderr


def test_promotion_recomputes_deterministic_sample_plan(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    evidence = _promotion_evidence(tmp_path, manifest_path)
    _hosting, live, browser, sample_plan, _selection, _build_report = evidence
    payload = json.loads(sample_plan.read_text(encoding="utf-8"))
    payload["randomCount"] = 0
    sample_plan.write_text(json.dumps(payload), encoding="utf-8")
    changed_hash = hashlib.sha256(sample_plan.read_bytes()).hexdigest()
    for report in (live, browser):
        report_payload = json.loads(report.read_text(encoding="utf-8"))
        report_payload["samplePlanSha256"] = changed_hash
        report.write_text(json.dumps(report_payload), encoding="utf-8")

    result = _run_validator(
        manifest_path,
        *_promotion_validation_args(evidence),
    )

    assert result.returncode == 1
    assert "does not exactly match the deterministic 10-random" in result.stderr


def test_promotion_rejects_nonproduction_asset_origin(tmp_path: Path) -> None:
    manifest_path = _write_release(tmp_path)
    evidence = _promotion_evidence(tmp_path, manifest_path)
    live = evidence[1]
    payload = json.loads(live.read_text(encoding="utf-8"))
    payload["assetBaseUrls"] = ["https://example.invalid/catalog-assets"]
    for result in payload["results"]:
        result["pdfAssets"][0]["assetBase"] = payload["assetBaseUrls"][0]
        result["thumbnailAssets"][0]["assetBase"] = payload["assetBaseUrls"][0]
    live.write_text(json.dumps(payload), encoding="utf-8")

    result = _run_validator(
        manifest_path,
        *_promotion_validation_args(evidence),
    )

    assert result.returncode == 1
    assert "do not exactly match the production catalog asset origin" in result.stderr


def test_executed_promotion_rejects_uncommitted_mapping_snapshots(
    tmp_path: Path,
) -> None:
    manifest_path = _write_release(tmp_path)
    evidence = _promotion_evidence(tmp_path, manifest_path)

    result = _run_validator(
        manifest_path,
        *_promotion_validation_args(evidence),
        "--require-committed-active-mapping",
    )

    assert result.returncode == 1
    assert "Could not read committed active contract" in result.stderr


def test_deploy_script_has_guarded_promotion_and_no_destructive_sync() -> None:
    text = DEPLOY_SCRIPT.read_text(encoding="utf-8")
    transport_text = GCS_TRANSPORT.read_text(encoding="utf-8")
    transport_cli_text = GCS_TRANSPORT_CLI.read_text(encoding="utf-8")
    validator_text = VALIDATOR_IMPLEMENTATION.read_text(encoding="utf-8")
    lock_text = PRODUCTION_LOCK_SCRIPT.read_text(encoding="utf-8")

    assert "rsync" not in text
    assert "--delete-unmatched-destination-objects" not in text
    assert "verify_remote_object" not in text
    assert "stage_assets()" not in text
    assert 'gcloud storage objects describe "${object_url}"' not in text
    assert "ThreadPoolExecutor" in transport_text
    assert "if_generation_match=0" in transport_text
    assert "DEFAULT_RETRY_IF_GENERATION_SPECIFIED" in transport_text
    assert "list_blobs" in transport_text
    assert "canonical_inventory_report_bytes" in transport_cli_text
    assert "os.replace" in transport_cli_text
    assert "--if-generation-match" in text
    assert "checksum=\"md5\"" in transport_text
    assert "md5_hash" in transport_text
    assert "TMP_SNAPSHOT_ROOT" in text
    assert "TMP_GCS_OBJECT_PLAN" in text
    assert "TMP_FROZEN_LEDGER_SNAPSHOT" in text
    assert "--frozen-ledger-manifest is required for every deployment action." in text
    assert "--inventory-report is required for executed stage and promotion." in text
    assert '"frozenAttestationObject": frozen_attestation_object' in text
    assert '"frozenAttestationSha256": frozen_attestation_sha256' in text
    assert '"frozenDigest": frozen_digest' in text
    assert '--expected-commit is required with --execute.' in text
    assert 'MAX_FORMS="1000"' in text
    assert "DEFAULT_MAX_FORMS = 1000" in validator_text
    assert 'BUCKET_URL}" != "gs://dullypdf-form-catalog-assets-east4"' in text
    assert 'ACTIVE_OBJECT}" != "catalog-release-state/active.json"' in text
    promote_lock = text.index('PRODUCTION_LOCK_OWNER="catalog-promote:')
    inventory_recheck = text.index("run_gcs_transport verify", promote_lock)
    live_requery = text.index("snapshot-hosting", promote_lock)
    final_lock_verify = text.index(
        "--minimum-remaining-seconds 300",
        live_requery,
    )
    pointer_cas = text.index('--if-generation-match "${ACTIVE_GENERATION}"')
    assert (
        promote_lock
        < inventory_recheck
        < live_requery
        < final_lock_verify
        < pointer_cas
    )
    assert 'LOCK_OBJECT="catalog-release-state/production-deployment.lock"' in lock_text
    assert "--if-generation-match=0" in lock_text
    assert '--if-generation-match "${current_generation}"' in lock_text
    assert "--minimum-remaining-seconds" in lock_text
    assert "expiresEpoch" in lock_text


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
    assert "--inventory-report tmp/catalog-release/stage-gcs-inventory.json" in text
    assert "<browser-output-dir>/promotion-gcs-inventory.json" in text
    assert "Application Default Credentials" in text
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
    assert "FORM_CATALOG_CREATE_HOSTING_EVIDENCE" in frontend_deploy
    assert "FORM_CATALOG_PRODUCTION_LOCK_OWNER" in text
    assert "FORM_CATALOG_PRODUCTION_LOCK_STATE_PATH" in text
    assert "releases/${release_id}/release-manifest.json" in text
    assert "form-catalog-active.json" in text
    assert "form-catalog-data.mjs" in text
    acquire = text.index("Acquire shared production Hosting deployment lock")
    snapshot = text.index("Capture pre-deploy form catalog Hosting version")
    deploy = text.index("Run deploy target")
    verify_receipt = text.index("Verify immediate form catalog Hosting evidence")
    failure_rollback = text.index("Roll back failed form catalog Hosting deployment")
    release = text.index("Release shared production Hosting deployment lock")
    assert acquire < snapshot < deploy < verify_receipt < failure_rollback < release
    firebase_deploy = frontend_deploy.index("firebase --json deploy")
    final_lock_verify = frontend_deploy.rindex(
        "verify_production_hosting_mutation_lock",
        0,
        firebase_deploy,
    )
    immediate_receipt = frontend_deploy.index(
        "create-hosting-evidence",
        firebase_deploy,
    )
    hosted_checks = frontend_deploy.index("check_remote_content_type", immediate_receipt)
    assert final_lock_verify < firebase_deploy < immediate_receipt < hosted_checks
    assert "--minimum-remaining-seconds 300" in frontend_deploy
    assert "firebase-hosting-deploy-result-recovered" not in text
    assert "form-catalog-hosting-failure-diagnostic" in text
    assert text.count("form-catalog-production-lock.sh") == 2
    assert "always()" in text
    assert "FORM_CATALOG_TERMINAL_JOB_STATUS: ${{ job.status }}" in text
    assert "(failure() || cancelled()) && 'true'" not in text


def test_form_catalog_hybrid_qa_covers_release_controllers() -> None:
    text = HYBRID_QA.read_text(encoding="utf-8")

    for path in (
        "scripts/finalize-form-catalog-release.sh",
        "scripts/form-catalog-production-lock.sh",
    ):
        assert path in text
        assert f"bash -n {path}" in text
    assert "npm run test:playwright:form-catalog-canary:unit" in text
