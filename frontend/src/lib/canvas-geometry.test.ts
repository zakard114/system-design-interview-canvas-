import { describe, expect, it } from "vitest";
import {
  borderPoint,
  clamp,
  edgeSegment,
  nodeCenter,
  simplifyStroke,
  strokePath,
} from "./canvas-geometry";

const box = (x: number, y: number) => ({ x, y, w: 100, h: 50 });

describe("canvas geometry", () => {
  it("computes the centre of a node box", () => {
    expect(nodeCenter(box(0, 0))).toEqual({ x: 50, y: 25 });
  });

  it("exits the box on the right edge when the target is to the right", () => {
    const point = borderPoint(box(0, 0), { x: 500, y: 25 });
    expect(point).toEqual({ x: 100, y: 25 });
  });

  it("exits the box on the top edge when the target is above", () => {
    const point = borderPoint(box(0, 0), { x: 50, y: -500 });
    expect(point).toEqual({ x: 50, y: 0 });
  });

  it("returns the centre when target equals centre", () => {
    expect(borderPoint(box(0, 0), { x: 50, y: 25 })).toEqual({ x: 50, y: 25 });
  });

  it("draws an arrow between facing edges of two boxes", () => {
    const { start, end } = edgeSegment(box(0, 0), box(300, 0));
    expect(start).toEqual({ x: 100, y: 25 });
    expect(end).toEqual({ x: 300, y: 25 });
  });

  it("clamps values into range", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
    expect(clamp(4, 0, 10)).toBe(4);
  });

  it("drops freehand points that are too close together", () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [0.5, 0],
      [10, 0],
      [10.4, 0],
      [30, 0],
    ];
    expect(simplifyStroke(points, 2)).toEqual([
      [0, 0],
      [10, 0],
      [30, 0],
    ]);
  });

  it("builds an SVG path from stroke points", () => {
    expect(
      strokePath([
        [0, 0],
        [5, 6],
      ]),
    ).toBe("M0 0 L5 6");
  });
});
