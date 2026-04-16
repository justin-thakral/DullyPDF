"""Cloud Tasks helpers for async OpenAI rename/remap jobs.

Both rename and remap tasks are dispatched to the same combined
rename+remap Cloud Run worker service.  There is no light/heavy profile
split -- the single service is sized for the heaviest workload.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from google.protobuf import duration_pb2, timestamp_pb2

from ..env_utils import env_truthy, env_value

_PREFIX = "OPENAI_RENAME_REMAP"

OPENAI_RENAME_TASK_HANDLER = "/internal/rename"
OPENAI_REMAP_TASK_HANDLER = "/internal/remap"
OPENAI_RENAME_REMAP_TASK_HANDLER = "/internal/rename-remap"
OPENAI_IMAGE_FILL_TASK_HANDLER = "/internal/image-fill"


def _safe_positive_int(value: str, default: int) -> int:
    raw = (value or "").strip()
    if not raw:
        return default
    try:
        parsed = int(raw)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


def resolve_openai_rename_remap_task_config() -> Dict[str, str]:
    """Resolve the unified rename+remap worker task configuration."""
    project = env_value(f"{_PREFIX}_TASKS_PROJECT") or env_value("GCP_PROJECT_ID")
    location = env_value(f"{_PREFIX}_TASKS_LOCATION")
    queue = env_value(f"{_PREFIX}_TASKS_QUEUE")
    service_url = env_value(f"{_PREFIX}_SERVICE_URL").rstrip("/")
    service_account = env_value(f"{_PREFIX}_TASKS_SERVICE_ACCOUNT")
    audience = env_value(f"{_PREFIX}_TASKS_AUDIENCE") or service_url

    missing = []
    if not project:
        missing.append(f"{_PREFIX}_TASKS_PROJECT (or GCP_PROJECT_ID)")
    if not location:
        missing.append(f"{_PREFIX}_TASKS_LOCATION")
    if not queue:
        missing.append(f"{_PREFIX}_TASKS_QUEUE")
    if not service_url:
        missing.append(f"{_PREFIX}_SERVICE_URL")
    if not service_account:
        missing.append(f"{_PREFIX}_TASKS_SERVICE_ACCOUNT")
    if missing:
        raise RuntimeError("Missing OpenAI rename/remap task config: " + ", ".join(missing))

    return {
        "project": project,
        "location": location,
        "queue": queue,
        "service_url": service_url,
        "service_account": service_account,
        "audience": audience,
    }


def _enqueue_task(handler_path: str, payload: Dict[str, Any]) -> str:
    try:
        from google.cloud import tasks_v2
    except ImportError as exc:
        raise RuntimeError(
            "google-cloud-tasks is required for OPENAI_RENAME_REMAP_MODE=tasks. "
            "Install backend/requirements.txt to enable Cloud Tasks."
        ) from exc

    config = resolve_openai_rename_remap_task_config()
    client = tasks_v2.CloudTasksClient()
    parent = client.queue_path(config["project"], config["location"], config["queue"])
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    task = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f"{config['service_url']}{handler_path}",
            "headers": {"Content-Type": "application/json"},
            "body": body,
            "oidc_token": {
                "service_account_email": config["service_account"],
                "audience": config["audience"],
            },
        }
    }

    deadline_raw = env_value(f"{_PREFIX}_TASKS_DISPATCH_DEADLINE_SECONDS")
    if deadline_raw:
        deadline_seconds = _safe_positive_int(deadline_raw, 0)
        if deadline_seconds > 0:
            task["dispatch_deadline"] = duration_pb2.Duration(seconds=deadline_seconds)

    if env_truthy(f"{_PREFIX}_TASKS_FORCE_IMMEDIATE") or env_truthy("OPENAI_TASKS_FORCE_IMMEDIATE"):
        task["schedule_time"] = timestamp_pb2.Timestamp(seconds=0)

    response = client.create_task(request={"parent": parent, "task": task})
    return response.name


def enqueue_openai_rename_task(payload: Dict[str, Any]) -> str:
    return _enqueue_task(OPENAI_RENAME_TASK_HANDLER, payload)


def enqueue_openai_remap_task(payload: Dict[str, Any]) -> str:
    return _enqueue_task(OPENAI_REMAP_TASK_HANDLER, payload)


def enqueue_openai_rename_remap_task(payload: Dict[str, Any]) -> str:
    return _enqueue_task(OPENAI_RENAME_REMAP_TASK_HANDLER, payload)


def enqueue_openai_image_fill_task(payload: Dict[str, Any]) -> str:
    return _enqueue_task(OPENAI_IMAGE_FILL_TASK_HANDLER, payload)
