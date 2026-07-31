from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from scripts.form_catalog_factory.ledger import (
    BatchStatus,
    CatalogFactoryLedger,
    Stage,
)
from scripts.form_catalog_factory.release_builder import build_release
from scripts.form_catalog_factory.release_validation import (
    ManifestValidationError,
    validate_frozen_evidence_files,
    validate_frozen_ledger_attestation,
    validate_release_manifest,
)
from scripts.form_catalog_factory.reviewed_release import (
    ReviewedReleaseError,
    build_visual_review_template,
    reconcile_reviewed_release,
    write_visual_review_template,
)
from scripts.form_catalog_factory.themes import get_theme
from scripts.form_catalog_factory.worker_control import register_existing_specs


REPO_ROOT = Path(__file__).resolve().parents[3]
EXEMPLAR = (
    REPO_ROOT
    / "form_catalog_specs"
    / "candidates"
    / "longtail"
    / "field_service"
    / "dfs_1100__appliance_repair_service_call_intake_form.json"
)
RENDER_THEME = get_theme("charcoal-deep-green-gold-v1").provenance()


class FakeClock:
    def __init__(self, value: float = 1_800_000_000.0) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


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


def _write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload) + "\n", encoding="utf-8")


def _refresh_review_build_hash(review_path: Path, report_path: Path) -> None:
    payload = json.loads(review_path.read_text(encoding="utf-8"))
    payload["buildReportSha256"] = hashlib.sha256(report_path.read_bytes()).hexdigest()
    _write_json(review_path, payload)


def _build_reviewed_fixture(
    tmp_path: Path,
    *,
    clock: FakeClock | None = None,
) -> tuple[CatalogFactoryLedger, Path, Path, Path, Path, str]:
    spec_root = tmp_path / "specs"
    spec_root.mkdir()
    spec_path = spec_root / EXEMPLAR.name
    spec = json.loads(EXEMPLAR.read_text(encoding="utf-8"))
    spec["title"] = "Appliance Repair Service Call Intake Form"
    spec["description"] = (
        "A focused intake record for the customer, appliance, service location, "
        "reported problem, and initial routing decision."
    )
    spec["use_case"] = (
        "Use when a service coordinator needs the facts required to identify "
        "an appliance request and route the next service action."
    )
    # Keep the reconciliation fixture focused on release evidence rather than
    # inheriting the legacy exemplar's intentionally broad five-page workflow.
    intake_section = spec["sections"][0]
    intake_blocks = intake_section["blocks"]
    spec["sections"] = [
        {
            **intake_section,
            "key": "request_customer",
            "title": "Request, customer, and service location",
            "guidance": "Identify the request, customer, and exact service location.",
            "blocks": intake_blocks[:3],
        },
        {
            **intake_section,
            "key": "appliance_problem",
            "title": "Appliance and reported problem",
            "guidance": "Record the affected appliance and the customer's stated problem.",
            "blocks": intake_blocks[3:],
        },
    ]
    spec_path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    catalog_id = spec["catalog_id"]
    selection = {
        "schemaVersion": 1,
        "releaseId": "catalog-test-001",
        "targetCount": 1,
        "renderTheme": RENDER_THEME,
        "items": [
            {
                "catalogId": catalog_id,
                "sourceSection": spec["source_section"],
                "filename": spec["source_filename"],
                "slug": spec["slug"],
                "title": "Appliance Repair Service Call Form",
                "riskTier": spec["risk_tier"],
            }
        ],
    }
    selection_path = tmp_path / "selection.json"
    selection_path.write_text(json.dumps(selection), encoding="utf-8")

    ledger = CatalogFactoryLedger(
        tmp_path / "factory.sqlite3",
        clock=clock or FakeClock(),
    )
    ledger.add_item(
        catalog_id=catalog_id,
        section=spec["source_section"],
        filename=spec["source_filename"],
        slug=spec["slug"],
        intent_fingerprint="9" * 64,
        current_asset_hash="0" * 64,
        payload={
            "title": selection["items"][0]["title"],
            "risk_tier": spec["risk_tier"],
        },
    )
    ledger.create_batch(
        batch_id="catalog-test-001",
        target_count=1,
        base_commit="a" * 40,
        renderer_commit="c" * 40,
    )
    ledger.assign_to_batch(
        batch_id="catalog-test-001",
        catalog_ids=[catalog_id],
    )
    register_existing_specs(
        ledger,
        batch_id="catalog-test-001",
        worker_id="spec-reviewer",
        spec_paths=[spec_path],
        claim_root=tmp_path / "claims",
    )

    release = build_release(
        selection_path=selection_path,
        spec_root=spec_root,
        output_root=tmp_path / "release",
        source_commit="c" * 40,
        base_commit="a" * 40,
        renderer_commit="c" * 40,
        previous_release_id=None,
        created_at="2026-07-30T12:00:00Z",
        workers=1,
        _source_verifier=_test_source_verifier,
        _runtime_verifier=_test_runtime_verifier,
    )
    build_report_path = Path(release["build_report"])
    review = build_visual_review_template(
        build_report_path=build_report_path,
        reviewer="visual-reviewer-01",
    )
    review["reviewedAt"] = "2026-07-30T12:30:00Z"
    review["passed"] = True
    for item in review["items"]:
        item["pagesReviewed"] = list(range(1, item["pageCount"] + 1))
        item["status"] = "approved"
        item["notes"] = "Every rendered page inspected at readable resolution."
    review_path = write_visual_review_template(tmp_path / "visual-review.json", review)
    return (
        ledger,
        selection_path,
        build_report_path,
        Path(release["manifest"]),
        review_path,
        catalog_id,
    )


def test_reconcile_reviewed_release_advances_and_freezes_exact_artifacts(
    tmp_path: Path,
) -> None:
    ledger, selection, report, manifest, review, catalog_id = (
        _build_reviewed_fixture(tmp_path)
    )

    result = reconcile_reviewed_release(
        ledger,
        batch_id="catalog-test-001",
        selection_path=selection,
        build_report_path=report,
        release_manifest_path=manifest,
        visual_review_paths=[review],
        worker_id="release-review-reconciler",
        spec_root=tmp_path / "specs",
    )
    replay = reconcile_reviewed_release(
        ledger,
        batch_id="catalog-test-001",
        selection_path=selection,
        build_report_path=report,
        release_manifest_path=manifest,
        visual_review_paths=[review],
        worker_id="release-review-reconciler",
        spec_root=tmp_path / "specs",
    )

    item = ledger.get_item(catalog_id)
    assert item is not None
    assert item.stage is Stage.REVIEW_APPROVED
    assert item.qa_evidence_hash
    assert item.review_evidence_hash
    assert result["transitions"] == {
        "qa_passed": 1,
        "rendered": 1,
        "review_approved": 1,
    }
    assert replay["transitions"] == {}
    assert replay["unchanged"] == [catalog_id]
    assert result["renderTheme"] == RENDER_THEME
    assert json.loads(review.read_text(encoding="utf-8"))["renderTheme"] == RENDER_THEME
    batch = ledger.get_batch("catalog-test-001")
    assert batch is not None
    selection_payload = json.loads(selection.read_text(encoding="utf-8"))
    canonical_selection = json.dumps(
        selection_payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    assert batch.source_commit == "c" * 40
    assert batch.selection_digest == hashlib.sha256(canonical_selection).hexdigest()
    assert batch.build_report_hash == hashlib.sha256(report.read_bytes()).hexdigest()
    assert batch.release_manifest_hash == hashlib.sha256(
        manifest.read_bytes()
    ).hexdigest()

    frozen = ledger.freeze_batch(
        batch_id="catalog-test-001",
        idempotency_key="freeze:catalog-test-001",
    )
    assert frozen.batch.status is BatchStatus.FROZEN
    frozen_item = frozen.batch.manifest["items"][0]
    assert frozen_item["qa_evidence_hash"] == item.qa_evidence_hash
    assert frozen_item["review_evidence_hash"] == item.review_evidence_hash
    frozen_path = tmp_path / "frozen-ledger-manifest.json"
    frozen_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "batchId": frozen.batch.batch_id,
                "targetCount": frozen.batch.target_count,
                "baseCommit": frozen.batch.base_commit,
                "rendererCommit": frozen.batch.renderer_commit,
                "sourceCommit": frozen.batch.source_commit,
                "selectionDigest": frozen.batch.selection_digest,
                "buildReportHash": frozen.batch.build_report_hash,
                "releaseManifestHash": frozen.batch.release_manifest_hash,
                "status": frozen.batch.status.value,
                "frozenDigest": frozen.batch.frozen_digest,
                "frozenAt": frozen.batch.frozen_at,
                "manifest": frozen.batch.manifest,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    validated_release = validate_release_manifest(
        manifest,
        asset_root=manifest.parent,
    )
    assert validated_release.render_theme == RENDER_THEME
    assert validated_release.summary()["renderTheme"] == RENDER_THEME
    validated_attestation = validate_frozen_ledger_attestation(
        frozen_path,
        release=validated_release,
    )
    assert validated_attestation.frozen_digest == frozen.batch.frozen_digest
    assert validated_attestation.release_manifest_hash == hashlib.sha256(
        manifest.read_bytes()
    ).hexdigest()
    validate_frozen_evidence_files(
        attestation=validated_attestation,
        release=validated_release,
        build_report_path=report,
    )

    review_payload = json.loads(review.read_text(encoding="utf-8"))
    review_payload.pop("renderTheme")
    _write_json(review, review_payload)
    with pytest.raises(ManifestValidationError, match="renderTheme must be present"):
        validate_frozen_evidence_files(
            attestation=validated_attestation,
            release=validated_release,
            build_report_path=report,
        )


def test_release_manifest_keeps_historical_theme_absence_readable(
    tmp_path: Path,
) -> None:
    _, _, _, manifest, _, _ = _build_reviewed_fixture(tmp_path)
    manifest_payload = json.loads(manifest.read_text(encoding="utf-8"))
    manifest_payload.pop("renderTheme")
    historical_manifest = manifest.parent / "historical-release.json"
    _write_json(historical_manifest, manifest_payload)

    validated = validate_release_manifest(
        historical_manifest,
        asset_root=manifest.parent,
    )

    assert validated.render_theme is None
    assert "renderTheme" not in validated.summary()


def test_reconcile_rejects_theme_mismatch_before_ledger_changes(
    tmp_path: Path,
) -> None:
    ledger, selection, report, manifest, review, catalog_id = (
        _build_reviewed_fixture(tmp_path)
    )
    build_report = json.loads(report.read_text(encoding="utf-8"))
    build_report["renderTheme"] = get_theme("legacy-navy-orange-v1").provenance()
    _write_json(report, build_report)
    _refresh_review_build_hash(review, report)

    with pytest.raises(ReviewedReleaseError, match="does not match selection"):
        reconcile_reviewed_release(
            ledger,
            batch_id="catalog-test-001",
            selection_path=selection,
            build_report_path=report,
            release_manifest_path=manifest,
            visual_review_paths=[review],
            worker_id="release-review-reconciler",
            spec_root=tmp_path / "specs",
        )

    assert ledger.get_item(catalog_id).stage is Stage.SPEC_READY


def test_reconcile_rejects_incomplete_page_review_before_ledger_changes(
    tmp_path: Path,
) -> None:
    ledger, selection, report, manifest, review, catalog_id = (
        _build_reviewed_fixture(tmp_path)
    )
    payload = json.loads(review.read_text(encoding="utf-8"))
    payload["items"][0]["pagesReviewed"] = []
    review.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ReviewedReleaseError, match="every page exactly once"):
        reconcile_reviewed_release(
            ledger,
            batch_id="catalog-test-001",
            selection_path=selection,
            build_report_path=report,
            release_manifest_path=manifest,
            visual_review_paths=[review],
            worker_id="release-review-reconciler",
            spec_root=tmp_path / "specs",
        )

    assert ledger.get_item(catalog_id).stage is Stage.SPEC_READY


def test_reconcile_rejects_changed_pdf_bytes_before_ledger_changes(
    tmp_path: Path,
) -> None:
    ledger, selection, report, manifest, review, catalog_id = (
        _build_reviewed_fixture(tmp_path)
    )
    build_report = json.loads(report.read_text(encoding="utf-8"))
    pdf_path = report.parent / build_report["results"][0]["pdf"]["sourcePath"]
    pdf_path.write_bytes(pdf_path.read_bytes() + b"\nchanged")

    with pytest.raises(ReviewedReleaseError, match="bytes do not match sha256"):
        reconcile_reviewed_release(
            ledger,
            batch_id="catalog-test-001",
            selection_path=selection,
            build_report_path=report,
            release_manifest_path=manifest,
            visual_review_paths=[review],
            worker_id="release-review-reconciler",
            spec_root=tmp_path / "specs",
        )

    assert ledger.get_item(catalog_id).stage is Stage.SPEC_READY


def test_reconcile_rejects_forged_passing_build_with_failed_qa(
    tmp_path: Path,
) -> None:
    ledger, selection, report, manifest, review, catalog_id = (
        _build_reviewed_fixture(tmp_path)
    )
    build_report = json.loads(report.read_text(encoding="utf-8"))
    result = build_report["results"][0]
    qa_path = report.parent / result["qaPath"]
    qa_evidence = json.loads(qa_path.read_text(encoding="utf-8"))
    qa_evidence["pdfQa"]["ok"] = False
    qa_path.write_text(json.dumps(qa_evidence) + "\n", encoding="utf-8")
    result["qaSha256"] = hashlib.sha256(qa_path.read_bytes()).hexdigest()
    report.write_text(json.dumps(build_report) + "\n", encoding="utf-8")

    review_payload = json.loads(review.read_text(encoding="utf-8"))
    review_payload["buildReportSha256"] = hashlib.sha256(
        report.read_bytes()
    ).hexdigest()
    review.write_text(json.dumps(review_payload) + "\n", encoding="utf-8")

    with pytest.raises(ReviewedReleaseError, match="PDF QA evidence is not clean"):
        reconcile_reviewed_release(
            ledger,
            batch_id="catalog-test-001",
            selection_path=selection,
            build_report_path=report,
            release_manifest_path=manifest,
            visual_review_paths=[review],
            worker_id="release-review-reconciler",
            spec_root=tmp_path / "specs",
        )

    assert ledger.get_item(catalog_id).stage is Stage.SPEC_READY


@pytest.mark.parametrize(
    ("field", "message"),
    [
        ("baseCommit", "baseCommit does not match"),
        ("rendererCommit", "rendererCommit does not match"),
    ],
)
def test_reconcile_rejects_batch_commit_mismatch_before_ledger_changes(
    tmp_path: Path,
    field: str,
    message: str,
) -> None:
    ledger, selection, report, manifest, review, catalog_id = (
        _build_reviewed_fixture(tmp_path)
    )
    build_report = json.loads(report.read_text(encoding="utf-8"))
    build_report[field] = "d" * 40
    _write_json(report, build_report)
    _refresh_review_build_hash(review, report)

    with pytest.raises(ReviewedReleaseError, match=message):
        reconcile_reviewed_release(
            ledger,
            batch_id="catalog-test-001",
            selection_path=selection,
            build_report_path=report,
            release_manifest_path=manifest,
            visual_review_paths=[review],
            worker_id="release-review-reconciler",
            spec_root=tmp_path / "specs",
        )

    assert ledger.get_item(catalog_id).stage is Stage.SPEC_READY
    assert ledger.get_batch("catalog-test-001").source_commit is None


def test_reconcile_rejects_release_manifest_asset_substitution(
    tmp_path: Path,
) -> None:
    ledger, selection, report, manifest, review, catalog_id = (
        _build_reviewed_fixture(tmp_path)
    )
    manifest_payload = json.loads(manifest.read_text(encoding="utf-8"))
    manifest_payload["forms"][0]["pdf"]["objectPath"] = (
        "releases/catalog-test-001/assets/field_service/substituted.pdf"
    )
    _write_json(manifest, manifest_payload)
    build_report = json.loads(report.read_text(encoding="utf-8"))
    build_report["releaseManifestSha256"] = hashlib.sha256(
        manifest.read_bytes()
    ).hexdigest()
    _write_json(report, build_report)
    _refresh_review_build_hash(review, report)

    with pytest.raises(ReviewedReleaseError, match="does not exactly match"):
        reconcile_reviewed_release(
            ledger,
            batch_id="catalog-test-001",
            selection_path=selection,
            build_report_path=report,
            release_manifest_path=manifest,
            visual_review_paths=[review],
            worker_id="release-review-reconciler",
            spec_root=tmp_path / "specs",
        )

    assert ledger.get_item(catalog_id).stage is Stage.SPEC_READY
    assert ledger.get_batch("catalog-test-001").source_commit is None


def test_reconcile_recovers_expired_crash_claim_with_a_new_fence(
    tmp_path: Path,
) -> None:
    clock = FakeClock()
    ledger, selection, report, manifest, review, catalog_id = (
        _build_reviewed_fixture(tmp_path, clock=clock)
    )
    report_hash = hashlib.sha256(report.read_bytes()).hexdigest()
    old_claim_key = (
        f"catalog-test-001:{catalog_id}:render_claimed:{report_hash}:claim"
    )
    crashed_lease = ledger.claim_next(
        worker_id="release-review-reconciler",
        claimed_stage=Stage.RENDER_CLAIMED,
        lease_seconds=1,
        batch_id="catalog-test-001",
        catalog_id=catalog_id,
        idempotency_key=old_claim_key,
    )
    assert crashed_lease is not None
    clock.advance(2)

    result = reconcile_reviewed_release(
        ledger,
        batch_id="catalog-test-001",
        selection_path=selection,
        build_report_path=report,
        release_manifest_path=manifest,
        visual_review_paths=[review],
        worker_id="release-review-reconciler",
        spec_root=tmp_path / "specs",
        lease_seconds=1,
    )

    item = ledger.get_item(catalog_id)
    assert item is not None
    assert item.stage is Stage.REVIEW_APPROVED
    assert item.fence_epoch > crashed_lease.fence_epoch
    assert result["transitions"]["rendered"] == 1
