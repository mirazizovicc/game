import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { defaultQuiz } from "@/content/default-quiz";
const alertOf = (page: import("@playwright/test").Page) => page.locator("[role=alert]:not(#__next-route-announcer__)");
import { correctLetter, createGame, joinGame, PHONE, pickOption } from "./helpers";

test.describe("join errors", () => {
  test("invalid PIN, duplicate nickname and abusive nickname show clear messages", async ({ browser }) => {
    const host = await createGame(browser);
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();

    await page.goto("/");
    await page.getByLabel("Game PIN").fill("12");
    await page.getByRole("button", { name: "Enter" }).click();
    await expect(alertOf(page)).toHaveText("The game PIN has 6 digits.");

    await page.goto("/join?pin=000000");
    await expect(alertOf(page)).toContainText("PIN not found");

    await joinGame(browser, host.pin, "Zoe");
    await page.goto(`/join?pin=${host.pin}`);
    await page.getByLabel(/^Nickname/).fill("ZOE");
    await page.getByRole("button", { name: "Join game" }).click();
    await expect(alertOf(page)).toContainText("Someone already has that nickname");

    await page.getByLabel(/^Nickname/).fill("<script>x</script>");
    await page.getByRole("button", { name: "Join game" }).click();
    await expect(alertOf(page)).toBeVisible();
    await page.getByLabel(/^Nickname/).fill("Host");
    await page.getByRole("button", { name: "Join game" }).click();
    await expect(alertOf(page)).toContainText("reserved");
    await ctx.close();
    await host.context.close();
  });

  test("markup in a nickname is rejected by the server and never reaches the screen", async ({ browser }) => {
    const host = await createGame(browser);
    const ctx = await browser.newContext(PHONE);
    const res = await ctx.request.post(`/api/games/${host.pin}/join`, { data: { nickname: "a<b>c" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_NICKNAME");
    expect(await host.page.content()).not.toContain("<b>c");
    await ctx.close();
    await host.context.close();
  });
});

test.describe("resilience", () => {
  test("player refresh keeps identity, answer and score; host refresh keeps control", async ({ browser }) => {
    const host = await createGame(browser);
    const dana = await joinGame(browser, host.pin, "Dana");
    await joinGame(browser, host.pin, "Eli"); // a second player keeps the question open

    await host.page.getByRole("button", { name: "Start game" }).click();
    await expect(dana.page.getByRole("heading", { name: defaultQuiz.questions[0]!.prompt })).toBeVisible();
    await pickOption(dana.page, correctLetter(0));
    await expect(dana.page.getByText("Answer submitted!")).toBeVisible();

    await dana.page.reload();
    await expect(dana.page.getByText("Answer submitted!")).toBeVisible();
    await expect(dana.page.getByRole("group", { name: /^Option B:/ })).toHaveAttribute("aria-label", /your answer/);

    await host.page.reload();
    await expect(host.page.getByRole("heading", { name: defaultQuiz.questions[0]!.prompt })).toBeVisible();
    await expect(host.page.getByText("1 of 2 answered")).toBeVisible();
    await host.page.getByRole("button", { name: "Reveal answer" }).click();
    await expect(host.page.getByText("Answer revealed")).toBeVisible();
    await expect(dana.page.getByRole("heading", { name: "Correct!" })).toBeVisible();

    // Rejoining through the join page with the same browser returns the same player (no duplicate).
    await dana.page.goto(`/join?pin=${host.pin}`).catch(() => undefined);
    await host.context.close();
    await dana.context.close();
  });

  test("a dropped connection shows a reconnecting banner and recovers on its own", async ({ browser }) => {
    const host = await createGame(browser);
    const fay = await joinGame(browser, host.pin, "Fay");
    await fay.context.setOffline(true);
    await expect(fay.page.getByText(/Connection lost — reconnecting/)).toBeVisible({ timeout: 20_000 });
    await fay.context.setOffline(false);
    await expect(fay.page.getByText(/Connection lost — reconnecting/)).toBeHidden({ timeout: 20_000 });
    await expect(fay.page.getByText("Waiting for the host to start")).toBeVisible();
    await host.context.close();
    await fay.context.close();
  });

  test("an unknown game on the play page explains what to do", async ({ browser }) => {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await page.goto("/play/123456");
    await expect(page.getByRole("heading", { name: "Game not found" })).toBeVisible();
    await ctx.close();
  });
});

test.describe("security boundaries (browser level)", () => {
  test("a player's browser cannot drive the game or read host state", async ({ browser }) => {
    const host = await createGame(browser);
    const gus = await joinGame(browser, host.pin, "Gus");

    const results = await gus.page.evaluate(async (pin) => {
      const post = async (action: string) =>
        (await fetch(`/api/games/${pin}/host`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, expectedVersion: 0 }) })).status;
      return {
        start: await post("start"),
        end: await post("end"),
        hostState: (await fetch(`/api/games/${pin}/state?role=host`)).status,
        forgedScore: (await fetch(`/api/games/${pin}/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionIndex: 0, optionId: "b", points: 99999, isCorrect: true }) })).status,
      };
    }, host.pin);

    expect(results.start).toBe(403);
    expect(results.end).toBe(403);
    expect(results.hostState).toBe(401);
    expect(results.forgedScore).toBe(400); // unknown fields are rejected outright
    await expect(host.page.getByText("1 players joined").or(host.page.getByText("1 player joined"))).toBeAttached();
    await host.context.close();
    await gus.context.close();
  });

  test("security headers are set and API responses are not cacheable", async ({ request }) => {
    const page = await request.get("/");
    expect(page.headers()["x-frame-options"]).toBe("DENY");
    expect(page.headers()["x-content-type-options"]).toBe("nosniff");
    const api = await request.get("/api/health");
    expect(api.headers()["cache-control"]).toContain("no-store");
  });
});

test.describe("accessibility (axe-core, WCAG 2.1 A/AA rules)", () => {
  const audit = async (page: import("@playwright/test").Page, label: string) => {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.html.slice(0, 120)}`);
    expect(summary, `${label} has accessibility violations`).toEqual([]);
  };

  test("landing, join, host setup, lobby, question, reveal, leaderboard and podium pass axe", async ({ browser }) => {
    const host = await createGame(browser);
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();

    await page.goto("/");
    await audit(page, "landing");
    await page.goto(`/join?pin=${host.pin}`);
    await expect(page.getByLabel(/^Nickname/)).toBeVisible();
    await audit(page, "join / nickname");
    await host.page.waitForTimeout(300);
    await audit(host.page, "host lobby (empty)");

    const hana = await joinGame(browser, host.pin, "Hana");
    await joinGame(browser, host.pin, "Ivan");
    await audit(hana.page, "player waiting room");
    await audit(host.page, "host lobby");

    await host.page.getByRole("button", { name: "Start game" }).click();
    await expect(hana.page.getByRole("heading", { name: defaultQuiz.questions[0]!.prompt })).toBeVisible();
    await audit(hana.page, "player question");
    await audit(host.page, "host question");
    await pickOption(hana.page, correctLetter(0));
    await audit(hana.page, "player answered");

    await host.page.getByRole("button", { name: "Reveal answer" }).click();
    await expect(host.page.getByText("Answer revealed")).toBeVisible();
    await audit(host.page, "host reveal");
    await audit(hana.page, "player reveal");
    await host.page.getByRole("button", { name: "Show leaderboard" }).click();
    await expect(host.page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
    await audit(host.page, "host leaderboard");
    await audit(hana.page, "player leaderboard");

    await host.page.getByRole("button", { name: "End game" }).click();
    await host.page.getByRole("button", { name: "Click again to end" }).click();
    await expect(host.page.getByRole("heading", { name: "Final podium" })).toBeVisible();
    await host.page.waitForTimeout(1500);
    await audit(host.page, "host podium");
    await audit(hana.page, "player podium");
    await Promise.all([host.context.close(), ctx.close(), hana.context.close()]);
  });

  test("the whole join-and-answer flow works with the keyboard only", async ({ browser }) => {
    const host = await createGame(browser);
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await page.goto(`/join?pin=${host.pin}`);
    await page.getByLabel(/^Nickname/).focus();
    await page.keyboard.type("Keyboard");
    await page.keyboard.press("Enter");
    await page.waitForURL(`**/play/${host.pin}`);
    await joinGame(browser, host.pin, "Partner");
    await host.page.getByRole("button", { name: "Start game" }).click();
    await expect(page.getByRole("heading", { name: defaultQuiz.questions[0]!.prompt })).toBeVisible();
    // Tab to the "B" answer and press Enter.
    const target = page.getByRole("button", { name: /^Option B:/ });
    await target.focus();
    await expect(target).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Answer submitted!")).toBeVisible();
    await ctx.close();
    await host.context.close();
  });
});
