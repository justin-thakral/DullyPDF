import pytest

from internal_stats.collector import PROD_FIREBASE_PROJECT_ID, require_prod_project_configuration


def test_require_prod_project_configuration_accepts_prod_project(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", PROD_FIREBASE_PROJECT_ID)
    require_prod_project_configuration()
    assert PROD_FIREBASE_PROJECT_ID == "dullypdf"


def test_require_prod_project_configuration_rejects_non_prod_project(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "dullypdf-dev")

    with pytest.raises(RuntimeError):
        require_prod_project_configuration()
