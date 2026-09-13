from fastapi.testclient import TestClient

from interview_canvas_backend.main import app

c = TestClient(app)
r = c.get("/health")
print("health", r.status_code, r.json())

r = c.post("/api/sessions", json={"displayName": "Alice"})
print("create", r.status_code, r.json())
data = r.json()
sid = data["session"]["id"]
assert data["participant"]["displayName"] == "Alice"
assert data["participant"]["role"] == "interviewer"
assert "joinCode" in data["session"]

r = c.get(f"/api/sessions/{sid}")
print("get", r.status_code, r.json()["joinCode"])

r = c.post(f"/api/sessions/{sid}/join", json={"displayName": "Bob"})
print("join", r.status_code, r.json()["role"])
pid = r.json()["id"]

r = c.get(f"/api/sessions/{sid}/participants")
print("participants", r.status_code, len(r.json()))

r = c.post(
    f"/api/sessions/{sid}/objects",
    json={
        "kind": "node",
        "type": "service",
        "x": 10,
        "y": 20,
        "w": 120,
        "h": 80,
        "label": "API",
        "createdBy": pid,
    },
)
print("create obj", r.status_code, r.json())
oid = r.json()["id"]

r = c.patch(f"/api/sessions/{sid}/objects/{oid}", json={"x": 50})
print("patch", r.status_code, r.json()["x"])

r = c.get(f"/api/sessions/{sid}/objects")
print("list obj", r.status_code, len(r.json()))

r = c.delete(f"/api/sessions/{sid}/objects/{oid}")
print("delete", r.status_code)

r = c.post(f"/api/sessions/{sid}/leave", json={"participantId": pid})
print("leave", r.status_code)

r = c.get("/api/sessions/does-not-exist")
print("404", r.status_code, r.json())
print("SMOKE OK")
