"""Unit tests for backend.ai.tasks (unified rename+remap worker)."""

from __future__ import annotations

import json
import sys
import types

import pytest

from backend.ai import tasks as openai_tasks


@pytest.fixture(autouse=True)
def _clear_openai_task_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in [
        "GCP_PROJECT_ID",
        "OPENAI_RENAME_REMAP_TASKS_PROJECT",
        "OPENAI_RENAME_REMAP_TASKS_LOCATION",
        "OPENAI_RENAME_REMAP_TASKS_QUEUE",
        "OPENAI_RENAME_REMAP_SERVICE_URL",
        "OPENAI_RENAME_REMAP_TASKS_SERVICE_ACCOUNT",
        "OPENAI_RENAME_REMAP_TASKS_AUDIENCE",
        "OPENAI_RENAME_REMAP_TASKS_DISPATCH_DEADLINE_SECONDS",
        "OPENAI_RENAME_REMAP_TASKS_FORCE_IMMEDIATE",
        "OPENAI_TASKS_FORCE_IMMEDIATE",
    ]:
        monkeypatch.delenv(key, raising=False)


def _install_fake_tasks_v2(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    created_requests: list[dict] = []

    class FakeCloudTasksClient:
        def queue_path(self, project: str, location: str, queue: str) -> str:
            return f"projects/{project}/locations/{location}/queues/{queue}"

        def create_task(self, request: dict):
            created_requests.append(request)
            return types.SimpleNamespace(name="tasks/fake-openai-task")

    tasks_v2_module = types.ModuleType("google.cloud.tasks_v2")
    tasks_v2_module.CloudTasksClient = FakeCloudTasksClient
    tasks_v2_module.HttpMethod = types.SimpleNamespace(POST="POST")

    google_module = sys.modules.get("google")
    if google_module is None:
        google_module = types.ModuleType("google")
        monkeypatch.setitem(sys.modules, "google", google_module)

    cloud_module = types.ModuleType("google.cloud")
    cloud_module.tasks_v2 = tasks_v2_module
    setattr(google_module, "cloud", cloud_module)

    monkeypatch.setitem(sys.modules, "google.cloud", cloud_module)
    monkeypatch.setitem(sys.modules, "google.cloud.tasks_v2", tasks_v2_module)

    return created_requests


# -- resolve_openai_rename_remap_task_config -----------------------------------


def test_resolve_config_raises_for_missing_env_vars() -> None:
    with pytest.raises(RuntimeError, match="Missing OpenAI rename/remap task config:") as excinfo:
        openai_tasks.resolve_openai_rename_remap_task_config()
    message = str(excinfo.value)
    assert "OPENAI_RENAME_REMAP_TASKS_PROJECT" in message
    assert "OPENAI_RENAME_REMAP_TASKS_LOCATION" in message
    assert "OPENAI_RENAME_REMAP_TASKS_QUEUE" in message
    assert "OPENAI_RENAME_REMAP_SERVICE_URL" in message
    assert "OPENAI_RENAME_REMAP_TASKS_SERVICE_ACCOUNT" in message


def test_resolve_config_returns_correct_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_PROJECT", "my-project")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_LOCATION", "us-central1")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_QUEUE", "rename-remap-q")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_SERVICE_URL", "https://worker.example.com/")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_SERVICE_ACCOUNT", "svc@example.com")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_AUDIENCE", "custom-audience")

    config = openai_tasks.resolve_openai_rename_remap_task_config()

    assert config == {
        "project": "my-project",
        "location": "us-central1",
        "queue": "rename-remap-q",
        "service_url": "https://worker.example.com",
        "service_account": "svc@example.com",
        "audience": "custom-audience",
    }


def test_resolve_config_falls_back_to_gcp_project_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GCP_PROJECT_ID", "fallback-project")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_LOCATION", "us-east1")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_QUEUE", "q")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_SERVICE_URL", "https://worker.example.com")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_SERVICE_ACCOUNT", "svc@example.com")

    config = openai_tasks.resolve_openai_rename_remap_task_config()

    assert config["project"] == "fallback-project"


def test_resolve_config_audience_falls_back_to_service_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_PROJECT", "my-project")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_LOCATION", "us-central1")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_QUEUE", "q")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_SERVICE_URL", "https://worker.example.com///")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_SERVICE_ACCOUNT", "svc@example.com")

    config = openai_tasks.resolve_openai_rename_remap_task_config()

    # Trailing slashes stripped, audience falls back to service_url
    assert config["service_url"] == "https://worker.example.com"
    assert config["audience"] == "https://worker.example.com"


# -- enqueue_openai_rename_task ------------------------------------------------


def test_enqueue_openai_rename_task_builds_correct_request(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_PROJECT", "project-a")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_LOCATION", "us-central1")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_SERVICE_ACCOUNT", "svc@example.com")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_QUEUE", "openai-rename-remap")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_SERVICE_URL", "https://worker.example.com/")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_AUDIENCE", "rename-remap-audience")

    created_requests = _install_fake_tasks_v2(monkeypatch)
    payload = {"jobId": "job-1", "sessionId": "sess-1"}

    task_name = openai_tasks.enqueue_openai_rename_task(payload)

    assert task_name == "tasks/fake-openai-task"
    request = created_requests[0]
    assert request["parent"] == "projects/project-a/locations/us-central1/queues/openai-rename-remap"
    task = request["task"]
    http_request = task["http_request"]
    assert http_request["url"] == "https://worker.example.com/internal/rename"
    assert http_request["body"] == json.dumps(payload, ensure_ascii=True).encode("utf-8")
    assert http_request["oidc_token"] == {
        "service_account_email": "svc@example.com",
        "audience": "rename-remap-audience",
    }


# -- enqueue_openai_remap_task ------------------------------------------------


def test_enqueue_openai_remap_task_builds_correct_request(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_PROJECT", "project-a")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_LOCATION", "us-central1")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_SERVICE_ACCOUNT", "svc@example.com")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_QUEUE", "openai-rename-remap")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_SERVICE_URL", "https://worker.example.com///")

    created_requests = _install_fake_tasks_v2(monkeypatch)

    openai_tasks.enqueue_openai_remap_task({"jobId": "job-2"})

    request = created_requests[0]
    task = request["task"]
    assert request["parent"] == "projects/project-a/locations/us-central1/queues/openai-rename-remap"
    assert task["http_request"]["url"] == "https://worker.example.com/internal/remap"
    # With no explicit audience env var, it falls back to service URL.
    assert task["http_request"]["oidc_token"]["audience"] == "https://worker.example.com"


# -- dispatch deadline ---------------------------------------------------------


def test_dispatch_deadline_is_applied_when_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_PROJECT", "project-a")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_LOCATION", "us-central1")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_SERVICE_ACCOUNT", "svc@example.com")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_QUEUE", "q")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_SERVICE_URL", "https://worker.example.com")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_DISPATCH_DEADLINE_SECONDS", "45")

    created_requests = _install_fake_tasks_v2(monkeypatch)

    openai_tasks.enqueue_openai_rename_task({"jobId": "job-3"})

    task = created_requests[0]["task"]
    assert task["dispatch_deadline"].seconds == 45


def test_dispatch_deadline_ignored_when_not_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_PROJECT", "project-a")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_LOCATION", "us-central1")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_SERVICE_ACCOUNT", "svc@example.com")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_QUEUE", "q")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_SERVICE_URL", "https://worker.example.com")

    created_requests = _install_fake_tasks_v2(monkeypatch)

    openai_tasks.enqueue_openai_rename_task({"jobId": "job-4"})

    task = created_requests[0]["task"]
    assert "dispatch_deadline" not in task


# -- force immediate scheduling ------------------------------------------------


def test_force_immediate_via_rename_remap_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_PROJECT", "project-a")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_LOCATION", "us-central1")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_SERVICE_ACCOUNT", "svc@example.com")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_QUEUE", "q")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_SERVICE_URL", "https://worker.example.com")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_FORCE_IMMEDIATE", "true")

    created_requests = _install_fake_tasks_v2(monkeypatch)

    openai_tasks.enqueue_openai_remap_task({"jobId": "job-5"})

    task = created_requests[0]["task"]
    assert task["schedule_time"].seconds == 0


def test_force_immediate_via_global_fallback_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_PROJECT", "project-a")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_LOCATION", "us-central1")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_SERVICE_ACCOUNT", "svc@example.com")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_QUEUE", "q")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_SERVICE_URL", "https://worker.example.com")
    monkeypatch.setenv("OPENAI_TASKS_FORCE_IMMEDIATE", "1")

    created_requests = _install_fake_tasks_v2(monkeypatch)

    openai_tasks.enqueue_openai_rename_task({"jobId": "job-6"})

    task = created_requests[0]["task"]
    assert task["schedule_time"].seconds == 0


def test_schedule_time_absent_when_force_immediate_not_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_PROJECT", "project-a")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_LOCATION", "us-central1")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_SERVICE_ACCOUNT", "svc@example.com")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_QUEUE", "q")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_SERVICE_URL", "https://worker.example.com")

    created_requests = _install_fake_tasks_v2(monkeypatch)

    openai_tasks.enqueue_openai_rename_task({"jobId": "job-7"})

    task = created_requests[0]["task"]
    assert "schedule_time" not in task
