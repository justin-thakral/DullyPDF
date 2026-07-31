from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from scripts.form_catalog_factory import planning_qa
from scripts.form_catalog_factory.planning_qa import (
    PlanningQaError,
    validate_planning_qa_lifecycle,
)
from scripts.form_catalog_factory.themes import DEFAULT_THEME_ID, get_theme


ROOT = Path(__file__).resolve().parents[3]
EXEMPLAR = (
    ROOT
    / "form_catalog_specs"
    / "candidates"
    / "longtail"
    / "field_service"
    / "dfs_1100__appliance_repair_service_call_intake_form.json"
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _build_repository(tmp_path: Path) -> tuple[Path, Path, Path, Path]:
    repository = tmp_path / "repository"
    planning = repository / "form_catalog_releases" / "planning"
    specs = repository / "form_catalog_specs" / "candidates"
    planning.mkdir(parents=True)
    specs.mkdir(parents=True)
    spec_path = specs / EXEMPLAR.name
    spec_path.write_bytes(EXEMPLAR.read_bytes())
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    selection = planning / "catalog-current-selection.json"
    selection.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "releaseId": "catalog-current",
                "targetCount": 1,
                "renderTheme": get_theme(DEFAULT_THEME_ID).provenance(),
                "items": [
                    {
                        "catalogId": spec["catalog_id"],
                        "sourceSection": spec["source_section"],
                        "filename": spec["source_filename"],
                        "slug": spec["slug"],
                        "riskTier": spec["risk_tier"],
                    }
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    registry = repository / "form_catalog_releases" / "planning-qa-registry.json"
    registry.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "currentPolicyReleaseId": "catalog-current",
                "selections": [
                    {
                        "releaseId": "catalog-current",
                        "selectionPath": (
                            "form_catalog_releases/planning/"
                            "catalog-current-selection.json"
                        ),
                        "selectionSha256": _sha256(selection),
                        "validationMode": "current-policy",
                    }
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return repository, planning, specs, registry


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(
        json.dumps(payload, indent=2) + "\n",
        encoding="utf-8",
    )


def _add_historical_receipt(
    *,
    repository: Path,
    planning: Path,
    registry: Path,
) -> tuple[Path, Path]:
    current = planning / "catalog-current-selection.json"
    historical = planning / "catalog-historical-selection.json"
    historical_payload = json.loads(current.read_text(encoding="utf-8"))
    historical_payload["releaseId"] = "catalog-historical"
    _write_json(historical, historical_payload)
    receipt = (
        repository
        / "form_catalog_releases"
        / "qa-receipts"
        / "catalog-historical.json"
    )
    receipt.parent.mkdir(parents=True)
    _write_json(
        receipt,
        {
            "schemaVersion": 1,
            "reportType": "form-catalog-selection-spec-qa",
            "releaseId": "catalog-historical",
            "selectionSha256": _sha256(historical),
            "passed": True,
        },
    )
    registry_payload = json.loads(registry.read_text(encoding="utf-8"))
    registry_payload["selections"].insert(
        0,
        {
            "releaseId": "catalog-historical",
            "selectionPath": (
                "form_catalog_releases/planning/"
                "catalog-historical-selection.json"
            ),
            "selectionSha256": _sha256(historical),
            "validationMode": "pinned-policy-receipt",
            "receiptPath": (
                "form_catalog_releases/qa-receipts/catalog-historical.json"
            ),
            "receiptSha256": _sha256(receipt),
        },
    )
    _write_json(registry, registry_payload)
    return historical, receipt


def test_planning_qa_runs_moving_policy_only_for_current_selection(
    tmp_path: Path,
) -> None:
    repository, planning, specs, registry = _build_repository(tmp_path)

    report = validate_planning_qa_lifecycle(
        registry_path=registry,
        planning_root=planning,
        spec_root=specs,
        report_root=repository / "reports",
        repository_root=repository,
    )

    assert report["passed"] is True
    assert report["currentPolicyReleaseId"] == "catalog-current"
    assert report["selectionCount"] == 1
    assert (repository / "reports" / "catalog-current.json").is_file()


def test_planning_qa_rejects_selection_changed_after_registry_binding(
    tmp_path: Path,
) -> None:
    repository, planning, specs, registry = _build_repository(tmp_path)
    selection = planning / "catalog-current-selection.json"
    selection.write_text(selection.read_text(encoding="utf-8") + "\n", encoding="utf-8")

    with pytest.raises(PlanningQaError, match="immutable registry binding"):
        validate_planning_qa_lifecycle(
            registry_path=registry,
            planning_root=planning,
            spec_root=specs,
            report_root=repository / "reports",
            repository_root=repository,
        )


def test_planning_qa_accepts_hash_bound_historical_receipt(
    tmp_path: Path,
) -> None:
    repository, planning, specs, registry = _build_repository(tmp_path)
    _add_historical_receipt(
        repository=repository,
        planning=planning,
        registry=registry,
    )

    report = validate_planning_qa_lifecycle(
        registry_path=registry,
        planning_root=planning,
        spec_root=specs,
        report_root=repository / "reports",
        repository_root=repository,
    )

    assert report["passed"] is True
    assert report["selectionCount"] == 2
    assert {
        item["validationMode"] for item in report["selections"]
    } == {"current-policy", "pinned-policy-receipt"}


def test_planning_qa_rejects_unregistered_discovered_selection(
    tmp_path: Path,
) -> None:
    repository, planning, specs, registry = _build_repository(tmp_path)
    payload = json.loads(
        (planning / "catalog-current-selection.json").read_text(encoding="utf-8")
    )
    payload["releaseId"] = "catalog-unbound"
    _write_json(planning / "catalog-unbound-selection.json", payload)

    with pytest.raises(PlanningQaError, match="no immutable QA registry binding"):
        validate_planning_qa_lifecycle(
            registry_path=registry,
            planning_root=planning,
            spec_root=specs,
            report_root=repository / "reports",
            repository_root=repository,
        )


@pytest.mark.parametrize(
    ("entry_update", "message"),
    [
        ({"releaseId": "catalog-current"}, "Duplicate registry releaseId"),
        ({"releaseId": "catalog-other"}, "Duplicate registry selectionPath"),
    ],
)
def test_planning_qa_rejects_duplicate_release_or_path_binding(
    tmp_path: Path,
    entry_update: dict[str, str],
    message: str,
) -> None:
    repository, planning, specs, registry = _build_repository(tmp_path)
    payload = json.loads(registry.read_text(encoding="utf-8"))
    duplicate = dict(payload["selections"][0])
    duplicate.update(entry_update)
    payload["selections"].append(duplicate)
    _write_json(registry, payload)

    with pytest.raises(PlanningQaError, match=message):
        validate_planning_qa_lifecycle(
            registry_path=registry,
            planning_root=planning,
            spec_root=specs,
            report_root=repository / "reports",
            repository_root=repository,
        )


def test_planning_qa_rejects_wrong_or_malformed_current_release_id(
    tmp_path: Path,
) -> None:
    repository, planning, specs, registry = _build_repository(tmp_path)
    payload = json.loads(registry.read_text(encoding="utf-8"))
    payload["currentPolicyReleaseId"] = "../escape"
    _write_json(registry, payload)

    with pytest.raises(PlanningQaError, match="currentPolicyReleaseId is invalid"):
        validate_planning_qa_lifecycle(
            registry_path=registry,
            planning_root=planning,
            spec_root=specs,
            report_root=repository / "reports",
            repository_root=repository,
        )

    payload["currentPolicyReleaseId"] = "catalog-other"
    _write_json(registry, payload)
    with pytest.raises(PlanningQaError, match="does not identify"):
        validate_planning_qa_lifecycle(
            registry_path=registry,
            planning_root=planning,
            spec_root=specs,
            report_root=repository / "reports",
            repository_root=repository,
        )


def test_planning_qa_rejects_multiple_current_policy_entries(
    tmp_path: Path,
) -> None:
    repository, planning, specs, registry = _build_repository(tmp_path)
    current = planning / "catalog-current-selection.json"
    second = planning / "catalog-second-selection.json"
    selection_payload = json.loads(current.read_text(encoding="utf-8"))
    selection_payload["releaseId"] = "catalog-second"
    _write_json(second, selection_payload)
    registry_payload = json.loads(registry.read_text(encoding="utf-8"))
    second_entry = dict(registry_payload["selections"][0])
    second_entry.update(
        {
            "releaseId": "catalog-second",
            "selectionPath": (
                "form_catalog_releases/planning/catalog-second-selection.json"
            ),
            "selectionSha256": _sha256(second),
        }
    )
    registry_payload["selections"].append(second_entry)
    _write_json(registry, registry_payload)

    with pytest.raises(PlanningQaError, match="exactly one current-policy"):
        validate_planning_qa_lifecycle(
            registry_path=registry,
            planning_root=planning,
            spec_root=specs,
            report_root=repository / "reports",
            repository_root=repository,
        )


def test_planning_qa_binds_legacy_selection_and_rejects_themed_legacy(
    tmp_path: Path,
) -> None:
    repository, planning, specs, registry = _build_repository(tmp_path)
    current = planning / "catalog-current-selection.json"
    legacy = planning / "catalog-legacy-selection.json"
    legacy_payload = json.loads(current.read_text(encoding="utf-8"))
    legacy_payload["releaseId"] = "catalog-legacy"
    legacy_payload["renderTheme"] = None
    _write_json(legacy, legacy_payload)
    registry_payload = json.loads(registry.read_text(encoding="utf-8"))
    registry_payload["selections"].insert(
        0,
        {
            "releaseId": "catalog-legacy",
            "selectionPath": (
                "form_catalog_releases/planning/catalog-legacy-selection.json"
            ),
            "selectionSha256": _sha256(legacy),
            "validationMode": "immutable-legacy-schema",
        },
    )
    _write_json(registry, registry_payload)

    passing = validate_planning_qa_lifecycle(
        registry_path=registry,
        planning_root=planning,
        spec_root=specs,
        report_root=repository / "reports",
        repository_root=repository,
    )
    assert passing["passed"] is True

    legacy_payload["renderTheme"] = get_theme(DEFAULT_THEME_ID).provenance()
    _write_json(legacy, legacy_payload)
    registry_payload["selections"][0]["selectionSha256"] = _sha256(legacy)
    _write_json(registry, registry_payload)
    with pytest.raises(PlanningQaError, match="must be unthemed"):
        validate_planning_qa_lifecycle(
            registry_path=registry,
            planning_root=planning,
            spec_root=specs,
            report_root=repository / "reports",
            repository_root=repository,
        )


@pytest.mark.parametrize(
    "defect",
    ["receipt_hash", "selection_hash", "not_passed"],
)
def test_planning_qa_rejects_invalid_pinned_receipt(
    tmp_path: Path,
    defect: str,
) -> None:
    repository, planning, specs, registry = _build_repository(tmp_path)
    _, receipt = _add_historical_receipt(
        repository=repository,
        planning=planning,
        registry=registry,
    )
    registry_payload = json.loads(registry.read_text(encoding="utf-8"))
    historical_entry = registry_payload["selections"][0]
    if defect == "receipt_hash":
        historical_entry["receiptSha256"] = "0" * 64
    else:
        receipt_payload = json.loads(receipt.read_text(encoding="utf-8"))
        if defect == "selection_hash":
            receipt_payload["selectionSha256"] = "0" * 64
        else:
            receipt_payload["passed"] = False
        _write_json(receipt, receipt_payload)
        historical_entry["receiptSha256"] = _sha256(receipt)
    _write_json(registry, registry_payload)

    with pytest.raises(PlanningQaError, match="Pinned QA receipt"):
        validate_planning_qa_lifecycle(
            registry_path=registry,
            planning_root=planning,
            spec_root=specs,
            report_root=repository / "reports",
            repository_root=repository,
        )


def test_planning_qa_cli_propagates_failed_current_report(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository, planning, specs, registry = _build_repository(tmp_path)
    original = planning_qa.validate_release_selection_specs

    def failing_report(**kwargs):
        report = original(**kwargs)
        report["passed"] = False
        return report

    monkeypatch.setattr(
        planning_qa,
        "validate_release_selection_specs",
        failing_report,
    )
    result = planning_qa.main(
        [
            "--registry",
            str(registry),
            "--planning-root",
            str(planning),
            "--spec-root",
            str(specs),
            "--report-root",
            str(repository / "reports"),
            "--repository-root",
            str(repository),
        ]
    )

    assert result == 1
    lifecycle = json.loads(
        (repository / "reports" / "planning-lifecycle.json").read_text(
            encoding="utf-8"
        )
    )
    assert lifecycle["passed"] is False
