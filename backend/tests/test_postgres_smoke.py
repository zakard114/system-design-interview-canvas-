"""Optional Postgres smoke — runs only when DATABASE_URL points at Postgres."""

from __future__ import annotations

import os

import pytest

from interview_canvas_backend.models import NewNodeObject
from interview_canvas_backend.store import SqlStore


def _postgres_url() -> str | None:
    url = os.environ.get("DATABASE_URL", "").strip()
    if url.startswith("postgresql"):
        return url
    return None


@pytest.fixture
def postgres_url() -> str:
    url = _postgres_url()
    if not url:
        pytest.skip("Set DATABASE_URL=postgresql+psycopg://... to run Postgres smoke")
    return url


def test_postgres_session_roundtrip(postgres_url: str) -> None:
    store = SqlStore(postgres_url)
    session, host = store.create_session(display_name="PgHost")
    assert host is not None
    obj = store.create_object(
        session.id,
        NewNodeObject(
            createdBy=host.id,
            kind="node",
            type="service",
            x=10,
            y=20,
            w=100,
            h=40,
            label="PgAPI",
        ),
    )
    again = SqlStore(postgres_url)
    loaded = again.get_session(session.id)
    assert loaded.id == session.id
    objects = again.list_objects(session.id)
    assert any(o.id == obj.id for o in objects)
