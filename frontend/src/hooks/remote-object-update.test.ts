import { describe, expect, it } from "vitest";
import { shouldApplyRemoteObjectUpdate } from "./remote-object-update";

describe("shouldApplyRemoteObjectUpdate", () => {
  it("applies remote updates when nothing is pending locally", () => {
    expect(shouldApplyRemoteObjectUpdate("obj-1", new Map())).toBe(true);
  });

  it("skips remote updates while a local patch for that id is in flight", () => {
    const pending = new Map([["obj-1", 2]]);
    expect(shouldApplyRemoteObjectUpdate("obj-1", pending)).toBe(false);
    expect(shouldApplyRemoteObjectUpdate("obj-2", pending)).toBe(true);
  });
});
