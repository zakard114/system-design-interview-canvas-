import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CanvasObject,
  EdgeObject,
  NewCanvasObject,
  NodeObject,
  StickyObject,
  StrokeObject,
} from "@/services";
import { CANVAS_H, CANVAS_W, NODE_H, NODE_W, nodeMeta } from "./node-meta";
import {
  DEFAULT_ARROW_LINE_STYLE,
  DEFAULT_ERASER_SIZE,
  DEFAULT_PEN_WIDTH,
  arrowPresetToEdgeProps,
  type ArrowLineStyle,
  type Tool,
} from "./tools";
import {
  clamp,
  borderPoint,
  CONNECT_GRIP_SHOW,
  curvedEdgePath,
  edgeEndpoints,
  magnetConnectTip,
  pointToAnchor,
  simplifyStroke,
  snapBoxDelta,
  strokeBounds,
  strokeDasharray,
  strokeHitsPoint,
  strokePath,
  type AnchorUV,
  type SnapResult,
} from "@/lib/canvas-geometry";

export const STICKY_W = 160;
export const STICKY_H = 96;
const MARQUEE_THRESHOLD = 4;
const SELECTION_RING = "#2dd4bf";
const CROSSHAIR_STROKE = "rgba(255, 255, 255, 0.72)";
const CROSSHAIR_GLOW = "rgba(45, 212, 191, 0.35)";
/** Committed arrow stroke. */
const ARROW_STROKE_WIDTH = 1.25;
/** Rubber-band preview while connecting — must stay readable. */
const ARROW_PREVIEW_STROKE_WIDTH = 2;
const CLICK_MOVE_THRESHOLD = 3;
const CANVAS_ZOOM_KEY = "idc.canvasZoom";
const CANVAS_ZOOM_MIN = 0.5;
const CANVAS_ZOOM_MAX = 2;

function readCanvasZoom(): number {
  try {
    const raw = globalThis.localStorage?.getItem(CANVAS_ZOOM_KEY);
    if (!raw) return 1;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, n)) : 1;
  } catch {
    return 1;
  }
}

interface Props {
  objects: CanvasObject[];
  tool: Tool;
  onToolUsed: () => void;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onCreate: (object: NewCanvasObject) => void | Promise<CanvasObject | void | undefined>;
  onUpdate: (id: string, patch: Partial<CanvasObject>) => void;
  /** Called once before a drag-commit that may update multiple objects. */
  onBeforeMoveCommit?: () => void;
  /** Snapshot before an eraser gesture deletes strokes. */
  onBeforeEraseCommit?: () => void;
  /** Delete a canvas object (eraser: whole-stroke remove). */
  onDelete?: (id: string) => void;
  penWidth?: number;
  eraserSize?: number;
  arrowLineStyle?: ArrowLineStyle;
  participantId: string;
}

type DragStart =
  | { id: string; kind: "xy"; x: number; y: number }
  | { id: string; kind: "stroke"; points: Array<[number, number]> };

type GroupDrag = {
  starts: DragStart[];
  pointerStartX: number;
  pointerStartY: number;
  dx: number;
  dy: number;
} | null;

type Marquee = { x0: number; y0: number; x1: number; y1: number } | null;

function pointInNode(node: Pick<NodeObject, "x" | "y" | "w" | "h">, x: number, y: number, pad = 0) {
  return (
    x >= node.x - pad &&
    x <= node.x + node.w + pad &&
    y >= node.y - pad &&
    y <= node.y + node.h + pad
  );
}

function normalizeRect(m: { x0: number; y0: number; x1: number; y1: number }) {
  const x = Math.min(m.x0, m.x1);
  const y = Math.min(m.y0, m.y1);
  const w = Math.abs(m.x1 - m.x0);
  const h = Math.abs(m.y1 - m.y0);
  return { x, y, w, h };
}

function intersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function CanvasSurface({
  objects,
  tool,
  onToolUsed,
  selectedIds,
  onSelect,
  onCreate,
  onUpdate,
  onBeforeMoveCommit,
  onBeforeEraseCommit,
  onDelete,
  penWidth = DEFAULT_PEN_WIDTH,
  eraserSize = DEFAULT_ERASER_SIZE,
  arrowLineStyle = DEFAULT_ARROW_LINE_STYLE,
  participantId,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<GroupDrag>(null);
  const [marquee, setMarquee] = useState<Marquee>(null);
  const marqueeRef = useRef<Marquee>(null);
  const [stroke, setStroke] = useState<Array<[number, number]> | null>(null);
  const [pendingEdgeFrom, setPendingEdgeFrom] = useState<string | null>(null);
  const [edgePreview, setEdgePreview] = useState<{ x: number; y: number } | null>(null);
  const [cursorGuide, setCursorGuide] = useState<{ x: number; y: number } | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapResult["guides"]>([]);
  const [connectGrip, setConnectGrip] = useState<{
    x: number;
    y: number;
    locked: boolean;
  } | null>(null);
  /** If set, a no-drag click on a multi-selection collapses to this id on pointerup. */
  const pendingSoloSelectRef = useRef<string | null>(null);
  const pendingEdgeFromRef = useRef<string | null>(null);
  const pendingToAnchorRef = useRef<AnchorUV | null>(null);
  const arrowDraggingRef = useRef(false);
  /** Blocks pointerup from creating a second edge after pointerdown already did. */
  const edgeCreateLockRef = useRef(false);
  const [canvasZoom, setCanvasZoom] = useState(readCanvasZoom);
  const erasingRef = useRef(false);
  const erasedIdsRef = useRef<Set<string>>(new Set());
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const nodes = objects.filter((o): o is NodeObject => o.kind === "node");
  const edges = objects.filter((o): o is EdgeObject => o.kind === "edge");
  const stickies = objects.filter((o): o is StickyObject => o.kind === "sticky");
  const strokes = objects.filter((o): o is StrokeObject => o.kind === "stroke");
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const pointFrom = useCallback((event: React.PointerEvent | PointerEvent) => {
    const el = surfaceRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    // CSS `zoom` scales the bounding rect; map screen → canvas logical coords
    // so the crosshair center sits on the cursor hotspot (not diagonally ahead).
    const scaleX = rect.width / CANVAS_W || 1;
    const scaleY = rect.height / CANVAS_H || 1;
    return {
      x: (event.clientX - rect.left) / scaleX,
      y: (event.clientY - rect.top) / scaleY,
    };
  }, []);

  const positionOf = (object: NodeObject | StickyObject) => {
    if (!drag) return { x: object.x, y: object.y };
    const start = drag.starts.find((s) => s.id === object.id && s.kind === "xy");
    if (!start || start.kind !== "xy") return { x: object.x, y: object.y };
    return { x: start.x + drag.dx, y: start.y + drag.dy };
  };

  const strokePointsOf = (s: StrokeObject): Array<[number, number]> => {
    if (!drag) return s.points;
    const start = drag.starts.find((d) => d.id === s.id && d.kind === "stroke");
    if (!start || start.kind !== "stroke") return s.points;
    return start.points.map(([x, y]) => [x + drag.dx, y + drag.dy]);
  };

  const nodeAt = (x: number, y: number, pad = 0): NodeObject | null => {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const node = nodes[i];
      if (!node) continue;
      const pos = positionOf(node);
      if (pointInNode({ x: pos.x, y: pos.y, w: node.w, h: node.h }, x, y, pad)) {
        return node;
      }
    }
    return null;
  };

  /** Arrow connect: include corner grips that sit slightly outside the box. */
  const nodeAtForConnect = (x: number, y: number): NodeObject | null => {
    const direct = nodeAt(x, y, CONNECT_GRIP_SHOW * 0.5);
    if (direct) return direct;
    let best: NodeObject | null = null;
    let bestDist = CONNECT_GRIP_SHOW;
    for (const node of nodes) {
      const pos = positionOf(node);
      const box = { x: pos.x, y: pos.y, w: node.w, h: node.h };
      const magnet = magnetConnectTip(box, { x, y });
      if (magnet.grip && magnet.dist <= bestDist) {
        bestDist = magnet.dist;
        best = node;
      }
    }
    return best;
  };

  /** Option A: erase whole stroke objects whose points fall within eraser radius. */
  const eraseAt = useCallback(
    (x: number, y: number) => {
      if (!onDelete) return;
      const radius = eraserSize / 2;
      for (const s of strokesRef.current) {
        if (erasedIdsRef.current.has(s.id)) continue;
        const hitRadius = radius + s.width / 2;
        if (!strokeHitsPoint(s.points, x, y, hitRadius)) continue;
        if (erasedIdsRef.current.size === 0) onBeforeEraseCommit?.();
        erasedIdsRef.current.add(s.id);
        onDelete(s.id);
      }
    },
    [eraserSize, onBeforeEraseCommit, onDelete],
  );

  const clearPendingEdge = useCallback(() => {
    pendingEdgeFromRef.current = null;
    pendingToAnchorRef.current = null;
    setPendingEdgeFrom(null);
    setEdgePreview(null);
    setConnectGrip(null);
    arrowDraggingRef.current = false;
  }, []);

  useEffect(() => {
    if (tool.kind !== "arrow") clearPendingEdge();
  }, [tool.kind, clearPendingEdge]);

  // Canvas-only Ctrl/Cmd+wheel — chrome (sidebars) stays put.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const surface = surfaceRef.current;
      const overSurface =
        surface != null && event.target instanceof Node && surface.contains(event.target);
      if (!overSurface) return;
      event.preventDefault();
      event.stopPropagation();
      const step = event.deltaY > 0 ? -0.08 : 0.08;
      setCanvasZoom((z) => {
        const next =
          Math.round(Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, z + step)) * 100) / 100;
        try {
          globalThis.localStorage?.setItem(CANVAS_ZOOM_KEY, String(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const createEdge = useCallback(
    async (fromId: string, toId: string, toAnchor?: AnchorUV | null) => {
      if (!fromId || !toId || fromId === toId) return;
      if (edgeCreateLockRef.current) return;
      edgeCreateLockRef.current = true;

      const preset = arrowPresetToEdgeProps(arrowLineStyle);
      const fromNode = nodes.find((n) => n.id === fromId);
      const toNode = nodes.find((n) => n.id === toId);
      const tipAnchor = toAnchor ?? pendingToAnchorRef.current;
      const previewSnap = edgePreview;

      // Clear pending BEFORE await so pointerup cannot create a duplicate edge.
      clearPendingEdge();
      arrowDraggingRef.current = false;

      try {
        let fromAnchor: AnchorUV | undefined;
        let resolvedTo = tipAnchor ?? undefined;
        if (fromNode && toNode) {
          if (!resolvedTo) {
            const tipGuess = previewSnap ?? {
              x: toNode.x + toNode.w / 2,
              y: toNode.y + toNode.h / 2,
            };
            const magnet = magnetConnectTip(toNode, tipGuess);
            resolvedTo = pointToAnchor(toNode, magnet.grip ?? borderPoint(toNode, tipGuess));
          }
          const end = {
            x: toNode.x + resolvedTo.u * toNode.w,
            y: toNode.y + resolvedTo.v * toNode.h,
          };
          // Start follows the tip direction (never a fixed click site).
          fromAnchor = pointToAnchor(fromNode, borderPoint(fromNode, end));
        }
        const created = await onCreate({
          kind: "edge",
          from: fromId,
          to: toId,
          label: "",
          lineStyle: preset.lineStyle,
          pathStyle: preset.pathStyle,
          ...(fromAnchor ? { fromAnchor } : {}),
          ...(resolvedTo ? { toAnchor: resolvedTo } : {}),
          createdBy: participantId,
        });
        if (created && typeof created === "object" && "id" in created) {
          onSelect([created.id]);
        } else {
          onSelect([]);
        }
      } finally {
        edgeCreateLockRef.current = false;
      }
    },
    [arrowLineStyle, clearPendingEdge, edgePreview, nodes, onCreate, onSelect, participantId],
  );

  const resolveTargetTip = useCallback(
    (node: NodeObject, x: number, y: number) => {
      const pos = positionOf(node);
      const box = { x: pos.x, y: pos.y, w: node.w, h: node.h };
      const magnet = magnetConnectTip(box, { x, y });

      // Guide box only when the magnet says a single pivot is in range.
      if (!magnet.grip) {
        return {
          tip: { x, y },
          grip: null as { x: number; y: number; locked: boolean } | null,
          anchor: null as AnchorUV | null,
        };
      }

      return {
        tip: magnet.tip,
        grip: {
          x: magnet.grip.x,
          y: magnet.grip.y,
          locked: magnet.locked,
        },
        anchor: pointToAnchor(box, magnet.grip),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drag],
  );

  const handleArrowOnNode = useCallback(
    (nodeId: string, x: number, y: number) => {
      const from = pendingEdgeFromRef.current;
      if (!from) {
        pendingEdgeFromRef.current = nodeId;
        setPendingEdgeFrom(nodeId);
        setEdgePreview({ x, y });
        setConnectGrip(null);
        onSelect([nodeId]);
        return;
      }
      if (from === nodeId) {
        clearPendingEdge();
        return;
      }
      const node = nodes.find((n) => n.id === nodeId);
      const resolved = node ? resolveTargetTip(node, x, y) : null;
      const anchor = pendingToAnchorRef.current ?? resolved?.anchor ?? null;
      void createEdge(from, nodeId, anchor);
    },
    [clearPendingEdge, createEdge, nodes, onSelect, resolveTargetTip],
  );

  const beginMarquee = (x: number, y: number, event: React.PointerEvent) => {
    const next = { x0: x, y0: y, x1: x, y1: y };
    marqueeRef.current = next;
    setMarquee(next);
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const handleSurfaceDown = (event: React.PointerEvent) => {
    const { x, y } = pointFrom(event);
    if (tool.kind === "node") {
      const meta = nodeMeta(tool.type);
      onCreate({
        kind: "node",
        type: tool.type,
        x: clamp(x - NODE_W / 2, 0, CANVAS_W - NODE_W),
        y: clamp(y - NODE_H / 2, 0, CANVAS_H - NODE_H),
        w: NODE_W,
        h: NODE_H,
        label: meta.defaultLabel,
        createdBy: participantId,
      });
      onToolUsed();
      return;
    }
    if (tool.kind === "sticky") {
      onCreate({
        kind: "sticky",
        x: clamp(x - STICKY_W / 2, 0, CANVAS_W - STICKY_W),
        y: clamp(y - STICKY_H / 2, 0, CANVAS_H - STICKY_H),
        text: "Note",
        createdBy: participantId,
      });
      onToolUsed();
      return;
    }
    if (tool.kind === "pen") {
      setStroke([[x, y]]);
      (event.target as Element).setPointerCapture?.(event.pointerId);
      return;
    }
    if (tool.kind === "eraser") {
      erasingRef.current = true;
      erasedIdsRef.current = new Set();
      eraseAt(x, y);
      (event.target as Element).setPointerCapture?.(event.pointerId);
      return;
    }
    if (tool.kind === "arrow") {
      const hit = nodeAtForConnect(x, y);
      if (hit) {
        arrowDraggingRef.current = true;
        handleArrowOnNode(hit.id, x, y);
        (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
        return;
      }
      clearPendingEdge();
      onSelect([]);
      return;
    }
    clearPendingEdge();
    if (tool.kind === "select") {
      beginMarquee(x, y, event);
      return;
    }
    onSelect([]);
  };

  const handleMove = (event: React.PointerEvent) => {
    const { x, y } = pointFrom(event);
    setCursorGuide({ x, y });

    if (stroke) {
      setStroke((prev) => (prev ? [...prev, [x, y]] : prev));
      return;
    }
    if (erasingRef.current) {
      eraseAt(x, y);
      return;
    }
    if (marqueeRef.current) {
      const next = { ...marqueeRef.current, x1: x, y1: y };
      marqueeRef.current = next;
      setMarquee(next);
      return;
    }
    if (tool.kind === "arrow" && pendingEdgeFromRef.current) {
      const fromId = pendingEdgeFromRef.current;
      const hit = nodeAtForConnect(x, y);

      // Tip follows cursor; start on source follows tip (border exit).
      let tip = { x, y };
      pendingToAnchorRef.current = null;
      setConnectGrip(null);

      if (hit && hit.id !== fromId) {
        const resolved = resolveTargetTip(hit, x, y);
        tip = resolved.tip;
        pendingToAnchorRef.current = resolved.anchor;
        setConnectGrip(resolved.grip);
      } else if (!hit || hit.id === fromId) {
        // Approach target from outside (or still on source) — nearest corner/mid grip
        let best: {
          tip: { x: number; y: number };
          grip: { x: number; y: number; locked: boolean };
          anchor: AnchorUV;
          dist: number;
        } | null = null;
        for (const n of nodes) {
          if (n.id === fromId) continue;
          const pos = positionOf(n);
          const box = { x: pos.x, y: pos.y, w: n.w, h: n.h };
          const magnet = magnetConnectTip(box, { x, y });
          if (!magnet.grip) continue;
          if (best && magnet.dist >= best.dist) continue;
          best = {
            tip: magnet.locked ? magnet.grip : magnet.tip,
            grip: {
              x: magnet.grip.x,
              y: magnet.grip.y,
              locked: magnet.locked,
            },
            anchor: pointToAnchor(box, magnet.grip),
            dist: magnet.dist,
          };
        }
        if (best) {
          tip = best.tip;
          pendingToAnchorRef.current = best.anchor;
          setConnectGrip(best.grip);
        }
      }
      setEdgePreview(tip);
      return;
    }
    if (drag) {
      const rawDx = x - drag.pointerStartX;
      const rawDy = y - drag.pointerStartY;
      const selected = new Set(drag.starts.map((s) => s.id));
      const movingBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
      for (const start of drag.starts) {
        if (start.kind === "xy") {
          const obj = objects.find((o) => o.id === start.id);
          if (obj?.kind === "node") {
            movingBoxes.push({ x: start.x, y: start.y, w: obj.w, h: obj.h });
          } else if (obj?.kind === "sticky") {
            movingBoxes.push({ x: start.x, y: start.y, w: STICKY_W, h: STICKY_H });
          }
        } else {
          movingBoxes.push(strokeBounds(start.points, 0));
        }
      }
      const targets: Array<{ x: number; y: number; w: number; h: number }> = [];
      for (const o of objects) {
        if (selected.has(o.id)) continue;
        if (o.kind === "node") targets.push({ x: o.x, y: o.y, w: o.w, h: o.h });
        else if (o.kind === "sticky") targets.push({ x: o.x, y: o.y, w: STICKY_W, h: STICKY_H });
      }

      let dx = rawDx;
      let dy = rawDy;
      let guides: SnapResult["guides"] = [];
      if (movingBoxes.length > 0 && targets.length > 0) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const b of movingBoxes) {
          minX = Math.min(minX, b.x);
          minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.w);
          maxY = Math.max(maxY, b.y + b.h);
        }
        const moving = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        const snapped = snapBoxDelta(moving, rawDx, rawDy, targets);
        dx = snapped.dx;
        dy = snapped.dy;
        guides = snapped.guides.map((g) => {
          const vertical = Math.abs(g.x2 - g.x1) < 1;
          if (vertical) {
            const gx = g.x1;
            return { x1: gx, y1: 0, x2: gx, y2: CANVAS_H };
          }
          const gy = g.y1;
          return { x1: 0, y1: gy, x2: CANVAS_W, y2: gy };
        });
      }
      setSnapGuides(guides);
      setDrag({ ...drag, dx, dy });
    }
  };

  const finishMarquee = () => {
    const m = marqueeRef.current;
    marqueeRef.current = null;
    setMarquee(null);
    if (!m) return;
    const rect = normalizeRect(m);
    if (rect.w < MARQUEE_THRESHOLD && rect.h < MARQUEE_THRESHOLD) {
      onSelect([]);
      return;
    }
    const hitIds: string[] = [];
    for (const node of nodes) {
      if (intersects(rect, { x: node.x, y: node.y, w: node.w, h: node.h })) {
        hitIds.push(node.id);
      }
    }
    for (const note of stickies) {
      if (intersects(rect, { x: note.x, y: note.y, w: STICKY_W, h: STICKY_H })) {
        hitIds.push(note.id);
      }
    }
    for (const s of strokes) {
      const bounds = strokeBounds(s.points, s.width / 2);
      if (bounds.w === 0 && bounds.h === 0 && s.points.length > 0) {
        const [px, py] = s.points[0]!;
        if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) {
          hitIds.push(s.id);
        }
      } else if (intersects(rect, bounds)) {
        hitIds.push(s.id);
      }
    }
    for (const edge of edges) {
      const fromId =
        typeof edge.from === "string" ? edge.from : (edge as EdgeObject & { from_?: string }).from_;
      const from = nodes.find((n) => n.id === fromId);
      const to = nodes.find((n) => n.id === edge.to);
      if (!from || !to) continue;
      const { start, end } = edgeEndpoints(from, to, edge.fromAnchor, edge.toAnchor);
      const bounds = {
        x: Math.min(start.x, end.x) - 8,
        y: Math.min(start.y, end.y) - 8,
        w: Math.abs(end.x - start.x) + 16,
        h: Math.abs(end.y - start.y) + 16,
      };
      if (intersects(rect, bounds)) hitIds.push(edge.id);
    }
    onSelect(hitIds);
  };

  const handleUp = (event: React.PointerEvent) => {
    if (stroke) {
      const points = simplifyStroke(stroke);
      if (points.length > 1) {
        onCreate({
          kind: "stroke",
          points,
          color: "var(--ink)",
          width: penWidth,
          lineStyle: "solid",
          createdBy: participantId,
        });
      }
      setStroke(null);
      return;
    }
    if (erasingRef.current) {
      erasingRef.current = false;
      erasedIdsRef.current = new Set();
      return;
    }
    if (marqueeRef.current) {
      finishMarquee();
      return;
    }
    if (tool.kind === "arrow" && arrowDraggingRef.current && pendingEdgeFromRef.current) {
      if (edgeCreateLockRef.current) {
        arrowDraggingRef.current = false;
        return;
      }
      const { x, y } = pointFrom(event);
      const fromId = pendingEdgeFromRef.current;
      arrowDraggingRef.current = false;
      const hit = nodeAtForConnect(x, y);
      if (hit && hit.id !== fromId) {
        const resolved = resolveTargetTip(hit, x, y);
        void createEdge(fromId, hit.id, pendingToAnchorRef.current ?? resolved.anchor);
        return;
      }
      let bestId: string | null = null;
      let bestAnchor: AnchorUV | null = null;
      let bestDist = Infinity;
      for (const n of nodes) {
        if (n.id === fromId) continue;
        const pos = positionOf(n);
        const box = { x: pos.x, y: pos.y, w: n.w, h: n.h };
        const magnet = magnetConnectTip(box, { x, y });
        if (!magnet.grip || magnet.dist >= bestDist) continue;
        bestDist = magnet.dist;
        bestId = n.id;
        bestAnchor = pointToAnchor(box, magnet.grip);
      }
      if (bestId) {
        void createEdge(fromId, bestId, pendingToAnchorRef.current ?? bestAnchor);
      }
      return;
    }
    if (drag) {
      const moved = Math.hypot(drag.dx, drag.dy) >= CLICK_MOVE_THRESHOLD;
      if (moved) {
        pendingSoloSelectRef.current = null;
        onBeforeMoveCommit?.();
        for (const start of drag.starts) {
          if (start.kind === "xy") {
            const x = Math.round(start.x + drag.dx);
            const y = Math.round(start.y + drag.dy);
            if (x !== start.x || y !== start.y) {
              onUpdate(start.id, { x, y });
            }
          } else {
            onUpdate(start.id, {
              points: start.points.map(([px, py]) => [px + drag.dx, py + drag.dy]),
            });
          }
        }
      } else if (pendingSoloSelectRef.current) {
        // Multi-select + plain click (no drag): keep only the clicked object.
        onSelect([pendingSoloSelectRef.current]);
        pendingSoloSelectRef.current = null;
      }
      setSnapGuides([]);
      setDrag(null);
    }
  };

  const startObjectInteraction = (event: React.PointerEvent, object: NodeObject | StickyObject) => {
    if (tool.kind === "pen" || tool.kind === "eraser") return;
    event.stopPropagation();

    if (tool.kind === "arrow") {
      if (object.kind !== "node") return;
      const { x, y } = pointFrom(event);
      arrowDraggingRef.current = true;
      handleArrowOnNode(object.id, x, y);
      // Capture so release on a corner grip (outside the node box) still completes.
      surfaceRef.current?.setPointerCapture?.(event.pointerId);
      return;
    }

    const shift = event.shiftKey;
    const mod = event.metaKey || event.ctrlKey;
    const current = selectedIdsRef.current;
    let nextSelection: string[];
    pendingSoloSelectRef.current = null;

    // Ctrl/Cmd: add or remove one without clearing the rest.
    if (mod || shift) {
      nextSelection = current.includes(object.id)
        ? current.filter((id) => id !== object.id)
        : [...current, object.id];
      onSelect(nextSelection);
      return;
    }

    if (current.includes(object.id) && current.length > 1) {
      // Keep group for drag; collapse to solo if this ends as a click.
      nextSelection = current;
      pendingSoloSelectRef.current = object.id;
    } else {
      nextSelection = [object.id];
      onSelect(nextSelection);
    }

    beginGroupDrag(event, nextSelection);
  };

  const beginGroupDrag = (event: React.PointerEvent, nextSelection: string[]) => {
    const selected = new Set(nextSelection);
    const starts: DragStart[] = [];
    for (const o of objects) {
      if (!selected.has(o.id)) continue;
      if (o.kind === "node" || o.kind === "sticky") {
        starts.push({ id: o.id, kind: "xy", x: o.x, y: o.y });
      } else if (o.kind === "stroke") {
        starts.push({
          id: o.id,
          kind: "stroke",
          points: o.points.map((p) => [p[0], p[1]] as [number, number]),
        });
      }
    }
    if (starts.length === 0) return;
    const { x, y } = pointFrom(event);
    setDrag({
      starts,
      pointerStartX: x,
      pointerStartY: y,
      dx: 0,
      dy: 0,
    });
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  };

  const selectStroke = (event: React.PointerEvent, s: StrokeObject) => {
    if (tool.kind === "pen" || tool.kind === "eraser") return;
    event.stopPropagation();
    if (tool.kind === "arrow") return;

    const cur = selectedIdsRef.current;
    const mod = event.metaKey || event.ctrlKey || event.shiftKey;
    let nextSelection: string[];
    pendingSoloSelectRef.current = null;

    if (mod) {
      nextSelection = cur.includes(s.id) ? cur.filter((id) => id !== s.id) : [...cur, s.id];
      onSelect(nextSelection);
      return;
    }
    if (cur.includes(s.id) && cur.length > 1) {
      nextSelection = cur;
      pendingSoloSelectRef.current = s.id;
    } else {
      nextSelection = [s.id];
      onSelect(nextSelection);
    }
    beginGroupDrag(event, nextSelection);
  };

  const cursor =
    tool.kind === "pen" || tool.kind === "eraser" || tool.kind === "select" || tool.kind === "arrow"
      ? "crosshair"
      : "copy";

  const edgePointerClass =
    tool.kind === "select" ? "pointer-events-auto cursor-pointer" : "pointer-events-none";

  const selectedSet = new Set(selectedIds);
  const marqueeRect = marquee ? normalizeRect(marquee) : null;

  return (
    <div ref={scrollRef} className="h-full w-full overflow-auto bg-background">
      <div
        ref={surfaceRef}
        onPointerDown={handleSurfaceDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={() => {
          setCursorGuide(null);
          if (tool.kind !== "arrow" || !pendingEdgeFromRef.current) {
            setConnectGrip(null);
          }
        }}
        className="relative grid-paper touch-none select-none"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          cursor,
          zoom: canvasZoom,
        }}
        data-testid="canvas-surface"
      >
        <svg
          className="pointer-events-none absolute inset-0 z-0"
          width={CANVAS_W}
          height={CANVAS_H}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="6"
              markerHeight="5"
              refX="5.5"
              refY="2.5"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L6,2.5 L0,5 z" fill="#2dd4bf" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const fromId =
              typeof edge.from === "string"
                ? edge.from
                : (edge as EdgeObject & { from_?: string }).from_;
            const to = nodes.find((n) => n.id === edge.to);
            const from = nodes.find((n) => n.id === fromId);
            if (!from || !to) return null;
            const fromPos = { ...from, ...positionOf(from) };
            const toPos = { ...to, ...positionOf(to) };
            const { start, end } = edgeEndpoints(fromPos, toPos, edge.fromAnchor, edge.toAnchor);
            const active = selectedSet.has(edge.id);
            const dash = strokeDasharray(edge.lineStyle ?? "solid");
            const curved = (edge.pathStyle ?? "straight") === "curved";
            const pathD = curved ? curvedEdgePath(start, end) : undefined;
            const strokeW = ARROW_STROKE_WIDTH;
            return (
              <g
                key={edge.id}
                className={edgePointerClass}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  const cur = selectedIdsRef.current;
                  const mod = event.shiftKey || event.metaKey || event.ctrlKey;
                  if (mod) {
                    onSelect(
                      cur.includes(edge.id)
                        ? cur.filter((id) => id !== edge.id)
                        : [...cur, edge.id],
                    );
                  } else {
                    onSelect([edge.id]);
                  }
                }}
              >
                {curved ? (
                  <>
                    <path d={pathD} fill="none" stroke="transparent" strokeWidth={14} />
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#2dd4bf"
                      strokeWidth={strokeW}
                      strokeDasharray={dash}
                      markerEnd="url(#arrowhead)"
                      opacity={active ? 1 : 0.92}
                    />
                  </>
                ) : (
                  <>
                    <line
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                      stroke="transparent"
                      strokeWidth={14}
                    />
                    <line
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                      stroke="#2dd4bf"
                      strokeWidth={strokeW}
                      strokeDasharray={dash}
                      markerEnd="url(#arrowhead)"
                      opacity={active ? 1 : 0.92}
                    />
                  </>
                )}
                {active ? (
                  <rect
                    x={Math.min(start.x, end.x) - 6}
                    y={Math.min(start.y, end.y) - 6}
                    width={Math.abs(end.x - start.x) + 12}
                    height={Math.abs(end.y - start.y) + 12}
                    fill="none"
                    stroke={SELECTION_RING}
                    strokeWidth={1}
                    strokeDasharray="5 4"
                    pointerEvents="none"
                    opacity={0.85}
                  />
                ) : null}
                {edge.label ? (
                  <text
                    x={(start.x + end.x) / 2}
                    y={(start.y + end.y) / 2 - 8}
                    textAnchor="middle"
                    fill="var(--foreground)"
                    className="text-[11px]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {strokes.map((s) => {
            const pts = strokePointsOf(s);
            const active = selectedSet.has(s.id);
            const dash = strokeDasharray(s.lineStyle ?? "solid");
            const bounds = strokeBounds(pts, Math.max(4, s.width / 2 + 2));
            return (
              <g key={s.id}>
                <path
                  d={strokePath(pts)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(16, s.width + 12)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={edgePointerClass}
                  onPointerDown={(event) => selectStroke(event, s)}
                />
                <path
                  d={strokePath(pts)}
                  fill="none"
                  stroke={active ? SELECTION_RING : s.color}
                  strokeWidth={s.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={dash}
                  className="pointer-events-none"
                />
                {active ? (
                  <rect
                    x={bounds.x}
                    y={bounds.y}
                    width={Math.max(bounds.w, 1)}
                    height={Math.max(bounds.h, 1)}
                    fill="none"
                    stroke={SELECTION_RING}
                    strokeWidth={1.25}
                    strokeDasharray="5 4"
                    pointerEvents="none"
                  />
                ) : null}
              </g>
            );
          })}

          {stroke && stroke.length > 1 ? (
            <path
              d={strokePath(stroke)}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={penWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {pendingEdgeFrom && edgePreview
            ? (() => {
                const fromNode = nodes.find((n) => n.id === pendingEdgeFrom);
                if (!fromNode) return null;
                const fromPos = { ...fromNode, ...positionOf(fromNode) };
                // Start tracks cursor: exit border toward current tip
                const start = borderPoint(fromPos, edgePreview);
                const end = edgePreview;
                const preset = arrowPresetToEdgeProps(arrowLineStyle);
                const dash = strokeDasharray(preset.lineStyle);
                if (preset.pathStyle === "curved") {
                  return (
                    <path
                      d={curvedEdgePath(start, end)}
                      fill="none"
                      stroke="#2dd4bf"
                      strokeWidth={ARROW_PREVIEW_STROKE_WIDTH}
                      strokeDasharray={dash}
                      opacity={0.9}
                      markerEnd="url(#arrowhead)"
                    />
                  );
                }
                return (
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke="#2dd4bf"
                    strokeWidth={ARROW_PREVIEW_STROKE_WIDTH}
                    strokeDasharray={dash}
                    opacity={0.85}
                    markerEnd="url(#arrowhead)"
                  />
                );
              })()
            : null}

          {connectGrip ? (
            <rect
              x={connectGrip.x - (connectGrip.locked ? 3 : 2.5)}
              y={connectGrip.y - (connectGrip.locked ? 3 : 2.5)}
              width={connectGrip.locked ? 6 : 5}
              height={connectGrip.locked ? 6 : 5}
              fill={connectGrip.locked ? "rgba(45, 212, 191, 0.35)" : "transparent"}
              stroke="rgba(255, 255, 255, 0.92)"
              strokeWidth={0.75}
              pointerEvents="none"
            />
          ) : null}

          {marqueeRect && (marqueeRect.w > 0 || marqueeRect.h > 0) ? (
            <rect
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.w}
              height={marqueeRect.h}
              fill="rgba(45, 212, 191, 0.08)"
              stroke={SELECTION_RING}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              pointerEvents="none"
            />
          ) : null}

          {cursorGuide ? (
            <g pointerEvents="none">
              <line
                x1={0}
                y1={cursorGuide.y}
                x2={CANVAS_W}
                y2={cursorGuide.y}
                stroke={CROSSHAIR_GLOW}
                strokeWidth={1.25}
              />
              <line
                x1={cursorGuide.x}
                y1={0}
                x2={cursorGuide.x}
                y2={CANVAS_H}
                stroke={CROSSHAIR_GLOW}
                strokeWidth={1.25}
              />
              <line
                x1={0}
                y1={cursorGuide.y}
                x2={CANVAS_W}
                y2={cursorGuide.y}
                stroke={CROSSHAIR_STROKE}
                strokeWidth={0.5}
              />
              <line
                x1={cursorGuide.x}
                y1={0}
                x2={cursorGuide.x}
                y2={CANVAS_H}
                stroke={CROSSHAIR_STROKE}
                strokeWidth={0.5}
              />
            </g>
          ) : null}

          {snapGuides.map((g, i) => (
            <line
              key={`snap-${i}`}
              x1={g.x1}
              y1={g.y1}
              x2={g.x2}
              y2={g.y2}
              stroke="#2dd4bf"
              strokeWidth={1}
              opacity={0.75}
              pointerEvents="none"
            />
          ))}
        </svg>

        {tool.kind === "arrow" ? (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-md border border-border bg-surface/95 px-3 py-1.5 text-xs text-foreground shadow">
            {pendingEdgeFrom
              ? "이제 다른 노드를 클릭하세요"
              : "노드를 클릭한 뒤, 연결할 노드를 다시 클릭하세요"}
          </div>
        ) : null}

        {nodes.map((node) => {
          const meta = nodeMeta(node.type);
          const Icon = meta.icon;
          const pos = positionOf(node);
          const isSelected = selectedSet.has(node.id);
          const isPendingFrom = pendingEdgeFrom === node.id;
          return (
            <div
              key={node.id}
              data-testid="canvas-node"
              data-node-id={node.id}
              onPointerDown={(event) => startObjectInteraction(event, node)}
              className="absolute z-10 flex flex-col justify-between rounded-md border bg-surface-raised px-3 py-2 shadow-lg transition-shadow"
              style={{
                left: pos.x,
                top: pos.y,
                width: node.w,
                height: node.h,
                borderColor: isSelected || isPendingFrom ? meta.colorVar : "var(--border)",
                boxShadow: isPendingFrom
                  ? `0 0 0 3px ${meta.colorVar}`
                  : isSelected
                    ? `0 0 0 2px ${SELECTION_RING}`
                    : undefined,
                cursor: tool.kind === "select" ? "grab" : cursor,
              }}
            >
              <div className="flex items-center gap-1.5" style={{ color: meta.colorVar }}>
                <Icon className="size-3.5" />
                <span className="mono-tag" style={{ color: meta.colorVar }}>
                  {meta.label}
                </span>
              </div>
              <div className="truncate text-sm font-medium text-foreground">{node.label}</div>
            </div>
          );
        })}

        {stickies.map((note) => {
          const pos = positionOf(note);
          const isSelected = selectedSet.has(note.id);
          return (
            <div
              key={note.id}
              data-testid="canvas-sticky"
              onPointerDown={(event) => startObjectInteraction(event, note)}
              className="absolute z-10 rounded-sm p-3 text-sm leading-snug shadow-lg"
              style={{
                left: pos.x,
                top: pos.y,
                width: STICKY_W,
                minHeight: STICKY_H,
                backgroundColor: "var(--note)",
                color: "var(--note-foreground)",
                transform: "rotate(-1deg)",
                boxShadow: isSelected ? `0 0 0 2px ${SELECTION_RING}` : undefined,
                cursor: tool.kind === "select" ? "grab" : cursor,
              }}
            >
              {note.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
