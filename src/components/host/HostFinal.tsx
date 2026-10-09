"use client";

import Link from "next/link";
import { Confetti } from "@/components/ui/Confetti";
import { Button } from "@/components/ui/Button";
import { Podium } from "@/components/ui/Podium";
import type { GameView } from "@/lib/domain/view";
import { HostControls } from "./HostControls";

interface Props {
  view: GameView;
  busy: boolean;
  onPlayAgain: () => void;
}

const SIDE_LIST_MAX = 9;

export function HostFinal({ view, busy, onPlayAgain }: Props) {
  const everyone = view.standings ?? [];
  const rest = everyone.filter((s) => s.rank > 3);
  const shown = rest.slice(0, SIDE_LIST_MAX);
  const nobodyScored = everyone.length > 0 && everyone.every((s) => s.score === 0);

  return (
    <div className="flex h-full flex-col gap-[2vh]">
      <Confetti />
      <header className="shrink-0 text-center">
        <p className="font-display text-[min(2vw,3.6vh)] font-bold uppercase tracking-[0.25em] text-rose-300">{view.title}</p>
        <h1 className="font-display text-[min(6vw,11vh)] font-extrabold leading-none">{nobodyScored ? "Game over" : "Final podium"}</h1>
      </header>

      <div className={`grid min-h-0 flex-1 gap-[2.4vw] ${shown.length > 0 ? "grid-cols-[minmax(0,7fr)_minmax(0,3fr)]" : "grid-cols-1"}`}>
        <div className="min-h-0">
          {everyone.length === 0 || (view.podium ?? []).length === 0 ? (
            <p className="grid h-full place-items-center text-center font-display text-[min(3vw,5vh)] font-bold text-ivory-dim">
              {everyone.length === 0 ? "No players took part in this game." : "Nobody scored any points this time."}
            </p>
          ) : (
            <Podium groups={view.podium ?? []} size="host" />
          )}
        </div>
        {shown.length > 0 && (
          <aside className="min-h-0 overflow-hidden rounded-[1.5rem] bg-ink-900/80 p-[1.4vw] ring-1 ring-white/10" aria-label="Other players">
            <h2 className="mb-[1vh] font-display text-[min(1.8vw,3.2vh)] font-bold uppercase tracking-widest text-ivory-dim">Everyone else</h2>
            <ol className="space-y-[0.7vh]">
              {shown.map((s) => (
                <li key={s.playerId} className="flex items-baseline gap-[0.8vw] font-display text-[min(1.9vw,3.4vh)]">
                  <span className="w-[2.4vw] shrink-0 text-right font-extrabold tabular-nums text-ivory-mute">{s.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">{s.nickname}</span>
                  <span className="font-bold tabular-nums text-ivory-dim">{s.score.toLocaleString("en-US")}</span>
                </li>
              ))}
              {rest.length > shown.length && <li className="pl-[3.2vw] text-ivory-mute">+{rest.length - shown.length} more</li>}
            </ol>
          </aside>
        )}
      </div>

      <HostControls>
        <Link href="/" className="inline-flex min-h-12 items-center rounded-2xl px-5 font-display font-bold text-ivory-dim underline-offset-4 hover:underline">
          Home
        </Link>
        <Button size="xl" onClick={onPlayAgain} busy={busy}>
          Play again (new game)
        </Button>
      </HostControls>
    </div>
  );
}
