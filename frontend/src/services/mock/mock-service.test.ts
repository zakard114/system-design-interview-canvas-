import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockInterviewService } from "../mock";
import { emptyStore, type BroadcastPort, type PersistencePort, type StoreData } from "./store";
import { ObjectNotFoundError, SessionNotFoundError, type SessionEvent } from "../types";

/** In-memory persistence so two service instances can share a "server". */
function memoryPersistence(seed: StoreData = emptyStore()) {
  let data = seed;
  const port: PersistencePort = {
    load: () => JSON.parse(JSON.stringify(data)) as StoreData,
    save: (next) => {
      data = JSON.parse(JSON.stringify(next)) as StoreData;
    },
  };
  return port;
}

/** Simple in-process bus emulating BroadcastChannel between two tabs. */
function memoryBus() {
  const handlers = new Set<(message: unknown) => void>();
  const port = (self: { skip?: (message: unknown) => void }): BroadcastPort => ({
    post: (message) => handlers.forEach((h) => h !== self.skip && h(message)),
    listen: (handler) => {
      self.skip = handler;
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  });
  return port;
}

describe("MockInterviewService — sessions", () => {
  let service: ReturnType<typeof createMockInterviewService>;

  beforeEach(() => {
    service = createMockInterviewService();
  });

  it("creates a session with a shareable join code", async () => {
    const { session, participant } = await service.createSession();
    expect(session.id).toBeTruthy();
    expect(session.joinCode).toHaveLength(6);
    expect(session.status).toBe("open");
    expect(participant).toBeNull();
  });

  it("registers the creator as interviewer when a name is given", async () => {
    const { participant } = await service.createSession({ displayName: "Heeju" });
    expect(participant?.role).toBe("interviewer");
    expect(participant?.displayName).toBe("Heeju");
  });

  it("lets several people join the same session", async () => {
    const { session } = await service.createSession({ displayName: "Host" });
    await service.joinSession({ sessionId: session.id, displayName: "Candidate" });
    await service.joinSession({ sessionId: session.id, displayName: "Observer" });
    const participants = await service.listParticipants(session.id);
    expect(participants.map((p) => p.displayName)).toEqual([
      "Host",
      "Candidate",
      "Observer",
    ]);
  });

  it("returns null for an unknown session and rejects joining it", async () => {
    expect(await service.getSession("nope")).toBeNull();
    await expect(
      service.joinSession({ sessionId: "nope", displayName: "X" }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("requires a non-empty display name", async () => {
    const { session } = await service.createSession();
    await expect(
      service.joinSession({ sessionId: session.id, displayName: "   " }),
    ).rejects.toThrow(/display name/i);
  });

  it("removes a participant on leave", async () => {
    const { session, participant } = await service.createSession({ displayName: "Host" });
    await service.leaveSession({ sessionId: session.id, participantId: participant!.id });
    expect(await service.listParticipants(session.id)).toHaveLength(0);
  });
});

describe("MockInterviewService — canvas objects", () => {
  it("creates, updates and deletes objects", async () => {
    const service = createMockInterviewService();
    const { session } = await service.createSession();

    const node = await service.createObject(session.id, {
      kind: "node",
      type: "database",
      x: 10,
      y: 20,
      w: 168,
      h: 76,
      label: "Postgres",
      createdBy: "p1",
    });
    expect(node.id).toBeTruthy();

    const moved = await service.updateObject(session.id, node.id, { x: 100, y: 200 });
    expect(moved).toMatchObject({ x: 100, y: 200, id: node.id });
    expect((await service.listObjects(session.id))[0]).toMatchObject({ x: 100 });

    await service.deleteObject(session.id, node.id);
    expect(await service.listObjects(session.id)).toHaveLength(0);
  });

  it("supports arrows, sticky notes and freehand strokes", async () => {
    const service = createMockInterviewService();
    const { session } = await service.createSession();
    const box = (label: string) =>
      service.createObject(session.id, {
        kind: "node",
        type: "service",
        x: 0,
        y: 0,
        w: 168,
        h: 76,
        label,
        createdBy: "p1",
      });
    const a = await box("API");
    const b = await box("Worker");

    await service.createObject(session.id, {
      kind: "edge",
      from: a.id,
      to: b.id,
      label: "enqueue",
      createdBy: "p1",
    });
    await service.createObject(session.id, {
      kind: "sticky",
      x: 5,
      y: 5,
      text: "backpressure?",
      createdBy: "p1",
    });
    await service.createObject(session.id, {
      kind: "stroke",
      points: [
        [0, 0],
        [5, 5],
      ],
      color: "var(--ink)",
      width: 2,
      createdBy: "p1",
    });

    const kinds = (await service.listObjects(session.id)).map((o) => o.kind);
    expect(kinds).toEqual(["node", "node", "edge", "sticky", "stroke"]);
  });

  it("deletes arrows attached to a removed node", async () => {
    const service = createMockInterviewService();
    const { session } = await service.createSession();
    const a = await service.createObject(session.id, {
      kind: "node",
      type: "service",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      label: "A",
      createdBy: "p",
    });
    const b = await service.createObject(session.id, {
      kind: "node",
      type: "cache",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      label: "B",
      createdBy: "p",
    });
    await service.createObject(session.id, {
      kind: "edge",
      from: a.id,
      to: b.id,
      label: "",
      createdBy: "p",
    });

    await service.deleteObject(session.id, a.id);
    const remaining = await service.listObjects(session.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(b.id);
  });

  it("throws for unknown objects and unknown sessions", async () => {
    const service = createMockInterviewService();
    const { session } = await service.createSession();
    await expect(service.updateObject(session.id, "x", { label: "y" })).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
    await expect(service.deleteObject(session.id, "x")).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
    await expect(service.listObjects("nope")).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});

describe("MockInterviewService — realtime", () => {
  it("fans out create/update/delete events to subscribers of the room", async () => {
    const service = createMockInterviewService();
    const { session } = await service.createSession();
    const events: SessionEvent[] = [];
    const stop = service.subscribe(session.id, (event) => events.push(event));

    const node = await service.createObject(session.id, {
      kind: "sticky",
      x: 0,
      y: 0,
      text: "hi",
      createdBy: "p",
    });
    await service.updateObject(session.id, node.id, { text: "hello" });
    await service.deleteObject(session.id, node.id);
    stop();
    await service.createObject(session.id, {
      kind: "sticky",
      x: 1,
      y: 1,
      text: "after",
      createdBy: "p",
    });

    expect(events.map((e) => e.type)).toEqual([
      "object_created",
      "object_updated",
      "object_deleted",
    ]);
  });

  it("does not deliver events from another room", async () => {
    const service = createMockInterviewService();
    const roomA = (await service.createSession()).session;
    const roomB = (await service.createSession()).session;
    const listener = vi.fn();
    service.subscribe(roomA.id, listener);
    await service.createObject(roomB.id, {
      kind: "sticky",
      x: 0,
      y: 0,
      text: "b",
      createdBy: "p",
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies subscribers when the participant list changes", async () => {
    const service = createMockInterviewService();
    const { session } = await service.createSession();
    const events: SessionEvent[] = [];
    service.subscribe(session.id, (event) => events.push(event));
    await service.joinSession({ sessionId: session.id, displayName: "Candidate" });
    expect(events[0]).toMatchObject({ type: "participants_updated" });
  });

  it("syncs two client instances sharing storage and a bus (two browser tabs)", async () => {
    const persistence = memoryPersistence();
    const bus = memoryBus();
    const tabA = createMockInterviewService({ persistence, broadcast: bus({}) });
    const { session } = await tabA.createSession({ displayName: "Host" });

    const tabB = createMockInterviewService({ persistence, broadcast: bus({}) });
    expect(await tabB.getSession(session.id)).toMatchObject({ id: session.id });

    const seenByB: SessionEvent[] = [];
    tabB.subscribe(session.id, (event) => seenByB.push(event));
    const seenByA: SessionEvent[] = [];
    tabA.subscribe(session.id, (event) => seenByA.push(event));

    // B joins and draws; A must see both.
    await tabB.joinSession({ sessionId: session.id, displayName: "Candidate" });
    const node = await tabB.createObject(session.id, {
      kind: "node",
      type: "queue",
      x: 0,
      y: 0,
      w: 168,
      h: 76,
      label: "Kafka",
      createdBy: "b",
    });
    expect(seenByA.map((e) => e.type)).toEqual(["participants_updated", "object_created"]);
    expect(await tabA.listObjects(session.id)).toHaveLength(1);

    // A moves it; B must see the update.
    await tabA.updateObject(session.id, node.id, { x: 420 });
    expect(seenByB.at(-1)).toMatchObject({ type: "object_updated" });
    expect((await tabB.listObjects(session.id))[0]).toMatchObject({ x: 420 });
  });
});

describe("MockInterviewService — persistence intent", () => {
  it("restores sessions and canvas state from persisted storage", async () => {
    const persistence = memoryPersistence();
    const first = createMockInterviewService({ persistence });
    const { session } = await first.createSession({ displayName: "Host" });
    await first.createObject(session.id, {
      kind: "node",
      type: "loadbalancer",
      x: 12,
      y: 34,
      w: 168,
      h: 76,
      label: "nginx",
      createdBy: "p",
    });

    // Simulates a reload / server restart: brand new instance, same storage.
    const restarted = createMockInterviewService({ persistence });
    expect(await restarted.getSession(session.id)).toMatchObject({ id: session.id });
    expect(await restarted.listParticipants(session.id)).toHaveLength(1);
    expect((await restarted.listObjects(session.id))[0]).toMatchObject({ label: "nginx" });
  });
});
