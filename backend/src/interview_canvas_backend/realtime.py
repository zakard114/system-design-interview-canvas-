"""WebSocket room fan-out for SessionEvent messages."""

from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket
from pydantic import BaseModel


class ConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._rooms.setdefault(session_id, set()).add(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        sockets = self._rooms.get(session_id)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            self._rooms.pop(session_id, None)

    async def broadcast(self, session_id: str, event: BaseModel | dict[str, Any]) -> None:
        # by_alias keeps JSON key `from` (not `from_`) so the FE can render edges.
        if isinstance(event, BaseModel):
            payload = event.model_dump(mode="json", by_alias=True)
        else:
            payload = event
        text = json.dumps(payload, default=str)
        sockets = list(self._rooms.get(session_id, set()))
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(session_id, ws)


manager = ConnectionManager()
