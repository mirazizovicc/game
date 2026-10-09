import type { GamePatch } from "../domain/game-machine";
import type { AnswerRecord, Game, Player, Quiz, Standing } from "../domain/types";
import type {
  AddPlayerResult,
  AnswerStats,
  CreateGameResult,
  GameStore,
  NewAnswerInput,
  NewGameInput,
  NewPlayerInput,
  SubmitAnswerResult,
} from "./store";

/**
 * In-process store for LOCAL DEMO MODE ONLY.
 *
 * It is NOT suitable for production: data lives in one Node process, so it is
 * lost on restart and is not shared between serverless instances. Every method
 * is synchronous inside, which makes each one trivially atomic.
 */
export class MemoryStore implements GameStore {
  readonly kind = "memory" as const;
  private quizzes = new Map<string, Quiz>();
  private games = new Map<string, Game>();
  private pinIndex = new Map<string, string>();
  private players = new Map<string, Player>();
  private answers = new Map<string, AnswerRecord>();

  async ensureQuiz(quiz: Quiz): Promise<void> {
    if (!this.quizzes.has(quiz.id)) this.quizzes.set(quiz.id, structuredClone(quiz));
  }

  async getQuiz(quizId: string): Promise<Quiz | null> {
    const quiz = this.quizzes.get(quizId);
    return quiz ? structuredClone(quiz) : null;
  }

  async createGame(input: NewGameInput): Promise<CreateGameResult> {
    const holderId = this.pinIndex.get(input.pin);
    const holder = holderId ? this.games.get(holderId) : undefined;
    if (holder && holder.expiresAt < input.createdAt) this.removeGame(holder.id); // expired games free their PIN
    else if (holder) return { ok: false, reason: "pin_taken" };
    if (!this.quizzes.has(input.quizId)) throw new Error(`Unknown quiz ${input.quizId}`);
    const game: Game = {
      id: input.id,
      pin: input.pin,
      quizId: input.quizId,
      title: input.title,
      status: "lobby",
      questionIndex: -1,
      version: 0,
      opensAt: null,
      closesAt: null,
      pausedAt: null,
      config: { ...input.config },
      optionSeed: input.optionSeed,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      hostTokenHash: input.hostTokenHash,
    };
    this.games.set(game.id, game);
    this.pinIndex.set(game.pin, game.id);
    return { ok: true, game: structuredClone(game) };
  }

  async getGameByPin(pin: string): Promise<Game | null> {
    const id = this.pinIndex.get(pin);
    const game = id ? this.games.get(id) : undefined;
    return game ? structuredClone(game) : null;
  }

  async addPlayer(input: NewPlayerInput): Promise<AddPlayerResult> {
    const game = this.games.get(input.gameId);
    if (!game) return { ok: false, reason: "game_not_found" };
    if (game.status !== "lobby") return { ok: false, reason: "not_lobby" };
    const existing = [...this.players.values()].filter((p) => p.gameId === input.gameId);
    if (existing.some((p) => p.nicknameKey === input.nicknameKey)) return { ok: false, reason: "nickname_taken" };
    if (existing.length >= input.maxPlayers) return { ok: false, reason: "game_full" };
    const player: Player = {
      id: input.id,
      gameId: input.gameId,
      nickname: input.nickname,
      nicknameKey: input.nicknameKey,
      score: 0,
      joinedAt: input.joinedAt,
      lastSeenAt: input.joinedAt,
      tokenHash: input.tokenHash,
    };
    this.players.set(player.id, player);
    return { ok: true, player: { ...player } };
  }

  async getPlayer(gameId: string, playerId: string): Promise<Player | null> {
    const player = this.players.get(playerId);
    return player && player.gameId === gameId ? { ...player } : null;
  }

  async touchPlayer(playerId: string, at: number): Promise<void> {
    const player = this.players.get(playerId);
    if (player) player.lastSeenAt = at;
  }

  async listPlayers(gameId: string): Promise<Player[]> {
    return [...this.players.values()]
      .filter((p) => p.gameId === gameId)
      .sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1))
      .map((p) => ({ ...p }));
  }

  async countPlayers(gameId: string): Promise<number> {
    return [...this.players.values()].filter((p) => p.gameId === gameId).length;
  }

  async transition(gameId: string, expectedVersion: number, patch: GamePatch): Promise<Game | null> {
    const game = this.games.get(gameId);
    if (!game || game.version !== expectedVersion) return null;
    Object.assign(game, patch);
    game.version += 1;
    return structuredClone(game);
  }

  async finalizeQuestion(gameId: string, expectedVersion: number): Promise<Game | null> {
    const game = this.games.get(gameId);
    if (!game || game.version !== expectedVersion || game.status !== "question") return null;
    game.status = "reveal";
    game.pausedAt = null;
    game.version += 1;
    for (const player of this.players.values()) {
      if (player.gameId !== gameId) continue;
      player.score = [...this.answers.values()]
        .filter((a) => a.playerId === player.id)
        .reduce((sum, a) => sum + a.points, 0);
    }
    return structuredClone(game);
  }

  async submitAnswer(input: NewAnswerInput): Promise<SubmitAnswerResult> {
    const game = this.games.get(input.gameId);
    if (!game || game.version !== input.expectedVersion || game.status !== "question") return "stale";
    const player = this.players.get(input.playerId);
    if (!player || player.gameId !== input.gameId) return "stale";
    const duplicate = [...this.answers.values()].some(
      (a) => a.playerId === input.playerId && a.questionIndex === input.questionIndex,
    );
    if (duplicate) return "duplicate";
    this.answers.set(input.id, {
      id: input.id,
      gameId: input.gameId,
      playerId: input.playerId,
      questionId: input.questionId,
      questionIndex: input.questionIndex,
      optionId: input.optionId,
      submittedAt: input.submittedAt,
      isCorrect: input.isCorrect,
      points: input.points,
    });
    return "accepted";
  }

  async getAnswerStats(gameId: string, questionIndex: number): Promise<AnswerStats> {
    const byOption: Record<string, number> = {};
    let total = 0;
    for (const answer of this.answers.values()) {
      if (answer.gameId !== gameId || answer.questionIndex !== questionIndex) continue;
      byOption[answer.optionId] = (byOption[answer.optionId] ?? 0) + 1;
      total += 1;
    }
    return { total, byOption };
  }

  async getPlayerAnswer(gameId: string, playerId: string, questionIndex: number): Promise<AnswerRecord | null> {
    for (const answer of this.answers.values()) {
      if (answer.gameId === gameId && answer.playerId === playerId && answer.questionIndex === questionIndex) {
        return { ...answer };
      }
    }
    return null;
  }

  async getStandings(gameId: string, questionIndex: number): Promise<Standing[]> {
    return [...this.players.values()]
      .filter((p) => p.gameId === gameId)
      .map((p) => {
        const answer = [...this.answers.values()].find((a) => a.playerId === p.id && a.questionIndex === questionIndex);
        return {
          playerId: p.id,
          nickname: p.nickname,
          nicknameKey: p.nicknameKey,
          score: p.score,
          lastPoints: answer?.points ?? 0,
        };
      });
  }

  private removeGame(gameId: string): void {
    const game = this.games.get(gameId);
    if (!game) return;
    this.games.delete(game.id);
    this.pinIndex.delete(game.pin);
    for (const player of [...this.players.values()]) if (player.gameId === game.id) this.players.delete(player.id);
    for (const answer of [...this.answers.values()]) if (answer.gameId === game.id) this.answers.delete(answer.id);
  }

  async deleteExpiredGames(before: number): Promise<number> {
    const expired = [...this.games.values()].filter((game) => game.expiresAt < before);
    for (const game of expired) this.removeGame(game.id);
    return expired.length;
  }

  async close(): Promise<void> {
    // Nothing to release.
  }
}
