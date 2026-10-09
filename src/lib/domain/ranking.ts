import { PODIUM_NAMES_PER_STEP } from "./constants";
import type { RankedStanding, Standing } from "./types";

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Ranking policy (documented in README):
 *  1. Higher total score ranks higher.
 *  2. Players with the SAME total share a rank ("competition ranking": 1, 2, 2, 4).
 *     We never break a tie by speed, so network latency cannot decide a placing.
 *  3. Display order inside a tie is deterministic: normalised nickname, then
 *     player id. It does not imply a better placing.
 */
export function rankStandings(standings: readonly Standing[]): RankedStanding[] {
  const sorted = [...standings].sort(
    (a, b) =>
      b.score - a.score ||
      compareCodeUnits(a.nicknameKey, b.nicknameKey) ||
      compareCodeUnits(a.playerId, b.playerId),
  );
  const ranked: RankedStanding[] = [];
  let previousScore: number | null = null;
  let previousRank = 0;
  sorted.forEach((standing, index) => {
    const rank = previousScore !== null && standing.score === previousScore ? previousRank : index + 1;
    previousScore = standing.score;
    previousRank = rank;
    ranked.push({ ...standing, rank });
  });
  return ranked;
}

export interface PodiumGroup {
  /** 1, 2 or 3 — the podium step (gold / silver / bronze). */
  rank: 1 | 2 | 3;
  players: RankedStanding[];
  /** Players on this step beyond what is shown. */
  hiddenCount: number;
}

/**
 * Groups ranked players by podium step. With ties, a step can hold several
 * players and a lower step can be empty (two winners tie for 1st → no 2nd).
 * Steps with no players are omitted, so fewer than three players works.
 * Only players who scored points can stand on the podium: a medal for 0 points
 * would be misleading, and if nobody scored the podium is simply empty.
 */
export function buildPodium(ranked: readonly RankedStanding[]): PodiumGroup[] {
  const groups: PodiumGroup[] = [];
  for (const rank of [1, 2, 3] as const) {
    const players = ranked.filter((p) => p.rank === rank && p.score > 0);
    if (players.length === 0) continue;
    groups.push({
      rank,
      players: players.slice(0, PODIUM_NAMES_PER_STEP),
      hiddenCount: Math.max(0, players.length - PODIUM_NAMES_PER_STEP),
    });
  }
  return groups;
}
