"""Pydantic models matching openapi.yaml (camelCase JSON)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

NodeType = Literal["service", "database", "queue", "cache", "loadbalancer", "llm"]
ParticipantRole = Literal["interviewer", "candidate"]
SessionStatus = Literal["open", "closed"]
ObjectKind = Literal["node", "edge", "sticky", "stroke"]
StrokeLineStyle = Literal["solid", "dashed", "dotted"]
PathStyle = Literal["straight", "curved"]


class ErrorBody(BaseModel):
    error: str
    message: str


class AnchorUV(BaseModel):
    u: float
    v: float


class Session(BaseModel):
    id: str
    joinCode: str
    createdAt: str
    status: SessionStatus


class Participant(BaseModel):
    id: str
    sessionId: str
    displayName: str
    role: ParticipantRole
    joinedAt: str


class CreateSessionRequest(BaseModel):
    displayName: str | None = None


class CreateSessionResponse(BaseModel):
    session: Session
    participant: Participant | None


class JoinSessionRequest(BaseModel):
    displayName: str
    role: ParticipantRole | None = None


class LeaveSessionRequest(BaseModel):
    participantId: str


class NodeObject(BaseModel):
    id: str
    createdBy: str
    kind: Literal["node"] = "node"
    type: NodeType
    x: float
    y: float
    w: float
    h: float
    label: str


class EdgeObject(BaseModel):
    id: str
    createdBy: str
    kind: Literal["edge"] = "edge"
    from_: str = Field(alias="from")
    to: str
    label: str = ""
    lineStyle: StrokeLineStyle = "solid"
    pathStyle: PathStyle = "straight"
    fromAnchor: AnchorUV | None = None
    toAnchor: AnchorUV | None = None

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class StickyObject(BaseModel):
    id: str
    createdBy: str
    kind: Literal["sticky"] = "sticky"
    x: float
    y: float
    text: str


class StrokeObject(BaseModel):
    id: str
    createdBy: str
    kind: Literal["stroke"] = "stroke"
    points: list[list[float]]
    color: str
    width: float
    lineStyle: StrokeLineStyle = "solid"


CanvasObject = Annotated[
    NodeObject | EdgeObject | StickyObject | StrokeObject,
    Field(discriminator="kind"),
]


class NewNodeObject(BaseModel):
    createdBy: str
    kind: Literal["node"] = "node"
    type: NodeType
    x: float
    y: float
    w: float
    h: float
    label: str


class NewEdgeObject(BaseModel):
    createdBy: str
    kind: Literal["edge"] = "edge"
    from_: str = Field(alias="from")
    to: str
    label: str = ""
    lineStyle: StrokeLineStyle = "solid"
    pathStyle: PathStyle = "straight"
    fromAnchor: AnchorUV | None = None
    toAnchor: AnchorUV | None = None

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class NewStickyObject(BaseModel):
    createdBy: str
    kind: Literal["sticky"] = "sticky"
    x: float
    y: float
    text: str


class NewStrokeObject(BaseModel):
    createdBy: str
    kind: Literal["stroke"] = "stroke"
    points: list[list[float]]
    color: str
    width: float
    lineStyle: StrokeLineStyle = "solid"


NewCanvasObject = Annotated[
    NewNodeObject | NewEdgeObject | NewStickyObject | NewStrokeObject,
    Field(discriminator="kind"),
]


class CanvasObjectPatch(BaseModel):
    createdBy: str | None = None
    kind: ObjectKind | None = None
    type: NodeType | None = None
    x: float | None = None
    y: float | None = None
    w: float | None = None
    h: float | None = None
    label: str | None = None
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    text: str | None = None
    points: list[list[float]] | None = None
    color: str | None = None
    width: float | None = None
    lineStyle: StrokeLineStyle | None = None
    pathStyle: PathStyle | None = None
    fromAnchor: AnchorUV | None = None
    toAnchor: AnchorUV | None = None

    model_config = ConfigDict(
        populate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
    )


class ObjectCreatedEvent(BaseModel):
    type: Literal["object_created"] = "object_created"
    sessionId: str
    object: NodeObject | EdgeObject | StickyObject | StrokeObject


class ObjectUpdatedEvent(BaseModel):
    type: Literal["object_updated"] = "object_updated"
    sessionId: str
    object: NodeObject | EdgeObject | StickyObject | StrokeObject


class ObjectDeletedEvent(BaseModel):
    type: Literal["object_deleted"] = "object_deleted"
    sessionId: str
    objectId: str


class ParticipantsUpdatedEvent(BaseModel):
    type: Literal["participants_updated"] = "participants_updated"
    sessionId: str
    participants: list[Participant]


SessionEvent = (
    ObjectCreatedEvent
    | ObjectUpdatedEvent
    | ObjectDeletedEvent
    | ParticipantsUpdatedEvent
)
