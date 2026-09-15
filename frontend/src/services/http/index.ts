/**
 * Real InterviewService talking to FastAPI (openapi.yaml).
 * HTTP mutations + WebSocket SessionEvent fan-out.
 */

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
import { normalizeCanvasObject, normalizeCanvasObjects } from "../normalize-canvas-object";

export const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

export interface HttpInterviewServiceOptions {
  baseUrl?: string;
}

function toWsUrl(httpBase: string, path: string): string {
  if (!httpBase) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${path}`;
  }
  const base = httpBase.replace(/\/$/, "");
  const wsBase = base.replace(/^http/i, "ws");
  return `${wsBase}${path}`;
}

export class HttpInterviewService implements InterviewService {
  private baseUrl: string;
  private sockets = new Map<string, WebSocket>();
  private listeners = new Map<string, Set<(event: SessionEvent) => void>>();

  constructor(options: HttpInterviewServiceOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
  }

  async createSession(input: { displayName?: string } = {}) {
    const body =
      input.displayName !== undefined && input.displayName !== ""
        ? { displayName: input.displayName }
        : {};
    return this.requestJson<{ session: Session; participant: Participant | null }>(
      "POST",
      "/api/sessions",
      body,
    );
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`);
    if (res.status === 404) return null;
    if (!res.ok) await this.throwFromResponse(res);
    return (await res.json()) as Session;
  }

  async joinSession(input: {
    sessionId: string;
    displayName: string;
    role?: ParticipantRole;
  }) {
    const body: { displayName: string; role?: ParticipantRole } = {
      displayName: input.displayName,
    };
    if (input.role) body.role = input.role;
    return this.requestJson<Participant>(
      "POST",
      `/api/sessions/${encodeURIComponent(input.sessionId)}/join`,
      body,
    );
  }

  async leaveSession(input: { sessionId: string; participantId: string }) {
    await this.requestEmpty(
      "POST",
      `/api/sessions/${encodeURIComponent(input.sessionId)}/leave`,
      { participantId: input.participantId },
    );
  }

  async listParticipants(sessionId: string) {
    return this.requestJson<Participant[]>(
      "GET",
      `/api/sessions/${encodeURIComponent(sessionId)}/participants`,
    );
  }

  async listObjects(sessionId: string) {
    const objects = await this.requestJson<CanvasObject[]>(
      "GET",
      `/api/sessions/${encodeURIComponent(sessionId)}/objects`,
    );
    return normalizeCanvasObjects(objects);
  }

  async createObject(sessionId: string, object: NewCanvasObject) {
    const created = await this.requestJson<CanvasObject>(
      "POST",
      `/api/sessions/${encodeURIComponent(sessionId)}/objects`,
      object,
    );
    return normalizeCanvasObject(created);
  }

  async updateObject(
    sessionId: string,
    objectId: string,
    patch: Partial<CanvasObject>,
  ) {
    const updated = await this.requestJson<CanvasObject>(
      "PATCH",
      `/api/sessions/${encodeURIComponent(sessionId)}/objects/${encodeURIComponent(objectId)}`,
      patch,
    );
    return normalizeCanvasObject(updated);
  }

  async deleteObject(sessionId: string, objectId: string) {
    await this.requestEmpty(
      "DELETE",
      `/api/sessions/${encodeURIComponent(sessionId)}/objects/${encodeURIComponent(objectId)}`,
    );
  }

  subscribe(sessionId: string, listener: (event: SessionEvent) => void) {
    const set = this.listeners.get(sessionId) ?? new Set();
    set.add(listener);
    this.listeners.set(sessionId, set);

    this.ensureSocket(sessionId);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(sessionId);
        const ws = this.sockets.get(sessionId);
        if (ws) {
          ws.close();
          this.sockets.delete(sessionId);
        }
      }
    };
  }

  private ensureSocket(sessionId: string) {
    const existing = this.sockets.get(sessionId);
    if (existing && existing.readyState <= WebSocket.OPEN) return;

    const url = toWsUrl(
      this.baseUrl,
      `/api/sessions/${encodeURIComponent(sessionId)}/ws`,
    );
    const ws = new WebSocket(url);
    this.sockets.set(sessionId, ws);

    ws.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data)) as SessionEvent;
        if (!event || typeof event !== "object" || !("type" in event)) return;
        if (event.type === "object_created" || event.type === "object_updated") {
          event.object = normalizeCanvasObject(event.object);
        }
        this.listeners.get(sessionId)?.forEach((fn) => fn(event));
      } catch {
        /* ignore malformed */
      }
    };

    ws.onclose = () => {
      if (this.sockets.get(sessionId) === ws) {
        this.sockets.delete(sessionId);
      }
      // Reconnect while listeners remain (backend restart / brief drop).
      if ((this.listeners.get(sessionId)?.size ?? 0) > 0) {
        globalThis.setTimeout(() => this.ensureSocket(sessionId), 800);
      }
    };
  }

  private async requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, this.buildInit(method, body));
    if (!res.ok) await this.throwFromResponse(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async requestEmpty(method: string, path: string, body?: unknown) {
    const res = await fetch(`${this.baseUrl}${path}`, this.buildInit(method, body));
    if (!res.ok) await this.throwFromResponse(res);
  }

  private buildInit(method: string, body?: unknown): RequestInit {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    return init;
  }

  private async throwFromResponse(res: Response): Promise<never> {
    let errorName = "HttpError";
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      if (data.error) errorName = data.error;
      if (data.message) message = data.message;
    } catch {
      /* ignore */
    }
    if (errorName === "SessionNotFoundError" || res.status === 404) {
      const match = /Session "([^"]+)"/.exec(message);
      throw new SessionNotFoundError(match?.[1] ?? "unknown");
    }
    if (errorName === "ObjectNotFoundError") {
      const match = /Object "([^"]+)"/.exec(message);
      throw new ObjectNotFoundError(match?.[1] ?? "unknown");
    }
    throw new Error(`${errorName}: ${message}`);
  }
}

export function createHttpInterviewService(options?: HttpInterviewServiceOptions) {
  return new HttpInterviewService(options);
}
