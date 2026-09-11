import {
  ObjectNotFoundError,
  SessionNotFoundError,
  type CanvasObject,
  type InterviewService,
  type NewCanvasObject,
  type Participant,
  type ParticipantRole,
  type Session,
  type SessionEvent,
} from "../types";
import {
  createBroadcastChannelPort,
  createLocalStoragePersistence,
  emptyStore,
  type BroadcastPort,
  type PersistencePort,
  type StoreData,
} from "./store";

export interface MockServiceOptions {
  persistence?: PersistencePort | null;
  broadcast?: BroadcastPort | null;
  idFactory?: () => string;
  now?: () => Date;
}

let counter = 0;
const defaultId = () => {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}${counter.toString(36)}${rand}`;
};

const joinCode = () => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
};

export class MockInterviewService implements InterviewService {
  private data: StoreData;
  private persistence: PersistencePort | null;
  private broadcast: BroadcastPort | null;
  private newId: () => string;
  private now: () => Date;
  private listeners = new Map<string, Set<(event: SessionEvent) => void>>();
  private stopBroadcast?: () => void;

  constructor(options: MockServiceOptions = {}) {
    this.persistence = options.persistence ?? null;
    this.broadcast = options.broadcast ?? null;
    this.newId = options.idFactory ?? defaultId;
    this.now = options.now ?? (() => new Date());
    this.data = this.persistence?.load() ?? emptyStore();

    if (this.broadcast) {
      this.stopBroadcast = this.broadcast.listen((message) => {
        const event = message as SessionEvent | undefined;
        if (!event || typeof event !== "object" || !("type" in event)) return;
        // Another tab mutated shared storage: re-read, then fan out locally.
        this.data = this.persistence?.load() ?? this.data;
        this.emitLocal(event);
      });
    }
  }

  dispose() {
    this.stopBroadcast?.();
    this.listeners.clear();
  }

  // ---------- sessions ----------

  async createSession(input: { displayName?: string } = {}) {
    const session: Session = {
      id: this.newId(),
      joinCode: joinCode(),
      createdAt: this.now().toISOString(),
      status: "open",
    };
    this.data.sessions[session.id] = session;
    this.data.participants[session.id] = [];
    this.data.objects[session.id] = [];
    this.flush();

    let participant: Participant | null = null;
    if (input.displayName) {
      participant = await this.joinSession({
        sessionId: session.id,
        displayName: input.displayName,
        role: "interviewer",
      });
    }
    return { session, participant };
  }

  async getSession(sessionId: string) {
    return this.data.sessions[sessionId] ?? null;
  }

  async joinSession(input: {
    sessionId: string;
    displayName: string;
    role?: ParticipantRole;
  }) {
    const session = this.requireSession(input.sessionId);
    const name = input.displayName.trim();
    if (!name) throw new Error("A display name is required");

    const participant: Participant = {
      id: this.newId(),
      sessionId: session.id,
      displayName: name,
      role: input.role ?? "candidate",
      joinedAt: this.now().toISOString(),
    };
    const list = this.data.participants[session.id] ?? [];
    this.data.participants[session.id] = [...list, participant];
    this.flush();
    this.emit({
      type: "participants_updated",
      sessionId: session.id,
      participants: this.data.participants[session.id]!,
    });
    return participant;
  }

  async leaveSession(input: { sessionId: string; participantId: string }) {
    const list = this.data.participants[input.sessionId];
    if (!list) return;
    this.data.participants[input.sessionId] = list.filter(
      (p) => p.id !== input.participantId,
    );
    this.flush();
    this.emit({
      type: "participants_updated",
      sessionId: input.sessionId,
      participants: this.data.participants[input.sessionId]!,
    });
  }

  async listParticipants(sessionId: string) {
    this.requireSession(sessionId);
    return [...(this.data.participants[sessionId] ?? [])];
  }

  // ---------- canvas objects ----------

  async listObjects(sessionId: string) {
    this.requireSession(sessionId);
    return [...(this.data.objects[sessionId] ?? [])];
  }

  async createObject(sessionId: string, object: NewCanvasObject) {
    this.requireSession(sessionId);
    const created = { ...object, id: this.newId() } as CanvasObject;
    this.data.objects[sessionId] = [...(this.data.objects[sessionId] ?? []), created];
    this.flush();
    this.emit({ type: "object_created", sessionId, object: created });
    return created;
  }

  async updateObject(
    sessionId: string,
    objectId: string,
    patch: Partial<CanvasObject>,
  ) {
    this.requireSession(sessionId);
    const list = this.data.objects[sessionId] ?? [];
    const index = list.findIndex((o) => o.id === objectId);
    if (index === -1) throw new ObjectNotFoundError(objectId);
    const updated = { ...list[index], ...patch, id: objectId } as CanvasObject;
    const next = [...list];
    next[index] = updated;
    this.data.objects[sessionId] = next;
    this.flush();
    this.emit({ type: "object_updated", sessionId, object: updated });
    return updated;
  }

  async deleteObject(sessionId: string, objectId: string) {
    this.requireSession(sessionId);
    const list = this.data.objects[sessionId] ?? [];
    if (!list.some((o) => o.id === objectId)) throw new ObjectNotFoundError(objectId);
    // Deleting a node also removes edges attached to it.
    this.data.objects[sessionId] = list.filter(
      (o) => o.id !== objectId && !(o.kind === "edge" && (o.from === objectId || o.to === objectId)),
    );
    this.flush();
    this.emit({ type: "object_deleted", sessionId, objectId });
  }

  // ---------- realtime ----------

  subscribe(sessionId: string, listener: (event: SessionEvent) => void) {
    const set = this.listeners.get(sessionId) ?? new Set();
    set.add(listener);
    this.listeners.set(sessionId, set);
    return () => {
      set.delete(listener);
    };
  }

  private emit(event: SessionEvent) {
    this.emitLocal(event);
    this.broadcast?.post(event);
  }

  private emitLocal(event: SessionEvent) {
    this.listeners.get(event.sessionId)?.forEach((listener) => listener(event));
  }

  private requireSession(sessionId: string) {
    const session = this.data.sessions[sessionId];
    if (!session) throw new SessionNotFoundError(sessionId);
    return session;
  }

  private flush() {
    this.persistence?.save(this.data);
  }
}

export function createMockInterviewService(options: MockServiceOptions = {}) {
  return new MockInterviewService(options);
}

/** Browser-flavoured mock: persists to localStorage, syncs across tabs. */
export function createBrowserMockInterviewService() {
  return new MockInterviewService({
    persistence: createLocalStoragePersistence(),
    broadcast: createBroadcastChannelPort(),
  });
}
