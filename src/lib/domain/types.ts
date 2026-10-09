/** Core domain types shared by the server stores, services and view-models. */

export type GameStatus = "lobby" | "question" | "reveal" | "leaderboard" | "finished";

export interface GameConfig {
  /** Overrides every question's own time limit when set. */
  timeLimitSec: number | null;
  /** Shuffle the on-screen order of answer options (correctness is by option id). */
  shuffleOptions: boolean;
}

export interface Game {
  id: string;
  /** Public, human-typeable join code. */
  pin: string;
  quizId: string;
  title: string;
  status: GameStatus;
  /** -1 while in the lobby. */
  questionIndex: number;
  /** Incremented by every state transition; used for compare-and-set. */
  version: number;
  /** Epoch ms. When the current question becomes visible/answerable. */
  opensAt: number | null;
  /** Epoch ms. Displayed deadline of the current question (shifted by pauses). */
  closesAt: number | null;
  /** Epoch ms when the host paused the current question, or null. */
  pausedAt: number | null;
  config: GameConfig;
  /** Seed so host and every player see the same option order. */
  optionSeed: string;
  createdAt: number;
  expiresAt: number;
  /** SHA-256 of the host secret. The secret itself is never stored. */
  hostTokenHash: string;
}

export interface Player {
  id: string;
  gameId: string;
  nickname: string;
  /** Normalised nickname used for case-insensitive uniqueness. */
  nicknameKey: string;
  score: number;
  joinedAt: number;
  lastSeenAt: number;
  /** SHA-256 of the player's secret. */
  tokenHash: string;
}

export interface QuizOption {
  id: string;
  text: string;
}

/** Server-side question including the answer key. NEVER send this to clients. */
export interface Question {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
  timeLimitSec: number;
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

export interface AnswerRecord {
  id: string;
  gameId: string;
  playerId: string;
  questionId: string;
  questionIndex: number;
  optionId: string;
  submittedAt: number;
  isCorrect: boolean;
  points: number;
}

export interface Standing {
  playerId: string;
  nickname: string;
  nicknameKey: string;
  score: number;
  /** Points earned in the most recently finalised question. */
  lastPoints: number;
}

export interface RankedStanding extends Standing {
  /** Competition ranking: equal scores share a rank (1, 2, 2, 4). */
  rank: number;
}
