import type { Connection } from "@/lib/client/use-game-state";

/** Screen-reader friendly connection status. Silent while healthy, loud when it matters. */
export function ConnectionBadge({ connection }: { connection: Connection }) {
  return (
    <div aria-live="polite" role="status" className="min-h-0">
      {connection === "reconnecting" && (
        <div className="flex items-center justify-center gap-2 bg-gold px-4 py-2 text-center text-sm font-bold text-ink-950">
          <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-ink-950" />
          Connection lost — reconnecting… your answers and score are safe.
        </div>
      )}
      {connection === "connecting" && <span className="sr-only">Connecting to the game…</span>}
    </div>
  );
}
