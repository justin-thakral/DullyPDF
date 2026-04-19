import sys
from pathlib import Path

from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import internal_stats.server as server


def test_stats_endpoint_returns_snapshot(mocker, monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "dullypdf")
    snapshot = {
        "meta": {
            "generatedAt": "2026-03-28T12:00:00+00:00",
            "environment": "prod",
            "projectId": "dullypdf",
            "accessMode": "local-adc",
        },
        "global": {
            "totalUsers": 1,
            "activeUsers": 1,
            "roleCounts": {"base": 1, "pro": 0, "god": 0, "unknown": 0},
            "totalDetections": 2,
            "totalDetectionPages": 5,
            "totalSavedTemplates": 1,
            "totalCreditsUsed": 6,
            "totalFillLinks": 1,
            "totalActiveFillLinks": 1,
            "totalFillLinkResponses": 3,
            "totalApiEndpoints": 1,
            "totalActiveApiEndpoints": 1,
            "totalApiFills": 4,
            "totalSigningRequests": 2,
            "totalCompletedSigningRequests": 1,
        },
        "users": [],
    }
    mocker.patch.object(server, "build_internal_stats_snapshot", return_value=snapshot)

    with TestClient(server.app) as client:
        response = client.get("/api/stats")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == snapshot


def test_root_serves_dashboard_html(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "dullypdf")
    with TestClient(server.app) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert "Production usage stats" in response.text
    assert response.headers["cache-control"] == "no-store"
