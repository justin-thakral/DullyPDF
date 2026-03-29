"""Standalone local-only internal stats server."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from internal_stats.collector import (
    build_internal_stats_snapshot,
    require_prod_project_configuration,
)


STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    require_prod_project_configuration()
    yield


app = FastAPI(
    title="DullyPDF Internal Stats",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def apply_no_store_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/stats")
async def get_stats() -> JSONResponse:
    try:
        payload = build_internal_stats_snapshot()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive boundary for operator tooling
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build internal stats snapshot: {exc}",
        ) from exc
    return JSONResponse(payload)


@app.get("/")
async def get_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
