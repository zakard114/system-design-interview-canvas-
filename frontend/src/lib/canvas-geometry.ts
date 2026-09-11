import type { NodeObject } from "@/services";

export interface Point {
  x: number;
  y: number;
}

export const nodeCenter = (node: Pick<NodeObject, "x" | "y" | "w" | "h">): Point => ({
  x: node.x + node.w / 2,
  y: node.y + node.h / 2,
});

/**
 * Point where the line from a node's center toward `target` exits the node box.
 * Keeps arrows attached to box edges instead of centers.
 */
export function borderPoint(
  node: Pick<NodeObject, "x" | "y" | "w" | "h">,
  target: Point,
): Point {
  const c = nodeCenter(node);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = node.w / 2;
  const hh = node.h / 2;
  const scale = Math.min(
    dx === 0 ? Infinity : hw / Math.abs(dx),
    dy === 0 ? Infinity : hh / Math.abs(dy),
  );
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

/** Start/end points for an arrow drawn between two node boxes. */
export function edgeSegment(
  from: Pick<NodeObject, "x" | "y" | "w" | "h">,
  to: Pick<NodeObject, "x" | "y" | "w" | "h">,
): { start: Point; end: Point } {
  return {
    start: borderPoint(from, nodeCenter(to)),
    end: borderPoint(to, nodeCenter(from)),
  };
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Reduces a freehand point list, dropping points closer than `minDistance`. */
export function simplifyStroke(
  points: Array<[number, number]>,
  minDistance = 2,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (
      !last ||
      Math.hypot(point[0] - last[0], point[1] - last[1]) >= minDistance
    ) {
      out.push(point);
    }
  }
  return out;
}

export const strokePath = (points: Array<[number, number]>) =>
  points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
