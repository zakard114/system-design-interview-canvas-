"""Persistent session store (SQLAlchemy). Same API as the former MemoryStore."""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .db import init_db, make_engine, make_session_factory
from .db_models import CanvasObjectRow, ParticipantRow, SessionRow
from .models import (
    CanvasObjectPatch,
    EdgeObject,
    NewCanvasObject,
    NewEdgeObject,
    NewNodeObject,
    NewStickyObject,
    NewStrokeObject,
    NodeObject,
    Participant,
    ParticipantRole,
    Session,
    StickyObject,
    StrokeObject,
)

CanvasObj = NodeObject | EdgeObject | StickyObject | StrokeObject


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id() -> str:
    return uuid.uuid4().hex


def _join_code() -> str:
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(6))


class SessionNotFoundError(Exception):
    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        super().__init__(f'Session "{session_id}" was not found')


class ObjectNotFoundError(Exception):
    def __init__(self, object_id: str) -> None:
        self.object_id = object_id
        super().__init__(f'Object "{object_id}" was not found')


def _row_to_session(row: SessionRow) -> Session:
    return Session(
        id=row.id,
        joinCode=row.join_code,
        createdAt=row.created_at,
        status=row.status,  # type: ignore[arg-type]
    )


def _row_to_participant(row: ParticipantRow) -> Participant:
    return Participant(
        id=row.id,
        sessionId=row.session_id,
        displayName=row.display_name,
        role=row.role,  # type: ignore[arg-type]
        joinedAt=row.joined_at,
    )


def _payload_to_object(payload: dict) -> CanvasObj:
    kind = payload.get("kind")
    if kind == "node":
        return NodeObject.model_validate(payload)
    if kind == "edge":
        return EdgeObject.model_validate(payload)
    if kind == "sticky":
        return StickyObject.model_validate(payload)
    if kind == "stroke":
        return StrokeObject.model_validate(payload)
    raise ValueError(f"Unknown canvas object kind: {kind}")


def _build_new_object(object_id: str, body: NewCanvasObject) -> CanvasObj:
    if isinstance(body, NewNodeObject):
        return NodeObject(
            id=object_id,
            createdBy=body.createdBy,
            kind="node",
            type=body.type,
            x=body.x,
            y=body.y,
            w=body.w,
            h=body.h,
            label=body.label,
        )
    if isinstance(body, NewEdgeObject):
        return EdgeObject.model_validate(
            {
                "id": object_id,
                "createdBy": body.createdBy,
                "kind": "edge",
                "from": body.from_,
                "to": body.to,
                "label": body.label,
                "lineStyle": body.lineStyle,
                "pathStyle": body.pathStyle,
                "fromAnchor": body.fromAnchor.model_dump() if body.fromAnchor else None,
                "toAnchor": body.toAnchor.model_dump() if body.toAnchor else None,
            }
        )
    if isinstance(body, NewStickyObject):
        return StickyObject(
            id=object_id,
            createdBy=body.createdBy,
            kind="sticky",
            x=body.x,
            y=body.y,
            text=body.text,
        )
    if isinstance(body, NewStrokeObject):
        return StrokeObject(
            id=object_id,
            createdBy=body.createdBy,
            kind="stroke",
            points=body.points,
            color=body.color,
            width=body.width,
            lineStyle=body.lineStyle,
        )
    raise TypeError(f"Unsupported object body: {type(body)}")


class SqlStore:
    def __init__(self, database_url: str | None = None) -> None:
        self.engine = make_engine(database_url)
        init_db(self.engine)
        self._SessionLocal = make_session_factory(self.engine)

    def _db(self) -> DbSession:
        return self._SessionLocal()

    def create_session(self, display_name: str | None = None) -> tuple[Session, Participant | None]:
        session = Session(
            id=_new_id(),
            joinCode=_join_code(),
            createdAt=_now_iso(),
            status="open",
        )
        with self._db() as db:
            db.add(
                SessionRow(
                    id=session.id,
                    join_code=session.joinCode,
                    created_at=session.createdAt,
                    status=session.status,
                )
            )
            db.commit()

        participant: Participant | None = None
        if display_name:
            participant = self.join_session(
                session.id, display_name=display_name, role="interviewer"
            )
        return session, participant

    def get_session(self, session_id: str) -> Session:
        with self._db() as db:
            row = db.get(SessionRow, session_id)
            if row is None:
                raise SessionNotFoundError(session_id)
            return _row_to_session(row)

    def require_session(self, session_id: str) -> Session:
        return self.get_session(session_id)

    def join_session(
        self,
        session_id: str,
        *,
        display_name: str,
        role: ParticipantRole | None = None,
    ) -> Participant:
        self.require_session(session_id)
        participant = Participant(
            id=_new_id(),
            sessionId=session_id,
            displayName=display_name,
            role=role or "candidate",
            joinedAt=_now_iso(),
        )
        with self._db() as db:
            db.add(
                ParticipantRow(
                    id=participant.id,
                    session_id=participant.sessionId,
                    display_name=participant.displayName,
                    role=participant.role,
                    joined_at=participant.joinedAt,
                )
            )
            db.commit()
        return participant

    def leave_session(self, session_id: str, participant_id: str) -> list[Participant]:
        self.require_session(session_id)
        with self._db() as db:
            row = db.get(ParticipantRow, participant_id)
            if row is not None and row.session_id == session_id:
                db.delete(row)
                db.commit()
        return self.list_participants(session_id)

    def list_participants(self, session_id: str) -> list[Participant]:
        self.require_session(session_id)
        with self._db() as db:
            rows = db.scalars(
                select(ParticipantRow)
                .where(ParticipantRow.session_id == session_id)
                .order_by(ParticipantRow.joined_at)
            ).all()
            return [_row_to_participant(r) for r in rows]

    def list_objects(self, session_id: str) -> list[CanvasObj]:
        self.require_session(session_id)
        with self._db() as db:
            rows = db.scalars(
                select(CanvasObjectRow).where(CanvasObjectRow.session_id == session_id)
            ).all()
            return [_payload_to_object(dict(r.payload)) for r in rows]

    def create_object(self, session_id: str, body: NewCanvasObject) -> CanvasObj:
        self.require_session(session_id)
        obj = _build_new_object(_new_id(), body)
        payload = obj.model_dump(mode="json", by_alias=True)
        with self._db() as db:
            db.add(
                CanvasObjectRow(
                    id=obj.id,
                    session_id=session_id,
                    kind=obj.kind,
                    payload=payload,
                )
            )
            db.commit()
        return obj

    def update_object(
        self, session_id: str, object_id: str, patch: CanvasObjectPatch
    ) -> CanvasObj:
        self.require_session(session_id)
        with self._db() as db:
            row = db.get(CanvasObjectRow, object_id)
            if row is None or row.session_id != session_id:
                raise ObjectNotFoundError(object_id)
            data = dict(row.payload)
            updates = patch.model_dump(mode="json", by_alias=True, exclude_unset=True)
            if "kind" in updates and updates["kind"] != data["kind"]:
                raise ValueError("kind cannot change object variant")
            data.update(updates)
            updated = _payload_to_object(data)
            row.kind = updated.kind
            row.payload = updated.model_dump(mode="json", by_alias=True)
            db.commit()
            return updated

    def delete_object(self, session_id: str, object_id: str) -> None:
        self.require_session(session_id)
        with self._db() as db:
            row = db.get(CanvasObjectRow, object_id)
            if row is None or row.session_id != session_id:
                raise ObjectNotFoundError(object_id)
            # Cascade: removing a node also removes attached edges.
            if row.kind == "node":
                edges = db.scalars(
                    select(CanvasObjectRow).where(
                        CanvasObjectRow.session_id == session_id,
                        CanvasObjectRow.kind == "edge",
                    )
                ).all()
                for edge in edges:
                    payload = dict(edge.payload)
                    frm = payload.get("from") or payload.get("from_")
                    to = payload.get("to")
                    if frm == object_id or to == object_id:
                        db.delete(edge)
            db.delete(row)
            db.commit()


# Default app store (file: backend/data/app.db unless DATABASE_URL is set).
store = SqlStore()
