"""Edge create validation + JSON alias (`from` not `from_`)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from interview_canvas_backend.main import app


def test_edge_create_with_empty_label_returns_from_alias() -> None:
    client = TestClient(app)
    created = client.post("/api/sessions", json={"displayName": "EdgeTester"}).json()
    sid = created["session"]["id"]
    pid = created["participant"]["id"]

    a = client.post(
        f"/api/sessions/{sid}/objects",
        json={
            "kind": "node",
            "type": "service",
            "x": 0,
            "y": 0,
            "w": 100,
            "h": 60,
            "label": "A",
            "createdBy": pid,
        },
    ).json()
    b = client.post(
        f"/api/sessions/{sid}/objects",
        json={
            "kind": "node",
            "type": "database",
            "x": 200,
            "y": 0,
            "w": 100,
            "h": 60,
            "label": "B",
            "createdBy": pid,
        },
    ).json()

    # FE arrow tool payload (label may be omitted by older clients).
    res = client.post(
        f"/api/sessions/{sid}/objects",
        json={"kind": "edge", "from": a["id"], "to": b["id"], "createdBy": pid},
    )
    assert res.status_code == 201, res.text
    edge = res.json()
    assert edge["kind"] == "edge"
    assert "from" in edge
    assert "from_" not in edge
    assert edge["from"] == a["id"]
    assert edge["to"] == b["id"]
    assert edge["label"] == ""

    listed = client.get(f"/api/sessions/{sid}/objects").json()
    edges = [o for o in listed if o["kind"] == "edge"]
    assert len(edges) == 1
    assert edges[0]["from"] == a["id"]


def test_edge_create_with_explicit_empty_label() -> None:
    client = TestClient(app)
    created = client.post("/api/sessions", json={"displayName": "Edge2"}).json()
    sid = created["session"]["id"]
    pid = created["participant"]["id"]
    a = client.post(
        f"/api/sessions/{sid}/objects",
        json={
            "kind": "node",
            "type": "service",
            "x": 0,
            "y": 0,
            "w": 10,
            "h": 10,
            "label": "A",
            "createdBy": pid,
        },
    ).json()
    b = client.post(
        f"/api/sessions/{sid}/objects",
        json={
            "kind": "node",
            "type": "queue",
            "x": 40,
            "y": 0,
            "w": 10,
            "h": 10,
            "label": "B",
            "createdBy": pid,
        },
    ).json()
    res = client.post(
        f"/api/sessions/{sid}/objects",
        json={
            "kind": "edge",
            "from": a["id"],
            "to": b["id"],
            "label": "",
            "createdBy": pid,
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["from"] == a["id"]
