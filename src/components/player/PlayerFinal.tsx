import Link from "next/link";
import { Confetti } from "@/components/ui/Confetti";
import { Podium } from "@/components/ui/Podium";
import { StandingRow } from "@/components/ui/StandingsList";
import type { GameView } from "@/lib/domain/view";

const ordinal = (n: number) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};

export function PlayerFinal({ view }: { view: GameView }) {
  const me = view.me;
  const onPodium = me?.rank !== null && me?.rank !== undefined && me.rank <= 3 && me.score > 0;
  const mine = view.standings?.find((s) => s.isYou) ?? view.you;
  const topTen = (view.standings ?? []).slice(0, 10);

  return (
    <div className="flex flex-1 flex-col gap-5 pt-2">
      {onPodium && <Confetti pieces={30} />}
      <header className="text-center">
        <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-rose-300">Game over</p>
        <h1 className="font-display text-4xl font-extrabold leading-tight">
          {me?.rank ? (onPodium ? `You finished ${ordinal(me.rank)}!` : `You finished ${ordinal(me.rank)}`) : "Thanks for playing"}
        </h1>
        {me && <p className="font-display text-xl font-bold text-gold tabular-nums">{me.score.toLocaleString("en-US")} points</p>}
      </header>

      <Podium groups={view.podium ?? []} size="player" youId={me?.id} />

      {topTen.length > 0 && (
        <ol className="flex flex-col gap-2" aria-label="Final standings">
          {topTen.map((s) => (
            <StandingRow key={s.playerId} standing={s} size="player" showDelta={false} />
          ))}
          {mine && !topTen.some((s) => s.playerId === mine.playerId) && (
            <>
              <li aria-hidden className="text-center text-ivory-mute">⋮</li>
              <StandingRow standing={mine} size="player" showDelta={false} />
            </>
          )}
        </ol>
      )}

      <Link href="/" className="mt-auto inline-flex min-h-12 items-center justify-center rounded-2xl bg-white/5 font-display font-bold ring-1 ring-inset ring-white/20">
        Back to start
      </Link>
    </div>
  );
}
