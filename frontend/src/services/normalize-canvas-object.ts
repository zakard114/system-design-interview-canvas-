/**
 * Backend may occasionally emit Python field names (`from_`) if alias dump is skipped.
 * Canvas rendering looks up `edge.from` — normalize so arrows stay visible.
 */
export function normalizeCanvasObject<T extends { kind?: string }>(object: T): T {
  if (!object || typeof object !== "object") return object;
  if ((object as { kind?: string }).kind !== "edge") return object;
  const edge = object as T & { from?: string; from_?: string; to?: string };
  const from =
    typeof edge.from === "string" && edge.from.length > 0
      ? edge.from
      : typeof edge.from_ === "string" && edge.from_.length > 0
        ? edge.from_
        : undefined;
  if (from == null) return object;
  if (edge.from === from && edge.from_ == null) return object;
  const { from_: _drop, ...rest } = edge;
  return { ...rest, from } as T;
}

export function normalizeCanvasObjects<T extends { kind?: string }>(objects: T[]): T[] {
  return objects.map(normalizeCanvasObject);
}

/** Prefer a renderable edge `from`/`to` when merging optimistic + server copies. */
export function mergeEdgeEndpoints<T extends { kind?: string; id: string }>(
  primary: T,
  fallback?: T | null,
): T {
  if (primary.kind !== "edge") return primary;
  const a = primary as T & { from?: string; to?: string; from_?: string };
  const b = fallback as (T & { from?: string; to?: string; from_?: string }) | null | undefined;
  const from =
    (typeof a.from === "string" && a.from) ||
    (typeof a.from_ === "string" && a.from_) ||
    (b && typeof b.from === "string" && b.from) ||
    (b && typeof b.from_ === "string" && b.from_) ||
    undefined;
  const to =
    (typeof a.to === "string" && a.to) || (b && typeof b.to === "string" && b.to) || undefined;
  if (!from || !to) return normalizeCanvasObject(primary);
  return normalizeCanvasObject({ ...primary, from, to } as T);
}
