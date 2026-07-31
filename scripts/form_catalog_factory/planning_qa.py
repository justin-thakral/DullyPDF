"""Lifecycle-scoped content QA for tracked release selections."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Sequence

from .release_builder import validate_release_selection_specs


VALIDATION_MODES = frozenset(
    {
        "current-policy",
        "immutable-legacy-schema",
        "pinned-policy-receipt",
    }
)
RELEASE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{4,79}$")


class PlanningQaError(RuntimeError):
    """A planning selection or its immutable QA binding is invalid."""


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_sha256(value: Any, *, name: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise PlanningQaError(f"{name} must be a lowercase SHA-256 digest")
    return value


def _load_object(path: Path, *, name: str) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PlanningQaError(f"Could not load {name} {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise PlanningQaError(f"{name} must be a JSON object: {path}")
    return payload


def _resolve_repository_path(
    value: Any,
    *,
    repository_root: Path,
    name: str,
) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise PlanningQaError(f"{name} must be a non-empty repository-relative path")
    raw = Path(value)
    if raw.is_absolute():
        raise PlanningQaError(f"{name} must be repository-relative")
    resolved = (repository_root / raw).resolve()
    try:
        resolved.relative_to(repository_root)
    except ValueError as exc:
        raise PlanningQaError(f"{name} escapes the repository root") from exc
    return resolved


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(payload, output, ensure_ascii=False, indent=2, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def validate_planning_qa_lifecycle(
    *,
    registry_path: str | Path,
    planning_root: str | Path,
    spec_root: str | Path,
    report_root: str | Path,
    repository_root: str | Path = ".",
) -> dict[str, Any]:
    """Validate exact historical bindings and QA only the current workset.

    Registry and discovery checks are O(n) in tracked selections. Current
    content QA retains the release validator's bounded pairwise comparison.
    Historical selections never inherit a future moving content policy.
    """

    repository = Path(repository_root).expanduser().resolve()
    registry_file = Path(registry_path).expanduser().resolve()
    planning_directory = Path(planning_root).expanduser().resolve()
    specs = Path(spec_root).expanduser().resolve()
    reports = Path(report_root).expanduser().resolve()
    registry = _load_object(registry_file, name="planning QA registry")
    if registry.get("schemaVersion") != 1:
        raise PlanningQaError("Planning QA registry has an unsupported schemaVersion")
    current_release_id = registry.get("currentPolicyReleaseId")
    if (
        not isinstance(current_release_id, str)
        or not RELEASE_ID_PATTERN.fullmatch(current_release_id)
    ):
        raise PlanningQaError(
            "Planning QA registry currentPolicyReleaseId is invalid"
        )
    raw_entries = registry.get("selections")
    if not isinstance(raw_entries, list) or not raw_entries:
        raise PlanningQaError("Planning QA registry selections must be non-empty")

    discovered = {
        path.resolve()
        for path in planning_directory.glob("*-selection.json")
        if path.is_file()
    }
    if not discovered:
        raise PlanningQaError("No tracked release selections were discovered")

    seen_paths: set[Path] = set()
    seen_release_ids: set[str] = set()
    normalized: list[dict[str, Any]] = []
    current_entries: list[dict[str, Any]] = []
    for index, raw_entry in enumerate(raw_entries):
        if not isinstance(raw_entry, dict):
            raise PlanningQaError(f"Registry selections[{index}] must be an object")
        release_id = raw_entry.get("releaseId")
        if (
            not isinstance(release_id, str)
            or not RELEASE_ID_PATTERN.fullmatch(release_id)
        ):
            raise PlanningQaError(
                f"Registry selections[{index}].releaseId is invalid"
            )
        if release_id in seen_release_ids:
            raise PlanningQaError(f"Duplicate registry releaseId {release_id!r}")
        seen_release_ids.add(release_id)
        selection_path = _resolve_repository_path(
            raw_entry.get("selectionPath"),
            repository_root=repository,
            name=f"selections[{index}].selectionPath",
        )
        if selection_path in seen_paths:
            raise PlanningQaError(
                f"Duplicate registry selectionPath {selection_path}"
            )
        seen_paths.add(selection_path)
        if selection_path not in discovered:
            raise PlanningQaError(
                f"Registry selection is not a discovered planning file: "
                f"{selection_path}"
            )
        expected_selection_hash = _validate_sha256(
            raw_entry.get("selectionSha256"),
            name=f"selections[{index}].selectionSha256",
        )
        actual_selection_hash = _sha256_file(selection_path)
        if actual_selection_hash != expected_selection_hash:
            raise PlanningQaError(
                f"Selection hash does not match its immutable registry binding: "
                f"{selection_path}"
            )
        selection = _load_object(selection_path, name="release selection")
        if selection.get("releaseId") != release_id:
            raise PlanningQaError(
                f"Selection releaseId does not match registry entry {release_id!r}"
            )
        mode = raw_entry.get("validationMode")
        if mode not in VALIDATION_MODES:
            raise PlanningQaError(
                f"Registry selection {release_id!r} has unsupported "
                f"validationMode {mode!r}"
            )
        if mode == "current-policy":
            theme = selection.get("renderTheme")
            if not isinstance(theme, dict) or not theme.get("id"):
                raise PlanningQaError(
                    f"Current-policy selection {release_id!r} has no render theme"
                )
            current_entries.append(raw_entry)
        elif mode == "immutable-legacy-schema":
            if selection.get("renderTheme") is not None:
                raise PlanningQaError(
                    f"Legacy schema-only selection {release_id!r} must be unthemed"
                )
        else:
            receipt_path = _resolve_repository_path(
                raw_entry.get("receiptPath"),
                repository_root=repository,
                name=f"selections[{index}].receiptPath",
            )
            expected_receipt_hash = _validate_sha256(
                raw_entry.get("receiptSha256"),
                name=f"selections[{index}].receiptSha256",
            )
            if not receipt_path.is_file():
                raise PlanningQaError(
                    f"Pinned QA receipt does not exist: {receipt_path}"
                )
            if _sha256_file(receipt_path) != expected_receipt_hash:
                raise PlanningQaError(
                    f"Pinned QA receipt hash does not match: {receipt_path}"
                )
            receipt = _load_object(receipt_path, name="pinned QA receipt")
            if (
                receipt.get("reportType")
                != "form-catalog-selection-spec-qa"
                or receipt.get("releaseId") != release_id
                or receipt.get("selectionSha256") != actual_selection_hash
                or receipt.get("passed") is not True
            ):
                raise PlanningQaError(
                    f"Pinned QA receipt is not a passing receipt for {release_id!r}"
                )
        normalized.append(
            {
                "releaseId": release_id,
                "selectionPath": selection_path.relative_to(repository).as_posix(),
                "selectionSha256": actual_selection_hash,
                "validationMode": mode,
            }
        )

    if seen_paths != discovered:
        unbound = sorted(path.as_posix() for path in discovered - seen_paths)
        raise PlanningQaError(
            f"Planning selections have no immutable QA registry binding: {unbound}"
        )
    if len(current_entries) != 1:
        raise PlanningQaError(
            "Planning QA registry must contain exactly one current-policy selection"
        )
    if current_entries[0].get("releaseId") != current_release_id:
        raise PlanningQaError(
            "currentPolicyReleaseId does not identify the current-policy entry"
        )

    current_path = _resolve_repository_path(
        current_entries[0]["selectionPath"],
        repository_root=repository,
        name="current selectionPath",
    )
    current_report = validate_release_selection_specs(
        selection_path=current_path,
        spec_root=specs,
    )
    reports.mkdir(parents=True, exist_ok=True)
    current_report_path = reports / f"{current_release_id}.json"
    _write_json(current_report_path, current_report)
    lifecycle = {
        "schemaVersion": 1,
        "reportType": "form-catalog-planning-qa-lifecycle",
        "registryPath": registry_file.relative_to(repository).as_posix(),
        "currentPolicyReleaseId": current_release_id,
        "selectionCount": len(normalized),
        "selections": sorted(normalized, key=lambda item: item["releaseId"]),
        "currentReportPath": current_report_path.as_posix(),
        "passed": current_report.get("passed") is True,
    }
    _write_json(reports / "planning-lifecycle.json", lifecycle)
    return lifecycle


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate lifecycle-scoped form-catalog planning QA",
    )
    parser.add_argument("--registry", required=True)
    parser.add_argument("--planning-root", required=True)
    parser.add_argument("--spec-root", required=True)
    parser.add_argument("--report-root", required=True)
    parser.add_argument("--repository-root", default=".")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        report = validate_planning_qa_lifecycle(
            registry_path=args.registry,
            planning_root=args.planning_root,
            spec_root=args.spec_root,
            report_root=args.report_root,
            repository_root=args.repository_root,
        )
    except PlanningQaError as exc:
        print(f"Planning QA lifecycle validation failed: {exc}")
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
