import { createBrowserMockInterviewService } from "./mock";
import type { InterviewService } from "./types";

export * from "./types";
export { createMockInterviewService, MockInterviewService } from "./mock";

let instance: InterviewService | null = null;

/**
 * The single entry point for backend access in the app.
 * Today it returns the mock implementation; swapping to a real
 * HTTP/WebSocket client is a change in this function only.
 */
export function getInterviewService(): InterviewService {
  if (!instance) {
    instance = createBrowserMockInterviewService();
  }
  return instance;
}

/** Test/storybook seam. */
export function setInterviewService(service: InterviewService | null) {
  instance = service;
}
