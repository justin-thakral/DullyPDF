"""Command-line entry point for rendering declarative catalog form specs."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="DullyPDF high-value form factory")
    subparsers = parser.add_subparsers(dest="command", required=True)

    render_parser = subparsers.add_parser("render", help="Render one or more JSON specs")
    render_parser.add_argument("specs", nargs="+", help="JSON files or directories")
    render_parser.add_argument("--output-root", required=True)

    validate_parser = subparsers.add_parser("validate-spec", help="Validate JSON specs")
    validate_parser.add_argument("specs", nargs="+", help="JSON files or directories")

    qa_parser = subparsers.add_parser(
        "qa-spec",
        help="Run workflow-depth and duplicate-content QA",
    )
    qa_parser.add_argument("specs", nargs="+", help="JSON files or directories")
    qa_parser.add_argument("--output")

    seed_parser = subparsers.add_parser(
        "seed-ledger",
        help="Seed the canonical first-party work queue",
    )
    seed_parser.add_argument("--ledger", required=True)
    seed_parser.add_argument(
        "--catalog-data",
        default="frontend/src/config/formCatalogData.mjs",
    )
    seed_parser.add_argument(
        "--local-registry",
        default="form_catalog/local_generated_forms.json",
    )

    status_parser = subparsers.add_parser(
        "status",
        help="Summarize durable work-queue stages",
    )
    status_parser.add_argument("--ledger", required=True)

    claim_spec_parser = subparsers.add_parser(
        "claim-spec",
        help="Claim one batch specification with a fenced runtime capability",
    )
    claim_spec_parser.add_argument("--ledger", required=True)
    claim_spec_parser.add_argument("--batch-id", required=True)
    claim_spec_parser.add_argument("--worker-id", required=True)
    claim_spec_parser.add_argument("--lease-seconds", type=float, default=3600)
    claim_spec_parser.add_argument("--idempotency-key", required=True)
    claim_spec_parser.add_argument("--output", required=True)
    claim_spec_parser.add_argument("--catalog-id")

    heartbeat_parser = subparsers.add_parser(
        "heartbeat-claim",
        help="Extend an active fenced worker claim",
    )
    heartbeat_parser.add_argument("--ledger", required=True)
    heartbeat_parser.add_argument("--claim", required=True)
    heartbeat_parser.add_argument("--lease-seconds", type=float, default=3600)

    complete_spec_parser = subparsers.add_parser(
        "complete-spec",
        help="Validate and complete a claimed specification",
    )
    complete_spec_parser.add_argument("--ledger", required=True)
    complete_spec_parser.add_argument("--claim", required=True)
    complete_spec_parser.add_argument("--spec", required=True)
    complete_spec_parser.add_argument("--idempotency-key", required=True)

    fail_claim_parser = subparsers.add_parser(
        "fail-claim",
        help="Release an active worker claim as retryable or blocked",
    )
    fail_claim_parser.add_argument("--ledger", required=True)
    fail_claim_parser.add_argument("--claim", required=True)
    fail_claim_parser.add_argument("--error", required=True)
    fail_claim_parser.add_argument("--retryable", action="store_true")
    fail_claim_parser.add_argument("--retry-delay-seconds", type=float, default=0)
    fail_claim_parser.add_argument("--idempotency-key", required=True)

    register_parser = subparsers.add_parser(
        "register-specs",
        help="Reconcile existing reviewed specs through exact fenced claims",
    )
    register_parser.add_argument("specs", nargs="+", help="JSON files or directories")
    register_parser.add_argument("--ledger", required=True)
    register_parser.add_argument("--batch-id", required=True)
    register_parser.add_argument("--worker-id", required=True)
    register_parser.add_argument("--claim-root", required=True)
    register_parser.add_argument("--lease-seconds", type=float, default=900)

    plan_parser = subparsers.add_parser(
        "plan-batch",
        help="Create a deterministic tracked release selection",
    )
    plan_parser.add_argument("--release-id", required=True)
    plan_parser.add_argument("--target-count", type=int, default=1000)
    plan_parser.add_argument("--output", required=True)
    plan_parser.add_argument(
        "--catalog-data",
        default="frontend/src/config/formCatalogData.mjs",
    )
    plan_parser.add_argument(
        "--local-registry",
        default="form_catalog/local_generated_forms.json",
    )

    build_parser = subparsers.add_parser(
        "build-release",
        help="Render and validate every asset in a tracked selection",
    )
    build_parser.add_argument("--selection", required=True)
    build_parser.add_argument("--spec-root", default="form_catalog_specs/candidates")
    build_parser.add_argument("--output-root", required=True)
    build_parser.add_argument("--source-commit", required=True)
    build_parser.add_argument("--base-commit", required=True)
    build_parser.add_argument("--renderer-commit", required=True)
    build_parser.add_argument("--previous-release-id")
    build_parser.add_argument("--created-at")
    build_parser.add_argument("--workers", type=int, default=8)

    review_template_parser = subparsers.add_parser(
        "prepare-visual-review",
        help="Create a pending page-review receipt for an exact release build",
    )
    review_template_parser.add_argument("--build-report", required=True)
    review_template_parser.add_argument("--reviewer", required=True)
    review_template_parser.add_argument("--output", required=True)

    reviewed_release_parser = subparsers.add_parser(
        "reconcile-reviewed-release",
        help="Bind final build and visual-review evidence through fenced stages",
    )
    reviewed_release_parser.add_argument("--ledger", required=True)
    reviewed_release_parser.add_argument("--batch-id", required=True)
    reviewed_release_parser.add_argument("--selection", required=True)
    reviewed_release_parser.add_argument("--build-report", required=True)
    reviewed_release_parser.add_argument("--manifest", required=True)
    reviewed_release_parser.add_argument(
        "--visual-review",
        action="append",
        required=True,
    )
    reviewed_release_parser.add_argument("--worker-id", required=True)
    reviewed_release_parser.add_argument(
        "--spec-root",
        default="form_catalog_specs/candidates",
    )
    reviewed_release_parser.add_argument("--lease-seconds", type=float, default=900)

    freeze_batch_parser = subparsers.add_parser(
        "freeze-batch",
        help="Freeze an exact reviewed batch and write its immutable ledger manifest",
    )
    freeze_batch_parser.add_argument("--ledger", required=True)
    freeze_batch_parser.add_argument("--batch-id", required=True)
    freeze_batch_parser.add_argument("--idempotency-key", required=True)
    freeze_batch_parser.add_argument("--output", required=True)

    open_batch_parser = subparsers.add_parser(
        "open-batch",
        help="Bind a tracked release selection to the work ledger",
    )
    open_batch_parser.add_argument("--ledger", required=True)
    open_batch_parser.add_argument("--selection", required=True)
    open_batch_parser.add_argument("--base-commit", required=True)
    open_batch_parser.add_argument("--renderer-commit", required=True)

    inspect_retarget_parser = subparsers.add_parser(
        "inspect-open-batch-retarget",
        help="Emit the exact read-only fence for an open-batch source retarget",
    )
    inspect_retarget_parser.add_argument("--ledger", required=True)
    inspect_retarget_parser.add_argument("--selection", required=True)

    retarget_parser = subparsers.add_parser(
        "retarget-open-batch-source",
        help="Atomically retarget an evidence-free spec-ready batch to source HEAD",
    )
    retarget_parser.add_argument("--ledger", required=True)
    retarget_parser.add_argument("--selection", required=True)
    retarget_parser.add_argument("--batch-id", required=True)
    retarget_parser.add_argument("--expected-selection-digest", required=True)
    retarget_parser.add_argument("--expected-base-commit", required=True)
    retarget_parser.add_argument("--expected-renderer-commit", required=True)
    retarget_parser.add_argument("--expected-batch-version", required=True, type=int)
    retarget_parser.add_argument("--expected-state-digest", required=True)
    retarget_parser.add_argument("--new-source-commit", required=True)
    retarget_parser.add_argument("--actor", required=True)
    retarget_parser.add_argument("--idempotency-key", required=True)

    activation_parser = subparsers.add_parser(
        "prepare-activation",
        help="Merge a staged release into the cumulative frontend contract",
    )
    activation_parser.add_argument("--manifest", required=True)
    activation_parser.add_argument(
        "--current-active",
        default="form_catalog_releases/active.json",
    )
    activation_parser.add_argument("--activated-at", required=True)
    activation_parser.add_argument("--output", required=True)

    active_mapping_parser = subparsers.add_parser(
        "verify-active-mapping",
        help=(
            "Prove the tracked active contract, generated catalog module, and "
            "current release manifest agree exactly"
        ),
    )
    active_mapping_parser.add_argument(
        "--active-release",
        default="form_catalog_releases/active.json",
    )
    active_mapping_parser.add_argument(
        "--form-catalog-data",
        default="frontend/src/config/formCatalogData.mjs",
    )
    active_mapping_parser.add_argument("--manifest")
    active_mapping_parser.add_argument("--repo-root", default=".")
    active_mapping_parser.add_argument("--git-active-reference")
    active_mapping_parser.add_argument("--git-data-reference")
    active_mapping_parser.add_argument("--expected-git-commit")
    active_mapping_parser.add_argument("--expected-report")
    active_mapping_parser.add_argument("--output", required=True)

    sample_parser = subparsers.add_parser(
        "plan-samples",
        help="Create reproducible random and worst-case live samples",
    )
    sample_parser.add_argument("--selection", required=True)
    sample_parser.add_argument("--build-report", required=True)
    sample_parser.add_argument("--manifest", required=True)
    sample_parser.add_argument("--random-count", type=int, default=10)
    sample_parser.add_argument("--output", required=True)

    live_parser = subparsers.add_parser(
        "validate-live",
        help="Verify sampled catalog pages and immutable assets after deployment",
    )
    live_parser.add_argument("--sample-plan", required=True)
    live_parser.add_argument("--site-origin", action="append", required=True)
    live_parser.add_argument("--asset-base-url", action="append", required=True)
    live_parser.add_argument("--hosting-version", required=True)
    live_parser.add_argument("--timeout-seconds", type=float, default=30)
    live_parser.add_argument("--output", required=True)

    hosting_snapshot_parser = subparsers.add_parser(
        "snapshot-hosting",
        help="Capture the exact Firebase Hosting live version before deployment",
    )
    hosting_snapshot_parser.add_argument("--project", required=True)
    hosting_snapshot_parser.add_argument("--site", required=True)
    hosting_snapshot_parser.add_argument("--output", required=True)

    hosting_evidence_parser = subparsers.add_parser(
        "create-hosting-evidence",
        help="Bind a Firebase deploy result to the live catalog release",
    )
    hosting_evidence_parser.add_argument("--active-release", required=True)
    hosting_evidence_parser.add_argument(
        "--active-mapping-evidence",
        required=True,
    )
    hosting_evidence_parser.add_argument(
        "--form-catalog-data",
        required=True,
    )
    hosting_evidence_parser.add_argument(
        "--release-manifest",
        required=True,
    )
    hosting_evidence_parser.add_argument("--before-snapshot", required=True)
    hosting_evidence_parser.add_argument("--deploy-result", required=True)
    hosting_evidence_parser.add_argument("--project", required=True)
    hosting_evidence_parser.add_argument("--site", required=True)
    hosting_evidence_parser.add_argument("--site-origin", action="append", required=True)
    hosting_evidence_parser.add_argument("--deployment-commit", required=True)
    hosting_evidence_parser.add_argument("--workflow-run-id", required=True)
    hosting_evidence_parser.add_argument("--workflow-run-attempt", required=True)
    hosting_evidence_parser.add_argument("--output", required=True)

    rollback_parser = subparsers.add_parser(
        "rollback-hosting",
        help=(
            "Create and verify a new live release serving the recorded rollback "
            "version while proving the old catalog pointer stayed unchanged"
        ),
    )
    rollback_parser.add_argument("--hosting-evidence", required=True)
    rollback_parser.add_argument("--previous-release-id")
    rollback_parser.add_argument("--pointer-object-url", required=True)
    rollback_parser.add_argument("--lock-owner", required=True)
    rollback_parser.add_argument("--lock-generation", required=True)
    rollback_parser.add_argument("--lock-state-file", required=True)
    rollback_parser.add_argument("--trigger-stage", required=True)
    rollback_parser.add_argument("--trigger-exit-code", required=True, type=int)
    rollback_parser.add_argument("--confirm-attempts", type=int, default=10)
    rollback_parser.add_argument(
        "--confirm-interval-seconds",
        type=float,
        default=2,
    )
    rollback_parser.add_argument("--output", required=True)

    pointer_snapshot_parser = subparsers.add_parser(
        "snapshot-catalog-pointer",
        help="Capture the generation-bound production catalog pointer identity",
    )
    pointer_snapshot_parser.add_argument("--project", required=True)
    pointer_snapshot_parser.add_argument("--object-url", required=True)
    pointer_snapshot_parser.add_argument("--output", required=True)
    return parser.parse_args()


def discover_specs(values: list[str]) -> list[Path]:
    paths: list[Path] = []
    for value in values:
        path = Path(value)
        if path.is_dir():
            paths.extend(sorted(path.rglob("*.json")))
        else:
            paths.append(path)
    return sorted(set(path.resolve() for path in paths))


def main() -> int:
    args = parse_args()
    if args.command == "verify-active-mapping":
        from .active_mapping import (
            build_active_mapping_evidence,
            verify_expected_active_mapping_evidence,
            write_active_mapping_evidence,
        )

        payload = build_active_mapping_evidence(
            active_release_path=args.active_release,
            form_catalog_data_path=args.form_catalog_data,
            manifest_path=args.manifest,
            repo_root=args.repo_root,
            git_active_reference_path=args.git_active_reference,
            git_data_reference_path=args.git_data_reference,
            expected_git_commit=args.expected_git_commit,
        )
        if args.expected_report:
            verify_expected_active_mapping_evidence(
                payload,
                args.expected_report,
            )
        write_active_mapping_evidence(args.output, payload)
        print(
            json.dumps(
                {
                    "output": str(Path(args.output).resolve()),
                    "release_id": payload["releaseId"],
                    "active_replacement_count": payload[
                        "activeReplacementCount"
                    ],
                    "current_release_replacement_count": payload[
                        "currentReleaseReplacementCount"
                    ],
                    "active_mapping_digest": payload["activeMappingDigest"],
                },
                indent=2,
            )
        )
        return 0

    if args.command == "rollback-hosting":
        from .hosting_rollback import (
            rollback_failed_hosting_release,
            write_rollback_receipt,
        )

        payload = rollback_failed_hosting_release(
            hosting_evidence_path=args.hosting_evidence,
            previous_release_id=args.previous_release_id,
            pointer_object_url=args.pointer_object_url,
            lock_owner=args.lock_owner,
            lock_generation=args.lock_generation,
            lock_state_path=args.lock_state_file,
            trigger_stage=args.trigger_stage,
            trigger_exit_code=args.trigger_exit_code,
            confirm_attempts=args.confirm_attempts,
            confirm_interval_seconds=args.confirm_interval_seconds,
        )
        write_rollback_receipt(args.output, payload)
        print(
            json.dumps(
                {
                    "output": str(Path(args.output).resolve()),
                    "release_id": payload["releaseId"],
                    "rollback_action": payload["rollbackAction"],
                    "rollback_hosting_version": payload[
                        "rollbackHostingVersion"
                    ],
                },
                indent=2,
            )
        )
        return 0

    if args.command == "snapshot-catalog-pointer":
        from .hosting_evidence import write_json as write_hosting_json
        from .hosting_rollback import GcloudPointerReader, pointer_snapshot_as_dict

        payload = pointer_snapshot_as_dict(
            GcloudPointerReader(
                project_id=args.project,
                object_url=args.object_url,
            ).snapshot()
        )
        write_hosting_json(args.output, payload)
        print(
            json.dumps(
                {
                    "output": str(Path(args.output).resolve()),
                    "exists": payload["exists"],
                    "release_id": payload["releaseId"],
                    "generation": payload["generation"],
                },
                indent=2,
            )
        )
        return 0

    if args.command == "snapshot-hosting":
        from .hosting_evidence import capture_live_snapshot, write_json as write_hosting_json

        payload = capture_live_snapshot(
            project_id=args.project,
            site=args.site,
        )
        write_hosting_json(args.output, payload)
        print(
            json.dumps(
                {
                    "output": str(Path(args.output).resolve()),
                    "hosting_version": payload["hostingVersion"],
                },
                indent=2,
            )
        )
        return 0

    if args.command == "create-hosting-evidence":
        from .hosting_evidence import (
            build_hosting_evidence,
            write_json as write_hosting_json,
        )

        payload = build_hosting_evidence(
            active_release_path=args.active_release,
            active_mapping_evidence_path=args.active_mapping_evidence,
            form_catalog_data_path=args.form_catalog_data,
            release_manifest_path=args.release_manifest,
            before_snapshot_path=args.before_snapshot,
            deploy_result_path=args.deploy_result,
            project_id=args.project,
            site=args.site,
            site_origins=args.site_origin,
            deployment_commit=args.deployment_commit,
            workflow_run_id=args.workflow_run_id,
            workflow_run_attempt=args.workflow_run_attempt,
        )
        write_hosting_json(args.output, payload)
        print(
            json.dumps(
                {
                    "output": str(Path(args.output).resolve()),
                    "release_id": payload["releaseId"],
                    "hosting_version": payload["hostingVersion"],
                    "rollback_hosting_version": payload["rollbackHostingVersion"],
                },
                indent=2,
            )
        )
        return 0

    if args.command == "validate-live":
        from .live_validation import validate_live_samples, write_live_report

        payload = validate_live_samples(
            sample_plan_path=args.sample_plan,
            site_origins=args.site_origin,
            asset_base_urls=args.asset_base_url,
            hosting_version=args.hosting_version,
            timeout_seconds=args.timeout_seconds,
        )
        write_live_report(args.output, payload)
        print(
            json.dumps(
                {
                    "output": str(Path(args.output).resolve()),
                    "release_id": payload["releaseId"],
                    "sample_count": payload["sampleCount"],
                    "passed": payload["ok"],
                },
                indent=2,
            )
        )
        return 0 if payload["ok"] else 1

    if args.command == "prepare-visual-review":
        from .reviewed_release import (
            build_visual_review_template,
            write_visual_review_template,
        )

        payload = build_visual_review_template(
            build_report_path=args.build_report,
            reviewer=args.reviewer,
        )
        output = write_visual_review_template(args.output, payload)
        print(
            json.dumps(
                {
                    "output": str(output),
                    "release_id": payload["releaseId"],
                    "count": len(payload["items"]),
                    "passed": payload["passed"],
                },
                indent=2,
            )
        )
        return 0

    if args.command == "reconcile-reviewed-release":
        from .ledger import CatalogFactoryLedger
        from .reviewed_release import reconcile_reviewed_release

        payload = reconcile_reviewed_release(
            CatalogFactoryLedger(args.ledger),
            batch_id=args.batch_id,
            selection_path=args.selection,
            build_report_path=args.build_report,
            release_manifest_path=args.manifest,
            visual_review_paths=args.visual_review,
            worker_id=args.worker_id,
            spec_root=args.spec_root,
            lease_seconds=args.lease_seconds,
        )
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "freeze-batch":
        from .ledger import CatalogFactoryLedger

        result = CatalogFactoryLedger(args.ledger).freeze_batch(
            batch_id=args.batch_id,
            idempotency_key=args.idempotency_key,
        )
        batch = result.batch
        payload = {
            "schemaVersion": 1,
            "batchId": batch.batch_id,
            "targetCount": batch.target_count,
            "baseCommit": batch.base_commit,
            "rendererCommit": batch.renderer_commit,
            "sourceCommit": batch.source_commit,
            "selectionDigest": batch.selection_digest,
            "buildReportHash": batch.build_report_hash,
            "releaseManifestHash": batch.release_manifest_hash,
            "status": batch.status.value,
            "frozenDigest": batch.frozen_digest,
            "frozenAt": batch.frozen_at,
            "manifest": batch.manifest,
        }
        output = Path(args.output).expanduser().resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            json.dumps(
                {
                    "output": str(output),
                    "batch_id": batch.batch_id,
                    "target_count": batch.target_count,
                    "frozen_digest": batch.frozen_digest,
                    "idempotent_replay": result.idempotent_replay,
                },
                indent=2,
            )
        )
        return 0

    if args.command == "claim-spec":
        from .ledger import CatalogFactoryLedger
        from .worker_control import claim_spec

        result = claim_spec(
            CatalogFactoryLedger(args.ledger),
            batch_id=args.batch_id,
            worker_id=args.worker_id,
            lease_seconds=args.lease_seconds,
            idempotency_key=args.idempotency_key,
            output_path=args.output,
            catalog_id=args.catalog_id,
        )
        print(json.dumps(result or {"claim": None}, indent=2))
        return 0 if result is not None else 3

    if args.command == "heartbeat-claim":
        from .ledger import CatalogFactoryLedger
        from .worker_control import heartbeat_claim

        result = heartbeat_claim(
            CatalogFactoryLedger(args.ledger),
            claim_path=args.claim,
            lease_seconds=args.lease_seconds,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "complete-spec":
        from .ledger import CatalogFactoryLedger
        from .worker_control import complete_spec_claim

        result = complete_spec_claim(
            CatalogFactoryLedger(args.ledger),
            claim_path=args.claim,
            spec_path=args.spec,
            idempotency_key=args.idempotency_key,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "fail-claim":
        from .ledger import CatalogFactoryLedger
        from .worker_control import fail_claim

        result = fail_claim(
            CatalogFactoryLedger(args.ledger),
            claim_path=args.claim,
            error=args.error,
            retryable=args.retryable,
            retry_delay_seconds=args.retry_delay_seconds,
            idempotency_key=args.idempotency_key,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "register-specs":
        from .ledger import CatalogFactoryLedger
        from .worker_control import register_existing_specs

        result = register_existing_specs(
            CatalogFactoryLedger(args.ledger),
            batch_id=args.batch_id,
            worker_id=args.worker_id,
            spec_paths=discover_specs(args.specs),
            claim_root=args.claim_root,
            lease_seconds=args.lease_seconds,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "prepare-activation":
        from .activation import build_active_contract, write_active_contract

        payload = build_active_contract(
            manifest_path=args.manifest,
            current_active_path=args.current_active,
            activated_at=args.activated_at,
        )
        write_active_contract(args.output, payload)
        print(
            json.dumps(
                {
                    "output": str(Path(args.output).resolve()),
                    "release_id": payload["releaseId"],
                    "replacement_count": len(payload["replacements"]),
                },
                indent=2,
            )
        )
        return 0

    if args.command == "plan-samples":
        from .sampling import build_sample_plan, write_sample_plan

        payload = build_sample_plan(
            selection_path=args.selection,
            build_report_path=args.build_report,
            manifest_path=args.manifest,
            random_count=args.random_count,
        )
        write_sample_plan(args.output, payload)
        print(
            json.dumps(
                {
                    "output": str(Path(args.output).resolve()),
                    "release_id": payload["releaseId"],
                    "random_count": payload["randomCount"],
                    "http_sample_count": payload["httpSampleCount"],
                    "browser_canary_count": payload["browserCanaryCount"],
                },
                indent=2,
            )
        )
        return 0

    if args.command == "open-batch":
        from .batch_control import open_batch_from_plan
        from .ledger import CatalogFactoryLedger

        result = open_batch_from_plan(
            CatalogFactoryLedger(args.ledger),
            selection_path=args.selection,
            base_commit=args.base_commit,
            renderer_commit=args.renderer_commit,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "inspect-open-batch-retarget":
        from .batch_control import inspect_open_batch_retarget
        from .ledger import CatalogFactoryLedger

        result = inspect_open_batch_retarget(
            CatalogFactoryLedger(args.ledger),
            selection_path=args.selection,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "retarget-open-batch-source":
        from .batch_control import retarget_open_batch_from_plan
        from .ledger import CatalogFactoryLedger

        result = retarget_open_batch_from_plan(
            CatalogFactoryLedger(args.ledger),
            selection_path=args.selection,
            batch_id=args.batch_id,
            expected_selection_digest=args.expected_selection_digest,
            expected_base_commit=args.expected_base_commit,
            expected_renderer_commit=args.expected_renderer_commit,
            expected_batch_version=args.expected_batch_version,
            expected_state_digest=args.expected_state_digest,
            new_source_commit=args.new_source_commit,
            actor=args.actor,
            idempotency_key=args.idempotency_key,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "build-release":
        from .release_builder import build_release

        result = build_release(
            selection_path=args.selection,
            spec_root=args.spec_root,
            output_root=args.output_root,
            source_commit=args.source_commit,
            base_commit=args.base_commit,
            renderer_commit=args.renderer_commit,
            previous_release_id=args.previous_release_id,
            created_at=args.created_at,
            workers=args.workers,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "plan-batch":
        from .batch_plan import build_batch_plan, write_batch_plan
        from .catalog_source import build_candidates

        candidates, missing = build_candidates(
            frontend_catalog_path=args.catalog_data,
            local_registry_path=args.local_registry,
        )
        plan = build_batch_plan(
            release_id=args.release_id,
            candidates=candidates,
            target_count=args.target_count,
            frontend_catalog_path=args.catalog_data,
            local_registry_path=args.local_registry,
        )
        write_batch_plan(args.output, plan)
        print(
            json.dumps(
                {
                    "output": str(Path(args.output).resolve()),
                    "release_id": plan["releaseId"],
                    "selected": len(plan["items"]),
                    "summary": plan["summary"],
                    "catalog_defects_excluded": len(missing),
                },
                indent=2,
            )
        )
        return 0

    if args.command == "seed-ledger":
        from .catalog_source import build_candidates, seed_ledger
        from .ledger import CatalogFactoryLedger

        candidates, missing = build_candidates(
            frontend_catalog_path=args.catalog_data,
            local_registry_path=args.local_registry,
        )
        count = seed_ledger(CatalogFactoryLedger(args.ledger), candidates)
        print(
            json.dumps(
                {
                    "seeded": count,
                    "missing_count": len(missing),
                    "missing": [
                        {"section": section, "filename": filename}
                        for section, filename in missing
                    ],
                    "families": dict(
                        sorted(Counter(item.source_family for item in candidates).items())
                    ),
                    "risk_tiers": dict(
                        sorted(Counter(item.risk_tier for item in candidates).items())
                    ),
                },
                indent=2,
            )
        )
        return 0

    if args.command == "status":
        from .ledger import CatalogFactoryLedger

        items = CatalogFactoryLedger(args.ledger).list_items()
        print(
            json.dumps(
                {
                    "total": len(items),
                    "stages": dict(
                        sorted(Counter(item.stage.value for item in items).items())
                    ),
                    "batches": dict(
                        sorted(
                            Counter(item.batch_id or "unassigned" for item in items).items()
                        )
                    ),
                },
                indent=2,
            )
        )
        return 0

    spec_paths = discover_specs(args.specs)
    if not spec_paths:
        raise SystemExit("No JSON specs found.")

    if args.command == "qa-spec":
        from .spec_qa import validate_spec_batch

        report = validate_spec_batch(spec_paths)
        serialized = json.dumps(report, indent=2)
        if args.output:
            output = Path(args.output)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(serialized + "\n", encoding="utf-8")
        print(serialized)
        return 0 if report["passed"] else 1

    results: list[dict[str, str]] = []
    from .models import load_form_spec
    from .renderer import render_form

    for spec_path in spec_paths:
        spec = load_form_spec(spec_path)
        result = {"spec": str(spec_path), "catalog_id": spec.catalog_id}
        if args.command == "render":
            output = (
                Path(args.output_root)
                / spec.source_section
                / spec.source_filename
            )
            render_form(spec, output)
            result["output"] = str(output)
        results.append(result)
    print(json.dumps({"count": len(results), "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
