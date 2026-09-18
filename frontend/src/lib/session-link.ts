/** Builds the shareable join link for a session. */
export function joinLink(sessionId: string, origin?: string) {
  const base = origin ?? globalThis.location?.origin ?? "";
  return `${base}/s/${sessionId}`;
}

/**
 * Copy text to clipboard. navigator.clipboard needs a secure context (HTTPS/localhost);
 * on plain HTTP (e.g. EC2 EIP PoC) fall back to execCommand.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
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
