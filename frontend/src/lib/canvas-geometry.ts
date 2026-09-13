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

/** Axis-aligned bounds of a freehand stroke (optionally padded). */
export function strokeBounds(
  points: Array<[number, number]>,
  pad = 0,
): { x: number; y: number; w: number; h: number } {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(0, maxX - minX) + pad * 2,
    h: Math.max(0, maxY - minY) + pad * 2,
  };
}

/** True if any stroke point lies within `radius` of (x, y). */
export function strokeHitsPoint(
  points: Array<[number, number]>,
  x: number,
  y: number,
  radius: number,
): boolean {
  const r2 = radius * radius;
  for (const [px, py] of points) {
    const dx = px - x;
    const dy = py - y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

export type LineStyle = "solid" | "dashed" | "dotted";
export type PathStyle = "straight" | "curved";

export function strokeDasharray(style: LineStyle | undefined): string | undefined {
  switch (style) {
    case "dashed":
      return "8 6";
    case "dotted":
      return "2 4";
    default:
      return undefined;
  }
}

export type Box = { x: number; y: number; w: number; h: number };

export type AnchorUV = { u: number; v: number };

/** Corners + edge midpoints (no center) — CAD connect targets. */
export function boxConnectPivots(box: Box): Point[] {
  const { x, y, w, h } = box;
  const mx = x + w / 2;
  const my = y + h / 2;
  return [
    { x, y },
    { x: mx, y },
    { x: x + w, y },
    { x: x + w, y: my },
    { x: x + w, y: y + h },
    { x: mx, y: y + h },
    { x, y: y + h },
    { x, y: my },
  ];
}

/** Exact UV for each entry of `boxConnectPivots` (same order). */
export const CONNECT_PIVOT_ANCHORS: AnchorUV[] = [
  { u: 0, v: 0 },
  { u: 0.5, v: 0 },
  { u: 1, v: 0 },
  { u: 1, v: 0.5 },
  { u: 1, v: 1 },
  { u: 0.5, v: 1 },
  { u: 0, v: 1 },
  { u: 0, v: 0.5 },
];

/** Corners + edge midpoints (+ center) used as snap pivots when moving boxes. */
export function boxPivotPoints(box: Box): Point[] {
  const c = nodeCenter(box);
  return [...boxConnectPivots(box), c];
}

export function pointToAnchor(box: Box, p: Point): AnchorUV {
  const raw = {
    u: box.w === 0 ? 0.5 : clamp((p.x - box.x) / box.w, 0, 1),
    v: box.h === 0 ? 0.5 : clamp((p.y - box.y) / box.h, 0, 1),
  };
  // Snap to exact 0 / 0.5 / 1 so corners stay corners (avoid float drift → mid).
  const q = (t: number) => {
    if (t <= 0.25) return 0;
    if (t >= 0.75) return 1;
    if (Math.abs(t - 0.5) <= 0.25) return 0.5;
    return t;
  };
  return { u: q(raw.u), v: q(raw.v) };
}

export function anchorToPoint(box: Box, a: AnchorUV): Point {
  return { x: box.x + a.u * box.w, y: box.y + a.v * box.h };
}

export const CONNECT_SNAP_THRESHOLD = 16;
/** Show a single CAD guide when cursor is near a corner / edge-mid. */
export const CONNECT_GRIP_SHOW = 26;
/** Soft magnet pull band (slides toward the pivot). */
export const CONNECT_ATTRACT = 14;
/** Hard snap distance — tip locks onto the pivot. */
export const CONNECT_MAGNET = 7;

/** Nearest corner/midpoint within threshold, or null. */
export function snapToConnectPivot(
  box: Box,
  p: Point,
  threshold = CONNECT_SNAP_THRESHOLD,
): Point | null {
  let best: Point | null = null;
  let bestDist = threshold;
  for (const pivot of boxConnectPivots(box)) {
    const d = Math.hypot(pivot.x - p.x, pivot.y - p.y);
    if (d <= bestDist) {
      bestDist = d;
      best = pivot;
    }
  }
  return best;
}

export type ConnectMagnetResult = {
  /** Where the arrow tip should be (may be attracted / snapped). */
  tip: Point;
  /** Single grip to draw, or null. */
  grip: Point | null;
  /** True when fully magnet-snapped. */
  locked: boolean;
  dist: number;
};

/**
 * CAD-style: at most one nearest guide on the *target*; soft attract then hard snap.
 * Far from all pivots → no grip, tip stays on the cursor.
 */
export function magnetConnectTip(box: Box, cursor: Point): ConnectMagnetResult {
  let best: Point | null = null;
  let bestDist = Infinity;
  for (const pivot of boxConnectPivots(box)) {
    const d = Math.hypot(pivot.x - cursor.x, pivot.y - cursor.y);
    if (d < bestDist) {
      bestDist = d;
      best = pivot;
    }
  }
  if (!best || bestDist > CONNECT_GRIP_SHOW) {
    return { tip: cursor, grip: null, locked: false, dist: bestDist };
  }
  if (bestDist <= CONNECT_MAGNET) {
    return { tip: best, grip: best, locked: true, dist: bestDist };
  }
  if (bestDist <= CONNECT_ATTRACT) {
    // Ease-in: slides, then snaps as distance closes.
    const t =
      1 - (bestDist - CONNECT_MAGNET) / (CONNECT_ATTRACT - CONNECT_MAGNET);
    const pull = 0.35 + 0.65 * (t * t);
    return {
      tip: {
        x: cursor.x + (best.x - cursor.x) * pull,
        y: cursor.y + (best.y - cursor.y) * pull,
      },
      grip: best,
      locked: false,
      dist: bestDist,
    };
  }
  // Near enough to preview the landing site, tip still mostly follows cursor.
  return {
    tip: {
      x: cursor.x + (best.x - cursor.x) * 0.12,
      y: cursor.y + (best.y - cursor.y) * 0.12,
    },
    grip: best,
    locked: false,
    dist: bestDist,
  };
}

/** Always pick the nearest corner / edge-mid (the 8 white-box sites). */
export function nearestConnectPivot(box: Box, p: Point): Point {
  let best = boxConnectPivots(box)[0]!;
  let bestDist = Infinity;
  for (const pivot of boxConnectPivots(box)) {
    const d = Math.hypot(pivot.x - p.x, pivot.y - p.y);
    if (d < bestDist) {
      bestDist = d;
      best = pivot;
    }
  }
  return best;
}

/** Quadratic curve between two edge endpoints (mild arch). */
export function curvedEdgePath(start: Point, end: Point): string {
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(48, len * 0.22);
  const cx = mx - (dy / len) * bend;
  const cy = my + (dx / len) * bend;
  return `M${start.x} ${start.y} Q${cx} ${cy} ${end.x} ${end.y}`;
}

/** Start/end for an arrow, honoring optional UV anchors independently. */
export function edgeEndpoints(
  from: Box,
  to: Box,
  fromAnchor?: AnchorUV | null,
  toAnchor?: AnchorUV | null,
): { start: Point; end: Point } {
  if (fromAnchor && toAnchor) {
    return {
      start: anchorToPoint(from, fromAnchor),
      end: anchorToPoint(to, toAnchor),
    };
  }
  if (toAnchor) {
    const end = anchorToPoint(to, toAnchor);
    const start = fromAnchor ? anchorToPoint(from, fromAnchor) : borderPoint(from, end);
    return { start, end };
  }
  if (fromAnchor) {
    const start = anchorToPoint(from, fromAnchor);
    const end = borderPoint(to, start);
    return { start, end };
  }
  return edgeSegment(from, to);
}

export const SNAP_THRESHOLD = 10;

export type SnapResult = {
  dx: number;
  dy: number;
  guides: Array<{ x1: number; y1: number; x2: number; y2: number }>;
};

/**
 * Snap a moving box (at start + raw delta) to pivots on other boxes.
 * Aligns moving pivots to target pivots within SNAP_THRESHOLD on x and/or y.
 */
export function snapBoxDelta(
  moving: Box,
  rawDx: number,
  rawDy: number,
  targets: Box[],
  threshold = SNAP_THRESHOLD,
): SnapResult {
  const tentative = { x: moving.x + rawDx, y: moving.y + rawDy, w: moving.w, h: moving.h };
  const movers = boxPivotPoints(tentative);
  const anchors = targets.flatMap(boxPivotPoints);

  let bestDx = rawDx;
  let bestDy = rawDy;
  let bestAbsX = threshold + 1;
  let bestAbsY = threshold + 1;
  let snapX: number | null = null;
  let snapY: number | null = null;

  for (const m of movers) {
    for (const a of anchors) {
      const ddx = a.x - m.x;
      const ddy = a.y - m.y;
      const absX = Math.abs(ddx);
      const absY = Math.abs(ddy);
      if (absX <= threshold && absX < bestAbsX) {
        bestAbsX = absX;
        bestDx = rawDx + ddx;
        snapX = a.x;
      }
      if (absY <= threshold && absY < bestAbsY) {
        bestAbsY = absY;
        bestDy = rawDy + ddy;
        snapY = a.y;
      }
    }
  }

  const guides: SnapResult["guides"] = [];
  if (snapX != null) {
    guides.push({ x1: snapX, y1: 0, x2: snapX, y2: 1e9 }); // clipped by caller to canvas
  }
  if (snapY != null) {
    guides.push({ x1: 0, y1: snapY, x2: 1e9, y2: snapY });
  }

  return { dx: bestDx, dy: bestDy, guides };
}

