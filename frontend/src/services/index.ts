import { createBrowserMockInterviewService } from "./mock";
import { createHttpInterviewService, DEFAULT_API_BASE_URL } from "./http";
import type { InterviewService } from "./types";

export * from "./types";
export { createMockInterviewService, MockInterviewService } from "./mock";
export {
  createHttpInterviewService,
  HttpInterviewService,
  DEFAULT_API_BASE_URL,
} from "./http";

let instance: InterviewService | null = null;

function resolveDefaultService(): InterviewService {
  // Keep mock available for tests / offline: VITE_USE_MOCK=true
  const useMock = import.meta.env.VITE_USE_MOCK === "true";
  if (useMock) {
    return createBrowserMockInterviewService();
  }
  const baseUrl =
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
    DEFAULT_API_BASE_URL;
  return createHttpInterviewService({ baseUrl });
}

/**
 * The single entry point for backend access in the app.
 * Default: HTTP/WebSocket client → FastAPI (openapi.yaml).
 * Set VITE_USE_MOCK=true to use the local mock instead.
 */
export function getInterviewService(): InterviewService {
  if (!instance) {
    instance = resolveDefaultService();
  }
  return instance;
}

/** Test/storybook seam. */
export function setInterviewService(service: InterviewService | null) {
  instance = service;
}
