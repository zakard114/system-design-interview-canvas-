"""Two WebSocket clients should both receive object_created after HTTP create."""

from __future__ import annotations

import asyncio
import json
import urllib.request

import websockets

BASE = "http://127.0.0.1:8000"
WS_BASE = "ws://127.0.0.1:8000"


def http_json(method: str, path: str, body: dict | None = None) -> object:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=15) as res:
        raw = res.read().decode()
        return json.loads(raw) if raw else None


async def recv_until(ws, predicate, timeout: float = 8.0):
    async def _loop():
        while True:
            msg = json.loads(await ws.recv())
            if predicate(msg):
                return msg

    return await asyncio.wait_for(_loop(), timeout=timeout)


async def main_async() -> None:
    created = http_json("POST", "/api/sessions", {"displayName": "WsSmoke"})
    assert isinstance(created, dict)
    sid = created["session"]["id"]
    pid = created["participant"]["id"]
    url = f"{WS_BASE}/api/sessions/{sid}/ws"

    async with websockets.connect(url) as a, websockets.connect(url) as b:
        # create object via HTTP while both sockets listen
        async def create_later():
            await asyncio.sleep(0.3)
            return await asyncio.to_thread(
                http_json,
                "POST",
                f"/api/sessions/{sid}/objects",
                {
                    "kind": "node",
                    "type": "cache",
                    "x": 10,
                    "y": 10,
                    "w": 100,
                    "h": 60,
                    "label": "WsNode",
                    "createdBy": pid,
                },
            )

        create_task = asyncio.create_task(create_later())

        def is_created(m: dict) -> bool:
            return m.get("type") == "object_created" and (m.get("object") or {}).get("label") == "WsNode"

        msg_a, msg_b, node = await asyncio.gather(
            recv_until(a, is_created),
            recv_until(b, is_created),
            create_task,
        )
        assert isinstance(node, dict)
        print(
            json.dumps(
                {
                    "ok": True,
                    "sessionId": sid,
                    "wsClients": 2,
                    "eventA": msg_a.get("type"),
                    "eventB": msg_b.get("type"),
                    "objectId": node.get("id"),
                },
                indent=2,
            )
        )


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
