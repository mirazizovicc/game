import type { StandingView } from "@/lib/domain/view";

interface StandingsListProps {
  standings: StandingView[];
  size: "host" | "player";
  /** Show "+points" earned on the latest question. */
  showDelta?: boolean;
}

const MEDAL: Record<number, string> = { 1: "bg-gold text-ink-950", 2: "bg-silver text-ink-950", 3: "bg-bronze text-ink-950" };

export function StandingRow({ standing, size, showDelta = true, index = 0 }: { standing: StandingView; size: "host" | "player"; showDelta?: boolean; index?: number }) {
  const host = size === "host";
  return (
    <li
      className={`flex items-center rounded-2xl animate-rise ${standing.isYou ? "bg-ivory text-ink-950 ring-4 ring-gold" : "bg-ink-800 text-ivory"} ${
        host ? "gap-[1.6vw] px-[1.8vw] py-[1.3vh]" : "gap-3 px-3 py-3"
      }`}
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <span
        className={`grid shrink-0 place-items-center rounded-full font-display font-extrabold tabular-nums ${(standing.score > 0 ? MEDAL[standing.rank] : undefined) ?? "bg-ink-600 text-ivory"} ${
          host ? "size-[min(5vw,8.5vh)] text-[min(2.6vw,4.6vh)]" : "size-10 text-lg"
        }`}
        aria-label={`Rank ${standing.rank}`}
      >
        {standing.rank}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-display font-bold ${host ? "text-[min(3vw,5.4vh)]" : "text-xl"}`}>
          {standing.nickname}
          {standing.isYou && <span className={`ml-2 font-sans font-semibold opacity-70 ${host ? "text-[min(1.4vw,2.4vh)]" : "text-sm"}`}>(you)</span>}
        </span>
        {!host && showDelta && standing.lastPoints > 0 && (
          <span className={`block text-sm font-bold tabular-nums ${standing.isYou ? "text-[#0b6a47]" : "text-good"}`}>+{standing.lastPoints.toLocaleString("en-US")} this round</span>
        )}
      </span>
      {host && showDelta && standing.lastPoints > 0 && (
        <span className="shrink-0 rounded-full bg-good/20 px-3 py-1 text-[min(1.8vw,3.2vh)] font-bold tabular-nums text-good">
          +{standing.lastPoints.toLocaleString("en-US")}
        </span>
      )}
      <span className={`shrink-0 text-right font-display font-extrabold tabular-nums ${host ? "min-w-[10vw] text-[min(3.4vw,6vh)]" : "min-w-[4.5rem] text-2xl"}`}>
        {standing.score.toLocaleString("en-US")}
      </span>
    </li>
  );
}

export function StandingsList({ standings, size, showDelta = true }: StandingsListProps) {
  if (standings.length === 0) {
    return <p className="rounded-2xl bg-ink-800 p-6 text-center text-lg text-ivory-dim">No scores yet.</p>;
  }
  return (
    <ol className={`flex flex-col ${size === "host" ? "gap-[1.2vh]" : "gap-2"}`}>
      {standings.map((standing, index) => (
        <StandingRow key={standing.playerId} standing={standing} size={size} showDelta={showDelta} index={index} />
      ))}
    </ol>
  );
}
