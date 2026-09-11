import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getInterviewService,
  type CanvasObject,
  type NewCanvasObject,
  type Participant,
  type ParticipantRole,
  type Session,
} from "@/services";

export type ConnectionState = "connecting" | "live" | "error";

const meKey = (sessionId: string) => `idc.me.${sessionId}`;

export function readStoredParticipant(sessionId: string): Participant | null {
  try {
    const raw = globalThis.localStorage?.getItem(meKey(sessionId));
    return raw ? (JSON.parse(raw) as Participant) : null;
  } catch {
    return null;
  }
}

export function storeParticipant(participant: Participant) {
  try {
    globalThis.localStorage?.setItem(
      meKey(participant.sessionId),
      JSON.stringify(participant),
    );
  } catch {
    /* ignore */
  }
}

export function useInterviewSession(sessionId: string) {
  const service = useMemo(() => getInterviewService(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [notFound, setNotFound] = useState(false);
  const hydrated = useRef(false);

  // Initial load + realtime subscription.
  useEffect(() => {
    let active = true;
    setStatus("connecting");
    setNotFound(false);

    (async () => {
      try {
        const found = await service.getSession(sessionId);
        if (!active) return;
        if (!found) {
          setNotFound(true);
          setStatus("error");
          return;
        }
        const stored = readStoredParticipant(sessionId);
        const [list, objs] = await Promise.all([
          service.listParticipants(sessionId),
          service.listObjects(sessionId),
        ]);
        if (!active) return;
        setSession(found);
        setMe(stored && list.some((p) => p.id === stored.id) ? stored : null);
        setParticipants(list);
        setObjects(objs);
        setStatus("live");
        hydrated.current = true;
      } catch {
        if (active) setStatus("error");
      }
    })();

    const unsubscribe = service.subscribe(sessionId, (event) => {
      if (event.type === "participants_updated") {
        setParticipants(event.participants);
        return;
      }
      if (event.type === "object_created") {
        setObjects((prev) =>
          prev.some((o) => o.id === event.object.id) ? prev : [...prev, event.object],
        );
        return;
      }
      if (event.type === "object_updated") {
        setObjects((prev) =>
          prev.map((o) => (o.id === event.object.id ? event.object : o)),
        );
        return;
      }
      setObjects((prev) =>
        prev.filter(
          (o) =>
            o.id !== event.objectId &&
            !(o.kind === "edge" && (o.from === event.objectId || o.to === event.objectId)),
        ),
      );
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [service, sessionId]);

  const join = useCallback(
    async (displayName: string, role: ParticipantRole = "candidate") => {
      const participant = await service.joinSession({ sessionId, displayName, role });
      storeParticipant(participant);
      setMe(participant);
      setParticipants(await service.listParticipants(sessionId));
      return participant;
    },
    [service, sessionId],
  );

  const createObject = useCallback(
    async (object: NewCanvasObject) => {
      const created = await service.createObject(sessionId, object);
      setObjects((prev) =>
        prev.some((o) => o.id === created.id) ? prev : [...prev, created],
      );
      return created;
    },
    [service, sessionId],
  );

  const updateObject = useCallback(
    async (objectId: string, patch: Partial<CanvasObject>) => {
      // Optimistic: canvas dragging must feel immediate.
      setObjects((prev) =>
        prev.map((o) => (o.id === objectId ? ({ ...o, ...patch } as CanvasObject) : o)),
      );
      await service.updateObject(sessionId, objectId, patch);
    },
    [service, sessionId],
  );

  const deleteObject = useCallback(
    async (objectId: string) => {
      setObjects((prev) =>
        prev.filter(
          (o) =>
            o.id !== objectId &&
            !(o.kind === "edge" && (o.from === objectId || o.to === objectId)),
        ),
      );
      await service.deleteObject(sessionId, objectId);
    },
    [service, sessionId],
  );

  return {
    session,
    me,
    participants,
    objects,
    status,
    notFound,
    join,
    createObject,
    updateObject,
    deleteObject,
  };
}
