"""Session maintenance endpoints."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Response

from backend.services.auth_service import require_user
from backend.sessions.session_store import (
    get_session_entry as _get_session_entry,
    touch_session_entry as _touch_session_entry,
)
from backend.services.pdf_service import safe_pdf_download_filename

router = APIRouter()


@router.post("/api/sessions/{session_id}/touch")
async def touch_session(
    session_id: str,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Refresh the session TTL so long-lived editor sessions are not cleaned up."""
    user = require_user(authorization)
    _touch_session_entry(session_id, user)
    return {"success": True, "sessionId": session_id}


@router.get("/api/sessions/{session_id}/pdf")
async def download_session_pdf(
    session_id: str,
    authorization: Optional[str] = Header(default=None),
) -> Response:
    """Return the original PDF bytes for a session-backed workspace restore."""
    user = require_user(authorization)
    entry = _get_session_entry(
        session_id,
        user,
        include_pdf_bytes=True,
        include_fields=False,
        include_result=False,
        include_renames=False,
        include_checkbox_rules=False,
    )
    pdf_bytes = entry.get("pdf_bytes")
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="Session PDF not found")
    filename = safe_pdf_download_filename(entry.get("source_pdf") or "document")
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "private, no-store",
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
