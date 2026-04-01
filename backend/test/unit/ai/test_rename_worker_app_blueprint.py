"""Unit tests for backend.ai.rename_remap_worker_app (rename route)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import backend.ai.rename_remap_worker_app as worker


def _payload(**overrides):
    payload = {
        "jobId": "job-1",
        "requestId": "job-1",
        "sessionId": "sess-1",
        "userId": "user-1",
        "userRole": "base",
        "credits": 1,
        "creditsCharged": True,
    }
    payload.update(overrides)
    return payload


def test_require_internal_auth_accepts_configured_audience(mocker, monkeypatch) -> None:
    worker._ALLOW_UNAUTHENTICATED = False
    monkeypatch.delenv("OPENAI_RENAME_REMAP_SERVICE_URL", raising=False)
    monkeypatch.setenv("OPENAI_RENAME_REMAP_TASKS_AUDIENCE", "rename-remap-audience")
    monkeypatch.setenv("OPENAI_RENAME_REMAP_CALLER_SERVICE_ACCOUNT", "allowed@example.com")
    payload = {"email": "allowed@example.com", "sub": "rename-task"}
    verify = mocker.patch(
        "backend.services.task_auth_service.id_token.verify_oauth2_token",
        return_value=payload,
    )

    assert worker._require_internal_auth("Bearer token") == payload
    assert verify.call_args.kwargs["audience"] == "rename-remap-audience"


def test_require_internal_auth_rejects_invalid_rename_token(mocker, monkeypatch) -> None:
    worker._ALLOW_UNAUTHENTICATED = False
    monkeypatch.setenv("OPENAI_RENAME_REMAP_SERVICE_URL", "https://rename.example.com")
    mocker.patch(
        "backend.services.task_auth_service.id_token.verify_oauth2_token",
        side_effect=ValueError("bad token"),
    )

    with pytest.raises(HTTPException) as exc_info:
        worker._require_internal_auth("Bearer token")
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid rename/remap worker auth token"


@pytest.mark.parametrize(
    ("status_code", "detail"),
    [
        (401, "Missing rename/remap worker auth token"),
        (403, "Rename/remap worker caller not allowed"),
    ],
)
def test_rename_worker_auth_failures_do_not_mutate_job_state(mocker, status_code: int, detail: str) -> None:
    client = TestClient(worker.app)
    mocker.patch.object(
        worker,
        "_require_internal_auth",
        side_effect=HTTPException(status_code=status_code, detail=detail),
    )
    reject_mock = mocker.patch.object(worker, "_reject_job_request")
    get_job_mock = mocker.patch.object(worker, "get_openai_job")
    update_job_mock = mocker.patch.object(worker, "update_openai_job")
    refund_mock = mocker.patch.object(worker, "attempt_credit_refund", return_value=True)

    response = client.post("/internal/rename", json=_payload())

    assert response.status_code == status_code
    assert response.json() == {"detail": detail}
    reject_mock.assert_not_called()
    get_job_mock.assert_not_called()
    update_job_mock.assert_not_called()
    refund_mock.assert_not_called()


def test_rename_worker_completes_job_and_persists_session_updates(mocker) -> None:
    client = TestClient(worker.app)
    mocker.patch.object(worker, "_require_internal_auth", return_value={"sub": "task"})
    mocker.patch.object(
        worker,
        "get_openai_job",
        return_value={
            "status": "queued",
            "user_id": "user-1",
            "request_id": "job-1",
        },
    )
    update_job_mock = mocker.patch.object(worker, "update_openai_job", return_value=None)
    mocker.patch.object(
        worker,
        "_get_session_entry",
        return_value={
            "pdf_bytes": b"%PDF-1.4\n",
            "fields": [{"name": "field_a", "type": "text", "page": 1, "rect": [1, 2, 3, 4]}],
            "source_pdf": "sample.pdf",
            "page_count": 1,
            "result": {
                "detectorCandidatesByPage": {
                    "1": {"checkboxCandidates": [{"id": "cb1", "bbox": [1, 2, 3, 4]}]}
                }
            },
        },
    )
    rename_mock = mocker.patch.object(
        worker,
        "run_openai_rename_on_pdf",
        return_value=(
            {"checkboxRules": []},
            [{"name": "first_name", "type": "text", "page": 1, "rect": [1, 2, 3, 4]}],
        ),
    )
    update_session_mock = mocker.patch.object(worker, "_update_session_entry", return_value=None)

    response = client.post("/internal/rename", json=_payload())

    assert response.status_code == 200
    assert response.json()["status"] == "complete"
    assert update_session_mock.called
    assert rename_mock.call_args.kwargs["detector_candidates_by_page"] == {
        "1": {"checkboxCandidates": [{"id": "cb1", "bbox": [1, 2, 3, 4]}]}
    }
    statuses = [call.kwargs.get("status") for call in update_job_mock.call_args_list if "status" in call.kwargs]
    assert "running" in statuses
    assert "complete" in statuses


def test_rename_worker_refunds_credits_on_terminal_failure(mocker) -> None:
    client = TestClient(worker.app)
    mocker.patch.object(worker, "_require_internal_auth", return_value={"sub": "task"})
    mocker.patch.object(
        worker,
        "get_openai_job",
        return_value={
            "status": "queued",
            "user_id": "user-1",
            "request_id": "job-1",
        },
    )
    mocker.patch.object(worker, "update_openai_job", return_value=None)
    mocker.patch.object(worker, "_get_session_entry", return_value={"pdf_bytes": None})
    refund_mock = mocker.patch.object(worker, "attempt_credit_refund", return_value=True)

    response = client.post("/internal/rename", json=_payload())

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    assert "Session PDF not found" in response.json()["error"]
    refund_mock.assert_called_once_with(
        user_id="user-1",
        role="base",
        credits=1,
        source="rename.worker",
        request_id="job-1",
        job_id="job-1",
        credit_breakdown=None,
    )


def test_rename_worker_rejects_locked_saved_form_sessions_after_downgrade(mocker) -> None:
    client = TestClient(worker.app)
    mocker.patch.object(worker, "_require_internal_auth", return_value={"sub": "task"})
    mocker.patch.object(
        worker,
        "get_openai_job",
        return_value={
            "status": "queued",
            "user_id": "user-1",
            "request_id": "job-1",
        },
    )
    mocker.patch.object(worker, "update_openai_job", return_value=None)
    mocker.patch.object(
        worker,
        "_get_session_entry",
        return_value={
            "pdf_bytes": b"%PDF-1.4\n",
            "pdf_path": "gs://saved-forms/form-6/source.pdf",
            "fields": [{"name": "field_a", "type": "text", "page": 1, "rect": [1, 2, 3, 4]}],
            "source_pdf": "sample.pdf",
        },
    )
    mocker.patch.object(
        worker,
        "list_templates",
        return_value=[SimpleNamespace(id="form-6", pdf_bucket_path="gs://saved-forms/form-6/source.pdf")],
    )
    mocker.patch.object(worker, "is_user_retention_template_locked", return_value=True)
    update_session_mock = mocker.patch.object(worker, "_update_session_entry", return_value=None)
    rename_mock = mocker.patch.object(worker, "run_openai_rename_on_pdf")
    refund_mock = mocker.patch.object(worker, "attempt_credit_refund", return_value=True)

    response = client.post("/internal/rename", json=_payload())

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    assert "locked on the base plan" in response.json()["error"]
    update_session_mock.assert_called_once()
    rename_mock.assert_not_called()
    refund_mock.assert_called_once_with(
        user_id="user-1",
        role="base",
        credits=1,
        source="rename.worker",
        request_id="job-1",
        job_id="job-1",
        credit_breakdown=None,
    )


def test_rename_worker_treats_insufficient_quota_as_terminal_failure(mocker) -> None:
    class _QuotaError(Exception):
        code = "insufficient_quota"

    client = TestClient(worker.app)
    mocker.patch.object(worker, "_require_internal_auth", return_value={"sub": "task"})
    mocker.patch.object(
        worker,
        "get_openai_job",
        return_value={
            "status": "queued",
            "user_id": "user-1",
            "request_id": "job-1",
        },
    )
    mocker.patch.object(
        worker,
        "_get_session_entry",
        return_value={
            "pdf_bytes": b"%PDF-1.4\n",
            "fields": [{"name": "field_a", "type": "text", "page": 1, "rect": [1, 2, 3, 4]}],
            "source_pdf": "sample.pdf",
            "page_count": 1,
        },
    )
    mocker.patch.object(worker, "run_openai_rename_on_pdf", side_effect=_QuotaError("quota"))
    refund_mock = mocker.patch.object(worker, "attempt_credit_refund", return_value=True)

    response = client.post("/internal/rename", json=_payload())

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    assert "insufficient_quota" in response.json()["error"]
    refund_mock.assert_called_once_with(
        user_id="user-1",
        role="base",
        credits=1,
        source="rename.worker",
        request_id="job-1",
        job_id="job-1",
        credit_breakdown=None,
    )


def test_rename_worker_rejects_missing_job_without_refund_or_upsert(mocker) -> None:
    client = TestClient(worker.app)
    mocker.patch.object(worker, "_require_internal_auth", return_value={"sub": "task"})
    mocker.patch.object(worker, "get_openai_job", return_value=None)
    update_job_mock = mocker.patch.object(worker, "update_openai_job", return_value=None)
    refund_mock = mocker.patch.object(worker, "attempt_credit_refund", return_value=True)

    response = client.post("/internal/rename", json=_payload())

    assert response.status_code == 200
    assert response.json() == {
        "jobId": "job-1",
        "status": "failed",
        "error": "Rename job metadata not found",
    }
    update_job_mock.assert_not_called()
    refund_mock.assert_not_called()


def test_rename_worker_uses_stored_job_identity_for_refunds(mocker) -> None:
    client = TestClient(worker.app)
    mocker.patch.object(worker, "_require_internal_auth", return_value={"sub": "task"})
    mocker.patch.object(
        worker,
        "get_openai_job",
        return_value={
            "status": "queued",
            "user_id": "user-1",
            "request_id": "stored-request",
            "user_role": "pro",
            "credits": 7,
            "credits_charged": True,
            "credit_breakdown": {"proMonthly": 7},
        },
    )
    mocker.patch.object(worker, "update_openai_job", return_value=None)
    mocker.patch.object(worker, "_get_session_entry", return_value={"pdf_bytes": None})
    refund_mock = mocker.patch.object(worker, "attempt_credit_refund", return_value=True)

    response = client.post(
        "/internal/rename",
        json=_payload(
            requestId="forged-request",
            userRole="base",
            credits=1,
            creditBreakdown={"base": 1},
        ),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    refund_mock.assert_called_once_with(
        user_id="user-1",
        role="pro",
        credits=7,
        source="rename.worker",
        request_id="stored-request",
        job_id="job-1",
        credit_breakdown={"proMonthly": 7},
    )


def test_rename_worker_rejects_payload_user_mismatch_without_mutation(mocker) -> None:
    client = TestClient(worker.app)
    mocker.patch.object(worker, "_require_internal_auth", return_value={"sub": "task"})
    mocker.patch.object(
        worker,
        "get_openai_job",
        return_value={
            "status": "queued",
            "user_id": "user-1",
            "request_id": "job-1",
        },
    )
    update_job_mock = mocker.patch.object(worker, "update_openai_job", return_value=None)
    refund_mock = mocker.patch.object(worker, "attempt_credit_refund", return_value=True)

    response = client.post("/internal/rename", json=_payload(userId="user-2"))

    assert response.status_code == 200
    assert response.json()["error"] == "Rename job user mismatch"
    update_job_mock.assert_called_once()
    assert update_job_mock.call_args.kwargs["job_id"] == "job-1"
    assert update_job_mock.call_args.kwargs["status"] == "failed"
    assert update_job_mock.call_args.kwargs["error"] == "Rename job user mismatch"
    refund_mock.assert_not_called()
