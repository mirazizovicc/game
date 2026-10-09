/**
 * Default nickname abuse list. Deliberately small and conservative: it is a
 * first line of defence, not a moderation system. Extend it per classroom with
 * the NICKNAME_BLOCKLIST environment variable (comma-separated). The host can
 * also see every nickname on the projector before starting the game.
 *
 * Matching rules (see nickname.ts): BLOCKED_SUBSTRINGS match anywhere inside
 * the nickname after leetspeak/lookalike normalisation; BLOCKED_WORDS must
 * match a whole word, which avoids false positives on innocent names such as
 * "Hancock", "Canal" or "Nazila". Extra terms from the environment follow
 * the same rule by length: 5+ letters match anywhere, shorter ones as words.
 */
export const BLOCKED_SUBSTRINGS: readonly string[] = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "cunt",
  "whore",
  "slut",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "hitler",
  "killyourself",
];

/** Matched only as whole words/tokens, because they appear inside innocent names and words. */
export const BLOCKED_WORDS: readonly string[] = ["dick", "cock", "pussy", "rape", "rapist", "nazi", "porn", "sex", "cum", "tits", "anal"];

/** Names that could be mistaken for the presenter or the system. */
export const RESERVED_NAMES: readonly string[] = [
  "host",
  "teacher",
  "admin",
  "administrator",
  "moderator",
  "professor",
  "presenter",
  "instructor",
  "lecturer",
  "system",
  "official",
  "staff",
];
