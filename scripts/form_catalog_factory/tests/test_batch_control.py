from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
from threading import Barrier

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


def _write_plan(
    path: Path,
    sha: str,
    *,
    release_id: str = "catalog-test-001",
) -> Path:
    payload = {
        "schemaVersion": 1,
        "releaseId": release_id,
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


def test_open_batch_rejects_item_already_assigned_before_creating_batch(
    tmp_path: Path,
) -> None:
    ledger = CatalogFactoryLedger(tmp_path / "factory.sqlite3")
    _add(ledger, "section/form_one", "a" * 64)
    open_batch_from_plan(
        ledger,
        selection_path=_write_plan(tmp_path / "first.json", "a" * 64),
        base_commit="b" * 40,
        renderer_commit="c" * 40,
    )

    with pytest.raises(
        BatchControlError,
        match=r"stage='queued'.*batch_id='catalog-test-001'",
    ):
        open_batch_from_plan(
            ledger,
            selection_path=_write_plan(
                tmp_path / "second.json",
                "a" * 64,
                release_id="catalog-test-002",
            ),
            base_commit="d" * 40,
            renderer_commit="e" * 40,
        )

    assert ledger.get_batch("catalog-test-002") is None


def test_open_batch_rejects_unassigned_item_that_left_queue(
    tmp_path: Path,
) -> None:
    ledger = CatalogFactoryLedger(tmp_path / "factory.sqlite3")
    _add(ledger, "section/form_one", "a" * 64)
    lease = ledger.claim_next(
        worker_id="unexpected-worker",
        claimed_stage=Stage.SPEC_CLAIMED,
        catalog_id="section/form_one",
    )
    assert lease is not None

    with pytest.raises(
        BatchControlError,
        match=r"stage='spec_claimed'.*batch_id=None",
    ):
        open_batch_from_plan(
            ledger,
            selection_path=_write_plan(tmp_path / "plan.json", "a" * 64),
            base_commit="b" * 40,
            renderer_commit="c" * 40,
        )

    assert ledger.get_batch("catalog-test-001") is None


def test_open_batch_preserves_schema_v1_existing_batch_replay(
    tmp_path: Path,
) -> None:
    ledger = CatalogFactoryLedger(tmp_path / "factory.sqlite3")
    _add(ledger, "section/form_one", "a" * 64)
    plan_path = _write_plan(tmp_path / "plan.json", "a" * 64)
    first = open_batch_from_plan(
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
        idempotency_key="catalog-test-001:spec-ready-replay",
        artifact_updates={"spec_hash": "d" * 64},
    )

    replay = open_batch_from_plan(
        ledger,
        selection_path=plan_path,
        base_commit="b" * 40,
        renderer_commit="c" * 40,
    )

    assert replay == first
    assert ledger.get_item("section/form_one").stage is Stage.SPEC_READY


def test_open_batch_atomic_race_rolls_back_losing_release_batch(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "factory.sqlite3"
    seed_ledger = CatalogFactoryLedger(database_path)
    _add(seed_ledger, "section/form_one", "a" * 64)
    plans = {
        release_id: _write_plan(
            tmp_path / f"{release_id}.json",
            "a" * 64,
            release_id=release_id,
        )
        for release_id in ("catalog-race-a", "catalog-race-b")
    }
    ledgers = {
        release_id: CatalogFactoryLedger(database_path)
        for release_id in plans
    }
    transaction_barrier = Barrier(2)
    original_open = CatalogFactoryLedger.create_batch_with_exact_assignment

    def synchronized_open(self, **kwargs):
        transaction_barrier.wait(timeout=5)
        return original_open(self, **kwargs)

    monkeypatch.setattr(
        CatalogFactoryLedger,
        "create_batch_with_exact_assignment",
        synchronized_open,
    )

    def attempt(release_id: str):
        try:
            result = open_batch_from_plan(
                ledgers[release_id],
                selection_path=plans[release_id],
                base_commit=("b" if release_id.endswith("a") else "d") * 40,
                renderer_commit=("c" if release_id.endswith("a") else "e") * 40,
            )
        except BatchControlError as exc:
            return release_id, None, exc
        return release_id, result, None

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(attempt, plans))

    successful = [
        (release_id, result)
        for release_id, result, error in outcomes
        if error is None
    ]
    failed = [
        (release_id, error)
        for release_id, result, error in outcomes
        if result is None
    ]
    assert len(successful) == 1
    assert len(failed) == 1
    winner_id, winner_result = successful[0]
    loser_id, loser_error = failed[0]
    assert winner_result["batch_id"] == winner_id
    assert "already belongs" in str(loser_error)

    verifier = CatalogFactoryLedger(database_path)
    assert verifier.get_item("section/form_one").batch_id == winner_id
    assert verifier.get_batch(winner_id) is not None
    assert verifier.get_batch(loser_id) is None
    assert verifier.list_items(batch_id=loser_id) == []


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
