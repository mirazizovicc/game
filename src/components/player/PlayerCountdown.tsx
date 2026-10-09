import { secondsLeft } from "@/lib/client/use-server-clock";
import type { GameView } from "@/lib/domain/view";

export function PlayerCountdown({ view, now }: { view: GameView; now: number }) {
  const left = secondsLeft(view.opensAt, now);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center" role="status" aria-live="assertive">
      <p className="font-display text-lg font-bold uppercase tracking-[0.2em] text-rose-300">
        Question {view.questionIndex + 1} of {view.totalQuestions}
      </p>
      <p className="animate-pulse-soft font-display text-[9rem] font-extrabold leading-none tabular-nums" key={left}>
        {left || "Go!"}
      </p>
      <p className="font-display text-xl font-bold text-ivory-dim">Get ready…</p>
    </div>
  );
}
