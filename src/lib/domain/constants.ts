/** Tunable game rules. Every business rule number lives here so it can be documented and tested. */

export const PIN_LENGTH = 6;

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 16;

/** Hard cap on players per game (protects the DB and the projector layout). */
export const MAX_PLAYERS = 150;

/** Scoring: a correct answer is worth 800–1000 points; speed only moves the last 200. */
export const MAX_POINTS = 1000;
export const ACCURACY_FLOOR = 0.8;

/**
 * Network-fairness grace period. The server keeps accepting answers this long
 * after the displayed deadline so a slow connection does not lose an answer
 * that the student submitted in time. Late answers inside the grace window
 * earn the same as an answer at the buzzer (the minimum correct score).
 */
export const ANSWER_GRACE_MS = 600;

/** Lead-in before a question opens, so every device has time to receive it. */
export const FIRST_QUESTION_LEAD_MS = 3000;
export const NEXT_QUESTION_LEAD_MS = 2000;

export const DEFAULT_TIME_LIMIT_SEC = 20;
export const MIN_TIME_LIMIT_SEC = 5;
export const MAX_TIME_LIMIT_SEC = 120;

/** A game (and its PIN) stops working this long after creation. */
export const GAME_TTL_MS = 6 * 60 * 60 * 1000;

/** A player counts as "connected" if the server heard from them this recently. */
export const PLAYER_ACTIVE_WINDOW_MS = 25_000;
/** `last_seen_at` is only written this often, to avoid one write per poll. */
export const PLAYER_TOUCH_INTERVAL_MS = 10_000;

export const LEADERBOARD_SIZE = 5;
export const PODIUM_NAMES_PER_STEP = 4;
