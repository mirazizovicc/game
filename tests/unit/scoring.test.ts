import { describe, expect, it } from "vitest";
import { computePoints } from "@/lib/domain/scoring";

const limitMs = 20_000;

describe("computePoints", () => {
  it("awards 1000 for an instant correct answer", () => {
    expect(computePoints({ correct: true, remainingMs: limitMs, limitMs })).toBe(1000);
  });

  it("awards 800 for a correct answer at the buzzer", () => {
    expect(computePoints({ correct: true, remainingMs: 0, limitMs })).toBe(800);
  });

  it("follows points = round(1000 * (0.8 + 0.2 * remaining / limit))", () => {
    expect(computePoints({ correct: true, remainingMs: 10_000, limitMs })).toBe(900);
    expect(computePoints({ correct: true, remainingMs: 5_000, limitMs })).toBe(850);
    expect(computePoints({ correct: true, remainingMs: 1_234, limitMs })).toBe(Math.round(1000 * (0.8 + 0.2 * (1234 / 20000))));
  });

  it("clamps remaining time: late (grace-window) answers get the minimum, never less", () => {
    expect(computePoints({ correct: true, remainingMs: -400, limitMs })).toBe(800);
  });

  it("clamps remaining time above the limit (pause/clock skew) to the maximum", () => {
    expect(computePoints({ correct: true, remainingMs: limitMs * 3, limitMs })).toBe(1000);
  });

  it("gives zero for incorrect answers regardless of speed", () => {
    expect(computePoints({ correct: false, remainingMs: limitMs, limitMs })).toBe(0);
    expect(computePoints({ correct: false, remainingMs: 0, limitMs })).toBe(0);
  });

  it("keeps accuracy dominant: the slowest correct answer beats any wrong answer", () => {
    expect(computePoints({ correct: true, remainingMs: 0, limitMs })).toBeGreaterThan(computePoints({ correct: false, remainingMs: limitMs, limitMs }));
  });

  it("limits the speed bonus to 200 points", () => {
    const fastest = computePoints({ correct: true, remainingMs: limitMs, limitMs });
    const slowest = computePoints({ correct: true, remainingMs: 0, limitMs });
    expect(fastest - slowest).toBe(200);
  });

  it("is monotonic: more time left never scores less", () => {
    let previous = 0;
    for (let remaining = 0; remaining <= limitMs; remaining += 250) {
      const points = computePoints({ correct: true, remainingMs: remaining, limitMs });
      expect(points).toBeGreaterThanOrEqual(previous);
      previous = points;
    }
  });

  it("handles degenerate limits without NaN", () => {
    expect(computePoints({ correct: true, remainingMs: 100, limitMs: 0 })).toBe(800);
    expect(computePoints({ correct: true, remainingMs: Number.NaN, limitMs })).toBe(800);
  });
});
