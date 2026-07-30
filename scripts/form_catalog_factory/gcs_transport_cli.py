"""Command-line boundary for scalable form-catalog GCS transport.

The storage SDK is imported only after argument validation so this module and
its ``--help`` output remain usable in dependency-light release environments.
Successful runs replace one local inventory report atomically; failures never
truncate or partially rewrite an existing report.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import sys
import tempfile
from types import ModuleType
from typing import Any, Mapping, Sequence


DEFAULT_MAX_WORKERS = 12
MIN_MAX_WORKERS = 1
MAX_MAX_WORKERS = 32
DEFAULT_PAGE_SIZE = 1000
MIN_PAGE_SIZE = 1
MAX_PAGE_SIZE = 1000
DEFAULT_TIMEOUT_SECONDS = 60

_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class GcsTransportCliError(RuntimeError):
    """The CLI could not safely produce a complete inventory report."""


class GcsTransportDependencyError(GcsTransportCliError):
    """The pinned Google Cloud Storage runtime is unavailable."""


def _bounded_integer(
    value: str,
    *,
    label: str,
    minimum: int,
    maximum: int | None = None,
) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"{label} must be an integer") from exc
    if parsed < minimum or (maximum is not None and parsed > maximum):
        bounds = (
            f"{minimum} through {maximum}"
            if maximum is not None
            else f"at least {minimum}"
        )
        raise argparse.ArgumentTypeError(f"{label} must be {bounds}")
    return parsed


def _max_workers(value: str) -> int:
    return _bounded_integer(
        value,
        label="--max-workers",
        minimum=MIN_MAX_WORKERS,
        maximum=MAX_MAX_WORKERS,
    )


def _page_size(value: str) -> int:
    return _bounded_integer(
        value,
        label="--page-size",
        minimum=MIN_PAGE_SIZE,
        maximum=MAX_PAGE_SIZE,
    )


def _timeout_seconds(value: str) -> int:
    return _bounded_integer(
        value,
        label="--timeout-seconds",
        minimum=1,
    )


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Stage or verify an immutable form-catalog GCS object plan and "
            "atomically write its exact inventory evidence."
        ),
    )
    parser.add_argument(
        "--action",
        choices=("stage", "verify"),
        required=True,
        help="Create-only upload plus verification, or verification only.",
    )
    parser.add_argument(
        "--plan",
        type=Path,
        required=True,
        help="Strict expected-object plan JSON path.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Inventory report JSON path.",
    )
    parser.add_argument(
        "--max-workers",
        type=_max_workers,
        default=DEFAULT_MAX_WORKERS,
        help=(
            "Maximum concurrent create-only uploads "
            f"({MIN_MAX_WORKERS}-{MAX_MAX_WORKERS})."
        ),
    )
    parser.add_argument(
        "--page-size",
        type=_page_size,
        default=DEFAULT_PAGE_SIZE,
        help=(
            "Object inventory page size "
            f"({MIN_PAGE_SIZE}-{MAX_PAGE_SIZE})."
        ),
    )
    parser.add_argument(
        "--timeout-seconds",
        type=_timeout_seconds,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Positive per-request timeout in seconds.",
    )
    return parser


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    return build_argument_parser().parse_args(argv)


def _load_transport_module() -> ModuleType:
    try:
        from . import gcs_transport
    except ModuleNotFoundError as exc:
        dependency = exc.name or ""
        if dependency == "google" or dependency.startswith("google."):
            raise GcsTransportDependencyError(
                "google-cloud-storage dependency is unavailable"
            ) from exc
        raise
    return gcs_transport


def _resolved(path: Path) -> Path:
    return path.expanduser().resolve(strict=False)


def _validate_output_destination(
    *,
    plan_path: Path,
    output_path: Path,
    plan: Any | None = None,
) -> None:
    output = _resolved(output_path)
    if output == _resolved(plan_path):
        raise GcsTransportCliError(
            "Inventory output must be separate from the expected-object plan"
        )
    if plan is not None and any(
        output == _resolved(item.source_path) for item in plan.objects
    ):
        raise GcsTransportCliError(
            "Inventory output must be separate from every upload source"
        )


def _atomic_write(path: Path, payload: bytes) -> None:
    """Replace ``path`` only after a sibling file contains durable full bytes."""

    destination = _resolved(path)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.",
        suffix=".tmp",
        dir=destination.parent,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as output:
            descriptor = -1
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        # Replacement is the only destination-content mutation. The following
        # directory fsync makes the rename durable across a host crash.
        os.replace(temporary_path, destination)
        directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
        directory_descriptor = os.open(destination.parent, directory_flags)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    except BaseException:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def _report_count(report: Mapping[str, Any], key: str) -> int:
    value = report.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise GcsTransportCliError(
            f"Successful inventory report has an invalid {key}"
        )
    return value


def _report_digest(report: Mapping[str, Any], key: str) -> str:
    value = report.get(key)
    if not isinstance(value, str) or not _SHA256_PATTERN.fullmatch(value):
        raise GcsTransportCliError(
            f"Successful inventory report has an invalid {key}"
        )
    return value


def _summary(action: str, report: Mapping[str, Any]) -> str:
    object_count = _report_count(report, "objectCount")
    page_count = _report_count(report, "pageCount")
    expected_digest = _report_digest(report, "expectedInventoryDigest")
    inventory_digest = _report_digest(report, "inventoryDigest")
    fields = [
        f"{action} ok",
        f"objects={object_count}",
        f"pages={page_count}",
    ]
    if action == "stage":
        created = _report_count(report, "createdObjectCount")
        existing = _report_count(report, "existingObjectCount")
        if created + existing != object_count:
            raise GcsTransportCliError(
                "Successful stage counts do not cover the exact inventory"
            )
        fields.extend((f"created={created}", f"existing={existing}"))
    fields.extend(
        (
            f"expected-digest={expected_digest}",
            f"inventory-digest={inventory_digest}",
        )
    )
    return " ".join(fields)


def execute(
    args: argparse.Namespace,
    *,
    transport_module: Any | None = None,
) -> str:
    """Run one transport action and return its path-free operator summary."""

    _validate_output_destination(
        plan_path=args.plan,
        output_path=args.output,
    )
    transport = (
        transport_module
        if transport_module is not None
        else _load_transport_module()
    )
    plan = transport.load_expected_object_plan(args.plan)
    _validate_output_destination(
        plan_path=args.plan,
        output_path=args.output,
        plan=plan,
    )

    if args.action == "stage":
        report = transport.stage_expected_objects(
            plan,
            max_workers=args.max_workers,
            page_size=args.page_size,
            timeout_seconds=args.timeout_seconds,
        )
    else:
        release_transport = transport.GcsReleaseTransport(
            plan,
            max_workers=args.max_workers,
            page_size=args.page_size,
            timeout_seconds=args.timeout_seconds,
        )
        report = release_transport.verify_inventory()

    # Bind the durable evidence to the requested operation. A shallow copy
    # preserves the transport's canonical object rows without mutating the
    # helper-owned result.
    evidence_report = dict(report)
    evidence_report["operation"] = args.action

    # Complete all validation and serialization before replacing prior
    # evidence. This keeps failures before os.replace non-destructive.
    summary = _summary(args.action, evidence_report)
    payload = transport.canonical_inventory_report_bytes(evidence_report)
    _atomic_write(args.output, payload)
    return summary


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        summary = execute(args)
    except GcsTransportDependencyError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        # Transport exceptions may contain local source or remote object paths.
        # The CLI surface intentionally emits only a stable error category.
        print(
            f"error: GCS transport failed ({type(exc).__name__})",
            file=sys.stderr,
        )
        return 1
    try:
        print(summary)
    except BrokenPipeError:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
