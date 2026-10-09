import { ACCURACY_FLOOR, MAX_POINTS } from "./constants";

export interface ScoreInput {
  correct: boolean;
  /** Time left on the clock when the answer was recorded by the server. */
  remainingMs: number;
  /** The question's full time limit. */
  limitMs: number;
}

/**
 * points = round(1000 * (0.8 + 0.2 * remaining / limit)) for a correct answer,
 * with `remaining` clamped to [0, limit]. Incorrect answers score 0.
 *
 * Accuracy dominates: the fastest possible wrong answer earns 0 while the
 * slowest correct answer still earns 800.
 */
export function computePoints({ correct, remainingMs, limitMs }: ScoreInput): number {
  if (!correct) return 0;
  if (!Number.isFinite(remainingMs) || !Number.isFinite(limitMs) || limitMs <= 0) {
    return Math.round(MAX_POINTS * ACCURACY_FLOOR);
  }
  const fraction = Math.min(1, Math.max(0, remainingMs / limitMs));
  return Math.round(MAX_POINTS * (ACCURACY_FLOOR + (1 - ACCURACY_FLOOR) * fraction));
}
