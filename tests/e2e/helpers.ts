import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { defaultQuiz } from "@/content/default-quiz";

export const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } as const;
export const PROJECTOR = { viewport: { width: 1920, height: 1080 } } as const;

export const letterOf = (optionId: string) => optionId.toUpperCase();
export const correctLetter = (q: number) => letterOf(defaultQuiz.questions[q]!.correctOptionId);
export const wrongLetter = (q: number) => (correctLetter(q) === "A" ? "B" : "A");

export interface Host {
  context: BrowserContext;
  page: Page;
  pin: string;
}

export async function createGame(browser: Browser, options: { timeLimit?: string; shuffle?: boolean } = {}): Promise<Host> {
  const context = await browser.newContext(PROJECTOR);
  const page = await context.newPage();
  await page.goto("/host");
  if (options.timeLimit) await page.getByLabel("Time per question").selectOption(options.timeLimit);
  if (options.shuffle) await page.getByLabel(/Shuffle answer order/).check();
  await page.getByRole("button", { name: "Create game" }).click();
  await page.waitForURL(/\/host\/\d{6}$/);
  const pin = page.url().match(/(\d{6})$/)![1]!;
  await expect(page.getByRole("heading", { name: "Players" })).toBeVisible();
  return { context, page, pin };
}

export interface Player {
  context: BrowserContext;
  page: Page;
  name: string;
}

/** Joins the way a student does after scanning the QR code: /join?pin=… then a nickname. */
export async function joinGame(browser: Browser, pin: string, name: string): Promise<Player> {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await page.goto(`/join?pin=${pin}`);
  await page.getByLabel(/^Nickname/).fill(name);
  await page.getByRole("button", { name: "Join game" }).click();
  await page.waitForURL(`**/play/${pin}`);
  await expect(page.getByText("Waiting for the host to start")).toBeVisible();
  return { context, page, name };
}

export async function pickOption(page: Page, letter: string) {
  await page.getByRole("button", { name: new RegExp(`^Option ${letter}:`) }).click();
}
