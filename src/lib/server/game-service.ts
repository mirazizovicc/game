import { GAME_TTL_MS, MAX_PLAYERS, PLAYER_TOUCH_INTERVAL_MS } from "../domain/constants";
import {
  answerWindow,
  isOverdue,
  limitMsFor,
  planHostAction,
  type HostAction,
} from "../domain/game-machine";
import { allocatePin, isValidPin, type RandomInt } from "../domain/pin";
import { computePoints } from "../domain/scoring";
import { validateNickname } from "../domain/nickname";
import type { CreateGameInput } from "../domain/schemas";
import type { Game, Player, Quiz } from "../domain/types";
import type { GameView, JoinInfo } from "../domain/view";
import { AppError } from "./errors";
import type { RateLimiter } from "./rate-limiter";
import type { GameStore } from "./store";
import { hashToken, safeEqual, tokenMatches } from "./tokens";
import { buildView, needsAnswerStats, needsStandings } from "./view";

export interface ServiceDeps {
  store: GameStore;
  quiz: Quiz;
  now: () => number;
  randomInt: RandomInt;
  newId: () => string;
  newToken: () => string;
  rateLimiter: RateLimiter;
  hostAccessCode: string | null;
  extraBlockedTerms: readonly string[];
}

export interface Credentials {
  /** Value of the host cookie for this PIN. */
  hostToken?: string;
  /** Value of the player cookie for this PIN: `${playerId}.${secret}`. */
  playerCookie?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MINUTE = 60_000;

export function createGameService(deps: ServiceDeps) {
  const { store, now, rateLimiter } = deps;
  const quizCache = new Map<string, Quiz>();

  function throttle(key: string, max: number, windowMs: number, message = "Too many requests. Please wait a moment and try again."): void {
    if (!rateLimiter.allow(key, max, windowMs)) throw new AppError("RATE_LIMITED", message);
  }

  async function loadQuiz(quizId: string): Promise<Quiz> {
    const cached = quizCache.get(quizId);
    if (cached) return cached;
    const quiz = await store.getQuiz(quizId);
    if (!quiz) throw new Error(`Quiz ${quizId} is missing from the store`);
    quizCache.set(quizId, quiz);
    return quiz;
  }

  async function loadGame(pin: string): Promise<Game> {
    if (!isValidPin(pin)) throw new AppError("GAME_NOT_FOUND", "That PIN doesn't match any game. Check the number on the screen.");
    const game = await store.getGameByPin(pin);
    if (!game) throw new AppError("GAME_NOT_FOUND", "That PIN doesn't match any game. Check the number on the screen.");
    if (now() >= game.expiresAt) throw new AppError("GAME_EXPIRED", "This game has expired. Ask your host for a new PIN.");
    return game;
  }

  /**
   * Server-side timers: serverless functions have no background clock, so a
   * question whose deadline has passed is finalised lazily by whichever request
   * notices first. The compare-and-set makes this safe when many requests race.
   */
  async function settle(game: Game): Promise<Game> {
    if (!isOverdue(game, now())) return game;
    const finalized = await store.finalizeQuestion(game.id, game.version);
    if (finalized) return finalized;
    return (await store.getGameByPin(game.pin)) ?? game;
  }

  async function authenticatePlayer(game: Game, creds: Credentials): Promise<Player | null> {
    const cookie = creds.playerCookie;
    if (!cookie) return null;
    const dot = cookie.indexOf(".");
    if (dot < 0) return null;
    const playerId = cookie.slice(0, dot);
    const secret = cookie.slice(dot + 1);
    if (!UUID.test(playerId)) return null;
    const player = await store.getPlayer(game.id, playerId);
    return player && tokenMatches(secret, player.tokenHash) ? player : null;
  }

  function isHost(game: Game, creds: Credentials): boolean {
    return tokenMatches(creds.hostToken, game.hostTokenHash);
  }

  return {
    async createGame(input: CreateGameInput, clientKey: string): Promise<{ pin: string; hostToken: string; expiresAt: number }> {
      throttle(`create:${clientKey}`, 20, 10 * MINUTE);
      if (deps.hostAccessCode !== null && !safeEqual(input.accessCode ?? "", deps.hostAccessCode)) {
        // Failed guesses count double against the limit.
        throttle(`create-fail:${clientKey}`, 8, 10 * MINUTE, "Too many incorrect access codes. Try again in a few minutes.");
        throw new AppError("FORBIDDEN", "That host access code is not correct.");
      }

      const startedAt = now();
      await store.ensureQuiz(deps.quiz);
      // Housekeeping: drop games that expired more than a day ago. Never blocks creation.
      store.deleteExpiredGames(startedAt - 24 * 60 * MINUTE).catch((error: unknown) => console.error("[game-service] expired-game cleanup failed", error));

      const hostToken = deps.newToken();
      const game = await allocatePin(deps.randomInt, async (pin) => {
        const result = await store.createGame({
          id: deps.newId(),
          pin,
          quizId: deps.quiz.id,
          title: deps.quiz.title,
          config: { timeLimitSec: input.timeLimitSec ?? null, shuffleOptions: input.shuffleOptions ?? false },
          optionSeed: deps.newToken(),
          hostTokenHash: hashToken(hostToken),
          createdAt: startedAt,
          expiresAt: startedAt + GAME_TTL_MS,
        });
        return result.ok ? result.game : null;
      });
      return { pin: game.pin, hostToken, expiresAt: game.expiresAt };
    },

    async getJoinInfo(pin: string, clientKey: string): Promise<JoinInfo> {
      throttle(`pin:${clientKey}`, 60, MINUTE, "Too many attempts. Please wait a minute and try again.");
      const game = await loadGame(pin);
      return { pin: game.pin, title: game.title, joinable: game.status === "lobby", playerCount: await store.countPlayers(game.id) };
    },

    async joinGame(
      pin: string,
      rawNickname: string,
      creds: Credentials,
      clientKey: string,
    ): Promise<{ player: { id: string; nickname: string }; cookieValue: string; rejoined: boolean }> {
      throttle(`join:${clientKey}`, 80, MINUTE, "Too many join attempts from this network. Please wait a minute.");
      const game = await loadGame(pin);

      // Reconnection: a valid player cookie means "this is the same browser" — return the same player.
      const existing = await authenticatePlayer(game, creds);
      if (existing && creds.playerCookie) {
        return { player: { id: existing.id, nickname: existing.nickname }, cookieValue: creds.playerCookie, rejoined: true };
      }

      if (game.status !== "lobby") {
        throw new AppError("GAME_STARTED", "This game has already started, so new players can't join. Ask the host to create a new game.");
      }
      const nickname = validateNickname(rawNickname, { extraBlockedTerms: deps.extraBlockedTerms });
      if (!nickname.ok) throw new AppError("INVALID_NICKNAME", nickname.message, { reason: nickname.reason });

      const secret = deps.newToken();
      const result = await store.addPlayer({
        id: deps.newId(),
        gameId: game.id,
        nickname: nickname.nickname,
        nicknameKey: nickname.key,
        tokenHash: hashToken(secret),
        joinedAt: now(),
        maxPlayers: MAX_PLAYERS,
      });
      if (!result.ok) {
        switch (result.reason) {
          case "nickname_taken":
            throw new AppError("NICKNAME_TAKEN", "Someone already has that nickname in this game. Try another one.");
          case "game_full":
            throw new AppError("GAME_FULL", "This game is full.");
          case "not_lobby":
            throw new AppError("GAME_STARTED", "This game has already started, so new players can't join. Ask the host to create a new game.");
          case "game_not_found":
            throw new AppError("GAME_NOT_FOUND", "That PIN doesn't match any game.");
        }
      }
      return {
        player: { id: result.player.id, nickname: result.player.nickname },
        cookieValue: `${result.player.id}.${secret}`,
        rejoined: false,
      };
    },

    async getState(pin: string, role: "host" | "player", creds: Credentials): Promise<GameView> {
      let game = await loadGame(pin);
      let player: Player | null = null;

      if (role === "host") {
        if (!isHost(game, creds)) throw new AppError("UNAUTHORIZED", "This browser is not the host of this game.");
        throttle(`state:host:${game.id}`, 60, 10_000);
      } else {
        player = await authenticatePlayer(game, creds);
        if (!player) throw new AppError("UNAUTHORIZED", "You haven't joined this game on this device.");
        throttle(`state:${player.id}`, 60, 10_000);
      }

      game = await settle(game);
      const quiz = await loadQuiz(game.quizId);
      const at = now();

      if (player && at - player.lastSeenAt > PLAYER_TOUCH_INTERVAL_MS) {
        try {
          await store.touchPlayer(player.id, at);
        } catch (error) {
          console.error("[game-service] could not record player activity", error);
        }
      }

      const inLobby = game.status === "lobby";
      const [roster, answerStats, standings, myAnswer, playerCountOnly] = await Promise.all([
        inLobby ? store.listPlayers(game.id) : Promise.resolve(null),
        needsAnswerStats(game.status) ? store.getAnswerStats(game.id, game.questionIndex) : Promise.resolve(null),
        needsStandings(game.status) ? store.getStandings(game.id, game.questionIndex) : Promise.resolve(null),
        player && game.questionIndex >= 0 ? store.getPlayerAnswer(game.id, player.id, game.questionIndex) : Promise.resolve(null),
        inLobby ? Promise.resolve(0) : store.countPlayers(game.id),
      ]);

      return buildView({
        game,
        quiz,
        now: at,
        role,
        player,
        playerCount: roster ? roster.length : playerCountOnly,
        roster,
        answerStats,
        myAnswer,
        standings,
      });
    },

    async submitAnswer(
      pin: string,
      creds: Credentials,
      input: { questionIndex: number; optionId: string },
    ): Promise<{ accepted: true }> {
      let game = await loadGame(pin);
      const player = await authenticatePlayer(game, creds);
      if (!player) throw new AppError("UNAUTHORIZED", "You haven't joined this game on this device.");
      throttle(`answer:${player.id}`, 30, MINUTE);

      game = await settle(game);
      const at = now();
      if (game.status !== "question" || input.questionIndex !== game.questionIndex) {
        throw new AppError("QUESTION_CLOSED", "Time's up — this question is closed.");
      }
      const window = answerWindow(game, at);
      if (window === "paused") throw new AppError("QUESTION_PAUSED", "The host paused the game. Hold on!");
      if (window === "not_open") throw new AppError("QUESTION_NOT_OPEN", "The question hasn't started yet.");
      if (window === "closed") throw new AppError("QUESTION_CLOSED", "Time's up — this question is closed.");

      const quiz = await loadQuiz(game.quizId);
      const question = quiz.questions[game.questionIndex];
      if (!question || game.closesAt === null) throw new Error("Game is in the question state without a question or deadline");
      if (!question.options.some((option) => option.id === input.optionId)) {
        throw new AppError("INVALID_OPTION", "That isn't one of the answer options.");
      }

      // Everything below is computed on the server from authoritative data.
      const isCorrect = input.optionId === question.correctOptionId;
      const points = computePoints({
        correct: isCorrect,
        remainingMs: game.closesAt - at, // negative inside the grace window → clamped to 0
        limitMs: limitMsFor(game, question),
      });

      const result = await store.submitAnswer({
        id: deps.newId(),
        gameId: game.id,
        playerId: player.id,
        questionId: question.id,
        questionIndex: game.questionIndex,
        optionId: input.optionId,
        isCorrect,
        points,
        submittedAt: at,
        expectedVersion: game.version,
      });
      if (result === "duplicate") {
        throw new AppError("ALREADY_ANSWERED", "You've already answered this question — your first answer counts.");
      }
      if (result === "stale") throw new AppError("QUESTION_CLOSED", "Time's up — this question is closed.");

      // Everyone has answered → no reason to wait for the clock.
      const [stats, total] = await Promise.all([store.getAnswerStats(game.id, game.questionIndex), store.countPlayers(game.id)]);
      if (stats.total >= total) await store.finalizeQuestion(game.id, game.version);

      return { accepted: true };
    },

    async hostAction(pin: string, creds: Credentials, input: { action: HostAction; expectedVersion: number }): Promise<{ version: number }> {
      let game = await loadGame(pin);
      if (!isHost(game, creds)) throw new AppError("FORBIDDEN", "Only the host of this game can do that.");
      throttle(`host-action:${game.id}`, 120, MINUTE);

      game = await settle(game);
      if (input.expectedVersion !== game.version) {
        // Double-click or a stale screen: nothing is applied, the client re-syncs.
        throw new AppError("STALE_STATE", "The game moved on before that click arrived.");
      }

      const quiz = await loadQuiz(game.quizId);
      const plan = planHostAction(game, input.action, {
        now: now(),
        totalQuestions: quiz.questions.length,
        playerCount: input.action === "start" ? await store.countPlayers(game.id) : 0,
        limitMsAt: (index) => limitMsFor(game, quiz.questions[index] ?? { timeLimitSec: 20 }),
      });
      if (!plan.ok) throw new AppError(plan.code, plan.message);

      const updated =
        plan.kind === "finalize"
          ? await store.finalizeQuestion(game.id, game.version)
          : await store.transition(game.id, game.version, plan.patch);
      if (!updated) throw new AppError("STALE_STATE", "The game moved on before that click arrived.");
      return { version: updated.version };
    },
  };
}

export type GameService = ReturnType<typeof createGameService>;
