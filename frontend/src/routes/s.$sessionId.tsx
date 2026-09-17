import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Link2,
  PanelLeft,
  PanelRight,
  Radio,
  WifiOff,
} from "lucide-react";
import { useInterviewSession } from "@/hooks/useInterviewSession";
import { useCanvasHistory } from "@/hooks/useCanvasHistory";
import { CanvasSurface } from "@/components/canvas/CanvasSurface";
import { Inspector } from "@/components/canvas/Inspector";
import { Toolbar } from "@/components/canvas/Toolbar";
import {
  DEFAULT_ARROW_LINE_STYLE,
  DEFAULT_ERASER_SIZE,
  DEFAULT_PEN_WIDTH,
  SELECT_TOOL,
  type ArrowLineStyle,
  type Tool,
} from "@/components/canvas/tools";
import { joinLink } from "@/lib/session-link";
import { clamp } from "@/lib/canvas-geometry";
import { isUsingMockService } from "@/services";
import type {
  EdgeObject,
  NewCanvasObject,
  NodeObject,
  StickyObject,
} from "@/services";

export const Route = createFileRoute("/s/$sessionId")({
  head: () => ({
    meta: [
      { title: "Interview room — Interview Canvas" },
      {
        name: "description",
        content:
          "Shared system design canvas for this interview room. Place components, connect them, annotate and sketch together.",
      },
      { property: "og:title", content: "Interview room — Interview Canvas" },
      {
        property: "og:description",
        content: "Shared system design canvas for this interview room.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SessionPage,
});

const INSPECTOR_WIDTH_KEY = "idc.inspectorWidth";
const INSPECTOR_HEIGHT_KEY = "idc.inspectorHeight";
const LEFT_PANEL_KEY = "idc.showLeftPanel";
const RIGHT_PANEL_KEY = "idc.showRightPanel";
const LEFT_WIDTH_KEY = "idc.leftPanelWidth";
const LEFT_WIDTH_DEFAULT = 176;
const LEFT_WIDTH_MIN = 140;
const LEFT_WIDTH_MAX = 320;
const INSPECTOR_DEFAULT = 256;
const INSPECTOR_MIN = 200;
const INSPECTOR_MAX = 480;
const CANVAS_MIN = 240;
const INSPECTOR_HEIGHT_DEFAULT = 200;
const INSPECTOR_HEIGHT_MIN = 120;
const CANVAS_STACK_MIN = 180;
const PASTE_OFFSET = 24;
const LG_BREAKPOINT = 1024;
/** Zoom for chrome outside the canvas (both sidebars share one scale). */
const CHROME_ZOOM_KEY = "idc.chromeZoom";
const CHROME_ZOOM_MIN = 0.55;
const CHROME_ZOOM_MAX = 1.6;

type ClipboardPayload = {
  nodes: NodeObject[];
  stickies: StickyObject[];
  edges: EdgeObject[];
};

/** True when keystrokes should edit text — empty fields still allow Delete to remove objects. */
function isTypingInField(target: EventTarget | null, key: string) {
  if (!(target instanceof HTMLElement)) return false;
  const raw =
    target.closest("input, textarea, select, [contenteditable='true']") ??
    (target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
      ? target
      : null);
  if (!(raw instanceof HTMLElement)) return false;
  const el = raw;
  if (el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (key === "Backspace" || key === "Delete") {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      if (start !== end) return true;
      if (el.value.length > 0) return true;
      return false;
    }
    return true;
  }
  if (el.isContentEditable) {
    const text = el.textContent ?? "";
    if (key === "Backspace" || key === "Delete") return text.length > 0;
    return true;
  }
  return true;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function readInspectorWidth(): number {
  try {
    const raw = globalThis.localStorage?.getItem(INSPECTOR_WIDTH_KEY);
    if (!raw) return INSPECTOR_DEFAULT;
    const n = Number(raw);
    return Number.isFinite(n) ? clamp(n, INSPECTOR_MIN, INSPECTOR_MAX) : INSPECTOR_DEFAULT;
  } catch {
    return INSPECTOR_DEFAULT;
  }
}

function readInspectorHeight(): number {
  try {
    const raw = globalThis.localStorage?.getItem(INSPECTOR_HEIGHT_KEY);
    if (!raw) return INSPECTOR_HEIGHT_DEFAULT;
    const n = Number(raw);
    return Number.isFinite(n)
      ? clamp(n, INSPECTOR_HEIGHT_MIN, 600)
      : INSPECTOR_HEIGHT_DEFAULT;
  } catch {
    return INSPECTOR_HEIGHT_DEFAULT;
  }
}

function readPanelOpen(key: string, fallback: boolean): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return raw === "1" || raw === "true";
  } catch {
    return fallback;
  }
}

function readChromeZoom(): number {
  try {
    const raw = globalThis.localStorage?.getItem(CHROME_ZOOM_KEY);
    if (!raw) return 1;
    const n = Number(raw);
    return Number.isFinite(n)
      ? clamp(n, CHROME_ZOOM_MIN, CHROME_ZOOM_MAX)
      : 1;
  } catch {
    return 1;
  }
}

function writePanelOpen(key: string, open: boolean) {
  try {
    globalThis.localStorage?.setItem(key, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function readLeftWidth(): number {
  try {
    const raw = globalThis.localStorage?.getItem(LEFT_WIDTH_KEY);
    if (!raw) return LEFT_WIDTH_DEFAULT;
    const n = Number(raw);
    return Number.isFinite(n)
      ? clamp(n, LEFT_WIDTH_MIN, LEFT_WIDTH_MAX)
      : LEFT_WIDTH_DEFAULT;
  } catch {
    return LEFT_WIDTH_DEFAULT;
  }
}

function SessionPage() {
  const { sessionId } = Route.useParams();
  const {
    session,
    me,
    participants,
    objects,
    status,
    notFound,
    join,
    createObject,
    updateObject,
    deleteObject,
    deleteObjects,
    createObjectRemote,
    deleteObjectRemote,
    replaceObjects,
    setRemoteSuppressed,
  } = useInterviewSession(sessionId);

  const [tool, setTool] = useState<Tool>(SELECT_TOOL);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(readInspectorWidth);
  const [inspectorHeight, setInspectorHeight] = useState(readInspectorHeight);
  const [leftPanelWidth, setLeftPanelWidth] = useState(readLeftWidth);
  const [penWidth, setPenWidth] = useState(DEFAULT_PEN_WIDTH);
  const [eraserSize, setEraserSize] = useState(DEFAULT_ERASER_SIZE);
  const [arrowLineStyle, setArrowLineStyle] = useState<ArrowLineStyle>(
    DEFAULT_ARROW_LINE_STYLE,
  );
  const [showLeftPanel, setShowLeftPanel] = useState(() =>
    readPanelOpen(LEFT_PANEL_KEY, true),
  );
  const [showRightPanel, setShowRightPanel] = useState(() =>
    readPanelOpen(RIGHT_PANEL_KEY, true),
  );
  const [chromeZoom, setChromeZoom] = useState(readChromeZoom);
  const [isLg, setIsLg] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= LG_BREAKPOINT,
  );

  const clipboardRef = useRef<ClipboardPayload | null>(null);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const rowRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const splittingRef = useRef(false);

  // Ctrl/Cmd+wheel outside the canvas zooms chrome (sidebars) only.
  // Over the canvas host/paper, CanvasSurface owns zoom — chrome stays put.
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const target = event.target;
      if (!(target instanceof Element)) {
        event.preventDefault();
        return;
      }
      // Canvas zone: surface handler zooms paper; host chrome only blocks page zoom.
      if (target.closest("[data-canvas-host]")) {
        if (!target.closest('[data-testid="canvas-surface"]')) {
          event.preventDefault();
        }
        return;
      }
      event.preventDefault();
      // Header stays fixed.
      if (target.closest("header")) return;
      const step = event.deltaY > 0 ? -0.08 : 0.08;
      setChromeZoom((z) => {
        const next =
          Math.round(
            Math.min(CHROME_ZOOM_MAX, Math.max(CHROME_ZOOM_MIN, z + step)) * 100,
          ) / 100;
        try {
          globalThis.localStorage?.setItem(CHROME_ZOOM_KEY, String(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, true);
  }, []);

  const mutators = useMemo(
    () => ({
      createObject,
      updateObject,
      deleteObject,
      replaceObjects,
      createObjectRemote,
      deleteObjectRemote,
      setRemoteSuppressed,
    }),
    [
      createObject,
      createObjectRemote,
      deleteObject,
      deleteObjectRemote,
      replaceObjects,
      setRemoteSuppressed,
      updateObject,
    ],
  );
  const { pushSnapshot, undo, redo, canUndo, canRedo } = useCanvasHistory(
    objects,
    mutators,
  );

  const selected = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    const id = selectedIds[0];
    return objects.find((o) => o.id === id) ?? null;
  }, [objects, selectedIds]);

  // Drop stale selection when objects disappear.
  useEffect(() => {
    const alive = new Set(objects.map((o) => o.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => alive.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [objects]);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const onChange = () => setIsLg(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const trackedCreate = useCallback(
    async (object: NewCanvasObject) => {
      pushSnapshot();
      return createObject(object);
    },
    [createObject, pushSnapshot],
  );

  const deleteSelected = useCallback(async () => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    pushSnapshot();
    setSelectedIds([]);
    await deleteObjects(ids);
  }, [deleteObjects, pushSnapshot]);

  const buildClipboard = useCallback((): ClipboardPayload | null => {
    const ids = new Set(selectedIdsRef.current);
    if (ids.size === 0) return null;
    const current = objectsRef.current;
    const nodes = current.filter(
      (o): o is NodeObject => o.kind === "node" && ids.has(o.id),
    );
    const stickies = current.filter(
      (o): o is StickyObject => o.kind === "sticky" && ids.has(o.id),
    );
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = current.filter(
      (o): o is EdgeObject =>
        o.kind === "edge" && nodeIds.has(o.from) && nodeIds.has(o.to),
    );
    if (nodes.length === 0 && stickies.length === 0) return null;
    return {
      nodes: structuredClone(nodes),
      stickies: structuredClone(stickies),
      edges: structuredClone(edges),
    };
  }, []);

  const copySelection = useCallback(() => {
    const payload = buildClipboard();
    if (!payload) return;
    clipboardRef.current = payload;
  }, [buildClipboard]);

  const cutSelection = useCallback(async () => {
    const payload = buildClipboard();
    if (!payload) return;
    clipboardRef.current = payload;
    await deleteSelected();
  }, [buildClipboard, deleteSelected]);

  const pasteClipboard = useCallback(async () => {
    const payload = clipboardRef.current;
    if (!payload || !me) return;
    pushSnapshot();
    const idMap = new Map<string, string>();
    const createdIds: string[] = [];

    for (const node of payload.nodes) {
      const created = await createObject({
        kind: "node",
        type: node.type,
        x: node.x + PASTE_OFFSET,
        y: node.y + PASTE_OFFSET,
        w: node.w,
        h: node.h,
        label: node.label,
        createdBy: me.id,
      });
      idMap.set(node.id, created.id);
      createdIds.push(created.id);
    }
    for (const note of payload.stickies) {
      const created = await createObject({
        kind: "sticky",
        x: note.x + PASTE_OFFSET,
        y: note.y + PASTE_OFFSET,
        text: note.text,
        createdBy: me.id,
      });
      idMap.set(note.id, created.id);
      createdIds.push(created.id);
    }
    for (const edge of payload.edges) {
      const from = idMap.get(edge.from);
      const to = idMap.get(edge.to);
      if (!from || !to) continue;
      const created = await createObject({
        kind: "edge",
        from,
        to,
        label: edge.label,
        createdBy: me.id,
        ...(edge.lineStyle ? { lineStyle: edge.lineStyle } : { lineStyle: "solid" as const }),
      });
      createdIds.push(created.id);
    }

    // Nudge clipboard so repeated pastes keep offsetting.
    clipboardRef.current = {
      nodes: payload.nodes.map((n) => ({
        ...n,
        x: n.x + PASTE_OFFSET,
        y: n.y + PASTE_OFFSET,
      })),
      stickies: payload.stickies.map((n) => ({
        ...n,
        x: n.x + PASTE_OFFSET,
        y: n.y + PASTE_OFFSET,
      })),
      edges: payload.edges,
    };

    setSelectedIds(createdIds);
  }, [createObject, me, pushSnapshot]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;

      if ((event.key === "Delete" || event.key === "Backspace") && selectedIdsRef.current.length) {
        if (isTypingInField(event.target, event.key)) return;
        event.preventDefault();
        void deleteSelected();
        return;
      }
      if (isEditableTarget(event.target)) return;
      if (event.key === "Escape") {
        setTool(SELECT_TOOL);
        return;
      }
      if (mod && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedIds(objectsRef.current.map((o) => o.id));
        return;
      }
      if (mod && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelection();
        return;
      }
      if (mod && event.key.toLowerCase() === "x") {
        event.preventDefault();
        void cutSelection();
        return;
      }
      if (mod && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void pasteClipboard();
        return;
      }
      if (mod && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        void undo();
        return;
      }
      if (
        mod &&
        ((event.key.toLowerCase() === "z" && event.shiftKey) || event.key.toLowerCase() === "y")
      ) {
        event.preventDefault();
        void redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copySelection, cutSelection, deleteSelected, pasteClipboard, redo, undo]);

  const onSplitterPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isLg) return;
    event.preventDefault();
    splittingRef.current = true;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const onMove = (ev: PointerEvent) => {
      if (!splittingRef.current || !splitRef.current) return;
      const splitRect = splitRef.current.getBoundingClientRect();
      // Inspector is on the right; width = split right - pointer x.
      const raw = splitRect.right - ev.clientX;
      const maxByRow = Math.max(INSPECTOR_MIN, splitRect.width * 0.5);
      const maxAllowed = Math.min(INSPECTOR_MAX, maxByRow, splitRect.width - CANVAS_MIN);
      const next = clamp(raw, INSPECTOR_MIN, Math.max(INSPECTOR_MIN, maxAllowed));
      setInspectorWidth(next);
    };
    const onUp = (ev: PointerEvent) => {
      splittingRef.current = false;
      handle.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setInspectorWidth((w) => {
        try {
          globalThis.localStorage?.setItem(INSPECTOR_WIDTH_KEY, String(w));
        } catch {
          /* ignore */
        }
        return w;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onHorizontalSplitterPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (isLg) return;
    event.preventDefault();
    splittingRef.current = true;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const onMove = (ev: PointerEvent) => {
      if (!splittingRef.current || !splitRef.current) return;
      const splitRect = splitRef.current.getBoundingClientRect();
      // Inspector is below; height = split bottom - pointer y.
      const raw = splitRect.bottom - ev.clientY;
      const maxByViewport = Math.floor(window.innerHeight * 0.6);
      const maxAllowed = Math.max(
        INSPECTOR_HEIGHT_MIN,
        Math.min(maxByViewport, splitRect.height - CANVAS_STACK_MIN),
      );
      const next = clamp(raw, INSPECTOR_HEIGHT_MIN, maxAllowed);
      setInspectorHeight(next);
    };
    const onUp = (ev: PointerEvent) => {
      splittingRef.current = false;
      handle.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setInspectorHeight((h) => {
        try {
          globalThis.localStorage?.setItem(INSPECTOR_HEIGHT_KEY, String(h));
        } catch {
          /* ignore */
        }
        return h;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (notFound) {
    const mockMode = isUsingMockService();
    return (
      <main className="flex min-h-screen items-center justify-center grid-paper px-5">
        <div className="panel max-w-md p-6 text-center">
          <h1 className="text-xl font-semibold">This room isn&apos;t here</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mockMode
              ? "Demo mode stores rooms only in this browser's localStorage. If the host created the room in another browser (or a private window), this tab cannot see it. Open the join link in another tab of the same browser where the room was created."
              : "The link may be wrong, or the room was never created / already expired."}
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Start a new room
          </Link>
        </div>
      </main>
    );
  }

  if (status === "connecting" && !session) {
    return (
      <main className="flex min-h-screen items-center justify-center grid-paper">
        <p className="mono-tag">Connecting to room…</p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center grid-paper px-5">
        <form
          className="panel w-full max-w-sm p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!nameInput.trim()) return;
            setJoining(true);
            try {
              await join(nameInput);
            } finally {
              setJoining(false);
            }
          }}
        >
          <span className="mono-tag">Join room {session?.joinCode}</span>
          <h1 className="mt-2 text-2xl font-semibold">What should we call you?</h1>
          <input
            autoFocus
            data-testid="join-display-name"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="Display name"
            className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          />
          <button
            type="submit"
            data-testid="enter-canvas"
            disabled={joining || !nameInput.trim()}
            className="mt-4 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {joining ? "Joining…" : "Enter canvas"}
          </button>
          <p className="mt-3 text-xs text-muted-foreground">
            {participants.length} already in the room.
          </p>
        </form>
      </main>
    );
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinLink(sessionId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const onLeftSplitterPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isLg || !showLeftPanel) return;
    event.preventDefault();
    splittingRef.current = true;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const onMove = (ev: PointerEvent) => {
      if (!splittingRef.current || !rowRef.current) return;
      const rowRect = rowRef.current.getBoundingClientRect();
      const raw = ev.clientX - rowRect.left - 8; // padding
      const next = clamp(raw, LEFT_WIDTH_MIN, LEFT_WIDTH_MAX);
      setLeftPanelWidth(next);
    };
    const onUp = (ev: PointerEvent) => {
      splittingRef.current = false;
      handle.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setLeftPanelWidth((w) => {
        try {
          globalThis.localStorage?.setItem(LEFT_WIDTH_KEY, String(w));
        } catch {
          /* ignore */
        }
        return w;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const toggleLeftPanel = () => {
    setShowLeftPanel((open) => {
      const next = !open;
      writePanelOpen(LEFT_PANEL_KEY, next);
      return next;
    });
  };

  const toggleRightPanel = () => {
    setShowRightPanel((open) => {
      const next = !open;
      writePanelOpen(RIGHT_PANEL_KEY, next);
      return next;
    });
  };

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-start gap-3 border-b border-border bg-surface px-3 py-2">
        <div className="flex flex-col items-start gap-1.5 pt-0.5">
          <Link to="/" className="font-display text-sm font-semibold leading-none">
            Interview<span className="text-primary">Canvas</span>
          </Link>
          <button
            type="button"
            title="Toggle tools panel"
            aria-label="Toggle tools panel"
            aria-pressed={showLeftPanel}
            onClick={toggleLeftPanel}
            className="rounded-sm border-0 bg-transparent p-1 text-muted-foreground transition-[color,filter] duration-150 hover:text-[var(--signal)] hover:drop-shadow-[0_0_8px_rgba(45,212,191,0.95)] focus-visible:outline-none"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 pt-0.5">
          <span className="mono-tag">room {session?.joinCode}</span>
          <button
            type="button"
            data-testid="copy-join-link"
            onClick={copyLink}
            className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
            {copied ? "Link copied" : "Copy join link"}
          </button>
          <span
            data-testid="join-link"
            className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"
          >
            <Link2 className="size-3.5" />
            {joinLink(sessionId)}
          </span>
          {isUsingMockService() ? (
            <span className="w-full text-[11px] leading-snug text-muted-foreground sm:w-auto">
              Demo: paste in another tab of this browser. Other browsers won&apos;t see the room yet.
            </span>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-1.5 pt-0.5">
          <span className="flex items-center gap-1.5 text-xs">
            {status === "live" ? (
              <>
                <Radio className="size-3.5 text-primary" />
                <span className="text-muted-foreground">Live · {participants.length}</span>
              </>
            ) : (
              <>
                <WifiOff className="size-3.5 text-destructive" />
                <span className="text-destructive">Reconnecting…</span>
              </>
            )}
          </span>
          <button
            type="button"
            title="Toggle inspector panel"
            aria-label="Toggle inspector panel"
            aria-pressed={showRightPanel}
            onClick={toggleRightPanel}
            className="rounded-sm border-0 bg-transparent p-1 text-muted-foreground transition-[color,filter] duration-150 hover:text-[var(--signal)] hover:drop-shadow-[0_0_8px_rgba(45,212,191,0.95)] focus-visible:outline-none"
          >
            <PanelRight className="size-4" />
          </button>
        </div>
      </header>

      <div
        ref={rowRef}
        data-testid="workspace"
        className="relative flex min-h-0 flex-1 flex-col gap-0 p-2 lg:flex-row lg:gap-0"
      >
        {showLeftPanel ? (
          <div
            className="relative shrink-0"
            data-chrome="tools"
            style={
              isLg
                ? { width: leftPanelWidth, zoom: chromeZoom }
                : { zoom: chromeZoom }
            }
          >
            <Toolbar
              tool={tool}
              onChange={setTool}
              penWidth={penWidth}
              onPenWidthChange={setPenWidth}
              eraserSize={eraserSize}
              onEraserSizeChange={setEraserSize}
              arrowLineStyle={arrowLineStyle}
              onArrowLineStyleChange={setArrowLineStyle}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={() => void undo()}
              onRedo={() => void redo()}
              widthPx={isLg ? leftPanelWidth : undefined}
            />
            {isLg ? (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize tools panel"
                onPointerDown={onLeftSplitterPointerDown}
                className="absolute inset-y-0 -right-1 z-30 hidden w-1.5 cursor-col-resize rounded-full bg-border/60 transition-colors hover:bg-primary/50 active:bg-primary lg:block"
              />
            ) : null}
          </div>
        ) : null}
        <div
          ref={splitRef}
          className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row"
        >
          <div
            className="panel min-h-0 min-w-0 flex-1 overflow-hidden"
            data-canvas-host=""
            style={!isLg && showRightPanel ? { minHeight: CANVAS_STACK_MIN } : undefined}
          >
            <CanvasSurface
              objects={objects}
              tool={tool}
              onToolUsed={() => setTool(SELECT_TOOL)}
              selectedIds={selectedIds}
              onSelect={setSelectedIds}
              onCreate={async (object) => {
                try {
                  return await trackedCreate(object);
                } catch (err) {
                  console.error("canvas create failed", object, err);
                  window.alert(
                    `Could not create ${object.kind}. Is the API running at http://127.0.0.1:8000?`,
                  );
                  return undefined;
                }
              }}
              onUpdate={(id, patch) => void updateObject(id, patch)}
              onDelete={(id) => {
                void deleteObject(id);
                setSelectedIds((prev) => prev.filter((x) => x !== id));
              }}
              onBeforeMoveCommit={pushSnapshot}
              onBeforeEraseCommit={pushSnapshot}
              participantId={me.id}
              penWidth={penWidth}
              eraserSize={eraserSize}
              arrowLineStyle={arrowLineStyle}
            />
          </div>

          {showRightPanel ? (
            <>
              {!isLg ? (
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize inspector"
                  onPointerDown={onHorizontalSplitterPointerDown}
                  className="my-1 h-1.5 w-full shrink-0 cursor-row-resize rounded-full bg-border/60 transition-colors hover:bg-primary/50 active:bg-primary lg:hidden"
                />
              ) : null}

              <div
                className="relative shrink-0"
                data-chrome="inspector"
                style={
                  isLg
                    ? { width: inspectorWidth, zoom: chromeZoom }
                    : { zoom: chromeZoom }
                }
              >
                {isLg ? (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize inspector"
                    onPointerDown={onSplitterPointerDown}
                    className="absolute inset-y-0 -left-1 z-30 hidden w-1.5 cursor-col-resize rounded-full bg-border/60 transition-colors hover:bg-primary/50 active:bg-primary lg:block"
                  />
                ) : null}
                <Inspector
                  selected={selected}
                  selectedCount={selectedIds.length}
                  participants={participants}
                  meId={me?.id}
                  widthPx={isLg ? inspectorWidth : undefined}
                  heightPx={!isLg ? inspectorHeight : undefined}
                  onUpdate={(id, patch) => void updateObject(id, patch)}
                  onDelete={(id) => {
                    pushSnapshot();
                    const ids =
                      selectedIds.includes(id) && selectedIds.length > 0
                        ? selectedIds
                        : [id];
                    void deleteObjects(ids);
                    setSelectedIds([]);
                  }}
                  onDeleteAll={() => void deleteSelected()}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
