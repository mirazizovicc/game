import { describe, expect, it } from "vitest";
import { allocatePin, generatePin, isValidPin, normalizePin, PinAllocationError } from "@/lib/domain/pin";

describe("PIN generation", () => {
  it("generates 6 digits with no leading zero", () => {
    for (let i = 0; i < 1000; i += 1) {
      const pin = generatePin((min, max) => min + Math.floor(Math.random() * (max - min)));
      expect(pin).toMatch(/^[1-9][0-9]{5}$/);
    }
  });

  it("validates and normalises user input", () => {
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("12345a")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(normalizePin(" 123 456 ")).toBe("123456");
  });
});

describe("allocatePin", () => {
  it("retries on collisions until the store accepts a PIN", async () => {
    const taken = new Set(["111111", "222222"]);
    const sequence = [111111, 222222, 333333];
    let i = 0;
    const result = await allocatePin(
      () => sequence[i++] as number,
      async (pin) => (taken.has(pin) ? null : pin),
    );
    expect(result).toBe("333333");
    expect(i).toBe(3);
  });

  it("gives up with a clear error when the space is exhausted", async () => {
    await expect(allocatePin(() => 123456, async () => null, 5)).rejects.toBeInstanceOf(PinAllocationError);
  });

  it("never hands out the same PIN twice under concurrent claims", async () => {
    const claimed = new Set<string>();
    // Tiny PIN space (100 values) with many concurrent claimers: the atomic claim is the only guard.
    const rng = (min: number) => min + Math.floor(Math.random() * 100);
    const claim = async (pin: string) => {
      await Promise.resolve();
      if (claimed.has(pin)) return null;
      claimed.add(pin);
      return pin;
    };
    const pins = await Promise.all(Array.from({ length: 60 }, () => allocatePin(rng, claim, 500)));
    expect(new Set(pins).size).toBe(60);
  });
});
