import { getRuntimeInfo } from "@/lib/server/container";

/**
 * Honest status of the backend, rendered on the server for every page.
 * Local demo mode must never be mistaken for the real multiplayer backend.
 */
export function ModeBanner() {
  const { mode } = getRuntimeInfo();
  if (mode === "postgres") return null;
  if (mode === "memory") {
    return (
      <div
        role="status"
        title="Games live in this server's memory only: lost on restart and not shared across servers. Set DATABASE_URL for real classroom use."
        className="bg-gold px-4 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-ink-950"
      >
        Demo mode · in-memory
      </div>
    );
  }
  return (
    <div role="alert" className="bg-bad px-4 py-2 text-center text-sm font-semibold text-ink-950">
      Backend not configured — set DATABASE_URL on the server (see README → Supabase setup). Games cannot be created yet.
    </div>
  );
}
