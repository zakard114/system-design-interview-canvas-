import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Link2, Radio, WifiOff } from "lucide-react";
import { useInterviewSession } from "@/hooks/useInterviewSession";
import { CanvasSurface } from "@/components/canvas/CanvasSurface";
import { Inspector } from "@/components/canvas/Inspector";
import { Toolbar } from "@/components/canvas/Toolbar";
import { SELECT_TOOL, type Tool } from "@/components/canvas/tools";
import { joinLink } from "@/lib/session-link";

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
  } = useInterviewSession(sessionId);

  const [tool, setTool] = useState<Tool>(SELECT_TOOL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [joining, setJoining] = useState(false);

  const selected = useMemo(
    () => objects.find((o) => o.id === selectedId) ?? null,
    [objects, selectedId],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA/.test(target.tagName)) return;
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        void deleteObject(selectedId);
        setSelectedId(null);
      }
      if (event.key === "Escape") setTool(SELECT_TOOL);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteObject, selectedId]);

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center grid-paper px-5">
        <div className="panel max-w-md p-6 text-center">
          <h1 className="text-xl font-semibold">This room doesn't exist</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The link may be wrong or the room was never created in this browser.
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
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="Display name"
            className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          />
          <button
            type="submit"
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

  return (
    <main className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <Link to="/" className="font-display text-sm font-semibold">
          Interview<span className="text-primary">Canvas</span>
        </Link>
        <span className="mono-tag">room {session?.joinCode}</span>
        <button
          type="button"
          onClick={copyLink}
          className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
          {copied ? "Link copied" : "Copy join link"}
        </button>
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <Link2 className="size-3.5" />
          {joinLink(sessionId)}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-xs">
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
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row">
        <Toolbar tool={tool} onChange={setTool} />
        <div className="panel min-h-0 flex-1 overflow-hidden">
          <CanvasSurface
            objects={objects}
            tool={tool}
            onToolUsed={() => setTool(SELECT_TOOL)}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreate={(object) => void createObject(object)}
            onUpdate={(id, patch) => void updateObject(id, patch)}
            participantId={me.id}
          />
        </div>
        <Inspector
          selected={selected}
          participants={participants}
          onUpdate={(id, patch) => void updateObject(id, patch)}
          onDelete={(id) => {
            void deleteObject(id);
            setSelectedId(null);
          }}
        />
      </div>
    </main>
  );
}
