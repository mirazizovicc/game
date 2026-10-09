import { ANSWER_GRACE_MS, FIRST_QUESTION_LEAD_MS, NEXT_QUESTION_LEAD_MS } from "./constants";
import type { Game, Question } from "./types";

/**
 * Pure game state machine. Nothing here touches I/O or the clock directly:
 * callers pass `now` (server time) so every rule is unit-testable.
 *
 *   lobby ──start──▶ question ──(deadline | close | all answered)──▶ reveal
 *                       ▲  │ pause/resume (stays in "question")          │
 *                       │  └────────────────────────────────────────┐    │advance
 *                       └─────────advance────── leaderboard ◀───────┴────┘
 *                                                  reveal ──advance (last question)──▶ finished
 *   any non-finished state ──end──▶ finished
 */

export type Phase = "lobby" | "countdown" | "open" | "paused" | "reveal" | "leaderboard" | "finished";

export type HostAction = "start" | "pause" | "resume" | "close" | "advance" | "end";
export const HOST_ACTIONS: readonly HostAction[] = ["start", "pause", "resume", "close", "advance", "end"];

export interface GamePatch {
  status?: Game["status"];
  questionIndex?: number;
  opensAt?: number | null;
  closesAt?: number | null;
  pausedAt?: number | null;
}

export type ActionPlan =
  | { ok: true; kind: "patch"; patch: GamePatch }
  | { ok: true; kind: "finalize" }
  | { ok: false; code: "INVALID_ACTION" | "NO_PLAYERS"; message: string };

/** Effective time limit of a question in this game. */
export function limitMsFor(game: Pick<Game, "config">, question: Pick<Question, "timeLimitSec">): number {
  return (game.config.timeLimitSec ?? question.timeLimitSec) * 1000;
}

/** Instant after which the server refuses answers (displayed deadline + grace). */
export function answerDeadline(game: Pick<Game, "closesAt">): number | null {
  return game.closesAt === null ? null : game.closesAt + ANSWER_GRACE_MS;
}

/** True when a question's time is over and the server must finalise it (lazy timer). */
export function isOverdue(game: Game, now: number): boolean {
  const deadline = answerDeadline(game);
  return game.status === "question" && game.pausedAt === null && deadline !== null && now >= deadline;
}

export function currentPhase(game: Game, now: number): Phase {
  switch (game.status) {
    case "lobby":
      return "lobby";
    case "reveal":
      return "reveal";
    case "leaderboard":
      return "leaderboard";
    case "finished":
      return "finished";
    case "question":
      if (game.pausedAt !== null) return "paused";
      if (game.opensAt !== null && now < game.opensAt) return "countdown";
      return "open";
  }
}

/** Can a player's answer be accepted at `now`? Returns a reason when it cannot. */
export function answerWindow(game: Game, now: number): "ok" | "closed" | "paused" | "not_open" {
  if (game.status !== "question") return "closed";
  if (game.pausedAt !== null) return "paused";
  if (game.opensAt !== null && now < game.opensAt) return "not_open";
  const deadline = answerDeadline(game);
  if (deadline !== null && now >= deadline) return "closed";
  return "ok";
}

export interface PlanContext {
  now: number;
  totalQuestions: number;
  playerCount: number;
  /** Effective time limit (ms) for the question at `index`. */
  limitMsAt: (index: number) => number;
}

const invalid = (message: string): ActionPlan => ({ ok: false, code: "INVALID_ACTION", message });

export function planHostAction(game: Game, action: HostAction, ctx: PlanContext): ActionPlan {
  const { now } = ctx;
  switch (action) {
    case "start": {
      if (game.status !== "lobby") return invalid("The game has already started.");
      if (ctx.playerCount < 1) return { ok: false, code: "NO_PLAYERS", message: "At least one player must join before you can start." };
      const opensAt = now + FIRST_QUESTION_LEAD_MS;
      return { ok: true, kind: "patch", patch: { status: "question", questionIndex: 0, opensAt, closesAt: opensAt + ctx.limitMsAt(0), pausedAt: null } };
    }
    case "pause": {
      if (game.status !== "question") return invalid("Only a running question can be paused.");
      if (game.pausedAt !== null) return invalid("The question is already paused.");
      return { ok: true, kind: "patch", patch: { pausedAt: now } };
    }
    case "resume": {
      if (game.status !== "question" || game.pausedAt === null || game.opensAt === null || game.closesAt === null) {
        return invalid("The question is not paused.");
      }
      const pausedFor = Math.max(0, now - game.pausedAt);
      return { ok: true, kind: "patch", patch: { pausedAt: null, opensAt: game.opensAt + pausedFor, closesAt: game.closesAt + pausedFor } };
    }
    case "close": {
      if (game.status !== "question") return invalid("There is no running question to close.");
      return { ok: true, kind: "finalize" };
    }
    case "advance": {
      if (game.status === "reveal") {
        const isLast = game.questionIndex >= ctx.totalQuestions - 1;
        return { ok: true, kind: "patch", patch: { status: isLast ? "finished" : "leaderboard" } };
      }
      if (game.status === "leaderboard") {
        const next = game.questionIndex + 1;
        if (next >= ctx.totalQuestions) return { ok: true, kind: "patch", patch: { status: "finished" } };
        const opensAt = now + NEXT_QUESTION_LEAD_MS;
        return { ok: true, kind: "patch", patch: { status: "question", questionIndex: next, opensAt, closesAt: opensAt + ctx.limitMsAt(next), pausedAt: null } };
      }
      return invalid("Nothing to advance right now.");
    }
    case "end": {
      if (game.status === "finished") return invalid("The game is already over.");
      return { ok: true, kind: "patch", patch: { status: "finished", pausedAt: null } };
    }
  }
}
