import { OptionTile, type TileState } from "@/components/ui/OptionTile";
import { CheckIcon, CrossIcon } from "@/components/ui/Shapes";
import type { GameView } from "@/lib/domain/view";

const ordinal = (n: number) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};

export function PlayerReveal({ view }: { view: GameView }) {
  const { question, reveal, me } = view;
  if (!question || !reveal || !me) return null;
  const result = me.result;
  const answered = me.answered;

  const heading = !answered ? "Time ran out" : result?.correct ? "Correct!" : "Not quite";
  const tone = !answered ? "bg-ink-800 text-ivory" : result?.correct ? "bg-good text-ink-950" : "bg-bad text-ink-950";

  return (
    <div className="flex flex-1 flex-col gap-4 pt-2">
      <div className={`animate-pop-in rounded-3xl px-5 py-5 text-center ${tone}`} role="status" aria-live="assertive">
        <div className="mx-auto mb-1 grid size-12 place-items-center rounded-full bg-black/15">
          {result?.correct ? <CheckIcon className="size-8" /> : <CrossIcon className="size-8" />}
        </div>
        <h1 className="font-display text-4xl font-extrabold">{heading}</h1>
        <p className="font-display text-2xl font-bold tabular-nums">+{(result?.points ?? 0).toLocaleString("en-US")} points</p>
        {!answered && <p className="mt-1 text-sm font-semibold">You didn&apos;t submit an answer for this question.</p>}
      </div>

      <p className="font-display text-lg font-bold leading-snug text-ivory-dim">{question.prompt}</p>

      <div className="flex flex-col gap-2.5">
        {question.options.map((option, position) => {
          let state: TileState = "dim";
          if (option.id === reveal.correctOptionId) state = "correct";
          else if (option.id === me.selectedOptionId) state = "wrong";
          return <OptionTile key={option.id} position={position} option={option} state={state} size="player" />;
        })}
      </div>

      <section className="rounded-2xl bg-ivory p-4 text-ink-950" aria-label="Explanation">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-burgundy-600">Why</p>
        <p className="mt-1 font-display text-lg font-semibold leading-snug">{reveal.explanation}</p>
      </section>

      <p className="rounded-2xl bg-ink-800 px-4 py-3 text-center font-display text-lg font-bold" aria-live="polite">
        {me.rank !== null ? <>You&apos;re {ordinal(me.rank)} with {me.score.toLocaleString("en-US")} points</> : <>{me.score.toLocaleString("en-US")} points</>}
      </p>
      <p className="pb-2 text-center text-sm text-ivory-mute">Waiting for the host…</p>
    </div>
  );
}
