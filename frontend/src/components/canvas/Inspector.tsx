import { Trash2 } from "lucide-react";
import type { CanvasObject, Participant } from "@/services";
import { nodeMeta } from "./node-meta";

interface Props {
  selected: CanvasObject | null;
  participants: Participant[];
  onUpdate: (id: string, patch: Partial<CanvasObject>) => void;
  onDelete: (id: string) => void;
}

export function Inspector({ selected, participants, onUpdate, onDelete }: Props) {
  return (
    <div className="panel flex w-full flex-col gap-4 p-3 lg:w-64">
      <div>
        <span className="mono-tag">Selection</span>
        {!selected ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Pick a tool, click the board to place things. Select an object to rename or
            delete it.
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
              <label className="block space-y-1">
                <span className="mono-tag">Label</span>
                <input
                  value={selected.label}
                  onChange={(event) => onUpdate(selected.id, { label: event.target.value })}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
                />
              </label>
            ) : null}

            {selected.kind === "edge" ? (
              <label className="block space-y-1">
                <span className="mono-tag">Arrow label</span>
                <input
                  value={selected.label}
                  placeholder="e.g. writes"
                  onChange={(event) => onUpdate(selected.id, { label: event.target.value })}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
                />
              </label>
            ) : null}

            {selected.kind === "sticky" ? (
              <label className="block space-y-1">
                <span className="mono-tag">Text</span>
                <textarea
                  value={selected.text}
                  rows={4}
                  onChange={(event) => onUpdate(selected.id, { text: event.target.value })}
                  className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
                />
              </label>
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
        <ul className="mt-2 space-y-1.5">
          {participants.map((participant) => (
            <li key={participant.id} className="flex items-center gap-2 text-sm">
              <span
                className="inline-block size-2 rounded-full"
                style={{
                  backgroundColor:
                    participant.role === "interviewer" ? "var(--signal)" : "var(--note)",
                }}
              />
              <span className="truncate">{participant.displayName}</span>
              <span className="mono-tag ml-auto">{participant.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
