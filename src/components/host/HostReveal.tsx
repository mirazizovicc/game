"use client";

import { Button } from "@/components/ui/Button";
import { OptionTile, type TileState } from "@/components/ui/OptionTile";
import type { GameView } from "@/lib/domain/view";
import { ConfirmButton, HostControls } from "./HostControls";

interface Props {
  view: GameView;
  busy: boolean;
  onAdvance: () => void;
  onEnd: () => void;
}

export function HostReveal({ view, busy, onAdvance, onEnd }: Props) {
  const { question, reveal } = view;
  if (!question || !reveal) return null;
  const isLast = view.questionIndex >= view.totalQuestions - 1;

  return (
    <div className="flex h-full flex-col gap-[1.8vh]">
      <header className="flex shrink-0 items-center justify-between gap-4">
        <p className="rounded-full bg-burgundy-600 px-[1.6vw] py-[0.8vh] font-display text-[min(2.2vw,4vh)] font-extrabold">
          {view.questionIndex + 1} / {view.totalQuestions}
        </p>
        <p className="font-display text-[min(2.2vw,4vh)] font-extrabold uppercase tracking-[0.2em] text-good">Answer revealed</p>
        <p className="rounded-full bg-ink-800 px-[1.6vw] py-[0.8vh] font-display text-[min(2.2vw,4vh)] font-bold tabular-nums">
          {reveal.answeredCount} of {view.playerCount} answered
        </p>
      </header>

      <h1 className="shrink-0 font-display text-[min(3.2vw,6vh)] font-extrabold leading-[1.12]">{question.prompt}</h1>

      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-[1.4vh] gap-x-[1.4vw]">
        {question.options.map((option, position) => {
          const state: TileState = option.id === reveal.correctOptionId ? "correct" : "dim";
          return (
            <OptionTile
              key={option.id}
              position={position}
              option={option}
              state={state}
              size="host"
              count={reveal.distribution[option.id] ?? 0}
              total={reveal.answeredCount}
            />
          );
        })}
      </div>

      <section className="shrink-0 rounded-2xl bg-ivory px-[2vw] py-[1.6vh] text-ink-950" aria-label="Explanation">
        <p className="text-[min(1.5vw,2.6vh)] font-bold uppercase tracking-[0.18em] text-burgundy-600">Why</p>
        <p className="font-display text-[min(2.2vw,4.1vh)] font-semibold leading-snug">{reveal.explanation}</p>
      </section>

      <HostControls>
        <ConfirmButton label="End game" confirmLabel="Click again to end" onConfirm={onEnd} disabled={busy} />
        <Button size="lg" onClick={onAdvance} busy={busy}>
          {isLast ? "Show final podium" : "Show leaderboard"}
        </Button>
      </HostControls>
    </div>
  );
}
