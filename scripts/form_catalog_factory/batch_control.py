"""Bind tracked release selections to the transactional worker ledger."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
from typing import Any

from .ledger import CatalogFactoryLedger, ConflictError, Stage


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


class BatchControlError(RuntimeError):
    """Raised when a tracked plan no longer matches the work ledger."""


def _canonical_digest(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _selection_catalog_ids(
    ledger: CatalogFactoryLedger,
    plan: dict[str, Any],
) -> tuple[list[str], list[str]]:
    catalog_ids: list[str] = []
    mismatches: list[str] = []
    for index, raw_item in enumerate(plan["items"]):
        if not isinstance(raw_item, dict):
            mismatches.append(f"items[{index}] is not an object")
            continue
        catalog_id = str(raw_item.get("catalogId") or "")
        item = ledger.get_item(catalog_id)
        if item is None:
            mismatches.append(f"{catalog_id or f'items[{index}]'}: missing from ledger")
            continue
        expected = {
            "sourceSection": item.section,
            "filename": item.filename,
            "slug": item.slug,
            "currentSha256": item.current_asset_hash,
        }
        for key, actual in expected.items():
            if raw_item.get(key) != actual:
                mismatches.append(
                    f"{catalog_id}: {key} changed from "
                    f"{raw_item.get(key)!r} to {actual!r}"
                )
        if item.ownership != "first_party":
            mismatches.append(f"{catalog_id}: ownership is {item.ownership!r}")
        catalog_ids.append(catalog_id)
    if len(catalog_ids) != len(set(catalog_ids)):
        mismatches.append("selection contains duplicate catalog IDs")
    return catalog_ids, mismatches


def _raise_selection_mismatches(mismatches: list[str]) -> None:
    if not mismatches:
        return
    preview = "; ".join(mismatches[:20])
    if len(mismatches) > 20:
        preview += f"; ... {len(mismatches) - 20} more"
    raise BatchControlError(f"Selection no longer matches ledger: {preview}")


def _new_batch_queue_mismatches(
    ledger: CatalogFactoryLedger,
    *,
    batch_id: str,
    catalog_ids: list[str],
) -> list[str]:
    """Reject stale selections before they can leave an empty batch behind."""

    existing_batch = ledger.get_batch(batch_id)
    if existing_batch is not None:
        existing_membership = {
            item.catalog_id for item in ledger.list_items(batch_id=batch_id)
        }
        # An exact existing membership is an idempotent read, not a new
        # assignment. This keeps schemaVersion 1 batch-1 plans replayable after
        # their items have advanced beyond the queue.
        if existing_membership == set(catalog_ids):
            return []

    mismatches: list[str] = []
    for catalog_id in catalog_ids:
        item = ledger.get_item(catalog_id)
        if item is None:
            mismatches.append(f"{catalog_id}: missing from ledger")
            continue
        if item.stage is not Stage.QUEUED or item.batch_id is not None:
            mismatches.append(
                f"{catalog_id}: new batch assignment requires stage='queued' "
                f"and batch_id=None; found stage={item.stage.value!r}, "
                f"batch_id={item.batch_id!r}"
            )
    return mismatches


def _run_git(
    repository_root: Path,
    arguments: list[str],
    *,
    text: bool = True,
) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *arguments],
        cwd=repository_root,
        check=False,
        capture_output=True,
        text=text,
    )


def _verify_retarget_git_source(
    *,
    repository_root: Path,
    selection_path: str | Path,
    base_commit: str,
    source_commit: str,
) -> None:
    """Require the retarget to name the current clean tracked source tree."""

    root = repository_root.expanduser().resolve()
    selection = Path(selection_path).expanduser().resolve()
    if not selection.is_relative_to(root):
        raise BatchControlError("Selection plan is outside the Git repository")
    relative_selection = selection.relative_to(root).as_posix()

    source_result = _run_git(
        root,
        ["rev-parse", "--verify", f"{source_commit}^{{commit}}"],
    )
    if source_result.returncode != 0:
        raise BatchControlError("new source commit is not a local Git commit")
    resolved_source = source_result.stdout.strip().lower()
    if resolved_source != source_commit.lower():
        raise BatchControlError(
            "new source commit must be the exact full Git object ID"
        )

    head_result = _run_git(root, ["rev-parse", "--verify", "HEAD^{commit}"])
    if (
        head_result.returncode != 0
        or head_result.stdout.strip().lower() != resolved_source
    ):
        raise BatchControlError("new source commit must equal the current Git HEAD")
    status_result = _run_git(root, ["status", "--porcelain", "--untracked-files=all"])
    if status_result.returncode != 0 or status_result.stdout:
        raise BatchControlError(
            "working tree must be completely clean before retargeting a batch"
        )

    tracked_result = _run_git(
        root,
        ["ls-files", "--error-unmatch", "--", relative_selection],
    )
    if tracked_result.returncode != 0:
        raise BatchControlError("Selection plan is not tracked by Git")
    committed_selection = _run_git(
        root,
        ["show", f"{resolved_source}:{relative_selection}"],
        text=False,
    )
    if (
        committed_selection.returncode != 0
        or committed_selection.stdout != selection.read_bytes()
    ):
        raise BatchControlError(
            "Selection plan bytes do not match the new source commit"
        )

    base_result = _run_git(
        root,
        ["rev-parse", "--verify", f"{base_commit}^{{commit}}"],
    )
    if base_result.returncode != 0:
        raise BatchControlError("new base commit is not a local Git commit")
    ancestry_result = _run_git(
        root,
        ["merge-base", "--is-ancestor", base_commit, resolved_source],
    )
    if ancestry_result.returncode != 0:
        raise BatchControlError(
            "new base commit must be an ancestor of the new source commit"
        )


def load_selection_plan(path: str | Path) -> dict[str, Any]:
    plan_path = Path(path)
    try:
        payload = json.loads(plan_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BatchControlError(f"Could not load selection plan {plan_path}: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise BatchControlError("Selection plan must be a schemaVersion 1 object")
    items = payload.get("items")
    target_count = payload.get("targetCount")
    if not isinstance(items, list) or not isinstance(target_count, int):
        raise BatchControlError("Selection plan has invalid items or targetCount")
    if target_count <= 0 or len(items) != target_count:
        raise BatchControlError(
            f"Selection plan target is {target_count}, but contains {len(items)} items"
        )
    return payload


def open_batch_from_plan(
    ledger: CatalogFactoryLedger,
    *,
    selection_path: str | Path,
    base_commit: str,
    renderer_commit: str,
) -> dict[str, Any]:
    """Create and atomically assign a release batch from a tracked plan."""

    plan = load_selection_plan(selection_path)
    batch_id = str(plan.get("releaseId") or "").strip()
    if not batch_id:
        raise BatchControlError("Selection plan has no releaseId")
    catalog_ids, mismatches = _selection_catalog_ids(ledger, plan)
    _raise_selection_mismatches(mismatches)
    _raise_selection_mismatches(
        _new_batch_queue_mismatches(
            ledger,
            batch_id=batch_id,
            catalog_ids=catalog_ids,
        )
    )

    plan_digest = _canonical_digest(plan)
    try:
        batch, assigned = ledger.create_batch_with_exact_assignment(
            batch_id=batch_id,
            target_count=plan["targetCount"],
            base_commit=base_commit,
            renderer_commit=renderer_commit,
            catalog_ids=catalog_ids,
            idempotency_key=f"open-batch-exact:{batch_id}:{plan_digest}",
        )
    except ConflictError as exc:
        raise BatchControlError(str(exc)) from exc
    return {
        "batch_id": batch.batch_id,
        "target_count": batch.target_count,
        "assigned": len(assigned),
        "base_commit": batch.base_commit,
        "renderer_commit": batch.renderer_commit,
        "selection_digest": plan_digest,
    }


def inspect_open_batch_retarget(
    ledger: CatalogFactoryLedger,
    *,
    selection_path: str | Path,
) -> dict[str, Any]:
    """Inspect the exact selection and emit the mutation fence without writes."""

    plan = load_selection_plan(selection_path)
    batch_id = str(plan.get("releaseId") or "").strip()
    if not batch_id:
        raise BatchControlError("Selection plan has no releaseId")
    catalog_ids, mismatches = _selection_catalog_ids(ledger, plan)
    batch = ledger.get_batch(batch_id)
    if batch is None:
        mismatches.append(f"unknown batch {batch_id!r}")
    else:
        if batch.target_count != plan["targetCount"]:
            mismatches.append(
                f"batch target is {batch.target_count}, selection target is "
                f"{plan['targetCount']}"
            )
        assigned_ids = {
            item.catalog_id for item in ledger.list_items(batch_id=batch_id)
        }
        if assigned_ids != set(catalog_ids):
            mismatches.append(
                "batch membership does not equal the tracked selection"
            )
    _raise_selection_mismatches(mismatches)

    fence = ledger.get_open_batch_retarget_fence(batch_id)
    return {
        **fence,
        "selection_digest": _canonical_digest(plan),
    }


def retarget_open_batch_from_plan(
    ledger: CatalogFactoryLedger,
    *,
    selection_path: str | Path,
    batch_id: str,
    expected_selection_digest: str,
    expected_base_commit: str,
    expected_renderer_commit: str,
    expected_batch_version: int,
    expected_state_digest: str,
    new_source_commit: str,
    actor: str,
    idempotency_key: str,
    repository_root: str | Path = REPOSITORY_ROOT,
) -> dict[str, Any]:
    """Retarget a tracked, fully authored open batch to one exact source HEAD."""

    plan = load_selection_plan(selection_path)
    planned_batch_id = str(plan.get("releaseId") or "").strip()
    if planned_batch_id != batch_id:
        raise BatchControlError(
            "Selection releaseId does not match the requested batch ID"
        )
    actual_selection_digest = _canonical_digest(plan)
    if actual_selection_digest != expected_selection_digest:
        raise BatchControlError(
            "Selection digest changed from the expected inspected value"
        )
    catalog_ids, mismatches = _selection_catalog_ids(ledger, plan)
    assigned_ids = {
        item.catalog_id for item in ledger.list_items(batch_id=batch_id)
    }
    if assigned_ids != set(catalog_ids):
        mismatches.append("batch membership does not equal the tracked selection")
    _raise_selection_mismatches(mismatches)

    _verify_retarget_git_source(
        repository_root=Path(repository_root),
        selection_path=selection_path,
        base_commit=expected_base_commit,
        source_commit=new_source_commit,
    )
    result = ledger.retarget_open_batch_source(
        batch_id=batch_id,
        expected_base_commit=expected_base_commit,
        expected_renderer_commit=expected_renderer_commit,
        expected_batch_version=expected_batch_version,
        expected_state_digest=expected_state_digest,
        selection_digest=actual_selection_digest,
        expected_catalog_ids=catalog_ids,
        new_source_commit=new_source_commit,
        actor=actor,
        idempotency_key=idempotency_key,
    )
    return {
        "batch_id": result.batch.batch_id,
        "target_count": result.batch.target_count,
        "item_count": result.item_count,
        "base_commit": result.batch.base_commit,
        "renderer_commit": result.batch.renderer_commit,
        "source_commit": result.batch.source_commit,
        "planned_source_commit": result.batch.renderer_commit,
        "batch_version": result.batch.version,
        "selection_digest": result.selection_digest,
        "previous_state_digest": result.previous_state_digest,
        "current_state_digest": result.current_state_digest,
        "idempotent_replay": result.idempotent_replay,
    }
