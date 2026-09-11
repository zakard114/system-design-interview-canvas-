/** Builds the shareable join link for a session. */
export function joinLink(sessionId: string, origin?: string) {
  const base = origin ?? globalThis.location?.origin ?? "";
  return `${base}/s/${sessionId}`;
}

/**
 * Accepts a full join link, a path, or a bare session id and returns the id.
 * Returns null when nothing usable is present.
 */
export function parseSessionRef(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/s\/([A-Za-z0-9_-]+)/);
  if (match) return match[1]!;
  if (/^[A-Za-z0-9_-]{4,}$/.test(trimmed)) return trimmed;
  return null;
}
