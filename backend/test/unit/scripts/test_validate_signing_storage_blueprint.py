"""Regression checks for the signing storage validation helper."""

from __future__ import annotations

from pathlib import Path


SCRIPT_PATH = Path("scripts/validate-signing-storage.py")


def test_validate_signing_storage_adds_repo_root_to_pythonpath() -> None:
    text = SCRIPT_PATH.read_text(encoding="utf-8")
    assert "from pathlib import Path" in text
    assert "REPO_ROOT = Path(__file__).resolve().parents[1]" in text
    assert "sys.path.insert(0, str(REPO_ROOT))" in text
    assert "from backend.services.signing_storage_service import describe_signing_storage_policy" in text
