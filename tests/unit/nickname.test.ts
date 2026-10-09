import { describe, expect, it } from "vitest";
import { cleanNickname, nicknameKey, parseBlocklist, validateNickname } from "@/lib/domain/nickname";

const ok = (value: string) => {
  const result = validateNickname(value);
  if (!result.ok) throw new Error(`expected "${value}" to be valid, got ${result.reason}`);
  return result;
};
const reason = (value: unknown, options?: Parameters<typeof validateNickname>[1]) => {
  const result = validateNickname(value, options);
  return result.ok ? "ok" : result.reason;
};

describe("validateNickname", () => {
  it("accepts ordinary names, including non-Latin scripts and Uzbek apostrophes", () => {
    expect(ok("Alex").nickname).toBe("Alex");
    expect(ok("Dilnoza_7").nickname).toBe("Dilnoza_7");
    expect(ok("Oʻtkir").nickname).toBe("Oʻtkir");
    expect(ok("Сергей").nickname).toBe("Сергей");
    expect(ok("李雷").nickname).toBe("李雷");
    expect(ok("Mary-Jane O'Neil").nickname).toBe("Mary-Jane O'Neil");
  });

  it("trims and collapses whitespace", () => {
    expect(ok("   Sam    Lee  ").nickname).toBe("Sam Lee");
  });

  it("rejects empty and non-string input", () => {
    expect(reason("")).toBe("empty");
    expect(reason("    ")).toBe("empty");
    expect(reason(undefined)).toBe("empty");
    expect(reason(42)).toBe("empty");
  });

  it("enforces length 2–16 characters (counting characters, not UTF-16 units)", () => {
    expect(reason("A")).toBe("too_short");
    expect(reason("Ab")).toBe("ok");
    expect(reason("a".repeat(16))).toBe("ok");
    expect(reason("a".repeat(17))).toBe("too_long");
    expect(reason("😀😀😀")).toBe("invalid_characters");
  });

  it.each(["<script>alert(1)</script>", "x<b>y", "a&b", 'say "hi"', "a`b", "name;drop", "jo{{7*7}}", "a\\b", "<img src=x onerror=1>"])(
    "rejects markup/injection characters: %s",
    (value) => {
      expect(reason(value)).not.toBe("ok");
    },
  );

  it("rejects control and invisible characters", () => {
    expect(reason("ab\u0000cd")).toBe("invalid_characters");
    expect(reason("ab‮cd")).toBe("invalid_characters"); // RTL override
    expect(reason("ab​cd")).toBe("invalid_characters"); // zero-width space
  });

  it("requires at least two letters or digits", () => {
    expect(reason("1.")).toBe("not_enough_letters"); // two characters, but only one letter/digit
    expect(reason("a-")).toBe("not_enough_letters");
    expect(reason("a1")).toBe("ok");
  });

  it("rejects names that look like the presenter or system", () => {
    for (const name of ["Host", "TEACHER", "Admin", "the host", "H.O.S.T", "Prof3ssor", "m0derator"]) {
      expect(reason(name), name).toBe("reserved");
    }
    expect(reason("Ghost")).toBe("ok");
    expect(reason("Hostile")).toBe("ok");
  });

  it("rejects abusive nicknames including leetspeak and spacing tricks", () => {
    for (const name of ["fuck", "F.u.c.k", "sh1t", "b1tch", "Nazi", "xXfuckXx", "kill yourself"]) {
      expect(reason(name), name).toBe("inappropriate");
    }
  });

  it("does not block innocent names that merely contain short blocked substrings", () => {
    for (const name of ["Dickens", "Sussex", "Cumberland", "Analyst", "Hancock", "Nazila", "Essex", "Rapeseed Fan"]) {
      expect(reason(name), name).not.toBe("inappropriate");
    }
  });

  it("supports a configurable extra blocklist", () => {
    expect(reason("Voldemort")).toBe("ok");
    expect(reason("Voldemort", { extraBlockedTerms: ["voldemort"] })).toBe("inappropriate");
    expect(parseBlocklist(" a , b,, c ")).toEqual(["a", "b", "c"]);
    expect(parseBlocklist(undefined)).toEqual([]);
  });
});

describe("nicknameKey (uniqueness policy)", () => {
  it("is case-insensitive", () => {
    expect(nicknameKey("Alex")).toBe(nicknameKey("aLeX"));
  });

  it("ignores punctuation and spacing so players cannot impersonate each other", () => {
    expect(nicknameKey("Ali_B")).toBe(nicknameKey("ali b"));
    expect(nicknameKey("Ali.B")).toBe(nicknameKey("A l i B"));
  });

  it("ignores diacritics and Cyrillic look-alikes", () => {
    expect(nicknameKey("José")).toBe(nicknameKey("jose"));
    expect(nicknameKey("Аlex")).toBe(nicknameKey("Alex")); // Cyrillic А
  });

  it("keeps genuinely different names different", () => {
    expect(nicknameKey("Alex1")).not.toBe(nicknameKey("Alex2"));
  });

  it("cleanNickname normalises full-width characters (NFKC)", () => {
    expect(cleanNickname("ＡＢＣ")).toBe("ABC");
  });
});
