"use client";

import { Button } from "@/components/ui/Button";
import { StandingsList } from "@/components/ui/StandingsList";
import type { GameView } from "@/lib/domain/view";
import { ConfirmButton, HostControls } from "./HostControls";

interface Props {
  view: GameView;
  busy: boolean;
  onAdvance: () => void;
  onEnd: () => void;
}

export function HostLeaderboard({ view, busy, onAdvance, onEnd }: Props) {
  const standings = view.standings ?? [];
  return (
    <div className="flex h-full flex-col gap-[2vh]">
      <header className="shrink-0 text-center">
        <p className="font-display text-[min(2vw,3.6vh)] font-bold uppercase tracking-[0.25em] text-rose-300">
          After question {view.questionIndex + 1} of {view.totalQuestions}
        </p>
        <h1 className="font-display text-[min(5.4vw,10vh)] font-extrabold leading-none">Leaderboard</h1>
      </header>
      <div className="mx-auto min-h-0 w-full max-w-[78vw] flex-1">
        <StandingsList standings={standings} size="host" />
      </div>
      <HostControls>
        <ConfirmButton label="End game" confirmLabel="Click again to end" onConfirm={onEnd} disabled={busy} />
        <Button size="lg" onClick={onAdvance} busy={busy}>
          Next question
        </Button>
      </HostControls>
    </div>
  );
}
