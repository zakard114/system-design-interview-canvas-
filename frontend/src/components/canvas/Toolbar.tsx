import { ArrowUpRight, MousePointer2, PenLine, StickyNote } from "lucide-react";
import { NODE_TYPES } from "./node-meta";
import type { Tool } from "./tools";

interface Props {
  tool: Tool;
  onChange: (tool: Tool) => void;
}

function ToolButton({
  active,
  label,
  color,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className="flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-accent"
      style={{
        borderColor: active ? (color ?? "var(--signal)") : "var(--border)",
        backgroundColor: active ? "var(--accent)" : "transparent",
        color: active ? (color ?? "var(--signal)") : "var(--foreground)",
      }}
    >
      {children}
    </button>
  );
}

export function Toolbar({ tool, onChange }: Props) {
  return (
    <div className="panel flex gap-1.5 overflow-x-auto p-2 lg:h-full lg:w-44 lg:flex-col lg:overflow-y-auto">
      <span className="mono-tag hidden lg:block lg:px-1 lg:pb-1">Tools</span>
      <ToolButton
        active={tool.kind === "select"}
        label="Select and move"
        onClick={() => onChange({ kind: "select" })}
      >
        <MousePointer2 className="size-4" />
        <span className="hidden lg:inline">Select</span>
      </ToolButton>
      <ToolButton
        active={tool.kind === "arrow"}
        label="Connect with arrow"
        onClick={() => onChange({ kind: "arrow" })}
      >
        <ArrowUpRight className="size-4" />
        <span className="hidden lg:inline">Arrow</span>
      </ToolButton>
      <ToolButton
        active={tool.kind === "sticky"}
        label="Sticky note"
        color="var(--note)"
        onClick={() => onChange({ kind: "sticky" })}
      >
        <StickyNote className="size-4" />
        <span className="hidden lg:inline">Note</span>
      </ToolButton>
      <ToolButton
        active={tool.kind === "pen"}
        label="Freehand pen"
        onClick={() => onChange({ kind: "pen" })}
      >
        <PenLine className="size-4" />
        <span className="hidden lg:inline">Pen</span>
      </ToolButton>

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
  );
}
