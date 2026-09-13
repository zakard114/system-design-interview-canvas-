import { useCallback, useRef, useState } from "react";
import type { CanvasObject, EdgeObject, NewCanvasObject } from "@/services";

const MAX_HISTORY = 50;

function cloneObjects(objects: CanvasObject[]): CanvasObject[] {
  return structuredClone(objects);
}

function samePayload(a: CanvasObject, b: CanvasObject): boolean {
  const { id: _a, ...restA } = a;
  const { id: _b, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

function toNewObject(object: CanvasObject): NewCanvasObject {
  const { id: _id, ...rest } = object;
  return rest as NewCanvasObject;
}

function remapObject(object: CanvasObject, idMap: Map<string, string>): CanvasObject {
  const id = idMap.get(object.id) ?? object.id;
  if (object.kind === "edge") {
    return {
      ...object,
      id,
      from: idMap.get(object.from) ?? object.from,
      to: idMap.get(object.to) ?? object.to,
    };
  }
  return { ...object, id };
}

function remapSnapshot(snapshot: CanvasObject[], idMap: Map<string, string>): CanvasObject[] {
  return snapshot.map((object) => remapObject(object, idMap));
}

function patchFrom(target: CanvasObject): Partial<CanvasObject> {
  const { id: _id, ...rest } = target;
  return rest;
}

function edgeCreateBody(edge: EdgeObject, from: string, to: string): NewCanvasObject {
  return {
    kind: "edge",
    from,
    to,
    label: edge.label,
    createdBy: edge.createdBy,
    ...(edge.lineStyle ? { lineStyle: edge.lineStyle } : {}),
    ...(edge.pathStyle ? { pathStyle: edge.pathStyle } : {}),
    ...(edge.fromAnchor ? { fromAnchor: edge.fromAnchor } : {}),
    ...(edge.toAnchor ? { toAnchor: edge.toAnchor } : {}),
  };
}

interface Mutators {
  createObject: (object: NewCanvasObject) => Promise<CanvasObject>;
  updateObject: (id: string, patch: Partial<CanvasObject>) => Promise<unknown>;
  deleteObject: (id: string) => Promise<unknown>;
  /** Replace local canvas state in one shot (undo/redo / batch delete). */
  replaceObjects: (objects: CanvasObject[]) => void;
  /** Server-only create (no local optimistic insert). */
  createObjectRemote: (object: NewCanvasObject) => Promise<CanvasObject>;
  /** Server-only delete (no local state change). */
  deleteObjectRemote: (id: string) => Promise<void>;
  /** Ignore WS fan-out while history is applying. */
  setRemoteSuppressed: (suppressed: boolean) => void;
}

/**
 * Snapshot-based undo/redo. Applies the target snapshot to the UI immediately,
 * then syncs the server in parallel so many objects appear/disappear together.
 */
export function useCanvasHistory(objects: CanvasObject[], mutators: Mutators) {
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  const pastRef = useRef<CanvasObject[][]>([]);
  const futureRef = useRef<CanvasObject[][]>([]);
  const applyingRef = useRef(false);
  const [revision, setRevision] = useState(0);

  const bump = () => setRevision((n) => n + 1);

  const remapStacks = useCallback((idMap: Map<string, string>) => {
    if (idMap.size === 0) return;
    pastRef.current = pastRef.current.map((snap) => remapSnapshot(snap, idMap));
    futureRef.current = futureRef.current.map((snap) => remapSnapshot(snap, idMap));
  }, []);

  const pushSnapshot = useCallback(() => {
    if (applyingRef.current) return;
    pastRef.current.push(cloneObjects(objectsRef.current));
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    futureRef.current = [];
    bump();
  }, []);

  const convergeTo = useCallback(
    async (target: CanvasObject[]) => {
      applyingRef.current = true;
      mutators.setRemoteSuppressed(true);
      const idMap = new Map<string, string>();
      const before = cloneObjects(objectsRef.current);
      const targetClone = cloneObjects(target);

      // Instant UI: whole snapshot at once.
      mutators.replaceObjects(targetClone);
      objectsRef.current = targetClone;

      try {
        const targetById = new Map(targetClone.map((o) => [o.id, o]));
        const beforeById = new Map(before.map((o) => [o.id, o]));

        const toDelete = before.filter((o) => !targetById.has(o.id));
        const missing = targetClone.filter((o) => !beforeById.has(o.id));
        const toUpdate = targetClone.filter((o) => {
          const cur = beforeById.get(o.id);
          return cur != null && !samePayload(cur, o);
        });

        await Promise.all(
          toDelete.map((o) =>
            mutators.deleteObjectRemote(o.id).catch(() => {
              /* already gone */
            }),
          ),
        );

        await Promise.all(
          toUpdate.map((o) => mutators.updateObject(o.id, patchFrom(o))),
        );

        const nonEdges = missing.filter((o) => o.kind !== "edge");
        const edges = missing.filter(
          (o): o is EdgeObject => o.kind === "edge",
        );

        const createdNodes = await Promise.all(
          nonEdges.map(async (obj) => {
            const created = await mutators.createObjectRemote(toNewObject(obj));
            idMap.set(obj.id, created.id);
            return created;
          }),
        );

        const createdEdges = await Promise.all(
          edges.map(async (edge) => {
            const from = idMap.get(edge.from) ?? edge.from;
            const to = idMap.get(edge.to) ?? edge.to;
            const created = await mutators.createObjectRemote(
              edgeCreateBody(edge, from, to),
            );
            idMap.set(edge.id, created.id);
            return created;
          }),
        );

        const kept = targetClone
          .filter((o) => beforeById.has(o.id))
          .map((o) => {
            const patch = toUpdate.find((u) => u.id === o.id);
            return patch ?? o;
          });

        const final = [
          ...kept.map((o) => remapObject(o, idMap)),
          ...createdNodes,
          ...createdEdges,
        ];
        // Dedupe by id
        const byId = new Map(final.map((o) => [o.id, o]));
        const unique = [...byId.values()];

        mutators.replaceObjects(unique);
        objectsRef.current = unique;
        remapStacks(idMap);
      } finally {
        mutators.setRemoteSuppressed(false);
        applyingRef.current = false;
        bump();
      }
    },
    [mutators, remapStacks],
  );

  const undo = useCallback(async () => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(cloneObjects(objectsRef.current));
    bump();
    await convergeTo(prev);
  }, [convergeTo]);

  const redo = useCallback(async () => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(cloneObjects(objectsRef.current));
    bump();
    await convergeTo(next);
  }, [convergeTo]);

  return {
    pushSnapshot,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    /** Re-render dependency for canUndo/canRedo */
    revision,
    isApplying: () => applyingRef.current,
  };
}
