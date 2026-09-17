import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Boxes, PenLine, Radio, StickyNote } from "lucide-react";
import { getInterviewService, isUsingMockService } from "@/services";
import { storeParticipant } from "@/hooks/useInterviewSession";
import { parseSessionRef } from "@/lib/session-link";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Interview Canvas — Shared System Design Board" },
      {
        name: "description",
        content:
          "Create an interview room, share the link, and sketch architecture together in real time: components, arrows, sticky notes and freehand.",
      },
      { property: "og:title", content: "Interview Canvas" },
      {
        property: "og:description",
        content: "Create a room, share the link, sketch system designs together live.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mockMode = isUsingMockService();

  const createSession = async () => {
    setError(null);
    setBusy(true);
    try {
      const service = getInterviewService();
      const { session, participant } = await service.createSession({
        displayName: name.trim() || "Interviewer",
      });
      if (participant) storeParticipant(participant);
      await navigate({ to: "/s/$sessionId", params: { sessionId: session.id } });
    } catch {
      setError("Could not start a room. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const openLink = async () => {
    const sessionId = parseSessionRef(link);
    if (!sessionId) {
      setError("That doesn't look like a room link.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const found = await getInterviewService().getSession(sessionId);
      if (!found) {
        setError(
          mockMode
            ? "Room not found in this browser. Demo mode keeps rooms in localStorage — open the link in another tab of the same browser where the room was created. A different browser cannot see that room yet."
            : "Room not found. Check the link or ask the host to create the room again.",
        );
        return;
      }
      await navigate({ to: "/s/$sessionId", params: { sessionId } });
    } catch {
      setError("Could not open that room. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen grid-paper">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-5 py-16">
        <span className="mono-tag">System design interviews</span>
        <h1 className="mt-3 text-4xl leading-tight font-semibold sm:text-6xl">
          One canvas.
          <br />
          <span className="text-primary">Both sides drawing.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground">
          Start a room, send the link, and sketch the architecture together — boxes,
          arrows, notes and freehand strokes appear for everyone as they happen.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="panel p-5">
            <span className="mono-tag">Start a room</span>
            <label className="mt-3 block space-y-1">
              <span className="text-xs text-muted-foreground">Your display name</span>
              <input
                data-testid="home-display-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Interviewer"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </label>
            <button
              type="button"
              data-testid="create-session"
              onClick={createSession}
              disabled={busy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create session"} <ArrowRight className="size-4" />
            </button>
          </div>

          <div className="panel p-5">
            <span className="mono-tag">Join with a link</span>
            <label className="mt-3 block space-y-1">
              <span className="text-xs text-muted-foreground">Paste the room link</span>
              <input
                data-testid="join-link-input"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://…/s/abc123"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </label>
            <button
              type="button"
              data-testid="open-room"
              onClick={openLink}
              disabled={busy}
              className="mt-4 w-full rounded-md border border-input px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-60"
            >
              Open room
            </button>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

        <ul className="mt-12 grid gap-4 sm:grid-cols-4">
          {[
            { icon: Boxes, title: "Component set", body: "Services, DB, queue, cache, LB, LLM" },
            { icon: ArrowRight, title: "Arrows", body: "Show data and control flow" },
            { icon: StickyNote, title: "Sticky notes", body: "Annotate trade-offs" },
            { icon: PenLine, title: "Freehand", body: "Sketch anything else" },
          ].map((item) => (
            <li key={item.title} className="panel p-4">
              <item.icon className="size-4 text-primary" />
              <p className="mt-2 text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>

        <p className="mt-8 flex items-start gap-2 text-xs text-muted-foreground">
          <Radio className="mt-0.5 size-3.5 shrink-0 text-primary" />
          {mockMode ? (
            <span>
              Demo mode: rooms live in this browser&apos;s localStorage and sync across
              tabs. A join link in another browser (or private window) will not see the
              room until a real backend is connected.
            </span>
          ) : (
            <span>Connected to the API — rooms are shared across browsers.</span>
          )}
        </p>
      </div>
    </main>
  );
}
