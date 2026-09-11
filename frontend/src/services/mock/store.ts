import type { CanvasObject, Participant, Session } from "../types";

export interface StoreData {
  sessions: Record<string, Session>;
  participants: Record<string, Participant[]>;
  objects: Record<string, CanvasObject[]>;
}

export const emptyStore = (): StoreData => ({
  sessions: {},
  participants: {},
  objects: {},
});

/** Persistence port — mock uses localStorage in the browser, nothing in tests. */
export interface PersistencePort {
  load(): StoreData | null;
  save(data: StoreData): void;
}

/** Fan-out port — mock uses BroadcastChannel across tabs, nothing in tests. */
export interface BroadcastPort {
  post(message: unknown): void;
  listen(handler: (message: unknown) => void): () => void;
}

const STORAGE_KEY = "idc.mock-store.v1";

export function createLocalStoragePersistence(): PersistencePort {
  return {
    load() {
      try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as StoreData) : null;
      } catch {
        return null;
      }
    },
    save(data) {
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        /* ignore quota / unavailable storage */
      }
    },
  };
}

export function createBroadcastChannelPort(name = "idc.session-events"): BroadcastPort {
  const Channel =
    typeof globalThis.BroadcastChannel === "function" ? globalThis.BroadcastChannel : null;
  if (!Channel) {
    return { post: () => {}, listen: () => () => {} };
  }
  const channel = new Channel(name);
  return {
    post(message) {
      channel.postMessage(message);
    },
    listen(handler) {
      const onMessage = (event: MessageEvent) => handler(event.data);
      channel.addEventListener("message", onMessage);
      return () => channel.removeEventListener("message", onMessage);
    },
  };
}
