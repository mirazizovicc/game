import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { defaultQuiz } from "@/content/default-quiz";
import { correctLetter, pickOption, wrongLetter } from "./helpers";

/**
 * Walks one game through every screen at several classroom-projector and phone sizes,
 * saving screenshots (test-results/shots) and asserting the layout rules:
 *  - the projected host screen never needs scrolling;
 *  - nothing on a phone scrolls horizontally.
 */
const SIZES = [
  { name: "hd", host: { width: 1920, height: 1080 }, phone: { width: 390, height: 844 } },
  { name: "laptop", host: { width: 1366, height: 768 }, phone: { width: 360, height: 640 } },
  { name: "xga-4x3", host: { width: 1024, height: 768 }, phone: { width: 412, height: 915 } },
];

const NAMES = ["Aziza", "Bobur", "Camila", "Dilnoza Rakhmat", "Eldor", "Farruh_01", "Gulnora", "Hasan", "Ilhom", "Jasmin"];

async function expectNoOverflow(page: Page, kind: "host" | "phone", label: string) {
  const m = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return { sh: el.scrollHeight, ih: window.innerHeight, sw: el.scrollWidth, iw: window.innerWidth };
  });
  expect(m.sw, `${label}: horizontal overflow (${m.sw} > ${m.iw})`).toBeLessThanOrEqual(m.iw);
  if (kind === "host") expect(m.sh, `${label}: host screen needs scrolling (${m.sh} > ${m.ih})`).toBeLessThanOrEqual(m.ih + 1);
}

for (const size of SIZES) {
  test(`every screen at ${size.name} (host ${size.host.width}×${size.host.height}, phone ${size.phone.width}×${size.phone.height})`, async ({ browser, baseURL }) => {
    const shot = async (page: Page, name: string, kind: "host" | "phone", full = false) => {
      await page.waitForTimeout(450); // let entrance animations settle
      await expectNoOverflow(page, kind, `${size.name}/${name}`);
      await page.screenshot({ path: `test-results/shots/${size.name}-${name}.png`, fullPage: full });
    };

    const hostCtx = await browser.newContext({ viewport: size.host });
    const host = await hostCtx.newPage();
    const phoneCtx = await browser.newContext({ viewport: size.phone, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const phone = await phoneCtx.newPage();

    // Landing, setup and error states.
    await phone.goto("/");
    await shot(phone, "01-landing", "phone", true);
    await phone.goto("/join?pin=000000");
    await expect(phone.getByText("PIN not found")).toBeVisible();
    await shot(phone, "02-invalid-pin", "phone");

    await host.goto("/host");
    await shot(host, "03-host-setup", "phone", true);
    await host.getByLabel("Time per question").selectOption("15");
    await host.getByRole("button", { name: "Create game" }).click();
    await host.waitForURL(/\/host\/\d{6}$/);
    const pin = host.url().match(/(\d{6})$/)![1]!;

    // Observer phone joins through the UI; the rest join through the API (cookies per context).
    await phone.goto(`/join?pin=${pin}`);
    await expect(phone.getByRole("heading", { name: "Choose a nickname" })).toBeVisible();
    await shot(phone, "04-nickname", "phone");
    await phone.getByLabel(/^Nickname/).fill("Observer");
    await phone.getByRole("button", { name: "Join game" }).click();
    await phone.waitForURL(`**/play/${pin}`);

    const bots: APIRequestContext[] = [];
    for (const name of NAMES) {
      const ctx = await request.newContext({ baseURL });
      const res = await ctx.post(`/api/games/${pin}/join`, { data: { nickname: name } });
      expect(res.status(), `join ${name}`).toBe(201);
      bots.push(ctx);
    }
    // Duplicate and abusive nicknames are refused with clear messages.
    const dup = await request.newContext({ baseURL });
    const dupRes = await dup.post(`/api/games/${pin}/join`, { data: { nickname: "aziza" } });
    expect(dupRes.status()).toBe(409);
    const bad = await dup.post(`/api/games/${pin}/join`, { data: { nickname: "<img src=x onerror=alert(1)>" } });
    expect(bad.status()).toBe(400);

    await expect(host.getByText("Hasan")).toBeVisible();
    await expect(phone.getByText("players in the lobby")).toBeVisible();
    await shot(host, "10-host-lobby", "host");
    await shot(phone, "11-player-waiting", "phone");

    await host.getByRole("button", { name: "Start game" }).click();
    await expect(host.getByText("Get ready…")).toBeVisible();
    await shot(host, "12-host-countdown", "host");
    await shot(phone, "13-player-countdown", "phone");

    const answerAll = async (q: number, count: number) => {
      for (const [i, bot] of bots.slice(0, count).entries()) {
        const q0 = defaultQuiz.questions[q]!;
        const optionId = i % 3 === 0 ? q0.options.find((o) => o.id !== q0.correctOptionId)!.id : q0.correctOptionId;
        const res = await bot.post(`/api/games/${pin}/answer`, { data: { questionIndex: q, optionId } });
        expect(res.status(), `bot ${i} answers q${q}`).toBe(201);
      }
    };

    for (let q = 0; q < 2; q += 1) {
      await expect(host.getByRole("heading", { name: defaultQuiz.questions[q]!.prompt })).toBeVisible();
      await expect(phone.getByRole("heading", { name: defaultQuiz.questions[q]!.prompt })).toBeVisible();
      await answerAll(q, 7);
      if (q === 0) {
        await shot(host, "14-host-question", "host");
        await shot(phone, "15-player-question", "phone", true);
      }
      await pickOption(phone, q === 0 ? correctLetter(q) : wrongLetter(q));
      await expect(phone.getByText("Answer submitted!")).toBeVisible();
      if (q === 0) await shot(phone, "16-player-answered", "phone", true);
      await host.getByRole("button", { name: "Reveal answer" }).click();
      await expect(host.getByText("Answer revealed")).toBeVisible();
      await expect(phone.getByRole("heading", { name: q === 0 ? "Correct!" : "Not quite" })).toBeVisible();
      await shot(host, `17-host-reveal-q${q + 1}`, "host");
      await shot(phone, `18-player-reveal-q${q + 1}`, "phone", true);
      await host.getByRole("button", { name: "Show leaderboard" }).click();
      await expect(host.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
      await expect(phone.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
      await shot(host, `19-host-leaderboard-q${q + 1}`, "host");
      await shot(phone, `20-player-leaderboard-q${q + 1}`, "phone", true);
      await host.getByRole("button", { name: "Next question" }).click();
    }

    // Pause overlay on question 3.
    await expect(host.getByRole("heading", { name: defaultQuiz.questions[2]!.prompt })).toBeVisible();
    await host.getByRole("button", { name: "Pause" }).click();
    await expect(host.getByText("Paused", { exact: true }).first()).toBeVisible();
    await expect(phone.getByText("The host paused the game.")).toBeVisible();
    await shot(host, "21-host-paused", "host");
    await shot(phone, "22-player-paused", "phone", true);
    await host.getByRole("button", { name: "Resume" }).click();

    // End the game early to reach the podium quickly (two-step confirmation).
    await host.getByRole("button", { name: "End game" }).click();
    await host.getByRole("button", { name: "Click again to end" }).click();
    await expect(host.getByRole("heading", { name: "Final podium" })).toBeVisible();
    await expect(phone.getByRole("heading", { name: /You finished/ })).toBeVisible();
    await shot(host, "30-host-final", "host");
    await shot(phone, "31-player-final", "phone", true);

    await Promise.all([hostCtx.close(), phoneCtx.close(), dup.dispose(), ...bots.map((b) => b.dispose())]);
  });
}
