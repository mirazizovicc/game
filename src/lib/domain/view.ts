import type { Phase } from "./game-machine";
import type { PodiumGroup } from "./ranking";
import type { GameConfig, GameStatus } from "./types";

/**
 * View-models: the ONLY shapes sent to browsers. They are built from an
 * explicit whitelist in `lib/server/view.ts`; database rows and `Question`
 * objects (which contain the answer key) are never serialised directly.
 */

export interface PublicOption {
  id: string;
  text: string;
}

export interface PublicQuestion {
  id: string;
  index: number;
  prompt: string;
  /** Already in display order (shuffled if the game shuffles options). */
  options: PublicOption[];
  timeLimitSec: number;
}

export interface RosterEntry {
  id: string;
  nickname: string;
  connected: boolean;
}

export interface StandingView {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
  lastPoints: number;
  isYou: boolean;
}

export interface RevealView {
  correctOptionId: string;
  explanation: string;
  /** Number of players per option id. Aggregate only — never who picked what. */
  distribution: Record<string, number>;
  answeredCount: number;
}

export interface MeView {
  id: string;
  nickname: string;
  /** Has this player answered the current question? */
  answered: boolean;
  /** The player's OWN selection (never anyone else's). */
  selectedOptionId: string | null;
  /** Present from the reveal onward. */
  result: { correct: boolean; points: number } | null;
  score: number;
  rank: number | null;
}

export interface GameView {
  pin: string;
  title: string;
  role: "host" | "player";
  status: GameStatus;
  phase: Phase;
  version: number;
  /** Server clock at response time; clients derive an offset for countdowns. */
  serverTime: number;
  questionIndex: number;
  totalQuestions: number;
  opensAt: number | null;
  closesAt: number | null;
  /** While paused: time left on the clock. */
  remainingMsWhenPaused: number | null;
  playerCount: number;
  config: GameConfig;
  /** Lobby only. */
  roster: RosterEntry[] | null;
  /** Visible only once the question has opened. */
  question: PublicQuestion | null;
  /** Number of players who have answered the current question. */
  answeredCount: number | null;
  me: MeView | null;
  /** Reveal / leaderboard phases. */
  reveal: RevealView | null;
  /** Leaderboard (top N) or, when finished, everyone. */
  standings: StandingView[] | null;
  /** The requesting player's own standing if they are not in `standings`. */
  you: StandingView | null;
  podium: PodiumGroup[] | null;
}

export interface JoinInfo {
  pin: string;
  title: string;
  joinable: boolean;
  playerCount: number;
}
