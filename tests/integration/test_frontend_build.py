"""Frontend production build must succeed (Compose image depends on it)."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest


def test_frontend_production_build(repo_root: Path) -> None:
    frontend = repo_root / "frontend"
    if not (frontend / "node_modules").is_dir():
        pytest.skip(
            "frontend/node_modules missing — covered by the frontend CI job "
            "(or run npm ci in frontend/ locally)"
        )
    env = os.environ.copy()
    env["VITE_USE_MOCK"] = "false"
    # Keep npm/vite caches on E: when the helper script was sourced.
    proc = subprocess.run(
        ["npm", "run", "build"],
        cwd=frontend,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=sys.platform == "win32",
        timeout=300,
    )
    if proc.returncode != 0:
        raise AssertionError(
            "frontend npm run build failed\n"
            f"--- stdout ---\n{proc.stdout[-4000:]}\n"
            f"--- stderr ---\n{proc.stderr[-4000:]}"
        )
    index = frontend / "dist" / "client" / "index.html"
    assert index.is_file(), f"missing SPA shell: {index}"

