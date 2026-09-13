"""FastAPI application — openapi.yaml + SQLite-backed store."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
