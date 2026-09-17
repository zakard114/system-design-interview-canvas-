"""Shared fixtures for Compose-stack integration tests."""

from __future__ import annotations

import os
from pathlib import Path

import httpx
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BASE_URL = "http://127.0.0.1:8100"


def base_url() -> str:
    return os.environ.get("E2E_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


@pytest.fixture(scope="session")
def compose_url() -> str:
    url = base_url()
    try:
        with httpx.Client(timeout=5.0) as client:
            res = client.get(f"{url}/health")
            if res.status_code != 200:
                pytest.skip(f"Compose stack not healthy at {url}/health ({res.status_code})")
    except httpx.HTTPError as exc:
        pytest.skip(
            f"Compose stack not reachable at {url} ({exc}). "
            "Run: docker compose up --build -d"
        )
    return url


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return REPO_ROOT
