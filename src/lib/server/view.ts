import { LEADERBOARD_SIZE, PLAYER_ACTIVE_WINDOW_MS } from "../domain/constants";
import { currentPhase, limitMsFor } from "../domain/game-machine";
import { buildPodium, rankStandings } from "../domain/ranking";
import { orderOptions } from "../domain/quiz";
import type { AnswerRecord, Game, Player, Quiz, RankedStanding, Standing } from "../domain/types";
import type { GameView, MeView, PublicQuestion, RevealView, StandingView } from "../domain/view";
import type { AnswerStats } from "./store";

export interface ViewData {
  game: Game;
  quiz: Quiz;
  now: number;
  role: "host" | "player";
  player: Player | null;
  playerCount: number;
  /** Lobby only. */
  roster: Player[] | null;
  answerStats: AnswerStats | null;
  myAnswer: AnswerRecord | null;
  /** Reveal / leaderboard / finished only. */
  standings: Standing[] | null;
}

/** Which datasets the service must load for a given game status. */
export function needsStandings(status: Game["status"]): boolean {
  return status === "reveal" || status === "leaderboard" || status === "finished";
}

export function needsAnswerStats(status: Game["status"]): boolean {
  return status === "question" || status === "reveal";
}

/**
 * Builds the response for one requester from an explicit whitelist.
 * The answer key and explanation are attached ONLY in the `reveal` phase.
 */
export function buildView(data: ViewData): GameView {
  const { game, quiz, now, role, player } = data;
  const phase = currentPhase(game, now);
  const question = game.questionIndex >= 0 ? (quiz.questions[game.questionIndex] ?? null) : null;

  // The question text is hidden during the pre-question countdown so nobody gets a head start.
  const openedBeforePause = game.pausedAt !== null && game.opensAt !== null && game.pausedAt >= game.opensAt;
  const questionVisible = phase === "open" || phase === "reveal" || phase === "leaderboard" || (phase === "paused" && openedBeforePause);

  let publicQuestion: PublicQuestion | null = null;
  if (question && questionVisible) {
    publicQuestion = {
      id: question.id,
      index: game.questionIndex,
      prompt: question.prompt,
      options: orderOptions(question.options, game.config.shuffleOptions, game.optionSeed, question.id),
      timeLimitSec: limitMsFor(game, question) / 1000,
    };
  }

  const ranked = data.standings ? rankStandings(data.standings) : null;
  const toView = (s: RankedStanding): StandingView => ({
    rank: s.rank,
    playerId: s.playerId,
    nickname: s.nickname,
    score: s.score,
    lastPoints: s.lastPoints,
    isYou: player !== null && s.playerId === player.id,
  });

  let standings: StandingView[] | null = null;
  if (ranked) {
    if (phase === "leaderboard") standings = ranked.slice(0, LEADERBOARD_SIZE).map(toView);
    else if (phase === "finished") standings = ranked.map(toView);
  }
  const myStanding = ranked && player ? ranked.find((s) => s.playerId === player.id) : undefined;
  const you: StandingView | null =
    myStanding && standings && !standings.some((s) => s.playerId === myStanding.playerId) ? toView(myStanding) : null;

  let reveal: RevealView | null = null;
  if (phase === "reveal" && question) {
    const distribution: Record<string, number> = {};
    for (const option of question.options) distribution[option.id] = data.answerStats?.byOption[option.id] ?? 0;
    reveal = {
      correctOptionId: question.correctOptionId,
      explanation: question.explanation,
      distribution,
      answeredCount: data.answerStats?.total ?? 0,
    };
  }

  let me: MeView | null = null;
  if (role === "player" && player) {
    const revealed = phase === "reveal";
    me = {
      id: player.id,
      nickname: player.nickname,
      answered: data.myAnswer !== null,
      selectedOptionId: data.myAnswer?.optionId ?? null,
      result: revealed ? { correct: data.myAnswer?.isCorrect ?? false, points: data.myAnswer?.points ?? 0 } : null,
      score: myStanding?.score ?? player.score,
      rank: myStanding?.rank ?? null,
    };
  }

  const roster =
    phase === "lobby" && data.roster
      ? data.roster.map((p) => ({ id: p.id, nickname: p.nickname, connected: now - p.lastSeenAt < PLAYER_ACTIVE_WINDOW_MS }))
      : null;

  return {
    pin: game.pin,
    title: game.title,
    role,
    status: game.status,
    phase,
    version: game.version,
    serverTime: now,
    questionIndex: game.questionIndex,
    totalQuestions: quiz.questions.length,
    opensAt: phase === "lobby" || phase === "finished" ? null : game.opensAt,
    closesAt: phase === "lobby" || phase === "finished" ? null : game.closesAt,
    remainingMsWhenPaused: game.pausedAt !== null && game.closesAt !== null ? Math.max(0, game.closesAt - game.pausedAt) : null,
    playerCount: data.playerCount,
    config: game.config,
    roster,
    question: publicQuestion,
    answeredCount: data.answerStats && (phase === "open" || phase === "paused" || phase === "countdown" || phase === "reveal") ? data.answerStats.total : null,
    me,
    reveal,
    standings,
    you,
    podium: phase === "finished" && ranked ? buildPodium(ranked) : null,
  };
}
