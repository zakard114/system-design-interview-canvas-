import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getInterviewService,
  ObjectNotFoundError,
  type CanvasObject,
  type EdgeObject,
  type NewCanvasObject,
  type Participant,
  type ParticipantRole,
  type Session,
} from "@/services";
import {
  mergeEdgeEndpoints,
  normalizeCanvasObject,
} from "@/services/normalize-canvas-object";
import { shouldApplyRemoteObjectUpdate } from "./remote-object-update";

export type ConnectionState = "connecting" | "live" | "error";

const meKey = (sessionId: string) => `idc.me.${sessionId}`;

/**
 * Per-tab identity (sessionStorage), NOT localStorage.
 * localStorage is shared across tabs — a join-link tab would steal the host's
 * "me" and skip the name form, so the host never sees a second participant.
 */
export function readStoredParticipant(sessionId: string): Participant | null {
  try {
    // Drop legacy localStorage identity so a join-link tab cannot inherit the host.
    try {
      globalThis.localStorage?.removeItem(meKey(sessionId));
    } catch {
      /* ignore */
    }
    const raw = globalThis.sessionStorage?.getItem(meKey(sessionId));
    return raw ? (JSON.parse(raw) as Participant) : null;
  } catch {
    return null;
  }
}

export function storeParticipant(participant: Participant) {
  try {
    globalThis.sessionStorage?.setItem(
      meKey(participant.sessionId),
      JSON.stringify(participant),
    );
  } catch {
    /* ignore */
  }
}

function isLocalId(id: string) {
  return id.startsWith("local-");
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
  /** objectId → latest local update sequence still in flight */
  const pendingLocalUpdates = useRef(new Map<string, number>());
  /** Serialize PATCHes per object so WS echoes cannot land out of order. */
  const updateChains = useRef(new Map<string, Promise<void>>());
  const remoteSuppressedRef = useRef(false);

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
      // Presence must update even while canvas remote events are suppressed.
      if (event.type === "state_sync") {
        setParticipants(event.participants);
        if (!remoteSuppressedRef.current) {
          setObjects(event.objects.map((o) => normalizeCanvasObject(o)));
        }
        return;
      }
      if (event.type === "participants_updated") {
        setParticipants(event.participants);
        return;
      }
      if (remoteSuppressedRef.current) return;
      if (event.type === "object_created") {
        const incoming = normalizeCanvasObject(event.object);
        setObjects((prev) => {
          if (prev.some((o) => o.id === incoming.id)) return prev;
          // Replace matching optimistic edge so we don't briefly keep two copies
          // then drop the wrong one.
          let next = prev;
          if (incoming.kind === "edge") {
            const edge = incoming as EdgeObject;
            next = prev.filter(
              (o) =>
                !(
                  o.kind === "edge" &&
                  isLocalId(o.id) &&
                  o.from === edge.from &&
                  o.to === edge.to
                ),
            );
          }
          return [...next, incoming];
        });
        return;
      }
      if (event.type === "object_updated") {
        if (!shouldApplyRemoteObjectUpdate(event.object.id, pendingLocalUpdates.current)) {
          return;
        }
        const incoming = normalizeCanvasObject(event.object);
        setObjects((prev) =>
          prev.map((o) => (o.id === incoming.id ? incoming : o)),
        );
        return;
      }
      if (event.type === "object_deleted") {
        setObjects((prev) =>
          prev.filter(
            (o) =>
              o.id !== event.objectId &&
              !(o.kind === "edge" && (o.from === event.objectId || o.to === event.objectId)),
          ),
        );
      }
    });

    // Presence fallback: poll so the host right-rail updates even if a
    // BroadcastChannel / storage event is missed.
    const poll = globalThis.setInterval(() => {
      if (!active || !hydrated.current) return;
      void service.listParticipants(sessionId).then((list) => {
        if (!active) return;
        setParticipants((prev) => {
          if (
            prev.length === list.length &&
            prev.every((p, i) => p.id === list[i]?.id && p.displayName === list[i]?.displayName)
          ) {
            return prev;
          }
          return list;
        });
      });
    }, 1500);

    return () => {
      active = false;
      globalThis.clearInterval(poll);
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
      const optimisticId = `local-${crypto.randomUUID().replace(/-/g, "")}`;
      const optimistic = { ...object, id: optimisticId } as CanvasObject;
      setObjects((prev) => [...prev, optimistic]);
      try {
        const createdRaw = await service.createObject(sessionId, object);
        const created = mergeEdgeEndpoints(
          normalizeCanvasObject(createdRaw),
          optimistic,
        );
        setObjects((prev) => {
          let next = prev.filter((o) => o.id !== optimisticId);
          if (created.kind === "edge") {
            const edge = created as EdgeObject;
            next = next.filter(
              (o) =>
                !(
                  o.kind === "edge" &&
                  isLocalId(o.id) &&
                  o.from === edge.from &&
                  o.to === edge.to
                ),
            );
          }
          const idx = next.findIndex((o) => o.id === created.id);
          if (idx >= 0) {
            const copy = [...next];
            copy[idx] = mergeEdgeEndpoints(created, next[idx]);
            return copy;
          }
          return [...next, created];
        });
        return created;
      } catch (err) {
        setObjects((prev) => prev.filter((o) => o.id !== optimisticId));
        console.error("createObject failed", object, err);
        throw err;
      }
    },
    [service, sessionId],
  );

  const createObjectRemote = useCallback(
    async (object: NewCanvasObject) => {
      const created = await service.createObject(sessionId, object);
      return normalizeCanvasObject(created);
    },
    [service, sessionId],
  );

  const updateObject = useCallback(
    async (objectId: string, patch: Partial<CanvasObject>) => {
      const seq = (pendingLocalUpdates.current.get(objectId) ?? 0) + 1;
      pendingLocalUpdates.current.set(objectId, seq);
      setObjects((prev) =>
        prev.map((o) => (o.id === objectId ? ({ ...o, ...patch } as CanvasObject) : o)),
      );

      const previous = updateChains.current.get(objectId) ?? Promise.resolve();
      const next = previous
        .catch(() => {
          /* keep the chain alive after a failed PATCH */
        })
        .then(async () => {
          await service.updateObject(sessionId, objectId, patch);
        })
        .finally(() => {
          if (pendingLocalUpdates.current.get(objectId) === seq) {
            pendingLocalUpdates.current.delete(objectId);
          }
        });
      updateChains.current.set(
        objectId,
        next.catch(() => {
          /* swallowed for chain continuity */
        }),
      );
      await next;
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
      try {
        await service.deleteObject(sessionId, objectId);
      } catch (err) {
        if (!(err instanceof ObjectNotFoundError)) throw err;
      }
    },
    [service, sessionId],
  );

  const deleteObjects = useCallback(
    async (objectIds: string[]) => {
      if (objectIds.length === 0) return;
      const idSet = new Set(objectIds);
      setObjects((prev) => {
        for (const o of prev) {
          if (o.kind === "edge" && (idSet.has(o.from) || idSet.has(o.to))) {
            idSet.add(o.id);
          }
        }
        return prev.filter((o) => !idSet.has(o.id));
      });
      await Promise.all(
        [...idSet].map((id) =>
          service.deleteObject(sessionId, id).catch((err) => {
            if (!(err instanceof ObjectNotFoundError)) throw err;
          }),
        ),
      );
    },
    [service, sessionId],
  );

  const deleteObjectRemote = useCallback(
    async (objectId: string) => {
      try {
        await service.deleteObject(sessionId, objectId);
      } catch (err) {
        if (!(err instanceof ObjectNotFoundError)) throw err;
      }
    },
    [service, sessionId],
  );

  const replaceObjects = useCallback((next: CanvasObject[]) => {
    setObjects(next);
  }, []);

  const setRemoteSuppressed = useCallback((suppressed: boolean) => {
    remoteSuppressedRef.current = suppressed;
  }, []);

  return {
    session,
    me,
    participants,
    objects,
    status,
    notFound,
    join,
    createObject,
    createObjectRemote,
    updateObject,
    deleteObject,
    deleteObjects,
    deleteObjectRemote,
    replaceObjects,
    setRemoteSuppressed,
  };
}
