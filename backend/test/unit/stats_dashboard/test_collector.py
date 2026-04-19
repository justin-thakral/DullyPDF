import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from internal_stats.collector import PROD_FIREBASE_PROJECT_ID, require_prod_project_configuration


def test_require_prod_project_configuration_accepts_prod_project(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", PROD_FIREBASE_PROJECT_ID)
    require_prod_project_configuration()
    assert PROD_FIREBASE_PROJECT_ID == "dullypdf"


def test_require_prod_project_configuration_rejects_non_prod_project(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "dullypdf-dev")

    with pytest.raises(RuntimeError):
        require_prod_project_configuration()
