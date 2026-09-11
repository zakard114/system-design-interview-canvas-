import { useCallback, useRef, useState } from "react";
import type {
  CanvasObject,
  EdgeObject,
  NewCanvasObject,
  NodeObject,
  StickyObject,
  StrokeObject,
} from "@/services";
import { CANVAS_H, CANVAS_W, NODE_H, NODE_W, nodeMeta } from "./node-meta";
import type { Tool } from "./tools";
import { clamp, edgeSegment, simplifyStroke, strokePath } from "@/lib/canvas-geometry";

interface Props {
  objects: CanvasObject[];
  tool: Tool;
  onToolUsed: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (object: NewCanvasObject) => void;
  onUpdate: (id: string, patch: Partial<CanvasObject>) => void;
  participantId: string;
}

type DragState = { id: string; dx: number; dy: number; x: number; y: number } | null;

export function CanvasSurface({
  objects,
  tool,
  onToolUsed,
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  participantId,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [stroke, setStroke] = useState<Array<[number, number]> | null>(null);
  const [pendingEdgeFrom, setPendingEdgeFrom] = useState<string | null>(null);

  const nodes = objects.filter((o): o is NodeObject => o.kind === "node");
  const edges = objects.filter((o): o is EdgeObject => o.kind === "edge");
  const stickies = objects.filter((o): o is StickyObject => o.kind === "sticky");
  const strokes = objects.filter((o): o is StrokeObject => o.kind === "stroke");

  const pointFrom = useCallback((event: React.PointerEvent) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const positionOf = (object: NodeObject | StickyObject) =>
    drag && drag.id === object.id ? { x: drag.x, y: drag.y } : { x: object.x, y: object.y };

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
        x: clamp(x - 80, 0, CANVAS_W - 160),
        y: clamp(y - 40, 0, CANVAS_H - 120),
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
    setPendingEdgeFrom(null);
    onSelect(null);
  };

  const handleMove = (event: React.PointerEvent) => {
    if (stroke) {
      const { x, y } = pointFrom(event);
      setStroke((prev) => (prev ? [...prev, [x, y]] : prev));
      return;
    }
    if (drag) {
      const { x, y } = pointFrom(event);
      setDrag({ ...drag, x: x - drag.dx, y: y - drag.dy });
    }
  };

  const handleUp = () => {
    if (stroke) {
      const points = simplifyStroke(stroke);
      if (points.length > 1) {
        onCreate({
          kind: "stroke",
          points,
          color: "var(--ink)",
          width: 2.5,
          createdBy: participantId,
        });
      }
      setStroke(null);
      return;
    }
    if (drag) {
      onUpdate(drag.id, { x: Math.round(drag.x), y: Math.round(drag.y) });
      setDrag(null);
    }
  };

  const startObjectInteraction = (
    event: React.PointerEvent,
    object: NodeObject | StickyObject,
  ) => {
    if (tool.kind === "pen") return; // let the surface draw over objects
    event.stopPropagation();

    if (tool.kind === "arrow") {
      if (object.kind !== "node") return;
      if (!pendingEdgeFrom) {
        setPendingEdgeFrom(object.id);
        onSelect(object.id);
        return;
      }
      if (pendingEdgeFrom !== object.id) {
        onCreate({
          kind: "edge",
          from: pendingEdgeFrom,
          to: object.id,
          label: "",
          createdBy: participantId,
        });
      }
      setPendingEdgeFrom(null);
      onToolUsed();
      return;
    }

    onSelect(object.id);
    const { x, y } = pointFrom(event);
    setDrag({ id: object.id, dx: x - object.x, dy: y - object.y, x: object.x, y: object.y });
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  };

  const cursor =
    tool.kind === "pen"
      ? "crosshair"
      : tool.kind === "select"
        ? "default"
        : tool.kind === "arrow"
          ? "cell"
          : "copy";

  return (
    <div className="h-full w-full overflow-auto bg-background">
      <div
        ref={surfaceRef}
        onPointerDown={handleSurfaceDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        className="relative grid-paper touch-none select-none"
        style={{ width: CANVAS_W, height: CANVAS_H, cursor }}
        data-testid="canvas-surface"
      >
        <svg className="absolute inset-0" width={CANVAS_W} height={CANVAS_H}>
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="8"
              refX="9"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L10,4 L0,8 z" fill="var(--signal)" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const from = nodes.find((n) => n.id === edge.from);
            const to = nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;
            const fromPos = { ...from, ...positionOf(from) };
            const toPos = { ...to, ...positionOf(to) };
            const { start, end } = edgeSegment(fromPos, toPos);
            const active = selectedId === edge.id;
            return (
              <g
                key={edge.id}
                className="pointer-events-auto cursor-pointer"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelect(edge.id);
                }}
              >
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="transparent"
                  strokeWidth={16}
                />
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="var(--signal)"
                  strokeWidth={active ? 3 : 1.75}
                  markerEnd="url(#arrowhead)"
                  opacity={active ? 1 : 0.75}
                />
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

          {strokes.map((s) => (
            <path
              key={s.id}
              d={strokePath(s.points)}
              fill="none"
              stroke={selectedId === s.id ? "var(--signal)" : s.color}
              strokeWidth={s.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-auto cursor-pointer"
              onPointerDown={(event) => {
                if (tool.kind === "pen") return;
                event.stopPropagation();
                onSelect(s.id);
              }}
            />
          ))}

          {stroke && stroke.length > 1 ? (
            <path
              d={strokePath(stroke)}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          ) : null}
        </svg>

        {nodes.map((node) => {
          const meta = nodeMeta(node.type);
          const Icon = meta.icon;
          const pos = positionOf(node);
          const isSelected = selectedId === node.id;
          const isPendingFrom = pendingEdgeFrom === node.id;
          return (
            <div
              key={node.id}
              data-testid="canvas-node"
              onPointerDown={(event) => startObjectInteraction(event, node)}
              className="absolute flex flex-col justify-between rounded-md border bg-surface-raised px-3 py-2 shadow-lg transition-shadow"
              style={{
                left: pos.x,
                top: pos.y,
                width: node.w,
                height: node.h,
                borderColor: isSelected || isPendingFrom ? meta.colorVar : "var(--border)",
                boxShadow: isSelected ? `0 0 0 2px ${meta.colorVar}` : undefined,
                cursor: tool.kind === "select" ? "grab" : cursor,
              }}
            >
              <div className="flex items-center gap-1.5" style={{ color: meta.colorVar }}>
                <Icon className="size-3.5" />
                <span className="mono-tag" style={{ color: meta.colorVar }}>
                  {meta.label}
                </span>
              </div>
              <div className="truncate text-sm font-medium text-foreground">
                {node.label}
              </div>
            </div>
          );
        })}

        {stickies.map((note) => {
          const pos = positionOf(note);
          const isSelected = selectedId === note.id;
          return (
            <div
              key={note.id}
              data-testid="canvas-sticky"
              onPointerDown={(event) => startObjectInteraction(event, note)}
              className="absolute rounded-sm p-3 text-sm leading-snug shadow-lg"
              style={{
                left: pos.x,
                top: pos.y,
                width: 160,
                minHeight: 96,
                backgroundColor: "var(--note)",
                color: "var(--note-foreground)",
                transform: "rotate(-1deg)",
                boxShadow: isSelected ? "0 0 0 2px var(--signal)" : undefined,
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
