import { describe, expect, it } from "vitest";
import { normalizeCanvasObject } from "./normalize-canvas-object";

describe("normalizeCanvasObject", () => {
  it("maps from_ to from for edges", () => {
    const edge = normalizeCanvasObject({
      id: "e1",
      kind: "edge" as const,
      from_: "a",
      to: "b",
      label: "",
      createdBy: "p",
    });
    expect(edge).toMatchObject({ from: "a", to: "b" });
    expect("from_" in edge).toBe(false);
  });

  it("leaves already-aliased edges alone", () => {
    const edge = {
      id: "e1",
      kind: "edge" as const,
      from: "a",
      to: "b",
      label: "",
      createdBy: "p",
    };
    expect(normalizeCanvasObject(edge)).toEqual(edge);
  });
});
