import { StandingRow, StandingsList } from "@/components/ui/StandingsList";
import type { GameView } from "@/lib/domain/view";

export function PlayerLeaderboard({ view }: { view: GameView }) {
  return (
    <div className="flex flex-1 flex-col gap-4 pt-2">
      <header className="text-center">
        <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-rose-300">
          After question {view.questionIndex + 1} of {view.totalQuestions}
        </p>
        <h1 className="font-display text-4xl font-extrabold">Leaderboard</h1>
      </header>
      <StandingsList standings={view.standings ?? []} size="player" />
      {view.you && (
        <>
          <p className="text-center text-ivory-mute" aria-hidden>
            ⋮
          </p>
          <ol>
            <StandingRow standing={view.you} size="player" />
          </ol>
        </>
      )}
      <p className="mt-auto pb-2 text-center text-sm text-ivory-mute">Next question coming up…</p>
    </div>
  );
}
