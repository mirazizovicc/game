"use client";

import { Button } from "@/components/ui/Button";
import { OptionTile } from "@/components/ui/OptionTile";
import { TimerRing } from "@/components/ui/TimerRing";
import { secondsLeft } from "@/lib/client/use-server-clock";
import type { GameView } from "@/lib/domain/view";
import { ConfirmButton, HostControls } from "./HostControls";

interface Props {
  view: GameView;
  now: number;
  busy: boolean;
  onAction: (action: "close" | "pause" | "resume" | "end") => void;
}

export function HostQuestion({ view, now, busy, onAction }: Props) {
  const question = view.question;
  const paused = view.phase === "paused";

  if (view.phase === "countdown" || !question) {
    const left = secondsLeft(view.opensAt, now);
    return (
      <div className="flex h-full flex-col">
        <div className="grid flex-1 place-content-center gap-[2vh] text-center" role="status" aria-live="assertive">
          <p className="font-display text-[min(3vw,5.5vh)] font-bold uppercase tracking-[0.2em] text-rose-300">
            Question {view.questionIndex + 1} of {view.totalQuestions}
          </p>
          <p className="font-display text-[min(26vw,44vh)] font-extrabold leading-none tabular-nums animate-pulse-soft" key={left}>
            {left || "Go!"}
          </p>
          <p className="font-display text-[min(3vw,5.5vh)] font-bold text-ivory-dim">Get ready…</p>
        </div>
        <HostControls>
          <ConfirmButton label="End game" confirmLabel="Click again to end" onConfirm={() => onAction("end")} disabled={busy} />
        </HostControls>
      </div>
    );
  }

  const totalMs = question.timeLimitSec * 1000;
  const remainingMs = paused ? (view.remainingMsWhenPaused ?? 0) : Math.max(0, (view.closesAt ?? now) - now);

  return (
    <div className="flex h-full flex-col gap-[2vh]">
      <header className="flex shrink-0 items-center justify-between gap-4">
        <p className="rounded-full bg-burgundy-600 px-[1.6vw] py-[0.8vh] font-display text-[min(2.2vw,4vh)] font-extrabold">
          {view.questionIndex + 1} / {view.totalQuestions}
        </p>
        <p className="rounded-full bg-ink-800 px-[1.6vw] py-[0.8vh] font-display text-[min(2.2vw,4vh)] font-bold tabular-nums" aria-live="polite">
          {view.answeredCount ?? 0} of {view.playerCount} answered
        </p>
        <TimerRing remainingMs={remainingMs} totalMs={totalMs} paused={paused} className="size-[min(9vw,15vh)]" />
      </header>

      <h1 className="shrink-0 font-display text-[min(3.9vw,7.2vh)] font-extrabold leading-[1.12]">{question.prompt}</h1>

      <div className="relative grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-[1.6vh] gap-x-[1.4vw]">
        {question.options.map((option, position) => (
          <OptionTile key={option.id} position={position} option={option} state="idle" size="host" />
        ))}
        {paused && (
          <div role="status" className="absolute inset-0 grid place-items-center rounded-2xl bg-ink-950/80 backdrop-blur-sm">
            <p className="font-display text-[min(6vw,11vh)] font-extrabold">Paused</p>
          </div>
        )}
      </div>

      <HostControls status={remainingMs === 0 && !paused ? "Time's up — locking in answers…" : undefined}>
        <ConfirmButton label="End game" confirmLabel="Click again to end" onConfirm={() => onAction("end")} disabled={busy} />
        {paused ? (
          <Button size="lg" onClick={() => onAction("resume")} busy={busy}>
            Resume
          </Button>
        ) : (
          <Button variant="ghost" size="lg" onClick={() => onAction("pause")} disabled={busy}>
            Pause
          </Button>
        )}
        <Button variant="secondary" size="lg" onClick={() => onAction("close")} busy={busy}>
          Reveal answer
        </Button>
      </HostControls>
    </div>
  );
}
