import type { PodiumGroup } from "@/lib/domain/ranking";

const STEP = {
  1: { label: "1st", ring: "from-gold to-[#b98a14]", height: "h-[62%]", glow: "shadow-[0_0_80px_-10px_rgb(233_185_59/0.55)]", text: "text-ink-950", name: "Gold" },
  2: { label: "2nd", ring: "from-silver to-[#8e98a8]", height: "h-[46%]", glow: "", text: "text-ink-950", name: "Silver" },
  3: { label: "3rd", ring: "from-bronze to-[#8f5524]", height: "h-[34%]", glow: "", text: "text-ink-950", name: "Bronze" },
} as const;

interface PodiumProps {
  groups: PodiumGroup[];
  size: "host" | "player";
  youId?: string | null;
}

/** Podium steps in classic order (2nd · 1st · 3rd). Missing steps (ties, small games) are simply omitted. */
export function Podium({ groups, size, youId }: PodiumProps) {
  const host = size === "host";
  const byRank = new Map(groups.map((g) => [g.rank, g]));
  const order = ([2, 1, 3] as const).filter((rank) => byRank.has(rank));
  if (order.length === 0) return null;

  const allZero = groups.every((g) => g.players.every((p) => p.score === 0));

  return (
    <div className={`flex w-full items-end justify-center ${host ? "h-full gap-[1.6vw]" : "h-72 gap-2"}`}>
      {order.map((rank, i) => {
        const group = byRank.get(rank)!;
        const step = STEP[rank];
        // Several co-placed players share the step: wrap and shrink so a tie still fits the screen.
        const crowd = group.players.length + (group.hiddenCount > 0 ? 1 : 0);
        const nameSize = host ? (crowd <= 1 ? "text-[min(2.8vw,5vh)]" : crowd === 2 ? "text-[min(2.2vw,4vh)]" : "text-[min(1.7vw,3vh)]") : crowd <= 2 ? "text-lg" : "text-sm";
        return (
          <div
            key={rank}
            className={`flex h-full flex-col justify-end ${host ? "w-[26vw] max-w-[28rem]" : "w-1/3"}`}
            style={{ animation: "var(--animate-rise)", animationDelay: `${(order.length - 1 - i) * 350 + 200}ms` }}
          >
            <div className={`mb-3 text-center ${nameSize}`}>
              <ul className="flex flex-wrap justify-center gap-x-[0.8em] gap-y-0.5">
                {group.players.map((player) => (
                  <li key={player.playerId} className={`truncate font-display font-extrabold ${youId === player.playerId ? "text-gold" : ""}`}>
                    {player.nickname}
                    {youId === player.playerId && <span className="sr-only"> (you)</span>}
                  </li>
                ))}
                {group.hiddenCount > 0 && <li className="font-sans text-ivory-dim">+{group.hiddenCount} more</li>}
              </ul>
              <p className={`font-display font-extrabold tabular-nums text-ivory-dim ${host ? "text-[min(2vw,3.6vh)]" : "text-base"}`}>
                {(group.players[0]?.score ?? 0).toLocaleString("en-US")} pts
              </p>
            </div>
            <div
              className={`flex ${step.height} items-start justify-center rounded-t-2xl bg-gradient-to-b ${step.ring} ${step.text} ${step.glow || "shadow-card"}`}
              role="img"
              aria-label={`${step.name} medal, rank ${rank}`}
            >
              <span className={`mt-2 font-display font-extrabold leading-none ${host ? "text-[min(6vw,11vh)]" : "text-5xl"}`}>{rank}</span>
            </div>
          </div>
        );
      })}
      {allZero && <p className="sr-only">Nobody scored any points.</p>}
    </div>
  );
}
