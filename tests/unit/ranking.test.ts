import { describe, expect, it } from "vitest";
import { buildPodium, rankStandings } from "@/lib/domain/ranking";
import type { Standing } from "@/lib/domain/types";

const s = (nickname: string, score: number, lastPoints = 0): Standing => ({
  playerId: `id-${nickname}`,
  nickname,
  nicknameKey: nickname.toLowerCase(),
  score,
  lastPoints,
});

describe("rankStandings", () => {
  it("sorts by score descending and numbers ranks", () => {
    const ranked = rankStandings([s("b", 100), s("a", 300), s("c", 200)]);
    expect(ranked.map((r) => [r.nickname, r.rank])).toEqual([["a", 1], ["c", 2], ["b", 3]]);
  });

  it("gives tied players a shared rank and skips the next rank (1, 2, 2, 4)", () => {
    const ranked = rankStandings([s("a", 900), s("b", 700), s("c", 700), s("d", 100)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("orders ties deterministically regardless of input order", () => {
    const players = [s("zed", 500), s("amy", 500), s("kim", 500)];
    const forward = rankStandings(players).map((r) => r.nickname);
    const reversed = rankStandings([...players].reverse()).map((r) => r.nickname);
    expect(forward).toEqual(["amy", "kim", "zed"]);
    expect(reversed).toEqual(forward);
  });

  it("does not use speed (lastPoints) to break ties", () => {
    const ranked = rankStandings([s("b", 500, 900), s("a", 500, 100)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1]);
  });

  it("handles an empty game", () => {
    expect(rankStandings([])).toEqual([]);
  });
});

describe("buildPodium", () => {
  it("builds gold, silver and bronze for three or more players", () => {
    const podium = buildPodium(rankStandings([s("a", 3000), s("b", 2000), s("c", 1000), s("d", 10)]));
    expect(podium.map((g) => [g.rank, g.players.map((p) => p.nickname)])).toEqual([[1, ["a"]], [2, ["b"]], [3, ["c"]]]);
  });

  it("gives no medal for zero points (nobody scored → empty podium)", () => {
    expect(buildPodium(rankStandings([s("a", 0), s("b", 0)]))).toEqual([]);
    const podium = buildPodium(rankStandings([s("a", 500), s("b", 0), s("c", 0)]));
    expect(podium.map((g) => [g.rank, g.players.map((p) => p.nickname)])).toEqual([[1, ["a"]]]);
  });

  it("works with fewer than three players", () => {
    expect(buildPodium(rankStandings([s("a", 1000)])).map((g) => g.rank)).toEqual([1]);
    expect(buildPodium(rankStandings([s("a", 1000), s("b", 500)])).map((g) => g.rank)).toEqual([1, 2]);
    expect(buildPodium([])).toEqual([]);
  });

  it("shows co-winners on the same step and leaves the skipped step empty", () => {
    const podium = buildPodium(rankStandings([s("a", 900), s("b", 900), s("c", 400), s("d", 100)]));
    expect(podium.map((g) => [g.rank, g.players.map((p) => p.nickname)])).toEqual([[1, ["a", "b"]], [3, ["c"]]]);
  });

  it("caps the names per step and reports how many are hidden", () => {
    const many = Array.from({ length: 9 }, (_, i) => s(`p${i}`, 100));
    const [first] = buildPodium(rankStandings(many));
    expect(first?.players).toHaveLength(4);
    expect(first?.hiddenCount).toBe(5);
  });
});
