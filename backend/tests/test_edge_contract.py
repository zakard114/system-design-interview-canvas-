"""Edge create/serialize contract used by FE arrow tool."""

from __future__ import annotations

from interview_canvas_backend.models import EdgeObject, NewEdgeObject, ObjectCreatedEvent
from interview_canvas_backend.routes import NewObjectAdapter
from interview_canvas_backend.store import SqlStore
from interview_canvas_backend.models import NewNodeObject


def test_new_edge_accepts_from_alias_and_optional_label() -> None:
    parsed = NewObjectAdapter.validate_python(
        {"kind": "edge", "from": "n1", "to": "n2", "createdBy": "p1"}
    )
    assert isinstance(parsed, NewEdgeObject)
    assert parsed.from_ == "n1"
    assert parsed.to == "n2"
    assert parsed.label == ""


def test_edge_json_uses_from_not_from_underscore() -> None:
    edge = EdgeObject.model_validate(
        {
            "id": "e1",
            "createdBy": "p1",
            "kind": "edge",
            "from": "n1",
            "to": "n2",
            "label": "",
        }
    )
    dumped = edge.model_dump(mode="json", by_alias=True)
    assert "from" in dumped
    assert "from_" not in dumped
    event = ObjectCreatedEvent(sessionId="s1", object=edge).model_dump(
        mode="json", by_alias=True
    )
    assert event["object"]["from"] == "n1"


def test_sql_store_roundtrip_edge(tmp_path) -> None:
    db_url = f"sqlite:///{(tmp_path / 'e.db').resolve().as_posix()}"
    store = SqlStore(db_url)
    session, host = store.create_session(display_name="Host")
    assert host is not None
    a = store.create_object(
        session.id,
        NewNodeObject(
            createdBy=host.id,
            kind="node",
            type="service",
            x=0,
            y=0,
            w=100,
            h=60,
            label="A",
        ),
    )
    b = store.create_object(
        session.id,
        NewNodeObject(
            createdBy=host.id,
            kind="node",
            type="database",
            x=200,
            y=0,
            w=100,
            h=60,
            label="B",
        ),
    )
    edge = store.create_object(
        session.id,
        NewObjectAdapter.validate_python(
            {
                "kind": "edge",
                "from": a.id,
                "to": b.id,
                "label": "",
                "createdBy": host.id,
            }
        ),
    )
    assert edge.kind == "edge"
    listed = store.list_objects(session.id)
    edges = [o for o in listed if o.kind == "edge"]
    assert len(edges) == 1
    dumped = edges[0].model_dump(mode="json", by_alias=True)
    assert dumped["from"] == a.id
    assert dumped["to"] == b.id
