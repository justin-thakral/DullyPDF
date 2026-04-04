"""Regression checks for frontend hosting security headers."""

from __future__ import annotations

import json
from pathlib import Path


FIREBASE_CONFIG_PATH = Path("firebase.json")


def _firebase_headers() -> list[dict]:
    payload = json.loads(FIREBASE_CONFIG_PATH.read_text(encoding="utf-8"))
    return payload["hosting"]["headers"]


def test_firebase_hosting_config_applies_security_headers_globally() -> None:
    headers = _firebase_headers()
    global_entry = next(entry for entry in headers if entry.get("source") == "**")
    header_values = {item["key"]: item["value"] for item in global_entry["headers"]}

    csp = header_values["Content-Security-Policy"]
    assert "default-src 'self'" in csp
    assert "base-uri 'self'" in csp
    assert "frame-ancestors 'self'" in csp
    assert "object-src 'none'" in csp
    assert "form-action 'self'" in csp
    assert "script-src 'self' https://www.googletagmanager.com" in csp
    assert "frame-src 'self' blob: https://www.google.com https://recaptcha.google.com https://dullypdf.firebaseapp.com" in csp
    assert "worker-src 'self' blob:" in csp
    assert "media-src 'self' data: blob: https:" in csp
    assert header_values["X-Frame-Options"] == "SAMEORIGIN"
    assert header_values["X-Content-Type-Options"] == "nosniff"
    assert header_values["Referrer-Policy"] == "strict-origin-when-cross-origin"
