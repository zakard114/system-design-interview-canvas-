"""Live API checks against docker-compose.yaml (app + Postgres)."""

from __future__ import annotations

import httpx


def test_health_ok(compose_url: str) -> None:
    with httpx.Client(timeout=15.0) as client:
        res = client.get(f"{compose_url}/health")
    assert res.status_code == 200
    assert res.json().get("status") == "ok"


def test_create_session_and_object_persists(compose_url: str) -> None:
    with httpx.Client(timeout=30.0) as client:
        created = client.post(
            f"{compose_url}/api/sessions",
            json={"displayName": "IntegrationHost"},
        )
        assert created.status_code == 201, created.text
        body = created.json()
        session = body["session"]
        participant = body["participant"]
        assert session["id"]
        assert participant is not None

        session_id = session["id"]
        obj = client.post(
            f"{compose_url}/api/sessions/{session_id}/objects",
            json={
                "createdBy": participant["id"],
                "kind": "node",
                "type": "service",
                "x": 40,
                "y": 50,
                "w": 120,
                "h": 48,
                "label": "ComposeAPI",
            },
        )
        assert obj.status_code == 201, obj.text
        object_id = obj.json()["id"]

        listed = client.get(f"{compose_url}/api/sessions/{session_id}/objects")
        assert listed.status_code == 200
        ids = [row["id"] for row in listed.json()]
        assert object_id in ids

        again = client.get(f"{compose_url}/api/sessions/{session_id}")
        assert again.status_code == 200
        assert again.json()["id"] == session_id
