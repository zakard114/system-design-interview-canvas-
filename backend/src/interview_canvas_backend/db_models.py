"""ORM tables for persistent store (SQLite now, Postgres later via DATABASE_URL)."""

from __future__ import annotations

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from .db import Base


class SessionRow(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    join_code: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)


class ParticipantRow(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    joined_at: Mapped[str] = mapped_column(String(64), nullable=False)


class CanvasObjectRow(Base):
    __tablename__ = "canvas_objects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # Full camelCase object payload (matches openapi / FE types).
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
