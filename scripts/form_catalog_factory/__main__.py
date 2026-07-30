"""Command-line entry point for rendering declarative catalog form specs."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path

from .activation import build_active_contract, write_active_contract
from .batch_control import open_batch_from_plan
from .batch_plan import build_batch_plan, write_batch_plan
from .catalog_source import build_candidates, seed_ledger
from .hosting_evidence import (
    build_hosting_evidence,
    capture_live_snapshot,
    write_json as write_hosting_json,
)
from .ledger import CatalogFactoryLedger
from .live_validation import validate_live_samples, write_live_report
from .models import load_form_spec
from .release_builder import build_release
from .renderer import render_form
from .sampling import build_sample_plan, write_sample_plan
from .spec_qa import validate_spec_batch
from .worker_control import (
    claim_spec,
    complete_spec_claim,
    fail_claim,
    heartbeat_claim,
    register_existing_specs,
)


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
    build_parser.add_argument("--previous-release-id")
    build_parser.add_argument("--created-at")
    build_parser.add_argument("--workers", type=int, default=8)

    open_batch_parser = subparsers.add_parser(
        "open-batch",
        help="Bind a tracked release selection to the work ledger",
    )
    open_batch_parser.add_argument("--ledger", required=True)
    open_batch_parser.add_argument("--selection", required=True)
    open_batch_parser.add_argument("--base-commit", required=True)
    open_batch_parser.add_argument("--renderer-commit", required=True)

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
    hosting_evidence_parser.add_argument("--before-snapshot", required=True)
    hosting_evidence_parser.add_argument("--deploy-result", required=True)
    hosting_evidence_parser.add_argument("--project", required=True)
    hosting_evidence_parser.add_argument("--site", required=True)
    hosting_evidence_parser.add_argument("--site-origin", action="append", required=True)
    hosting_evidence_parser.add_argument("--deployment-commit", required=True)
    hosting_evidence_parser.add_argument("--workflow-run-id", required=True)
    hosting_evidence_parser.add_argument("--workflow-run-attempt", required=True)
    hosting_evidence_parser.add_argument("--output", required=True)
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
    if args.command == "snapshot-hosting":
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
        payload = build_hosting_evidence(
            active_release_path=args.active_release,
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

    if args.command == "claim-spec":
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
        result = heartbeat_claim(
            CatalogFactoryLedger(args.ledger),
            claim_path=args.claim,
            lease_seconds=args.lease_seconds,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "complete-spec":
        result = complete_spec_claim(
            CatalogFactoryLedger(args.ledger),
            claim_path=args.claim,
            spec_path=args.spec,
            idempotency_key=args.idempotency_key,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "fail-claim":
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
        result = open_batch_from_plan(
            CatalogFactoryLedger(args.ledger),
            selection_path=args.selection,
            base_commit=args.base_commit,
            renderer_commit=args.renderer_commit,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "build-release":
        result = build_release(
            selection_path=args.selection,
            spec_root=args.spec_root,
            output_root=args.output_root,
            source_commit=args.source_commit,
            previous_release_id=args.previous_release_id,
            created_at=args.created_at,
            workers=args.workers,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "plan-batch":
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
        report = validate_spec_batch(spec_paths)
        serialized = json.dumps(report, indent=2)
        if args.output:
            output = Path(args.output)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(serialized + "\n", encoding="utf-8")
        print(serialized)
        return 0 if report["passed"] else 1

    results: list[dict[str, str]] = []
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
