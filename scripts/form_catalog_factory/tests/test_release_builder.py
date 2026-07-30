from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

from scripts.form_catalog_factory.release_builder import build_release


ROOT = Path(__file__).resolve().parents[3]
EXEMPLAR = (
    ROOT
    / "form_catalog_specs"
    / "candidates"
    / "longtail"
    / "field_service"
    / "dfs_1100__appliance_repair_service_call_intake_form.json"
)


def test_release_builder_produces_valid_immutable_assets(tmp_path: Path) -> None:
    spec_root = tmp_path / "specs"
    spec_root.mkdir()
    spec_path = spec_root / EXEMPLAR.name
    spec_path.write_bytes(EXEMPLAR.read_bytes())
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    plan = {
        "schemaVersion": 1,
        "releaseId": "catalog-test-001",
        "targetCount": 1,
        "items": [
            {
                "catalogId": spec["catalog_id"],
                "sourceSection": spec["source_section"],
                "filename": spec["source_filename"],
                "slug": spec["slug"],
                "riskTier": spec["risk_tier"],
            }
        ],
    }
    plan_path = tmp_path / "selection.json"
    plan_path.write_text(json.dumps(plan), encoding="utf-8")

    result = build_release(
        selection_path=plan_path,
        spec_root=spec_root,
        output_root=tmp_path / "release",
        source_commit="a" * 40,
        previous_release_id=None,
        created_at="2026-07-29T12:00:00Z",
        workers=1,
    )

    manifest = json.loads(Path(result["manifest"]).read_text(encoding="utf-8"))
    form = manifest["forms"][0]
    assert form["catalogId"] == spec["catalog_id"]
    assert form["pageCount"] >= 2
    for key in ("pdf", "thumbnail"):
        asset = form[key]
        path = (tmp_path / "release" / asset["sourcePath"]).resolve()
        assert path.is_file()
        assert asset["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
        assert asset["objectPath"].startswith(
            "releases/catalog-test-001/assets/"
        )

    validation = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "validate-form-catalog-release.py"),
            "--manifest",
            result["manifest"],
            "--asset-root",
            str(tmp_path / "release"),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert validation.returncode == 0, validation.stderr
