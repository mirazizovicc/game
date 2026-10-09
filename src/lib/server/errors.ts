export type ErrorCode =
  | "BAD_REQUEST"
  | "INVALID_NICKNAME"
  | "GAME_NOT_FOUND"
  | "GAME_EXPIRED"
  | "GAME_STARTED"
  | "NICKNAME_TAKEN"
  | "GAME_FULL"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "QUESTION_CLOSED"
  | "QUESTION_NOT_OPEN"
  | "QUESTION_PAUSED"
  | "ALREADY_ANSWERED"
  | "INVALID_OPTION"
  | "STALE_STATE"
  | "INVALID_ACTION"
  | "NO_PLAYERS"
  | "BACKEND_NOT_CONFIGURED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  INVALID_NICKNAME: 400,
  INVALID_OPTION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  GAME_NOT_FOUND: 404,
  GAME_EXPIRED: 410,
  GAME_STARTED: 409,
  NICKNAME_TAKEN: 409,
  GAME_FULL: 409,
  QUESTION_CLOSED: 409,
  QUESTION_NOT_OPEN: 409,
  QUESTION_PAUSED: 409,
  ALREADY_ANSWERED: 409,
  STALE_STATE: 409,
  INVALID_ACTION: 409,
  NO_PLAYERS: 409,
  RATE_LIMITED: 429,
  BACKEND_NOT_CONFIGURED: 503,
  INTERNAL: 500,
};

/** An error whose message is safe to show to the end user. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}
