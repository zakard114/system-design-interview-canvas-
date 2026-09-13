"""SQLAlchemy engine — SQLite by default, DATABASE_URL override (Postgres-ready)."""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SQLITE_PATH = BACKEND_ROOT / "data" / "app.db"


class Base(DeclarativeBase):
    pass


def default_database_url() -> str:
    env = os.environ.get("DATABASE_URL", "").strip()
    if env:
        return env
    DEFAULT_SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{DEFAULT_SQLITE_PATH.resolve().as_posix()}"


def make_engine(url: str | None = None) -> Engine:
    database_url = url or default_database_url()
    connect_args: dict = {}
    if database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    engine = create_engine(database_url, future=True, connect_args=connect_args)

    if database_url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _sqlite_fk(dbapi_connection, _connection_record):  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine



def make_session_factory(engine: Engine) -> sessionmaker:
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def init_db(engine: Engine) -> None:
    from . import db_models  # noqa: F401 — register tables

    Base.metadata.create_all(bind=engine)
