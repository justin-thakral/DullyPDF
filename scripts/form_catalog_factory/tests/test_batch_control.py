from __future__ import annotations

import json
from pathlib import Path
import subprocess

import pytest

from scripts.form_catalog_factory.batch_control import (
    BatchControlError,
    _verify_retarget_git_source,
    inspect_open_batch_retarget,
    open_batch_from_plan,
    retarget_open_batch_from_plan,
)
from scripts.form_catalog_factory.ledger import CatalogFactoryLedger, Stage


def _add(ledger: CatalogFactoryLedger, catalog_id: str, sha: str) -> None:
    section, stem = catalog_id.split("/", 1)
    ledger.add_item(
        catalog_id=catalog_id,
        section=section,
        filename=f"{stem}.pdf",
        slug=stem.replace("_", "-"),
        current_asset_hash=sha,
    )


def _write_plan(path: Path, sha: str) -> Path:
    payload = {
        "schemaVersion": 1,
        "releaseId": "catalog-test-001",
        "targetCount": 1,
        "items": [
            {
                "catalogId": "section/form_one",
                "sourceSection": "section",
                "filename": "form_one.pdf",
                "slug": "form-one",
                "currentSha256": sha,
            }
        ],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_open_batch_assigns_exact_tracked_selection(tmp_path: Path) -> None:
    ledger = CatalogFactoryLedger(tmp_path / "factory.sqlite3")
    _add(ledger, "section/form_one", "a" * 64)

    result = open_batch_from_plan(
        ledger,
        selection_path=_write_plan(tmp_path / "plan.json", "a" * 64),
        base_commit="b" * 40,
        renderer_commit="c" * 40,
    )

    assert result["assigned"] == 1
    assert ledger.get_item("section/form_one").batch_id == "catalog-test-001"


def test_open_batch_fails_when_current_asset_hash_drifted(tmp_path: Path) -> None:
    ledger = CatalogFactoryLedger(tmp_path / "factory.sqlite3")
    _add(ledger, "section/form_one", "a" * 64)

    with pytest.raises(BatchControlError, match="currentSha256 changed"):
        open_batch_from_plan(
            ledger,
            selection_path=_write_plan(tmp_path / "plan.json", "d" * 64),
            base_commit="b" * 40,
            renderer_commit="c" * 40,
        )


def test_tracked_plan_retarget_inspection_and_mutation_use_exact_fence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ledger = CatalogFactoryLedger(tmp_path / "factory.sqlite3")
    _add(ledger, "section/form_one", "a" * 64)
    plan_path = _write_plan(tmp_path / "plan.json", "a" * 64)
    open_batch_from_plan(
        ledger,
        selection_path=plan_path,
        base_commit="b" * 40,
        renderer_commit="c" * 40,
    )
    lease = ledger.claim_next(
        worker_id="spec-author",
        claimed_stage=Stage.SPEC_CLAIMED,
        batch_id="catalog-test-001",
    )
    assert lease is not None
    ledger.complete_lease(
        lease,
        idempotency_key="catalog-test-001:spec-ready",
        artifact_updates={"spec_hash": "d" * 64},
    )
    fence = inspect_open_batch_retarget(
        ledger,
        selection_path=plan_path,
    )
    assert fence["eligible"] is True
    assert fence["stages"] == {"spec_ready": 1}
    verified: dict[str, object] = {}

    def record_git_verification(**kwargs) -> None:
        verified.update(kwargs)

    monkeypatch.setattr(
        "scripts.form_catalog_factory.batch_control._verify_retarget_git_source",
        record_git_verification,
    )
    request = {
        "selection_path": plan_path,
        "batch_id": "catalog-test-001",
        "expected_selection_digest": fence["selection_digest"],
        "expected_base_commit": fence["base_commit"],
        "expected_renderer_commit": fence["renderer_commit"],
        "expected_batch_version": fence["batch_version"],
        "expected_state_digest": fence["state_digest"],
        "new_source_commit": "e" * 40,
        "actor": "release-controller",
        "idempotency_key": "retarget:catalog-test-001:source-e",
    }

    result = retarget_open_batch_from_plan(ledger, **request)

    assert result["renderer_commit"] == "e" * 40
    assert result["planned_source_commit"] == "e" * 40
    assert result["source_commit"] is None
    assert result["batch_version"] == 1
    assert result["idempotent_replay"] is False
    assert verified["base_commit"] == "b" * 40
    assert verified["source_commit"] == "e" * 40

    replay = retarget_open_batch_from_plan(ledger, **request)
    assert replay["idempotent_replay"] is True
    assert replay["current_state_digest"] == result["current_state_digest"]


def test_tracked_plan_retarget_rejects_stale_selection_digest(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ledger = CatalogFactoryLedger(tmp_path / "factory.sqlite3")
    _add(ledger, "section/form_one", "a" * 64)
    plan_path = _write_plan(tmp_path / "plan.json", "a" * 64)
    open_batch_from_plan(
        ledger,
        selection_path=plan_path,
        base_commit="b" * 40,
        renderer_commit="c" * 40,
    )
    monkeypatch.setattr(
        "scripts.form_catalog_factory.batch_control._verify_retarget_git_source",
        lambda **kwargs: None,
    )

    with pytest.raises(BatchControlError, match="Selection digest changed"):
        retarget_open_batch_from_plan(
            ledger,
            selection_path=plan_path,
            batch_id="catalog-test-001",
            expected_selection_digest="f" * 64,
            expected_base_commit="b" * 40,
            expected_renderer_commit="c" * 40,
            expected_batch_version=0,
            expected_state_digest="1" * 64,
            new_source_commit="e" * 40,
            actor="release-controller",
            idempotency_key="retarget:stale-selection",
        )


def test_retarget_git_source_requires_clean_head_tracked_selection_and_ancestor(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()

    def git(*arguments: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", *arguments],
            cwd=repository,
            check=True,
            capture_output=True,
            text=True,
        )

    git("init")
    git("config", "user.name", "Catalog Test")
    git("config", "user.email", "catalog-test@example.com")
    selection = repository / "selection.json"
    selection.write_text('{"schemaVersion":1}\n', encoding="utf-8")
    git("add", "selection.json")
    git("commit", "-m", "Add selection")
    base_commit = git("rev-parse", "HEAD").stdout.strip()
    (repository / "source.txt").write_text("source\n", encoding="utf-8")
    git("add", "source.txt")
    git("commit", "-m", "Add source")
    source_commit = git("rev-parse", "HEAD").stdout.strip()

    _verify_retarget_git_source(
        repository_root=repository,
        selection_path=selection,
        base_commit=base_commit,
        source_commit=source_commit,
    )

    selection.write_text('{"schemaVersion":1} \n', encoding="utf-8")
    with pytest.raises(BatchControlError, match="working tree.*clean"):
        _verify_retarget_git_source(
            repository_root=repository,
            selection_path=selection,
            base_commit=base_commit,
            source_commit=source_commit,
        )
