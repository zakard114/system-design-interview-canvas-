"""REST + WebSocket routes matching openapi.yaml."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response
from pydantic import Field, TypeAdapter, ValidationError

from .models import (
    CanvasObjectPatch,
    CreateSessionRequest,
    CreateSessionResponse,
    ErrorBody,
    JoinSessionRequest,
    LeaveSessionRequest,
    NewEdgeObject,
    NewNodeObject,
    NewStickyObject,
    NewStrokeObject,
    ObjectCreatedEvent,
    ObjectDeletedEvent,
    ObjectUpdatedEvent,
    ParticipantsUpdatedEvent,
    Session,
)
from .realtime import manager
from .store import ObjectNotFoundError, SessionNotFoundError, store

router = APIRouter()

NewObjectAdapter: TypeAdapter = TypeAdapter(
    Annotated[
        NewNodeObject | NewEdgeObject | NewStickyObject | NewStrokeObject,
        Field(discriminator="kind"),
    ]
)


def _session_not_found(session_id: str) -> JSONResponse:
    body = ErrorBody(
        error="SessionNotFoundError",
        message=f'Session "{session_id}" was not found',
    )
    return JSONResponse(status_code=404, content=body.model_dump())


def _object_not_found(object_id: str) -> JSONResponse:
    body = ErrorBody(
        error="ObjectNotFoundError",
        message=f'Object "{object_id}" was not found',
    )
    return JSONResponse(status_code=404, content=body.model_dump())


def _bad_request(message: str) -> JSONResponse:
    body = ErrorBody(error="ValidationError", message=message)
    return JSONResponse(status_code=400, content=body.model_dump())


@router.post("/api/sessions", status_code=201, response_model=CreateSessionResponse)
async def create_session(body: CreateSessionRequest | None = None) -> CreateSessionResponse:
    display_name = body.displayName if body else None
    session, participant = store.create_session(display_name)
    if participant is not None:
        await manager.broadcast(
            session.id,
            ParticipantsUpdatedEvent(
                sessionId=session.id,
                participants=store.list_participants(session.id),
            ),
        )
    return CreateSessionResponse(session=session, participant=participant)


@router.get("/api/sessions/{sessionId}", response_model=Session)
async def get_session(sessionId: str) -> Session | JSONResponse:
    try:
        return store.get_session(sessionId)
    except SessionNotFoundError:
        return _session_not_found(sessionId)


@router.post("/api/sessions/{sessionId}/join")
async def join_session(sessionId: str, body: JoinSessionRequest):
    try:
        participant = store.join_session(
            sessionId,
            display_name=body.displayName,
            role=body.role,
        )
    except SessionNotFoundError:
        return _session_not_found(sessionId)

    await manager.broadcast(
        sessionId,
        ParticipantsUpdatedEvent(
            sessionId=sessionId,
            participants=store.list_participants(sessionId),
        ),
    )
    return participant


@router.post("/api/sessions/{sessionId}/leave", status_code=204)
async def leave_session(sessionId: str, body: LeaveSessionRequest):
    try:
        participants = store.leave_session(sessionId, body.participantId)
    except SessionNotFoundError:
        return _session_not_found(sessionId)

    await manager.broadcast(
        sessionId,
        ParticipantsUpdatedEvent(sessionId=sessionId, participants=participants),
    )
    return Response(status_code=204)


@router.get("/api/sessions/{sessionId}/participants")
async def list_participants(sessionId: str):
    try:
        return store.list_participants(sessionId)
    except SessionNotFoundError:
        return _session_not_found(sessionId)


@router.get("/api/sessions/{sessionId}/objects")
async def list_objects(sessionId: str):
    try:
        objects = store.list_objects(sessionId)
    except SessionNotFoundError:
        return _session_not_found(sessionId)
    return JSONResponse(
        content=[obj.model_dump(mode="json", by_alias=True) for obj in objects],
    )


@router.post("/api/sessions/{sessionId}/objects", status_code=201)
async def create_object(sessionId: str, body: dict):
    # Discriminated unions can omit defaults for missing keys; normalize edge label.
    if isinstance(body, dict) and body.get("kind") == "edge" and "label" not in body:
        body = {**body, "label": ""}
    try:
        parsed = NewObjectAdapter.validate_python(body)
    except ValidationError as exc:
        return _bad_request(str(exc.errors()))

    try:
        obj = store.create_object(sessionId, parsed)
    except SessionNotFoundError:
        return _session_not_found(sessionId)

    await manager.broadcast(
        sessionId,
        ObjectCreatedEvent(sessionId=sessionId, object=obj),
    )
    return JSONResponse(
        status_code=201,
        content=obj.model_dump(mode="json", by_alias=True),
    )


@router.patch("/api/sessions/{sessionId}/objects/{objectId}")
async def update_object(sessionId: str, objectId: str, body: CanvasObjectPatch):
    try:
        obj = store.update_object(sessionId, objectId, body)
    except SessionNotFoundError:
        return _session_not_found(sessionId)
    except ObjectNotFoundError:
        return _object_not_found(objectId)
    except ValueError as exc:
        return _bad_request(str(exc))

    await manager.broadcast(
        sessionId,
        ObjectUpdatedEvent(sessionId=sessionId, object=obj),
    )
    return JSONResponse(content=obj.model_dump(mode="json", by_alias=True))


@router.delete("/api/sessions/{sessionId}/objects/{objectId}", status_code=204)
async def delete_object(sessionId: str, objectId: str):
    try:
        store.delete_object(sessionId, objectId)
    except SessionNotFoundError:
        return _session_not_found(sessionId)
    except ObjectNotFoundError:
        return _object_not_found(objectId)

    await manager.broadcast(
        sessionId,
        ObjectDeletedEvent(sessionId=sessionId, objectId=objectId),
    )
    return Response(status_code=204)


@router.websocket("/api/sessions/{sessionId}/ws")
async def session_ws(websocket: WebSocket, sessionId: str) -> None:
    try:
        store.require_session(sessionId)
    except SessionNotFoundError:
        await websocket.close(code=4404)
        return

    await manager.connect(sessionId, websocket)
    try:
        while True:
            # Keep connection alive; ignore client payloads (no command protocol).
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(sessionId, websocket)
