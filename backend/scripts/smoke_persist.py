"""Manual-style persistence check: write, reopen SqlStore, read back."""

from __future__ import annotations

import os
from pathlib import Path

# Use a dedicated smoke DB so we don't fight a running server lock oddly.
root = Path(__file__).resolve().parents[1]
db_path = root / "data" / "smoke_persist.db"
if db_path.exists():
    db_path.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{db_path.resolve().as_posix()}"

from interview_canvas_backend.models import NewNodeObject
from interview_canvas_backend.store import SqlStore

store1 = SqlStore(os.environ["DATABASE_URL"])
session, host = store1.create_session(display_name="PersistHost")
assert host is not None
obj = store1.create_object(
    session.id,
    NewNodeObject(
        createdBy=host.id,
        kind="node",
        type="cache",
        x=9,
        y=9,
        w=50,
        h=50,
        label="Redis",
    ),
)
sid, oid, code = session.id, obj.id, session.joinCode
print("wrote", sid, code, oid)

store2 = SqlStore(os.environ["DATABASE_URL"])
again = store2.get_session(sid)
objs = store2.list_objects(sid)
assert again.joinCode == code
assert len(objs) == 1 and objs[0].id == oid
print("PERSIST OK after new SqlStore instance")
