"""Bind tracked release selections to the transactional worker ledger."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .ledger import CatalogFactoryLedger, ConflictError


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
                    f"{catalog_id}: {key} changed from {raw_item.get(key)!r} to {actual!r}"
                )
        if item.ownership != "first_party":
            mismatches.append(f"{catalog_id}: ownership is {item.ownership!r}")
        catalog_ids.append(catalog_id)
    if mismatches:
        preview = "; ".join(mismatches[:20])
        if len(mismatches) > 20:
            preview += f"; ... {len(mismatches) - 20} more"
        raise BatchControlError(f"Selection no longer matches ledger: {preview}")

    plan_digest = _canonical_digest(plan)
    batch = ledger.create_batch(
        batch_id=batch_id,
        target_count=plan["targetCount"],
        base_commit=base_commit,
        renderer_commit=renderer_commit,
        idempotency_key=f"open-batch:{batch_id}:{plan_digest}",
    )
    try:
        assigned = ledger.assign_to_batch(
            batch_id=batch_id,
            catalog_ids=catalog_ids,
            idempotency_key=f"assign-batch:{batch_id}:{plan_digest}",
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
