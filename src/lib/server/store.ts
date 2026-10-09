import type { GamePatch } from "../domain/game-machine";
import type { AnswerRecord, Game, GameConfig, Player, Quiz, Standing } from "../domain/types";

export interface NewGameInput {
  id: string;
  pin: string;
  quizId: string;
  title: string;
  config: GameConfig;
  optionSeed: string;
  hostTokenHash: string;
  createdAt: number;
  expiresAt: number;
}

export type CreateGameResult = { ok: true; game: Game } | { ok: false; reason: "pin_taken" };

export interface NewPlayerInput {
  id: string;
  gameId: string;
  nickname: string;
  nicknameKey: string;
  tokenHash: string;
  joinedAt: number;
  maxPlayers: number;
}

export type AddPlayerResult =
  | { ok: true; player: Player }
  | { ok: false; reason: "game_not_found" | "not_lobby" | "nickname_taken" | "game_full" };

export interface NewAnswerInput {
  id: string;
  gameId: string;
  playerId: string;
  questionId: string;
  questionIndex: number;
  optionId: string;
  isCorrect: boolean;
  points: number;
  submittedAt: number;
  /** The game version the service validated against; a mismatch means the game moved on. */
  expectedVersion: number;
}

export type SubmitAnswerResult = "accepted" | "duplicate" | "stale";

export interface AnswerStats {
  total: number;
  byOption: Record<string, number>;
}

/**
 * Persistence boundary. Implementations must make every method atomic and
 * safe under concurrent callers (the Postgres store uses transactions, row
 * locks and unique constraints; the memory store relies on a single thread).
 *
 * Business rules (who may do what, deadlines, scoring) live in the service,
 * not here. The store only guarantees consistency.
 */
export interface GameStore {
  readonly kind: "memory" | "postgres";

  /** Idempotently stores an immutable quiz (content-hashed id). */
  ensureQuiz(quiz: Quiz): Promise<void>;
  getQuiz(quizId: string): Promise<Quiz | null>;

  createGame(input: NewGameInput): Promise<CreateGameResult>;
  getGameByPin(pin: string): Promise<Game | null>;

  /**
   * Atomically checks (game exists, still in lobby, below capacity, nickname
   * key free) and inserts. Closing the lobby (start) is serialised with this.
   */
  addPlayer(input: NewPlayerInput): Promise<AddPlayerResult>;
  getPlayer(gameId: string, playerId: string): Promise<Player | null>;
  touchPlayer(playerId: string, at: number): Promise<void>;
  listPlayers(gameId: string): Promise<Player[]>;
  countPlayers(gameId: string): Promise<number>;

  /** Compare-and-set: applies `patch` and bumps `version` only if `version` still matches. */
  transition(gameId: string, expectedVersion: number, patch: GamePatch): Promise<Game | null>;

  /**
   * Compare-and-set `question` → `reveal`, and in the same transaction
   * recompute every player's cumulative score from their answers.
   */
  finalizeQuestion(gameId: string, expectedVersion: number): Promise<Game | null>;

  /**
   * Inserts an answer iff the game is still at `expectedVersion` AND the player
   * has not answered this question. Serialised against `finalizeQuestion`, so
   * an answer is either counted in the reveal or rejected — never lost.
   */
  submitAnswer(input: NewAnswerInput): Promise<SubmitAnswerResult>;
  getAnswerStats(gameId: string, questionIndex: number): Promise<AnswerStats>;
  getPlayerAnswer(gameId: string, playerId: string, questionIndex: number): Promise<AnswerRecord | null>;

  /** Cumulative scores plus the points each player earned on `questionIndex`. */
  getStandings(gameId: string, questionIndex: number): Promise<Standing[]>;

  /** Housekeeping: delete games that expired before `before`. Returns rows removed. */
  deleteExpiredGames(before: number): Promise<number>;

  close(): Promise<void>;
}
