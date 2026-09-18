import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Eraser,
  MousePointer2,
  PenLine,
  Redo2,
  StickyNote,
  Undo2,
} from "lucide-react";
import { NODE_TYPES } from "./node-meta";
import {
  ARROW_LINE_STYLES,
  DEFAULT_ARROW_LINE_STYLE,
  ERASER_SIZES,
  PEN_WIDTHS,
  type ArrowLineStyle,
  type Tool,
} from "./tools";

interface Props {
  tool: Tool;
  onChange: (tool: Tool) => void;
  penWidth: number;
  onPenWidthChange: (width: number) => void;
  eraserSize: number;
  onEraserSizeChange: (size: number) => void;
  arrowLineStyle: ArrowLineStyle;
  onArrowLineStyleChange: (style: ArrowLineStyle) => void;
  canUndo?: boolean | undefined;
  canRedo?: boolean | undefined;
  onUndo?: (() => void) | undefined;
  onRedo?: (() => void) | undefined;
  /** Docked width in px (lg+). */
  widthPx?: number | undefined;
}

function ToolButton({
  active,
  label,
  color,
  onClick,
  disabled,
  children,
}: {
  active?: boolean;
  label: string;
  color?: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className="flex w-auto shrink-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40 lg:w-full"
      style={{
        borderColor: active ? "var(--signal)" : "var(--border)",
        backgroundColor: active ? "var(--accent)" : "transparent",
        color: active ? (color ?? "var(--signal)") : "var(--foreground)",
      }}
    >
      {children}
    </button>
  );
}

function useAnchorRect(open: boolean, anchor: HTMLElement | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor) {
      setRect(null);
      return;
    }
    const update = () => setRect(anchor.getBoundingClientRect());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchor]);
  return rect;
}

function FixedFlyout({
  open,
  anchor,
  label,
  children,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  label: string;
  children: React.ReactNode;
}) {
  const rect = useAnchorRect(open, anchor);
  if (!open || !rect || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="group"
      aria-label={label}
      className="flex min-w-[3.5rem] flex-col gap-1 rounded-md border border-border bg-surface p-1.5 shadow-xl"
      style={{
        position: "fixed",
        left: rect.right + 8,
        top: rect.top,
        zIndex: 80,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function PenWidthFlyout({
  open,
  anchor,
  value,
  onChange,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <FixedFlyout open={open} anchor={anchor} label="Stroke width">
      {PEN_WIDTHS.map((n) => {
        const active = n === value;
        return (
          <button
            key={n}
            type="button"
            title={`${n}px`}
            aria-label={`Stroke width ${n}px`}
            aria-pressed={active}
            onClick={(event) => {
              event.stopPropagation();
              onChange(n);
            }}
            className="flex h-8 w-full items-center justify-center rounded-md px-2 transition-colors hover:bg-accent"
            style={{
              backgroundColor: active ? "var(--accent)" : "transparent",
              boxShadow: active ? "inset 0 0 0 1px var(--signal)" : undefined,
            }}
          >
            <span
              className="block w-10 rounded-full bg-foreground"
              style={{ height: Math.min(n, 12), opacity: 0.9 }}
            />
          </button>
        );
      })}
    </FixedFlyout>
  );
}

function EraserSizeFlyout({
  open,
  anchor,
  value,
  onChange,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <FixedFlyout open={open} anchor={anchor} label="Eraser size">
      {ERASER_SIZES.map((n) => {
        const active = n === value;
        const box = Math.min(22, Math.max(8, Math.round(n * 0.65)));
        return (
          <button
            key={n}
            type="button"
            title={`${n}px`}
            aria-label={`Eraser size ${n}px`}
            aria-pressed={active}
            onClick={(event) => {
              event.stopPropagation();
              onChange(n);
            }}
            className="flex h-9 w-full items-center justify-center rounded-md transition-colors hover:bg-accent"
            style={{
              backgroundColor: active ? "var(--accent)" : "transparent",
              boxShadow: active ? "inset 0 0 0 1px var(--signal)" : undefined,
            }}
          >
            <span
              className="rounded-[2px] border border-foreground/80 bg-foreground/15"
              style={{ width: box, height: box }}
            />
          </button>
        );
      })}
    </FixedFlyout>
  );
}

function ArrowStyleFlyout({
  open,
  anchor,
  value,
  onChange,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  value: ArrowLineStyle;
  onChange: (style: ArrowLineStyle) => void;
}) {
  const labels: Record<ArrowLineStyle, string> = {
    solid: "Solid",
    dashed: "Dashed",
    dotted: "Dotted",
    curved: "Curved",
  };
  return (
    <FixedFlyout open={open} anchor={anchor} label="Arrow line style">
      {ARROW_LINE_STYLES.map((style) => {
        const active = style === value;
        return (
          <button
            key={style}
            type="button"
            title={labels[style]}
            aria-label={labels[style]}
            aria-pressed={active}
            onClick={(event) => {
              event.stopPropagation();
              onChange(style);
            }}
            className="flex h-8 w-full items-center justify-center rounded-md px-2 transition-colors hover:bg-accent"
            style={{
              backgroundColor: active ? "var(--accent)" : "transparent",
              boxShadow: active ? "inset 0 0 0 1px var(--signal)" : undefined,
            }}
          >
            <svg width="40" height="12" aria-hidden>
              {style === "curved" ? (
                <path d="M2 10 Q20 0 38 10" fill="none" stroke="currentColor" strokeWidth="2" />
              ) : (
                <line
                  x1="2"
                  y1="6"
                  x2="38"
                  y2="6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={
                    style === "dashed" ? "6 4" : style === "dotted" ? "2 3" : undefined
                  }
                />
              )}
            </svg>
          </button>
        );
      })}
    </FixedFlyout>
  );
}

export function Toolbar({
  tool,
  onChange,
  penWidth,
  onPenWidthChange,
  eraserSize,
  onEraserSizeChange,
  arrowLineStyle = DEFAULT_ARROW_LINE_STYLE,
  onArrowLineStyleChange = () => {},
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  widthPx,
}: Props) {
  const [penAnchor, setPenAnchor] = useState<HTMLDivElement | null>(null);
  const [eraserAnchor, setEraserAnchor] = useState<HTMLDivElement | null>(null);
  const [arrowAnchor, setArrowAnchor] = useState<HTMLDivElement | null>(null);

  return (
    <div
      className="panel flex h-auto max-h-full flex-col gap-1.5 overflow-visible p-2 lg:h-full"
      style={{
        width: widthPx ? `${widthPx}px` : undefined,
        minWidth: widthPx ? `${widthPx}px` : undefined,
      }}
      data-testid="tools-panel"
    >
      <span className="mono-tag hidden lg:block lg:px-1 lg:pb-1">Tools</span>
      <div className="flex gap-1.5 overflow-x-auto lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
        <ToolButton
          active={tool.kind === "select"}
          label="Select and move"
          onClick={() => onChange({ kind: "select" })}
        >
          <MousePointer2 className="size-4" />
          <span className="hidden lg:inline">Select</span>
        </ToolButton>

        <div ref={setArrowAnchor} className="relative w-auto shrink-0 lg:w-full">
          <ToolButton
            active={tool.kind === "arrow"}
            label="Connect with arrow"
            onClick={() => onChange({ kind: "arrow" })}
          >
            <ArrowUpRight className="size-4" />
            <span className="hidden lg:inline">Arrow</span>
          </ToolButton>
          <ArrowStyleFlyout
            open={tool.kind === "arrow"}
            anchor={arrowAnchor}
            value={arrowLineStyle}
            onChange={onArrowLineStyleChange}
          />
        </div>

        <ToolButton
          active={tool.kind === "sticky"}
          label="Sticky note"
          color="var(--note)"
          onClick={() => onChange({ kind: "sticky" })}
        >
          <StickyNote className="size-4" />
          <span className="hidden lg:inline">Note</span>
        </ToolButton>

        <div ref={setPenAnchor} className="relative w-auto shrink-0 lg:w-full">
          <ToolButton
            active={tool.kind === "pen"}
            label="Freehand pen"
            onClick={() => onChange({ kind: "pen" })}
          >
            <PenLine className="size-4" />
            <span className="hidden lg:inline">Pen</span>
          </ToolButton>
          <PenWidthFlyout
            open={tool.kind === "pen"}
            anchor={penAnchor}
            value={penWidth}
            onChange={onPenWidthChange}
          />
        </div>

        <div ref={setEraserAnchor} className="relative w-auto shrink-0 lg:w-full">
          <ToolButton
            active={tool.kind === "eraser"}
            label="Eraser"
            onClick={() => onChange({ kind: "eraser" })}
          >
            <Eraser className="size-4" />
            <span className="hidden lg:inline">Eraser</span>
          </ToolButton>
          <EraserSizeFlyout
            open={tool.kind === "eraser"}
            anchor={eraserAnchor}
            value={eraserSize}
            onChange={onEraserSizeChange}
          />
        </div>

        <span className="mono-tag hidden lg:block lg:px-1 lg:pb-1 lg:pt-3">History</span>
        <div className="flex w-auto gap-1.5 lg:w-full lg:flex-col">
          <ToolButton label="Undo" onClick={() => onUndo?.()} disabled={!canUndo}>
            <Undo2 className="size-4" />
            <span className="hidden lg:inline">Undo</span>
          </ToolButton>
          <ToolButton label="Redo" onClick={() => onRedo?.()} disabled={!canRedo}>
            <Redo2 className="size-4" />
            <span className="hidden lg:inline">Redo</span>
          </ToolButton>
        </div>

        <span className="mono-tag hidden lg:block lg:px-1 lg:pb-1 lg:pt-3">Components</span>
        {NODE_TYPES.map((meta) => {
          const Icon = meta.icon;
          return (
            <ToolButton
              key={meta.type}
              active={tool.kind === "node" && tool.type === meta.type}
              label={meta.label}
              color={meta.colorVar}
              onClick={() => onChange({ kind: "node", type: meta.type })}
            >
              <Icon className="size-4" />
              <span className="hidden lg:inline">{meta.label}</span>
            </ToolButton>
          );
        })}
      </div>
    </div>
  );
}
