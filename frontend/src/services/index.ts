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

/**
 * Frontend First default: in-browser mock (localStorage + cross-tab sync).
 * Set VITE_USE_MOCK=false to use the HTTP/WebSocket client → FastAPI.
 */
export function isUsingMockService(): boolean {
  return import.meta.env.VITE_USE_MOCK !== "false";
}

function resolveDefaultService(): InterviewService {
  if (isUsingMockService()) {
    return createBrowserMockInterviewService();
  }
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const baseUrl = envBase
    ? envBase
    : import.meta.env.PROD
      ? ""
      : DEFAULT_API_BASE_URL;
  return createHttpInterviewService({ baseUrl });
}

/**
 * The single entry point for backend access in the app.
 * Default: browser mock (no backend). Set VITE_USE_MOCK=false for FastAPI.
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
