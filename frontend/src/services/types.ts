/**
 * Domain + service-layer contract.
 *
 * Every backend call in the app goes through `InterviewService`.
 * v1 ships a mock implementation (see ./mock). Swapping in a real
 * HTTP/WebSocket client later means implementing this interface only.
 */

export type NodeType =
  | "service"
  | "database"
  | "queue"
  | "cache"
  | "loadbalancer"
  | "llm";

export type ParticipantRole = "interviewer" | "candidate";

export interface Session {
  id: string;
  joinCode: string;
  createdAt: string;
  status: "open" | "closed";
}

export interface Participant {
  id: string;
  sessionId: string;
  displayName: string;
  role: ParticipantRole;
  joinedAt: string;
}

interface BaseObject {
  id: string;
  createdBy: string;
}

export interface NodeObject extends BaseObject {
  kind: "node";
  type: NodeType;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface EdgeObject extends BaseObject {
  kind: "edge";
  from: string;
  to: string;
  label: string;
}

export interface StickyObject extends BaseObject {
  kind: "sticky";
  x: number;
  y: number;
  text: string;
}

export interface StrokeObject extends BaseObject {
  kind: "stroke";
  points: Array<[number, number]>;
  color: string;
  width: number;
}

export type CanvasObject = NodeObject | EdgeObject | StickyObject | StrokeObject;

export type NewCanvasObject =
  | Omit<NodeObject, "id">
  | Omit<EdgeObject, "id">
  | Omit<StickyObject, "id">
  | Omit<StrokeObject, "id">;

export type SessionEvent =
  | { type: "object_created"; sessionId: string; object: CanvasObject }
  | { type: "object_updated"; sessionId: string; object: CanvasObject }
  | { type: "object_deleted"; sessionId: string; objectId: string }
  | { type: "participants_updated"; sessionId: string; participants: Participant[] };

export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Session "${id}" was not found`);
    this.name = "SessionNotFoundError";
  }
}

export class ObjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Object "${id}" was not found`);
    this.name = "ObjectNotFoundError";
  }
}

export interface InterviewService {
  createSession(input?: { displayName?: string }): Promise<{
    session: Session;
    participant: Participant | null;
  }>;
  getSession(sessionId: string): Promise<Session | null>;
  joinSession(input: {
    sessionId: string;
    displayName: string;
    role?: ParticipantRole;
  }): Promise<Participant>;
  leaveSession(input: { sessionId: string; participantId: string }): Promise<void>;
  listParticipants(sessionId: string): Promise<Participant[]>;
  listObjects(sessionId: string): Promise<CanvasObject[]>;
  createObject(sessionId: string, object: NewCanvasObject): Promise<CanvasObject>;
  updateObject(
    sessionId: string,
    objectId: string,
    patch: Partial<CanvasObject>,
  ): Promise<CanvasObject>;
  deleteObject(sessionId: string, objectId: string): Promise<void>;
  /** Room-scoped fan-out. Returns an unsubscribe function. */
  subscribe(sessionId: string, listener: (event: SessionEvent) => void): () => void;
}
