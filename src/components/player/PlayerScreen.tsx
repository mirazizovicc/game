"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { useGameState } from "@/lib/client/use-game-state";
import { useServerNow } from "@/lib/client/use-server-clock";
import { PlayerCountdown } from "./PlayerCountdown";
import { PlayerFinal } from "./PlayerFinal";
import { PlayerLeaderboard } from "./PlayerLeaderboard";
import { PlayerLobby } from "./PlayerLobby";
import { PlayerQuestion } from "./PlayerQuestion";
import { PlayerReveal } from "./PlayerReveal";
import { PlayerShell } from "./PlayerShell";

/** Controller for a student's phone. Renders whatever the server says the game is doing. */
export function PlayerScreen({ pin }: { pin: string }) {
  const { view, connection, fatal, clockOffset, refresh } = useGameState(pin, "player");
  const timed = view !== null && (view.phase === "countdown" || view.phase === "open");
  const now = useServerNow(clockOffset, timed);

  // Move focus to the new screen heading so screen-reader users hear each state change.
  const phase = view?.phase;
  useEffect(() => {
    document.querySelector<HTMLElement>("main h1")?.setAttribute("tabindex", "-1");
    document.querySelector<HTMLElement>("main h1")?.focus({ preventScroll: true });
  }, [phase]);

  if (fatal) {
    const notJoined = fatal.code === "UNAUTHORIZED";
    return (
      <PlayerShell connection="ended">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <h1 className="font-display text-3xl font-extrabold">
            {notJoined ? "You haven't joined this game" : fatal.code === "GAME_EXPIRED" ? "This game has ended" : "Game not found"}
          </h1>
          <p className="text-ivory-dim">
            {notJoined ? "Join with the PIN on the screen. If you were already playing, open this page in the same browser you joined from." : fatal.message}
          </p>
          <Link href={notJoined ? `/join?pin=${pin}` : "/join"} className="inline-flex">
            <Button size="lg">{notJoined ? "Join this game" : "Enter a different PIN"}</Button>
          </Link>
        </div>
      </PlayerShell>
    );
  }

  if (!view) {
    return (
      <PlayerShell connection={connection}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center" role="status">
          <span aria-hidden className="size-8 animate-spin rounded-full border-4 border-white/20 border-t-gold" />
          <p className="font-display text-xl font-bold">Joining the game…</p>
        </div>
      </PlayerShell>
    );
  }

  let content;
  switch (view.phase) {
    case "lobby":
      content = <PlayerLobby view={view} />;
      break;
    case "countdown":
      content = <PlayerCountdown view={view} now={now} />;
      break;
    case "open":
    case "paused":
      content = <PlayerQuestion key={view.question?.id ?? view.questionIndex} pin={pin} view={view} now={now} onChanged={refresh} />;
      break;
    case "reveal":
      content = <PlayerReveal view={view} />;
      break;
    case "leaderboard":
      content = <PlayerLeaderboard view={view} />;
      break;
    case "finished":
      content = <PlayerFinal view={view} />;
      break;
  }

  return (
    <PlayerShell connection={connection} nickname={view.me?.nickname} score={view.phase === "lobby" ? undefined : view.me?.score}>
      {content}
    </PlayerShell>
  );
}
