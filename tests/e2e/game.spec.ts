import { expect, test } from "@playwright/test";
import { defaultQuiz } from "@/content/default-quiz";
import { correctLetter, createGame, joinGame, pickOption, wrongLetter } from "./helpers";

test.describe("complete multiplayer game", () => {
  test("host + three phones play all seven questions and the podium is correct", async ({ browser }) => {
    const host = await createGame(browser, { timeLimit: "15" });
    const alice = await joinGame(browser, host.pin, "Alice");
    const bob = await joinGame(browser, host.pin, "Bob");
    const cara = await joinGame(browser, host.pin, "Cara");
    const players = [alice, bob, cara];

    // 1. Lobby: the host sees everyone arrive in real time, with PIN and QR code visible.
    await expect(host.page.locator('[aria-label^="Game PIN"]')).toHaveText(host.pin);
    await expect(host.page.getByRole("img", { name: /QR code that opens .*\/join\?pin=\d{6}/ })).toBeVisible();
    for (const p of players) await expect(host.page.getByRole("listitem").filter({ hasText: p.name })).toBeVisible();
    await expect(host.page.getByText("3 players joined")).toBeAttached();
    await expect(alice.page.getByText("players in the lobby")).toBeVisible();

    // 2. Start: players see the countdown and the question appears on every device.
    await host.page.getByRole("button", { name: "Start game" }).click();
    await expect(host.page.getByText("Get ready…")).toBeVisible();
    await expect(alice.page.getByText("Get ready…")).toBeVisible();

    // A late joiner is refused with a clear message.
    const late = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const latePage = await late.newPage();
    await latePage.goto(`/join?pin=${host.pin}`);
    await expect(latePage.getByText("The game has already started")).toBeVisible();
    await late.close();

    const finalScores: Record<string, number> = { Alice: 0, Bob: 0, Cara: 0 };

    for (let q = 0; q < 7; q += 1) {
      const question = defaultQuiz.questions[q]!;
      await expect(host.page.getByRole("heading", { name: question.prompt })).toBeVisible();
      for (const p of players) await expect(p.page.getByRole("heading", { name: question.prompt })).toBeVisible();
      await expect(host.page.getByText(`${q + 1} / 7`)).toBeVisible();

      // Before the reveal the answer key must not be anywhere in the DOM or the network payloads.
      const html = await alice.page.content();
      expect(html).not.toContain(question.explanation);
      const stateJson = await alice.page.evaluate(async (pin) => (await fetch(`/api/games/${pin}/state?role=player`)).text(), host.pin);
      expect(stateJson).not.toContain("correctOptionId");
      expect(stateJson).not.toContain(question.explanation);

      // Alice: always right. Bob: right on even-numbered questions. Cara: never right.
      await pickOption(alice.page, correctLetter(q));
      await expect(alice.page.getByText("Answer submitted!")).toBeVisible();
      await expect(host.page.getByText(/1 of 3 answered/)).toBeVisible();
      await pickOption(bob.page, q % 2 === 0 ? correctLetter(q) : wrongLetter(q));

      if (q === 3) {
        // Cara stays silent; the host reveals early instead of waiting for the clock.
        await expect(host.page.getByText(/2 of 3 answered/)).toBeVisible();
        await host.page.getByRole("button", { name: "Reveal answer" }).click();
      } else {
        await pickOption(cara.page, wrongLetter(q)); // last answer → everyone has answered → auto-reveal
      }

      // Reveal: correct answer + explanation on the projector, personal result on each phone.
      await expect(host.page.getByText("Answer revealed")).toBeVisible();
      await expect(host.page.getByText(question.explanation)).toBeVisible();
      await expect(alice.page.getByRole("heading", { name: "Correct!" })).toBeVisible();
      await expect(alice.page.getByText(question.explanation)).toBeVisible();
      await expect(cara.page.getByRole("heading", { name: q === 3 ? "Time ran out" : "Not quite" })).toBeVisible();
      await expect(bob.page.getByRole("heading", { name: q % 2 === 0 ? "Correct!" : "Not quite" })).toBeVisible();

      const isLast = q === 6;
      if (!isLast) {
        await host.page.getByRole("button", { name: "Show leaderboard" }).click();
        await expect(host.page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
        await expect(alice.page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
        // Alice leads and every client agrees on the top score.
        const hostTop = await host.page.getByRole("listitem").first().innerText();
        expect(hostTop).toContain("Alice");
        await host.page.getByRole("button", { name: "Next question" }).click();
      } else {
        await host.page.getByRole("button", { name: "Show final podium" }).click();
      }
    }

    // 3. Final podium: Alice 1st, Bob 2nd, Cara 3rd — on the projector and on each phone.
    await expect(host.page.getByRole("heading", { name: "Final podium" })).toBeVisible();
    await expect(host.page.getByRole("img", { name: "Gold medal, rank 1" })).toBeVisible();
    await expect(host.page.getByRole("img", { name: "Silver medal, rank 2" })).toBeVisible();
    // Cara scored nothing, so there is no bronze medal: the podium is reserved for players who scored.
    await expect(host.page.getByRole("img", { name: "Bronze medal, rank 3" })).toHaveCount(0);
    await expect(alice.page.getByRole("heading", { name: "You finished 1st!" })).toBeVisible();
    await expect(bob.page.getByRole("heading", { name: /You finished 2nd/ })).toBeVisible();
    await expect(cara.page.getByRole("heading", { name: "You finished 3rd", exact: true })).toBeVisible(); // no "!" — no celebration for 0 points

    // Scores: Alice answered correctly all 7 → between 7×800 and 7×1000; Bob 4 correct; Cara 0.
    const rows = alice.page.getByRole("list", { name: "Final standings" }).getByRole("listitem");
    await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      const lines = (await rows.nth(i).innerText()).split("\n").map((l) => l.trim()).filter(Boolean);
      const name = lines.find((l) => /Alice|Bob|Cara/.test(l))!.replace(/\s*\(you\)/, "");
      finalScores[name] = Number(lines[lines.length - 1]!.replace(/,/g, ""));
    }
    expect(Object.keys(finalScores).sort()).toEqual(["Alice", "Bob", "Cara"]);
    expect(finalScores.Alice).toBeGreaterThanOrEqual(7 * 800);
    expect(finalScores.Alice).toBeLessThanOrEqual(7 * 1000);
    expect(finalScores.Bob).toBeGreaterThanOrEqual(4 * 800);
    expect(finalScores.Bob).toBeLessThanOrEqual(4 * 1000);
    expect(finalScores.Cara).toBe(0);

    await host.page.screenshot({ path: "test-results/shots/host-final.png" });
    await alice.page.screenshot({ path: "test-results/shots/player-final.png", fullPage: true });

    for (const ctx of [host.context, alice.context, bob.context, cara.context]) await ctx.close();
  });
});
