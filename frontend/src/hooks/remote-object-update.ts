/**
 * While a local PATCH is in flight, older WebSocket object_updated echoes
 * must not replace optimistic state (causes cursor jumps / phantom Backspace).
 */
export function shouldApplyRemoteObjectUpdate(
  objectId: string,
  pendingLocalUpdates: ReadonlyMap<string, number>,
): boolean {
  return !pendingLocalUpdates.has(objectId);
}
