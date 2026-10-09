import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from "./constants";
import { BLOCKED_SUBSTRINGS, BLOCKED_WORDS, RESERVED_NAMES } from "./nickname-blocklist";

export type NicknameProblem =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "not_enough_letters"
  | "reserved"
  | "inappropriate";

export type NicknameResult =
  | { ok: true; nickname: string; key: string }
  | { ok: false; reason: NicknameProblem; message: string };

export const NICKNAME_MESSAGES: Record<NicknameProblem, string> = {
  empty: "Please choose a nickname.",
  too_short: `Nicknames need at least ${NICKNAME_MIN_LENGTH} characters.`,
  too_long: `Nicknames can have at most ${NICKNAME_MAX_LENGTH} characters.`,
  invalid_characters: "Use letters, numbers, spaces and . _ - ' only.",
  not_enough_letters: "Please include at least two letters or numbers.",
  reserved: "That nickname is reserved. Please pick another one.",
  inappropriate: "Please choose a respectful nickname.",
};

/**
 * Letters/numbers first, then letters, marks, numbers, space and a few
 * punctuation marks (including the Uzbek/Turkic apostrophes ʻ ʼ ’).
 * `<`, `>`, `&`, quotes and backticks are therefore impossible.
 */
const ALLOWED = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} _.'’ʻʼ-]*$/u;

/** Latin look-alikes for common Cyrillic/Greek letters, used only for the uniqueness key. */
const LOOKALIKES: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", і: "i",
  α: "a", ο: "o", ρ: "p", ν: "v", ι: "i",
};

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

function stripMarks(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "");
}

function mapChars(value: string, map: Record<string, string>): string {
  return Array.from(value, (ch) => map[ch] ?? ch).join("");
}

/** Cleans user input: Unicode-normalises and collapses whitespace. */
export function cleanNickname(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

/**
 * Case-insensitive, punctuation-insensitive identity of a nickname.
 * "Ali_B", "ali b" and "ALI.B" all map to "alib", so players cannot impersonate
 * each other with whitespace or punctuation tricks.
 */
export function nicknameKey(clean: string): string {
  const lowered = mapChars(stripMarks(clean).toLowerCase(), LOOKALIKES);
  return lowered.replace(/[^\p{L}\p{N}]/gu, "");
}

function abuseTokens(clean: string): { tokens: string[]; squashed: string } {
  const lowered = mapChars(stripMarks(clean).toLowerCase(), LOOKALIKES);
  const leeted = mapChars(lowered, LEET);
  const tokens = leeted.split(/[^\p{L}]+/u).filter(Boolean);
  return { tokens, squashed: tokens.join("") };
}

export interface NicknameOptions {
  /** Extra blocked terms (e.g. from NICKNAME_BLOCKLIST). */
  extraBlockedTerms?: readonly string[];
}

function normaliseTerm(term: string): string {
  return mapChars(stripMarks(term).toLowerCase(), LOOKALIKES).replace(/[^\p{L}]/gu, "");
}

export function validateNickname(raw: unknown, options: NicknameOptions = {}): NicknameResult {
  const fail = (reason: NicknameProblem): NicknameResult => ({ ok: false, reason, message: NICKNAME_MESSAGES[reason] });
  if (typeof raw !== "string") return fail("empty");

  const nickname = cleanNickname(raw);
  if (nickname.length === 0) return fail("empty");
  const length = Array.from(nickname).length;
  if (length < NICKNAME_MIN_LENGTH) return fail("too_short");
  if (length > NICKNAME_MAX_LENGTH) return fail("too_long");
  if (!ALLOWED.test(nickname)) return fail("invalid_characters");

  const key = nicknameKey(nickname);
  if (Array.from(key).length < NICKNAME_MIN_LENGTH) return fail("not_enough_letters");

  const { tokens, squashed } = abuseTokens(nickname);
  if (RESERVED_NAMES.some((name) => key === name || tokens.includes(name))) return fail("reserved");

  const extra = (options.extraBlockedTerms ?? []).map(normaliseTerm).filter((term) => term.length >= 2);
  const substrings = [...BLOCKED_SUBSTRINGS, ...extra.filter((term) => term.length >= 5)];
  const words = [...BLOCKED_WORDS, ...extra.filter((term) => term.length < 5)];
  const isBlocked =
    substrings.some((term) => squashed.includes(term)) || words.some((term) => tokens.includes(term) || squashed === term);
  if (isBlocked) return fail("inappropriate");

  return { ok: true, nickname, key };
}

/** Parses the NICKNAME_BLOCKLIST env value. */
export function parseBlocklist(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}
