import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** High-entropy secret handed to a browser (host or player). */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Only the hash is stored server-side; a leaked database does not leak sessions. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string | undefined, expectedHash: string): boolean {
  if (!token) return false;
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Constant-time string comparison (for the optional host access code). */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export const cryptoRandomInt = (minInclusive: number, maxExclusive: number): number => randomInt(minInclusive, maxExclusive);
