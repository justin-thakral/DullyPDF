"""Regression checks for frontend env assembly rollout flags."""

from __future__ import annotations

from pathlib import Path


SCRIPT_PATH = Path("scripts/use-frontend-env.sh")


def test_use_frontend_env_appends_prod_calculation_rollout_flag_after_overrides() -> None:
    text = SCRIPT_PATH.read_text(encoding="utf-8")
    assert 'if [[ "$MODE" == "prod" ]]; then' in text
    assert "Production rollout flags managed by source control" in text
    assert 'printf "VITE_ENABLE_CALCULATION_FIELDS=true\\n"' in text
    assert text.rfind('printf "VITE_ENABLE_CALCULATION_FIELDS=true\\n"') > text.rfind('cat "$EXPLICIT_OVERRIDE_FILE"')
