import { describe, expect, it } from "vitest";
import { ANSWER_GRACE_MS, FIRST_QUESTION_LEAD_MS, NEXT_QUESTION_LEAD_MS } from "@/lib/domain/constants";
import { answerWindow, currentPhase, isOverdue, planHostAction, type PlanContext } from "@/lib/domain/game-machine";
import type { Game } from "@/lib/domain/types";

const NOW = 1_000_000;
const LIMIT = 20_000;

const game = (overrides: Partial<Game> = {}): Game => ({
  id: "g",
  pin: "123456",
  quizId: "q",
  title: "t",
  status: "lobby",
  questionIndex: -1,
  version: 0,
  opensAt: null,
  closesAt: null,
  pausedAt: null,
  config: { timeLimitSec: null, shuffleOptions: false },
  optionSeed: "s",
  createdAt: 0,
  expiresAt: 10 ** 12,
  hostTokenHash: "h",
  ...overrides,
});

const ctx = (overrides: Partial<PlanContext> = {}): PlanContext => ({ now: NOW, totalQuestions: 3, playerCount: 2, limitMsAt: () => LIMIT, ...overrides });
const running = (overrides: Partial<Game> = {}) =>
  game({ status: "question", questionIndex: 0, opensAt: NOW - 5_000, closesAt: NOW + 15_000, ...overrides });

describe("planHostAction", () => {
  it("start: lobby → first question with a lead-in countdown", () => {
    const plan = planHostAction(game(), "start", ctx());
    expect(plan).toEqual({
      ok: true,
      kind: "patch",
      patch: { status: "question", questionIndex: 0, opensAt: NOW + FIRST_QUESTION_LEAD_MS, closesAt: NOW + FIRST_QUESTION_LEAD_MS + LIMIT, pausedAt: null },
    });
  });

  it("start needs at least one player and can only happen from the lobby", () => {
    expect(planHostAction(game(), "start", ctx({ playerCount: 0 }))).toMatchObject({ ok: false, code: "NO_PLAYERS" });
    expect(planHostAction(running(), "start", ctx())).toMatchObject({ ok: false, code: "INVALID_ACTION" });
  });

  it("close: only while a question is running", () => {
    expect(planHostAction(running(), "close", ctx())).toEqual({ ok: true, kind: "finalize" });
    expect(planHostAction(game({ status: "reveal", questionIndex: 0 }), "close", ctx())).toMatchObject({ ok: false });
    expect(planHostAction(game(), "close", ctx())).toMatchObject({ ok: false });
  });

  it("advance: reveal → leaderboard, leaderboard → next question, last question → finished", () => {
    expect(planHostAction(game({ status: "reveal", questionIndex: 0 }), "advance", ctx())).toEqual({ ok: true, kind: "patch", patch: { status: "leaderboard" } });

    const next = planHostAction(game({ status: "leaderboard", questionIndex: 0 }), "advance", ctx());
    expect(next).toEqual({
      ok: true,
      kind: "patch",
      patch: { status: "question", questionIndex: 1, opensAt: NOW + NEXT_QUESTION_LEAD_MS, closesAt: NOW + NEXT_QUESTION_LEAD_MS + LIMIT, pausedAt: null },
    });

    expect(planHostAction(game({ status: "reveal", questionIndex: 2 }), "advance", ctx())).toEqual({ ok: true, kind: "patch", patch: { status: "finished" } });
  });

  it("advance is rejected in the lobby, during a question, and after the end", () => {
    for (const status of ["lobby", "question", "finished"] as const) {
      expect(planHostAction(game({ status }), "advance", ctx())).toMatchObject({ ok: false, code: "INVALID_ACTION" });
    }
  });

  it("pause/resume shifts both timestamps by the paused duration", () => {
    const paused = planHostAction(running(), "pause", ctx());
    expect(paused).toEqual({ ok: true, kind: "patch", patch: { pausedAt: NOW } });

    const resumed = planHostAction(running({ pausedAt: NOW - 4_000 }), "resume", ctx());
    expect(resumed).toEqual({ ok: true, kind: "patch", patch: { pausedAt: null, opensAt: NOW - 5_000 + 4_000, closesAt: NOW + 15_000 + 4_000 } });
  });

  it("cannot pause twice or resume when not paused", () => {
    expect(planHostAction(running({ pausedAt: NOW }), "pause", ctx())).toMatchObject({ ok: false });
    expect(planHostAction(running(), "resume", ctx())).toMatchObject({ ok: false });
  });

  it("end: aborts any unfinished game, but not a finished one", () => {
    for (const status of ["lobby", "question", "reveal", "leaderboard"] as const) {
      expect(planHostAction(game({ status }), "end", ctx())).toMatchObject({ ok: true });
    }
    expect(planHostAction(game({ status: "finished" }), "end", ctx())).toMatchObject({ ok: false });
  });
});

describe("timing rules", () => {
  it("derives phases from server time", () => {
    expect(currentPhase(game(), NOW)).toBe("lobby");
    expect(currentPhase(running({ opensAt: NOW + 1000, closesAt: NOW + 21_000 }), NOW)).toBe("countdown");
    expect(currentPhase(running(), NOW)).toBe("open");
    expect(currentPhase(running({ pausedAt: NOW }), NOW)).toBe("paused");
    expect(currentPhase(game({ status: "reveal" }), NOW)).toBe("reveal");
    expect(currentPhase(game({ status: "leaderboard" }), NOW)).toBe("leaderboard");
    expect(currentPhase(game({ status: "finished" }), NOW)).toBe("finished");
  });

  it("accepts answers only inside [opensAt, closesAt + grace)", () => {
    const g = running({ opensAt: NOW, closesAt: NOW + LIMIT });
    expect(answerWindow(g, NOW - 1)).toBe("not_open");
    expect(answerWindow(g, NOW)).toBe("ok");
    expect(answerWindow(g, NOW + LIMIT)).toBe("ok"); // inside the grace window
    expect(answerWindow(g, NOW + LIMIT + ANSWER_GRACE_MS - 1)).toBe("ok");
    expect(answerWindow(g, NOW + LIMIT + ANSWER_GRACE_MS)).toBe("closed");
  });

  it("refuses answers while paused or outside the question state", () => {
    expect(answerWindow(running({ pausedAt: NOW }), NOW)).toBe("paused");
    expect(answerWindow(game({ status: "reveal" }), NOW)).toBe("closed");
    expect(answerWindow(game(), NOW)).toBe("closed");
  });

  it("flags a question overdue only after deadline + grace and never while paused", () => {
    const g = running({ closesAt: NOW });
    expect(isOverdue(g, NOW + ANSWER_GRACE_MS - 1)).toBe(false);
    expect(isOverdue(g, NOW + ANSWER_GRACE_MS)).toBe(true);
    expect(isOverdue({ ...g, pausedAt: NOW - 1 }, NOW + 10 * ANSWER_GRACE_MS)).toBe(false);
    expect(isOverdue(game({ status: "reveal", closesAt: NOW - 99999 }), NOW)).toBe(false);
  });
});
