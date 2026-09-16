"""FastAPI application — openapi.yaml + SQLite-backed store."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .db import init_db
from .routes import router
from .store import store


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db(store.engine)
    yield


app = FastAPI(
    title="System Design Interview Canvas API",
    version="0.1.0",
    description="openapi.yaml contract with SQLite persistence (DATABASE_URL override).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    # Vite picks another port when 8080 is busy (e.g. 8081).
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _mount_frontend_spa(application: FastAPI) -> None:
    static_root = os.getenv("INTERVIEW_CANVAS_STATIC_DIR", "").strip()
    if not static_root:
        return
    frontend_dir = Path(static_root).resolve()
    index_path = frontend_dir / "index.html"
    if not index_path.is_file():
        return

    @application.get("/{path:path}", include_in_schema=False)
    async def serve_frontend(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        requested = (frontend_dir / path).resolve()
        if requested.is_relative_to(frontend_dir) and requested.is_file():
            return FileResponse(requested)
        return FileResponse(index_path)


_mount_frontend_spa(app)
