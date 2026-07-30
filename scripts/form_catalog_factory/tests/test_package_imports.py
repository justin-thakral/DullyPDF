"""Import-boundary tests for commands that do not process PDF bytes."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_release_validator_import_does_not_require_pdf_runtime() -> None:
    script = """
import importlib.abc
import sys


class BlockPdfRuntime(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split(".", 1)[0] in {"PIL", "pypdf", "reportlab"}:
            raise ModuleNotFoundError(f"blocked optional dependency: {fullname}")
        return None


sys.meta_path.insert(0, BlockPdfRuntime())
from scripts.form_catalog_factory.release_validation import validate_release_manifest

assert callable(validate_release_manifest)
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
