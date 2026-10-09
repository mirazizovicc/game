"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionBadge } from "@/components/ui/ConnectionBadge";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/client/api";
import { useGameState } from "@/lib/client/use-game-state";
import { useServerNow } from "@/lib/client/use-server-clock";
import type { HostAction } from "@/lib/domain/game-machine";
import { HostFinal } from "./HostFinal";
import { HostLeaderboard } from "./HostLeaderboard";
import { HostLobby } from "./HostLobby";
import { HostQuestion } from "./HostQuestion";
import { HostReveal } from "./HostReveal";

function joinBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, "");
}

/** Controller for the projected host screen. All state comes from the server; this only renders it and sends commands. */
export function HostScreen({ pin, banner }: { pin: string; banner?: React.ReactNode }) {
  const router = useRouter();
  const { view, connection, fatal, clockOffset, refresh } = useGameState(pin, "host");
  const timed = view !== null && (view.phase === "countdown" || view.phase === "open");
  const now = useServerNow(clockOffset, timed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(id);
  }, [error]);

  const run = useCallback(
    async (action: HostAction) => {
      if (!view || inFlight.current) return; // single-flight: a double-click sends one request
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        await api.hostAction(pin, action, view.version);
      } catch (e) {
        // STALE_STATE just means the screen was a moment behind; the refresh below fixes it silently.
        if (!(e instanceof ApiError && e.code === "STALE_STATE")) {
          setError(e instanceof ApiError ? e.message : "Something went wrong.");
        }
      } finally {
        inFlight.current = false;
        setBusy(false);
        refresh();
      }
    },
    [pin, view, refresh],
  );

  const playAgain = useCallback(async () => {
    if (!view || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const created = await api.createGame({ timeLimitSec: view.config.timeLimitSec, shuffleOptions: view.config.shuffleOptions });
      router.push(`/host/${created.pin}`);
    } catch (e) {
      // A configured access code is needed again; send the host back to the setup screen.
      if (e instanceof ApiError && e.code === "FORBIDDEN") router.push("/host");
      else setError(e instanceof ApiError ? e.message : "Could not create a new game.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [view, router]);

  if (fatal) {
    const notHost = fatal.code === "UNAUTHORIZED";
    return (
      <Message
        title={notHost ? "This browser isn't the host of this game" : fatal.code === "GAME_EXPIRED" ? "This game has expired" : "Game not found"}
        body={
          notHost
            ? "Only the browser that created the game can control it. If you closed the original window's cookies, create a new game."
            : fatal.message
        }
        action={
          <Link href="/host" className="inline-flex">
            <Button size="lg">Create a new game</Button>
          </Link>
        }
      />
    );
  }

  if (!view) {
    return (
      <>
        <ConnectionBadge connection={connection} />
        <Message title="Loading your game…" body="Connecting to the server." />
      </>
    );
  }

  let content;
  switch (view.phase) {
    case "lobby":
      content = <HostLobby view={view} joinBase={joinBase()} busy={busy} onStart={() => run("start")} onEnd={() => run("end")} />;
      break;
    case "countdown":
    case "open":
    case "paused":
      content = <HostQuestion view={view} now={now} busy={busy} onAction={run} />;
      break;
    case "reveal":
      content = <HostReveal view={view} busy={busy} onAdvance={() => run("advance")} onEnd={() => run("end")} />;
      break;
    case "leaderboard":
      content = <HostLeaderboard view={view} busy={busy} onAdvance={() => run("advance")} onEnd={() => run("end")} />;
      break;
    case "finished":
      content = <HostFinal view={view} busy={busy} onPlayAgain={playAgain} />;
      break;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {banner}
      <ConnectionBadge connection={connection} />
      {error && (
        <div role="alert" className="shrink-0 bg-bad px-4 py-2 text-center font-semibold text-ink-950">
          {error}
        </div>
      )}
      <main className="min-h-0 flex-1 px-[3vw] py-[2.4vh]">{content}</main>
    </div>
  );
}

function Message({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-xl space-y-4 text-center" role="status">
        <h1 className="font-display text-4xl font-extrabold">{title}</h1>
        <p className="text-lg text-ivory-dim">{body}</p>
        {action}
      </div>
    </main>
  );
}
