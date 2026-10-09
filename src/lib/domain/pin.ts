import { PIN_LENGTH } from "./constants";

export type RandomInt = (minInclusive: number, maxExclusive: number) => number;

const PIN_PATTERN = new RegExp(`^[0-9]{${PIN_LENGTH}}$`);

export function isValidPin(value: string): boolean {
  return PIN_PATTERN.test(value);
}

/** Extracts digits from user input ("123 456" → "123456"). */
export function normalizePin(value: string): string {
  return value.replace(/\D/g, "");
}

/** Generates a PIN without a leading zero (easier to read aloud and type). */
export function generatePin(randomInt: RandomInt): string {
  const min = 10 ** (PIN_LENGTH - 1);
  const max = 10 ** PIN_LENGTH;
  return String(randomInt(min, max));
}

export class PinAllocationError extends Error {
  constructor(attempts: number) {
    super(`Could not allocate a unique game PIN after ${attempts} attempts`);
    this.name = "PinAllocationError";
  }
}

/**
 * Repeatedly generates PINs until `tryClaim` accepts one. `tryClaim` must be
 * atomic (the store's unique constraint decides), so two hosts creating games
 * at the same moment can never receive the same PIN.
 */
export async function allocatePin<T>(
  randomInt: RandomInt,
  tryClaim: (pin: string) => Promise<T | null>,
  maxAttempts = 20,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const claimed = await tryClaim(generatePin(randomInt));
    if (claimed !== null) return claimed;
  }
  throw new PinAllocationError(maxAttempts);
}
