import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { CanvasObject, Participant } from "@/services";
import { nodeMeta } from "./node-meta";

interface Props {
  selected: CanvasObject | null;
  selectedCount: number;
  participants: Participant[];
  /** Current tab's participant id — used to mark "(you)" in the room list. */
  meId?: string;
  onUpdate: (id: string, patch: Partial<CanvasObject>) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  /** Optional fixed width (px) for lg+ layout; full width when stacked. */
  widthPx?: number | undefined;
  /** Optional fixed height (px) for stacked (narrow) layout. */
  heightPx?: number | undefined;
}

/** Keep caret stable while PATCH/WS echoes rewrite `selected` under us. */
function useFocusedDraft(synced: string, objectId: string) {
  const [draft, setDraft] = useState(synced);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(synced);
  }, [objectId, synced]);

  return {
    value: draft,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      setDraft(synced);
    },
    onChange: (next: string) => setDraft(next),
  };
}

export function Inspector({
  selected,
  selectedCount,
  participants,
  meId,
  onUpdate,
  onDelete,
  onDeleteAll,
  widthPx,
  heightPx,
}: Props) {
  return (
    <div
      className="panel flex w-full flex-col gap-4 overflow-y-auto p-3 lg:w-auto lg:shrink-0"
      style={{
        ...(widthPx != null ? { width: widthPx } : {}),
        ...(heightPx != null ? { height: heightPx, flexShrink: 0 } : {}),
      }}
      data-testid="inspector-panel"
    >
      <div>
        <span className="mono-tag">Selection</span>
        {selectedCount > 1 ? (
          <div className="mt-2 space-y-3">
            <p className="text-sm font-medium text-foreground">{selectedCount} selected</p>
            <button
              type="button"
              onClick={onDeleteAll}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-destructive/50 px-2 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" /> Delete all
            </button>
          </div>
        ) : !selected ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Pick a tool, click the board to place things. Select an object to rename or delete it.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-sm font-medium text-foreground">
              {selected.kind === "node"
                ? nodeMeta(selected.type).label
                : selected.kind === "edge"
                  ? "Arrow"
                  : selected.kind === "sticky"
                    ? "Sticky note"
                    : "Sketch"}
            </p>

            {selected.kind === "node" ? (
              <LabelField objectId={selected.id} label={selected.label} onUpdate={onUpdate} />
            ) : null}

            {selected.kind === "edge" ? (
              <>
                <LabelField
                  objectId={selected.id}
                  label={selected.label}
                  placeholder="e.g. writes"
                  fieldLabel="Arrow label"
                  onUpdate={onUpdate}
                />
                <label className="block space-y-1">
                  <span className="mono-tag">Line style</span>
                  <select
                    value={
                      (selected.pathStyle ?? "straight") === "curved"
                        ? "curved"
                        : (selected.lineStyle ?? "solid")
                    }
                    onChange={(event) => {
                      const v = event.target.value;
                      if (v === "curved") {
                        onUpdate(selected.id, {
                          pathStyle: "curved",
                          lineStyle: "solid",
                        });
                      } else {
                        onUpdate(selected.id, {
                          pathStyle: "straight",
                          lineStyle: v as "solid" | "dashed" | "dotted",
                        });
                      }
                    }}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                    <option value="curved">Curved</option>
                  </select>
                </label>
              </>
            ) : null}

            {selected.kind === "sticky" ? (
              <StickyField objectId={selected.id} text={selected.text} onUpdate={onUpdate} />
            ) : null}

            {selected.kind === "stroke" ? (
              <StrokeFields
                objectId={selected.id}
                width={selected.width}
                lineStyle={selected.lineStyle ?? "solid"}
                onUpdate={onUpdate}
              />
            ) : null}

            <button
              type="button"
              onClick={() => onDelete(selected.id)}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-destructive/50 px-2 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-3">
        <span className="mono-tag">In the room ({participants.length})</span>
        {participants.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Waiting for people to join…</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {participants.map((participant) => {
              const isYou = meId !== undefined && participant.id === meId;
              return (
                <li key={participant.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        participant.role === "interviewer" ? "var(--signal)" : "var(--note)",
                    }}
                  />
                  <span className="truncate font-medium">
                    {participant.displayName}
                    {isYou ? (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>
                    ) : null}
                  </span>
                  <span className="mono-tag ml-auto shrink-0">{participant.role}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function LabelField({
  objectId,
  label,
  onUpdate,
  placeholder,
  fieldLabel = "Label",
}: {
  objectId: string;
  label: string;
  onUpdate: (id: string, patch: Partial<CanvasObject>) => void;
  placeholder?: string;
  fieldLabel?: string;
}) {
  const draft = useFocusedDraft(label, objectId);
  return (
    <label className="block space-y-1">
      <span className="mono-tag">{fieldLabel}</span>
      <input
        value={draft.value}
        placeholder={placeholder}
        onFocus={draft.onFocus}
        onBlur={draft.onBlur}
        onChange={(event) => {
          draft.onChange(event.target.value);
          onUpdate(objectId, { label: event.target.value });
        }}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
      />
    </label>
  );
}

function StickyField({
  objectId,
  text,
  onUpdate,
}: {
  objectId: string;
  text: string;
  onUpdate: (id: string, patch: Partial<CanvasObject>) => void;
}) {
  const draft = useFocusedDraft(text, objectId);
  return (
    <label className="block space-y-1">
      <span className="mono-tag">Text</span>
      <textarea
        value={draft.value}
        rows={4}
        onFocus={draft.onFocus}
        onBlur={draft.onBlur}
        onChange={(event) => {
          draft.onChange(event.target.value);
          onUpdate(objectId, { text: event.target.value });
        }}
        className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
      />
    </label>
  );
}

function StrokeFields({
  objectId,
  width,
  lineStyle,
  onUpdate,
}: {
  objectId: string;
  width: number;
  lineStyle: "solid" | "dashed" | "dotted";
  onUpdate: (id: string, patch: Partial<CanvasObject>) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="mono-tag">Line style</span>
        <select
          value={lineStyle}
          onChange={(event) =>
            onUpdate(objectId, {
              lineStyle: event.target.value as "solid" | "dashed" | "dotted",
            })
          }
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="mono-tag">Width</span>
        <select
          value={String(width)}
          onChange={(event) => onUpdate(objectId, { width: Number(event.target.value) })}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
        >
          {[2, 4, 8, 12].map((n) => (
            <option key={n} value={n}>
              {n}px
            </option>
          ))}
          {![2, 2.5, 4, 8].includes(width) ? <option value={width}>{width}px</option> : null}
        </select>
      </label>
    </div>
  );
}
