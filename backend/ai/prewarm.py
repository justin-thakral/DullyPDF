"""Best-effort Cloud Run prewarm helpers for OpenAI worker services."""

from __future__ import annotations

from typing import List

import httpx

from backend.logging_config import get_logger
from backend.env_utils import env_truthy, int_env

from .tasks import resolve_openai_rename_remap_task_config


logger = get_logger(__name__)


def prewarm_openai_services(
    *,
    page_count: int,
    prewarm_rename: bool,
    prewarm_remap: bool,
) -> List[str]:
    """Trigger a lightweight /health request to warm the combined worker service."""
    if not env_truthy("OPENAI_PREWARM_ENABLED"):
        return []
    if not (prewarm_rename or prewarm_remap):
        return []

    touched: List[str] = []
    timeout_seconds = max(1, int_env("OPENAI_PREWARM_TIMEOUT_SECONDS", 2))

    try:
        config = resolve_openai_rename_remap_task_config()
        url = (config.get("service_url") or "").rstrip("/")
        if not url:
            return []
        health_url = f"{url}/health"
        with httpx.Client(timeout=timeout_seconds) as client:
            response = client.get(health_url)
        if response.status_code < 500:
            touched.append(health_url)
        else:
            logger.debug("OpenAI prewarm returned %s for %s", response.status_code, health_url)
    except Exception as exc:
        logger.debug("OpenAI prewarm config unavailable: %s", exc)

    return touched
