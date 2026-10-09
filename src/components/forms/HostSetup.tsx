"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/client/api";

const TIME_OPTIONS = [
  { value: "", label: "Quiz default (20 seconds)" },
  { value: "10", label: "10 seconds — fast" },
  { value: "15", label: "15 seconds" },
  { value: "30", label: "30 seconds" },
  { value: "45", label: "45 seconds" },
  { value: "60", label: "60 seconds — relaxed" },
];

export function HostSetup() {
  const router = useRouter();
  const [timeLimit, setTimeLimit] = useState("");
  const [shuffle, setShuffle] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [backend, setBackend] = useState<"postgres" | "memory" | "unconfigured" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .health()
      .then((info) => {
        setNeedsCode(info.hostAccessCodeRequired);
        setBackend(info.mode);
      })
      .catch(() => setError("Can't reach the server right now. Check your connection and reload."));
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { pin } = await api.createGame({
        accessCode: needsCode ? accessCode : undefined,
        timeLimitSec: timeLimit ? Number(timeLimit) : null,
        shuffleOptions: shuffle,
      });
      router.push(`/host/${pin}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the game.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-10 pt-6">
      <header className="mb-8 flex items-center justify-between">
        <Brand compact />
        <Link href="/" className="text-sm font-semibold text-ivory-dim underline-offset-4 hover:underline">
          Join instead
        </Link>
      </header>

      <form
        className="space-y-6 rounded-[1.75rem] bg-ink-800 p-6 shadow-card ring-1 ring-white/10 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div>
          <h1 className="font-display text-4xl font-extrabold leading-tight">Host a game</h1>
          <p className="mt-2 text-ivory-dim">
            Open this on the laptop connected to the projector. You&apos;ll get a PIN and QR code for students to join, then control each question from there.
          </p>
        </div>

        <div>
          <label htmlFor="time" className="mb-2 block text-sm font-semibold text-ivory-dim">
            Time per question
          </label>
          <select
            id="time"
            value={timeLimit}
            onChange={(e) => setTimeLimit(e.target.value)}
            className="w-full rounded-xl border-2 border-ink-600 bg-ink-950 px-4 py-3 text-lg focus:border-gold focus:outline-none"
          >
            {TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} className="mt-1 size-6 accent-burgundy-500" />
          <span>
            <span className="block font-semibold">Shuffle answer order</span>
            <span className="block text-sm text-ivory-dim">Everyone sees the same shuffled order. Scoring is unaffected.</span>
          </span>
        </label>

        {needsCode && (
          <div>
            <label htmlFor="code" className="mb-2 block text-sm font-semibold text-ivory-dim">
              Host access code
            </label>
            <input
              id="code"
              type="password"
              autoComplete="off"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              className="w-full rounded-xl border-2 border-ink-600 bg-ink-950 px-4 py-3 text-lg focus:border-gold focus:outline-none"
            />
          </div>
        )}

        {backend === "unconfigured" && (
          <p role="alert" className="rounded-xl bg-bad/15 px-4 py-3 font-semibold text-bad">
            The game backend isn&apos;t configured yet. The site owner needs to set DATABASE_URL (see the README).
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-bad/15 px-4 py-3 font-semibold text-bad">
            {error}
          </p>
        )}

        <Button type="submit" size="xl" className="w-full" busy={busy} disabled={backend === "unconfigured" || (needsCode && accessCode.length === 0)}>
          Create game
        </Button>
        <p className="text-center text-sm text-ivory-mute">7 questions · about 6 minutes</p>
      </form>
    </main>
  );
}
