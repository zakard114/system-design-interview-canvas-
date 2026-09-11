import { describe, expect, it } from "vitest";
import { joinLink, parseSessionRef } from "./session-link";

describe("session links", () => {
  it("builds a shareable link from an origin", () => {
    expect(joinLink("abc123", "https://example.com")).toBe("https://example.com/s/abc123");
  });

  it("extracts the session id from a full link", () => {
    expect(parseSessionRef("https://example.com/s/abc123")).toBe("abc123");
    expect(parseSessionRef("  /s/abc123?x=1 ")).toBe("abc123");
  });

  it("accepts a bare session id", () => {
    expect(parseSessionRef("abc123")).toBe("abc123");
  });

  it("rejects unusable input", () => {
    expect(parseSessionRef("")).toBeNull();
    expect(parseSessionRef("   ")).toBeNull();
    expect(parseSessionRef("ab")).toBeNull();
    expect(parseSessionRef("not a link!")).toBeNull();
  });
});
