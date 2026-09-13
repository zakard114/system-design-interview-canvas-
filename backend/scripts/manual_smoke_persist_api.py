"""End-to-end persistence smoke against a live API (create → restart-friendly re-read).

Does NOT restart the server itself — caller restarts uvicorn between phases if desired.
Phase A: create session + node + sticky, print ids.
Phase B: re-fetch by session id and assert object count/labels.

Usage:
  uv run python scripts/manual_smoke_persist_api.py create
  # restart backend
  uv run python scripts/manual_smoke_persist_api.py verify <sessionId> <nodeId> <stickyId>
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"


def req(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=15) as res:
            raw = res.read().decode()
            return res.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            payload = raw
        return e.code, payload


def phase_create() -> int:
    code, health = req("GET", "/health")
    assert code == 200 and isinstance(health, dict) and health.get("status") == "ok", health

    code, created = req("POST", "/api/sessions", {"displayName": "SmokePersist"})
    assert code == 201 and isinstance(created, dict), created
    session = created["session"]
    participant = created["participant"]
    sid = session["id"]
    pid = participant["id"]

    code, node = req(
        "POST",
        f"/api/sessions/{sid}/objects",
        {
            "kind": "node",
            "type": "service",
            "x": 120,
            "y": 80,
            "w": 168,
            "h": 76,
            "label": "PersistNode",
            "createdBy": pid,
        },
    )
    assert code == 201 and isinstance(node, dict), node

    code, sticky = req(
        "POST",
        f"/api/sessions/{sid}/objects",
        {
            "kind": "sticky",
            "x": 320,
            "y": 100,
            "text": "PersistNote",
            "createdBy": pid,
        },
    )
    assert code == 201 and isinstance(sticky, dict), sticky

    code, objs = req("GET", f"/api/sessions/{sid}/objects")
    assert code == 200 and isinstance(objs, list) and len(objs) == 2, objs

    out = {
        "sessionId": sid,
        "joinCode": session.get("joinCode"),
        "nodeId": node["id"],
        "stickyId": sticky["id"],
        "url": f"http://127.0.0.1:8080/s/{sid}",
        "objectCount": len(objs),
    }
    print(json.dumps(out, indent=2))
    return 0


def phase_verify(session_id: str, node_id: str, sticky_id: str) -> int:
    code, health = req("GET", "/health")
    assert code == 200, health

    code, session = req("GET", f"/api/sessions/{session_id}")
    assert code == 200 and isinstance(session, dict), session

    code, objs = req("GET", f"/api/sessions/{session_id}/objects")
    assert code == 200 and isinstance(objs, list), objs
    by_id = {o["id"]: o for o in objs if isinstance(o, dict)}
    assert node_id in by_id, (node_id, list(by_id))
    assert sticky_id in by_id, (sticky_id, list(by_id))
    assert by_id[node_id].get("label") == "PersistNode", by_id[node_id]
    assert by_id[sticky_id].get("text") == "PersistNote", by_id[sticky_id]
    print(
        json.dumps(
            {
                "ok": True,
                "sessionId": session_id,
                "objectCount": len(objs),
                "labels": {
                    "node": by_id[node_id].get("label"),
                    "sticky": by_id[sticky_id].get("text"),
                },
            },
            indent=2,
        )
    )
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    cmd = sys.argv[1]
    if cmd == "create":
        return phase_create()
    if cmd == "verify":
        if len(sys.argv) != 5:
            print("usage: verify <sessionId> <nodeId> <stickyId>")
            return 2
        return phase_verify(sys.argv[2], sys.argv[3], sys.argv[4])
    print("unknown command", cmd)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
