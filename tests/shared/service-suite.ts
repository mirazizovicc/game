import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultQuiz } from "@/content/default-quiz";
import { ANSWER_GRACE_MS, FIRST_QUESTION_LEAD_MS, MAX_PLAYERS, NEXT_QUESTION_LEAD_MS } from "@/lib/domain/constants";
import type { HostAction } from "@/lib/domain/game-machine";
import type { GameView } from "@/lib/domain/view";
import { AppError, type ErrorCode } from "@/lib/server/errors";
import { createGameService, type Credentials } from "@/lib/server/game-service";
import { RateLimiter } from "@/lib/server/rate-limiter";
import { cryptoRandomInt, newToken } from "@/lib/server/tokens";
import type { StoreFixture } from "./store-contract";

const T0 = 1_800_000_000_000;
const CORRECT = defaultQuiz.questions.map((q) => q.correctOptionId);
const WRONG = defaultQuiz.questions.map((q) => q.options.find((o) => o.id !== q.correctOptionId)!.id);

export async function expectError(promise: Promise<unknown>, code: ErrorCode) {
  try {
    await promise;
  } catch (error) {
    expect(error, `expected AppError ${code}`).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return error as AppError;
  }
  throw new Error(`expected ${code} but the call succeeded`);
}

export function serviceSuite(name: string, create: () => Promise<StoreFixture>) {
  describe(`game service: ${name}`, () => {
    let fixture: StoreFixture;
    let clock = T0;
    let ipCounter = 0;

    const advance = (ms: number) => {
      clock += ms;
    };

    function makeService(options: { hostAccessCode?: string | null } = {}) {
      return createGameService({
        store: fixture.store,
        quiz: defaultQuiz,
        now: () => clock,
        randomInt: cryptoRandomInt,
        newId: randomUUID,
        newToken,
        rateLimiter: new RateLimiter(() => clock),
        hostAccessCode: options.hostAccessCode ?? null,
        extraBlockedTerms: [],
      });
    }
    let service!: ReturnType<typeof makeService>;

    beforeAll(async () => {
      fixture = await create();
      service = makeService();
    });
    afterAll(async () => {
      await fixture.cleanup();
    });

    /** Each helper call uses a fresh "IP" so classroom-NAT rate limits do not interfere. */
    const ip = () => `10.0.0.${++ipCounter}`;

    async function newGame(config: { timeLimitSec?: number | null; shuffleOptions?: boolean } = {}) {
      const created = await service.createGame(config, ip());
      const host: Credentials = { hostToken: created.hostToken };
      return { pin: created.pin, host };
    }

    async function join(pin: string, nickname: string): Promise<Credentials> {
      const joined = await service.joinGame(pin, nickname, {}, ip());
      return { playerCookie: joined.cookieValue };
    }

    const hostView = (pin: string, host: Credentials) => service.getState(pin, "host", host);
    const playerView = (pin: string, player: Credentials) => service.getState(pin, "player", player);

    async function act(pin: string, host: Credentials, action: HostAction) {
      const view = await hostView(pin, host);
      return service.hostAction(pin, host, { action, expectedVersion: view.version });
    }

    /** lobby → question 1 is OPEN (lead-in elapsed). */
    async function startAndOpen(pin: string, host: Credentials) {
      await act(pin, host, "start");
      advance(FIRST_QUESTION_LEAD_MS);
    }

    /** After a reveal: leaderboard → next question, open. */
    async function nextQuestion(pin: string, host: Credentials) {
      await act(pin, host, "advance"); // reveal → leaderboard
      await act(pin, host, "advance"); // leaderboard → next question
      advance(NEXT_QUESTION_LEAD_MS);
    }

    const answer = (pin: string, player: Credentials, questionIndex: number, optionId: string) =>
      service.submitAnswer(pin, player, { questionIndex, optionId });

    describe("creating a game", () => {
      it("creates a lobby with a 6-digit PIN and a host credential", async () => {
        const { pin, host } = await newGame();
        expect(pin).toMatch(/^[1-9]\d{5}$/);
        const view = await hostView(pin, host);
        expect(view).toMatchObject({ role: "host", phase: "lobby", status: "lobby", playerCount: 0, totalQuestions: 7 });
      });

      it("generates distinct PINs for simultaneous games", async () => {
        const games = await Promise.all(Array.from({ length: 12 }, () => service.createGame({}, ip())));
        expect(new Set(games.map((g) => g.pin)).size).toBe(12);
      });

      it("stores only a hash of the host secret", async () => {
        const created = await service.createGame({}, ip());
        const game = await fixture.store.getGameByPin(created.pin);
        expect(game?.hostTokenHash).not.toContain(created.hostToken);
        expect(game?.hostTokenHash).toMatch(/^[0-9a-f]{64}$/);
      });

      it("requires the access code when one is configured", async () => {
        const guarded = makeService({ hostAccessCode: "letmein" });
        await expectError(guarded.createGame({}, ip()), "FORBIDDEN");
        await expectError(guarded.createGame({ accessCode: "wrong" }, ip()), "FORBIDDEN");
        await expect(guarded.createGame({ accessCode: "letmein" }, ip())).resolves.toMatchObject({ pin: expect.any(String) });
      });

      it("throttles repeated wrong access codes", async () => {
        const guarded = makeService({ hostAccessCode: "letmein" });
        const sameIp = ip();
        const codes: string[] = [];
        for (let i = 0; i < 12; i += 1) {
          try {
            await guarded.createGame({ accessCode: "nope" }, sameIp);
          } catch (error) {
            codes.push((error as AppError).code);
          }
        }
        expect(codes).toContain("RATE_LIMITED");
      });

      it("applies the host's time-limit and shuffle settings", async () => {
        const { pin, host } = await newGame({ timeLimitSec: 10, shuffleOptions: true });
        expect((await hostView(pin, host)).config).toEqual({ timeLimitSec: 10, shuffleOptions: true });
      });
    });

    describe("joining", () => {
      it("lets a player join and appear in the host's roster", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "  Aziza  ");
        const view = await hostView(pin, host);
        expect(view.playerCount).toBe(1);
        expect(view.roster?.map((r) => r.nickname)).toEqual(["Aziza"]);
        expect((await playerView(pin, player)).me?.nickname).toBe("Aziza");
      });

      it("rejects duplicate nicknames case- and punctuation-insensitively", async () => {
        const { pin } = await newGame();
        await join(pin, "Bobur");
        await expectError(service.joinGame(pin, "BOBUR", {}, ip()), "NICKNAME_TAKEN");
        await expectError(service.joinGame(pin, "b.o.b.u.r", {}, ip()), "NICKNAME_TAKEN");
      });

      it("rejects invalid, markup-containing, reserved and abusive nicknames with a reason", async () => {
        const { pin } = await newGame();
        for (const [nick, reason] of [["", "empty"], ["x", "too_short"], ["<script>alert(1)</script>", "too_long"], ["<b>hi</b>", "invalid_characters"], ["Host", "reserved"], ["fuck", "inappropriate"]] as const) {
          const error = await expectError(service.joinGame(pin, nick, {}, ip()), "INVALID_NICKNAME");
          expect(error.details?.reason, nick).toBe(reason);
        }
      });

      it("reports unknown, malformed and expired PINs distinctly", async () => {
        await expectError(service.getJoinInfo("999999", ip()), "GAME_NOT_FOUND");
        await expectError(service.getJoinInfo("abc", ip()), "GAME_NOT_FOUND");
        await expectError(service.joinGame("12", "Name", {}, ip()), "GAME_NOT_FOUND");
        const { pin } = await newGame();
        advance(7 * 3600_000);
        await expectError(service.getJoinInfo(pin, ip()), "GAME_EXPIRED");
        await expectError(service.joinGame(pin, "Late", {}, ip()), "GAME_EXPIRED");
        advance(-7 * 3600_000);
      });

      it("reconnects the same browser to the same player (no duplicate, score kept)", async () => {
        const { pin, host } = await newGame();
        const first = await service.joinGame(pin, "Camila", {}, ip());
        const creds = { playerCookie: first.cookieValue };
        const again = await service.joinGame(pin, "SomethingElse", creds, ip());
        expect(again.rejoined).toBe(true);
        expect(again.player).toEqual(first.player);
        expect((await hostView(pin, host)).playerCount).toBe(1);
      });

      it("closes the lobby when the game starts (late joiners are told why)", async () => {
        const { pin, host } = await newGame();
        await join(pin, "OnTime");
        await act(pin, host, "start");
        await expectError(service.joinGame(pin, "TooLate", {}, ip()), "GAME_STARTED");
        const info = await service.getJoinInfo(pin, ip());
        expect(info.joinable).toBe(false);
      });

      it("enforces the player cap", async () => {
        const { pin } = await newGame();
        for (let i = 0; i < MAX_PLAYERS; i += 1) await service.joinGame(pin, `player ${i}`, {}, ip());
        await expectError(service.joinGame(pin, "one too many", {}, ip()), "GAME_FULL");
      }, 60_000);

      it("rate limits join floods from one address", async () => {
        const { pin } = await newGame();
        const flood = ip();
        const codes: string[] = [];
        for (let i = 0; i < 90; i += 1) {
          try {
            await service.joinGame(pin, `flood${i}`, {}, flood);
          } catch (error) {
            codes.push((error as AppError).code);
          }
        }
        expect(codes).toContain("RATE_LIMITED");
      });
    });

    describe("authorization", () => {
      it("blocks every host action without the host credential", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Mallory");
        const version = (await hostView(pin, host)).version;
        for (const creds of [{}, player, { hostToken: "guess" }, { hostToken: newToken() }] as Credentials[]) {
          await expectError(service.hostAction(pin, creds, { action: "start", expectedVersion: version }), "FORBIDDEN");
        }
        expect((await hostView(pin, host)).phase).toBe("lobby");
      });

      it("a host credential for one game does not work on another", async () => {
        const a = await newGame();
        const b = await newGame();
        const version = (await hostView(b.pin, b.host)).version;
        await expectError(service.hostAction(b.pin, a.host, { action: "end", expectedVersion: version }), "FORBIDDEN");
      });

      it("hides host state from players and player state from strangers", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Nina");
        await expectError(service.getState(pin, "host", player), "UNAUTHORIZED");
        await expectError(service.getState(pin, "player", host), "UNAUTHORIZED");
        await expectError(service.getState(pin, "player", {}), "UNAUTHORIZED");
        await expectError(service.getState(pin, "player", { playerCookie: `${randomUUID()}.${newToken()}` }), "UNAUTHORIZED");
        await expectError(service.getState(pin, "player", { playerCookie: "not-a-cookie" }), "UNAUTHORIZED");
      });

      it("rejects a forged player secret and a player cookie from another game", async () => {
        const g1 = await newGame();
        const g2 = await newGame();
        const p1 = await join(g1.pin, "Real");
        const [id] = (p1.playerCookie as string).split(".");
        await expectError(service.getState(g1.pin, "player", { playerCookie: `${id}.forged` }), "UNAUTHORIZED");
        await expectError(service.getState(g2.pin, "player", p1), "UNAUTHORIZED");
      });

      it("rejects stale or duplicate host clicks without applying them", async () => {
        const { pin, host } = await newGame();
        await join(pin, "Solo");
        const version = (await hostView(pin, host)).version;
        await service.hostAction(pin, host, { action: "start", expectedVersion: version });
        await expectError(service.hostAction(pin, host, { action: "start", expectedVersion: version }), "STALE_STATE");
        expect((await hostView(pin, host)).questionIndex).toBe(0);
      });

      it("refuses to start with no players and refuses invalid transitions", async () => {
        const { pin, host } = await newGame();
        await expectError(act(pin, host, "start"), "NO_PLAYERS");
        await expectError(act(pin, host, "advance"), "INVALID_ACTION");
        await expectError(act(pin, host, "close"), "INVALID_ACTION");
        await expectError(act(pin, host, "pause"), "INVALID_ACTION");
      });
    });

    describe("answer secrecy", () => {
      it("never sends the answer key or explanation before the reveal (any role, any phase)", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Spy");
        await join(pin, "Silent"); // keeps the question open (not everyone has answered)
        const forbidden = [...defaultQuiz.questions.map((q) => q.explanation), "correctOptionId", "isCorrect"];
        const snapshots: GameView[] = [await hostView(pin, host), await playerView(pin, player)];

        await act(pin, host, "start");
        snapshots.push(await hostView(pin, host), await playerView(pin, player)); // countdown
        advance(FIRST_QUESTION_LEAD_MS);
        snapshots.push(await hostView(pin, host), await playerView(pin, player)); // open
        await answer(pin, player, 0, CORRECT[0]!);
        snapshots.push(await hostView(pin, host), await playerView(pin, player)); // answered, still open

        for (const view of snapshots) {
          const json = JSON.stringify(view);
          for (const secret of forbidden) expect(json).not.toContain(secret);
          expect(view.reveal).toBeNull();
        }
      });

      it("hides the question text itself during the pre-question countdown", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Early");
        await act(pin, host, "start");
        const view = await playerView(pin, player);
        expect(view.phase).toBe("countdown");
        expect(view.question).toBeNull();
        expect(JSON.stringify(view)).not.toContain(defaultQuiz.questions[0]!.prompt);
        expect(view.opensAt! - view.serverTime).toBe(FIRST_QUESTION_LEAD_MS);
      });

      it("the submit response never reveals correctness or points", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Quiet");
        await startAndOpen(pin, host);
        const response = await answer(pin, player, 0, CORRECT[0]!);
        expect(response).toEqual({ accepted: true });
      });

      it("reveals the key, explanation and aggregate distribution after the question closes", async () => {
        const { pin, host } = await newGame();
        const a = await join(pin, "Aaa");
        const b = await join(pin, "Bbb");
        await join(pin, "Ccc");
        await startAndOpen(pin, host);
        await answer(pin, a, 0, CORRECT[0]!);
        await answer(pin, b, 0, WRONG[0]!);
        await act(pin, host, "close");

        const view = await hostView(pin, host);
        expect(view.phase).toBe("reveal");
        expect(view.reveal).toMatchObject({
          correctOptionId: CORRECT[0],
          explanation: defaultQuiz.questions[0]!.explanation,
          answeredCount: 2,
        });
        expect(view.reveal?.distribution[CORRECT[0]!]).toBe(1);
        expect(view.reveal?.distribution[WRONG[0]!]).toBe(1);
      });

      it("shows each player only their own choice, never anyone else's", async () => {
        const { pin, host } = await newGame();
        const a = await join(pin, "Owner");
        const b = await join(pin, "Other");
        await join(pin, "Silent"); // keeps the question open
        await startAndOpen(pin, host);
        await answer(pin, a, 0, "a");
        await answer(pin, b, 0, "d");
        const viewA = await playerView(pin, a);
        expect(viewA.me?.selectedOptionId).toBe("a");
        expect(viewA.reveal).toBeNull(); // no distribution before the reveal
        const hostJson = JSON.stringify(await hostView(pin, host));
        expect(hostJson).not.toContain("selectedOptionId"); // the host never sees who picked what
        expect(hostJson).not.toContain("Other");
        // After the reveal only aggregate counts are shown — still no per-player choices.
        await act(pin, host, "close");
        const revealed = JSON.stringify(await playerView(pin, a));
        expect(revealed).not.toContain("Other");
      });

      it("only shows the roster in the lobby", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Roster");
        expect((await playerView(pin, player)).roster).toHaveLength(1);
        await startAndOpen(pin, host);
        expect((await playerView(pin, player)).roster).toBeNull();
        expect((await hostView(pin, host)).roster).toBeNull();
      });
    });

    describe("answering", () => {
      it("rejects answers before the question opens", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Eager");
        await act(pin, host, "start");
        await expectError(answer(pin, player, 0, "a"), "QUESTION_NOT_OPEN");
      });

      it("rejects answers in the lobby, for the wrong question and for unknown options", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Confused");
        await expectError(answer(pin, player, 0, "a"), "QUESTION_CLOSED");
        await startAndOpen(pin, host);
        await expectError(answer(pin, player, 1, "a"), "QUESTION_CLOSED");
        await expectError(answer(pin, player, 0, "z"), "INVALID_OPTION");
        await expect(answer(pin, player, 0, "a")).resolves.toEqual({ accepted: true });
      });

      it("requires a valid player credential", async () => {
        const { pin, host } = await newGame();
        await join(pin, "Real");
        await startAndOpen(pin, host);
        await expectError(answer(pin, {}, 0, "a"), "UNAUTHORIZED");
        await expectError(answer(pin, host, 0, "a"), "UNAUTHORIZED");
      });

      it("keeps the first answer and rejects a second one (no changing answers)", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Hasty");
        await join(pin, "Slowpoke");
        await startAndOpen(pin, host);
        await answer(pin, player, 0, WRONG[0]!);
        await expectError(answer(pin, player, 0, CORRECT[0]!), "ALREADY_ANSWERED");
        await act(pin, host, "close");
        const view = await playerView(pin, player);
        expect(view.me).toMatchObject({ selectedOptionId: WRONG[0], result: { correct: false, points: 0 }, score: 0 });
      });

      it("resolves simultaneous duplicate submissions to exactly one stored answer", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Doubleclick");
        await join(pin, "Bystander");
        await startAndOpen(pin, host);
        const outcomes = await Promise.allSettled(Array.from({ length: 10 }, () => answer(pin, player, 0, CORRECT[0]!)));
        expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
        for (const o of outcomes.filter((o) => o.status === "rejected")) expect((o as PromiseRejectedResult).reason.code).toBe("ALREADY_ANSWERED");
        expect((await hostView(pin, host)).answeredCount).toBe(1);
      });

      it("throttles answer spam from one player", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Spammy");
        await join(pin, "Other");
        await startAndOpen(pin, host);
        const codes: string[] = [];
        for (let i = 0; i < 40; i += 1) {
          try {
            await answer(pin, player, 0, "a");
          } catch (error) {
            codes.push((error as AppError).code);
          }
        }
        expect(codes).toContain("RATE_LIMITED");
      });
    });

    describe("deadlines (server clock)", () => {
      it("accepts an answer inside the grace window and scores it as the slowest correct answer", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Buzzer");
        await join(pin, "Waiting");
        await startAndOpen(pin, host);
        advance(20_000 + ANSWER_GRACE_MS - 1); // displayed clock is at zero, grace not yet over
        await expect(answer(pin, player, 0, CORRECT[0]!)).resolves.toEqual({ accepted: true });
        advance(1);
        const view = await playerView(pin, player);
        expect(view.phase).toBe("reveal");
        expect(view.me).toMatchObject({ result: { correct: true, points: 800 }, score: 800 });
      });

      it("rejects an answer after the grace window, and the question auto-reveals", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "TooSlow");
        await join(pin, "Waiting");
        await startAndOpen(pin, host);
        advance(20_000 + ANSWER_GRACE_MS);
        await expectError(answer(pin, player, 0, CORRECT[0]!), "QUESTION_CLOSED");
        const view = await hostView(pin, host);
        expect(view.phase).toBe("reveal");
        expect(view.reveal?.answeredCount).toBe(0);
        expect((await playerView(pin, player)).me).toMatchObject({ result: { correct: false, points: 0 }, score: 0 });
      });

      it("honours the host's time-limit override", async () => {
        const { pin, host } = await newGame({ timeLimitSec: 5 });
        const player = await join(pin, "Short");
        await join(pin, "Waiting");
        await startAndOpen(pin, host);
        expect((await playerView(pin, player)).question?.timeLimitSec).toBe(5);
        advance(5_000 + ANSWER_GRACE_MS);
        await expectError(answer(pin, player, 0, "a"), "QUESTION_CLOSED");
      });

      it("closes the question early when everybody has answered", async () => {
        const { pin, host } = await newGame();
        const a = await join(pin, "One");
        const b = await join(pin, "Two");
        await startAndOpen(pin, host);
        await answer(pin, a, 0, "a");
        expect((await hostView(pin, host)).phase).toBe("open");
        await answer(pin, b, 0, "b");
        expect((await hostView(pin, host)).phase).toBe("reveal");
      });

      it("lets the host close early; later answers are refused", async () => {
        const { pin, host } = await newGame();
        const a = await join(pin, "Early");
        const b = await join(pin, "Later");
        await startAndOpen(pin, host);
        await answer(pin, a, 0, CORRECT[0]!);
        await act(pin, host, "close");
        await expectError(answer(pin, b, 0, CORRECT[0]!), "QUESTION_CLOSED");
      });

      it("handles answers racing with the deadline: each answer is either scored or rejected, never lost", async () => {
        const { pin, host } = await newGame();
        const players = await Promise.all(Array.from({ length: 20 }, (_, i) => join(pin, `racer${i}`)));
        await startAndOpen(pin, host);
        advance(20_000 + ANSWER_GRACE_MS - 5);
        const outcomes = await Promise.allSettled(players.map((p, i) => {
          if (i === 10) advance(10); // the deadline passes while some requests are in flight
          return answer(pin, p, 0, CORRECT[0]!);
        }));
        const accepted = outcomes.filter((o) => o.status === "fulfilled").length;
        const view = await hostView(pin, host);
        expect(view.phase).toBe("reveal");
        expect(view.reveal?.answeredCount).toBe(accepted);
        for (const o of outcomes) {
          if (o.status === "rejected") expect(["QUESTION_CLOSED"]).toContain((o.reason as AppError).code);
        }
      });
    });

    describe("pause and resume", () => {
      it("refuses answers while paused and gives back the time on resume", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Patient");
        await join(pin, "Waiting");
        await startAndOpen(pin, host);
        advance(5_000); // 15s left
        await act(pin, host, "pause");
        const paused = await playerView(pin, player);
        expect(paused.phase).toBe("paused");
        expect(paused.remainingMsWhenPaused).toBe(15_000);
        expect(paused.question?.prompt).toBe(defaultQuiz.questions[0]!.prompt);
        await expectError(answer(pin, player, 0, "a"), "QUESTION_PAUSED");

        advance(60_000); // a long pause must not burn the clock
        expect((await playerView(pin, player)).phase).toBe("paused");
        await act(pin, host, "resume");
        const resumed = await playerView(pin, player);
        expect(resumed.phase).toBe("open");
        expect(resumed.closesAt! - resumed.serverTime).toBe(15_000);

        await answer(pin, player, 0, CORRECT[0]!);
        await act(pin, host, "close");
        // 15s of 20s left → 1000 * (0.8 + 0.2 * 0.75) = 950
        expect((await playerView(pin, player)).me?.result).toEqual({ correct: true, points: 950 });
      });
    });

    describe("scoring and leaderboard", () => {
      it("awards 800–1000 for correct answers by speed, 0 for wrong or missing answers", async () => {
        const { pin, host } = await newGame();
        const fast = await join(pin, "Fast");
        const slow = await join(pin, "Slow");
        const wrong = await join(pin, "Wrong");
        await join(pin, "Silent");
        await startAndOpen(pin, host);
        await answer(pin, wrong, 0, WRONG[0]!); // instant but wrong
        advance(5_000);
        await answer(pin, fast, 0, CORRECT[0]!); // 15s left → 950
        advance(10_000);
        await answer(pin, slow, 0, CORRECT[0]!); // 5s left → 850
        await act(pin, host, "close");

        expect((await playerView(pin, fast)).me).toMatchObject({ score: 950, rank: 1 });
        expect((await playerView(pin, slow)).me).toMatchObject({ score: 850, rank: 2 });
        expect((await playerView(pin, wrong)).me).toMatchObject({ score: 0, rank: 3 }); // tied with Silent
        await act(pin, host, "advance");
        const board = await hostView(pin, host);
        expect(board.phase).toBe("leaderboard");
        expect(board.standings?.map((s) => [s.nickname, s.rank, s.score, s.lastPoints])).toEqual([
          ["Fast", 1, 950, 950],
          ["Slow", 2, 850, 850],
          ["Silent", 3, 0, 0],
          ["Wrong", 3, 0, 0],
        ]);
      });

      it("keeps scores hidden until the reveal (no live leaderboard leaks)", async () => {
        const { pin, host } = await newGame();
        const a = await join(pin, "Hidden");
        await join(pin, "Waiting");
        await startAndOpen(pin, host);
        await answer(pin, a, 0, CORRECT[0]!);
        const view = await playerView(pin, a);
        expect(view.me?.score).toBe(0);
        expect(view.standings).toBeNull();
        expect(view.me?.result).toBeNull();
      });

      it("shows a player outside the top five their own standing", async () => {
        const { pin, host } = await newGame();
        const players: Credentials[] = [];
        for (let i = 0; i < 8; i += 1) players.push(await join(pin, `player${i}`));
        await startAndOpen(pin, host);
        for (const [i, p] of players.entries()) {
          advance(100);
          await answer(pin, p, 0, i < 7 ? CORRECT[0]! : WRONG[0]!);
        }
        const last = players[7]!;
        const view = await (async () => {
          await act(pin, host, "advance");
          return playerView(pin, last);
        })();
        expect(view.phase).toBe("leaderboard");
        expect(view.standings).toHaveLength(5);
        expect(view.you).toMatchObject({ nickname: "player7", isYou: true, score: 0 });
      });

      it("cumulates scores across questions", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Steady");
        await join(pin, "Other");
        await startAndOpen(pin, host);
        await answer(pin, player, 0, CORRECT[0]!); // instant → 1000
        await act(pin, host, "close");
        await nextQuestion(pin, host);
        advance(10_000);
        await answer(pin, player, 1, CORRECT[1]!); // 10s left → 900
        await act(pin, host, "close");
        expect((await playerView(pin, player)).me).toMatchObject({ score: 1900, result: { correct: true, points: 900 } });
      });
    });

    describe("a complete game", () => {
      it("plays all seven questions and ends on a correct podium", async () => {
        const { pin, host } = await newGame();
        const champion = await join(pin, "Champion"); // always right, always instant
        const runnerUp = await join(pin, "Runner Up"); // right on 5 of 7
        const third = await join(pin, "Third"); // right on 3 of 7
        const fourth = await join(pin, "Fourth"); // never right

        await startAndOpen(pin, host);
        for (let q = 0; q < 7; q += 1) {
          await answer(pin, champion, q, CORRECT[q]!);
          await answer(pin, runnerUp, q, q < 5 ? CORRECT[q]! : WRONG[q]!);
          await answer(pin, third, q, q < 3 ? CORRECT[q]! : WRONG[q]!);
          await answer(pin, fourth, q, WRONG[q]!);
          expect((await hostView(pin, host)).phase).toBe("reveal"); // everyone answered → auto reveal
          if (q < 6) await nextQuestion(pin, host);
        }
        await act(pin, host, "advance"); // reveal of the last question → finished

        const finalView = await hostView(pin, host);
        expect(finalView.phase).toBe("finished");
        expect(finalView.standings?.map((s) => [s.nickname, s.rank, s.score])).toEqual([
          ["Champion", 1, 7000],
          ["Runner Up", 2, 5000],
          ["Third", 3, 3000],
          ["Fourth", 4, 0],
        ]);
        expect(finalView.podium?.map((g) => [g.rank, g.players.map((p) => p.nickname)])).toEqual([[1, ["Champion"]], [2, ["Runner Up"]], [3, ["Third"]]]);
        expect((await playerView(pin, third)).me).toMatchObject({ rank: 3, score: 3000 });
        expect((await playerView(pin, fourth)).me).toMatchObject({ rank: 4, score: 0 });
      });

      it("handles ties with a shared rank on the podium", async () => {
        const { pin, host } = await newGame();
        const a = await join(pin, "Twin A");
        const b = await join(pin, "Twin B");
        const c = await join(pin, "Solo C");
        await startAndOpen(pin, host);
        for (let q = 0; q < 7; q += 1) {
          await answer(pin, a, q, CORRECT[q]!);
          await answer(pin, b, q, CORRECT[q]!);
          await answer(pin, c, q, WRONG[q]!);
          if (q < 6) await nextQuestion(pin, host);
        }
        await act(pin, host, "advance");
        const view = await hostView(pin, host);
        expect(view.standings?.map((s) => [s.nickname, s.rank])).toEqual([["Twin A", 1], ["Twin B", 1], ["Solo C", 3]]);
        // Co-winners share the gold step; Solo C scored nothing, so there is no bronze.
        expect(view.podium?.map((g) => [g.rank, g.players.map((p) => p.nickname)])).toEqual([[1, ["Twin A", "Twin B"]]]);
      });

      it("gives a shared 3rd place its own bronze step when ranks 1 and 2 are taken", async () => {
        const { pin, host } = await newGame();
        const a = await join(pin, "Gold");
        const b = await join(pin, "Silver");
        const c = await join(pin, "Bronze");
        await startAndOpen(pin, host);
        for (let q = 0; q < 7; q += 1) {
          await answer(pin, a, q, CORRECT[q]!);
          await answer(pin, b, q, q < 4 ? CORRECT[q]! : WRONG[q]!);
          await answer(pin, c, q, q < 1 ? CORRECT[q]! : WRONG[q]!);
          if (q < 6) await nextQuestion(pin, host);
        }
        await act(pin, host, "advance");
        const view = await hostView(pin, host);
        expect(view.podium?.map((g) => [g.rank, g.players.map((p) => p.nickname)])).toEqual([[1, ["Gold"]], [2, ["Silver"]], [3, ["Bronze"]]]);
      });

      it("works with fewer than three players", async () => {
        const { pin, host } = await newGame();
        const only = await join(pin, "Lonely");
        await startAndOpen(pin, host);
        for (let q = 0; q < 7; q += 1) {
          await answer(pin, only, q, CORRECT[q]!);
          if (q < 6) await nextQuestion(pin, host);
        }
        await act(pin, host, "advance");
        const view = await playerView(pin, only);
        expect(view.phase).toBe("finished");
        expect(view.podium).toHaveLength(1);
        expect(view.podium?.[0]).toMatchObject({ rank: 1 });
        expect(view.me).toMatchObject({ rank: 1, score: 7000 });
      });

      it("lets the host end the game early; everyone gets the podium of what was played", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Quitter");
        await join(pin, "Waiting");
        await startAndOpen(pin, host);
        await answer(pin, player, 0, CORRECT[0]!);
        await act(pin, host, "close");
        await act(pin, host, "end");
        const view = await playerView(pin, player);
        expect(view.phase).toBe("finished");
        expect(view.podium?.[0]?.players[0]?.nickname).toBe("Quitter");
        await expectError(act(pin, host, "end"), "INVALID_ACTION");
      });

      it("survives a host refresh: state is server-side and the host credential persists", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Steady");
        await startAndOpen(pin, host);
        await answer(pin, player, 0, CORRECT[0]!);
        // "Refresh": a brand-new request with the same credentials gets the same truth.
        const before = await hostView(pin, host);
        const after = await hostView(pin, { hostToken: host.hostToken });
        expect(after).toEqual({ ...before, serverTime: after.serverTime });
        expect(after.answeredCount).toBe(1);
      });

      it("survives a player refresh mid-question and shows their submission", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Refresher");
        await join(pin, "Waiting");
        await startAndOpen(pin, host);
        await answer(pin, player, 0, "c");
        const reloaded = await playerView(pin, { playerCookie: player.playerCookie });
        expect(reloaded.me).toMatchObject({ answered: true, selectedOptionId: "c" });
        expect(reloaded.question?.prompt).toBe(defaultQuiz.questions[0]!.prompt);
      });
    });

    describe("option shuffling", () => {
      it("gives host and players the same shuffled order, and scoring still uses option ids", async () => {
        const { pin, host } = await newGame({ shuffleOptions: true });
        const player = await join(pin, "Shuffled");
        const other = await join(pin, "Waiting");
        await startAndOpen(pin, host);
        const forHost = (await hostView(pin, host)).question!;
        const forPlayer = (await playerView(pin, player)).question!;
        const forOther = (await playerView(pin, other)).question!;
        expect(forPlayer.options).toEqual(forHost.options);
        expect(forOther.options).toEqual(forHost.options);
        expect(forHost.options.map((o) => o.id).sort()).toEqual(["a", "b", "c", "d"]);
        // The text shown for the correct id is still the authored correct text.
        const correctText = defaultQuiz.questions[0]!.options.find((o) => o.id === CORRECT[0])!.text;
        expect(forHost.options.find((o) => o.id === CORRECT[0])?.text).toBe(correctText);
        await answer(pin, player, 0, CORRECT[0]!);
        await act(pin, host, "close");
        expect((await playerView(pin, player)).me?.result?.correct).toBe(true);
      });
    });

    describe("expiry", () => {
      it("stops serving a game after it expires", async () => {
        const { pin, host } = await newGame();
        const player = await join(pin, "Gone");
        advance(7 * 3600_000);
        await expectError(hostView(pin, host), "GAME_EXPIRED");
        await expectError(playerView(pin, player), "GAME_EXPIRED");
        await expectError(service.hostAction(pin, host, { action: "end", expectedVersion: 0 }), "GAME_EXPIRED");
        advance(-7 * 3600_000);
      });
    });
  });
}
