"""SQLite persistence tests for SqlStore."""

from __future__ import annotations

from pathlib import Path

from interview_canvas_backend.models import NewNodeObject
from interview_canvas_backend.store import SessionNotFoundError, SqlStore


def test_session_and_object_survive_new_store_instance(tmp_path: Path) -> None:
    db_url = f"sqlite:///{(tmp_path / 't.db').resolve().as_posix()}"
    store_a = SqlStore(db_url)
    session, participant = store_a.create_session(display_name="Alice")
    assert participant is not None
    assert participant.role == "interviewer"

    created = store_a.create_object(
        session.id,
        NewNodeObject(
            createdBy=participant.id,
            kind="node",
            type="service",
            x=1,
            y=2,
            w=100,
            h=40,
            label="API",
        ),
    )

    # Simulate process restart: new store, same DB file.
    store_b = SqlStore(db_url)
    loaded = store_b.get_session(session.id)
    assert loaded.joinCode == session.joinCode
    people = store_b.list_participants(session.id)
    assert len(people) == 1
    assert people[0].displayName == "Alice"
    objects = store_b.list_objects(session.id)
    assert len(objects) == 1
    assert objects[0].id == created.id
    assert objects[0].kind == "node"
    assert objects[0].label == "API"  # type: ignore[union-attr]


def test_missing_session_raises(tmp_path: Path) -> None:
    db_url = f"sqlite:///{(tmp_path / 't.db').resolve().as_posix()}"
    store = SqlStore(db_url)
    try:
        store.get_session("missing")
        raise AssertionError("expected SessionNotFoundError")
    except SessionNotFoundError:
        pass


def test_update_and_delete_object(tmp_path: Path) -> None:
    db_url = f"sqlite:///{(tmp_path / 't.db').resolve().as_posix()}"
    store = SqlStore(db_url)
    session, host = store.create_session(display_name="Host")
    assert host is not None
    obj = store.create_object(
        session.id,
        NewNodeObject(
            createdBy=host.id,
            kind="node",
            type="database",
            x=0,
            y=0,
            w=80,
            h=80,
            label="DB",
        ),
    )
    from interview_canvas_backend.models import CanvasObjectPatch

    updated = store.update_object(
        session.id, obj.id, CanvasObjectPatch.model_validate({"x": 42})
    )
    assert updated.x == 42  # type: ignore[union-attr]
    store.delete_object(session.id, obj.id)
    assert store.list_objects(session.id) == []
