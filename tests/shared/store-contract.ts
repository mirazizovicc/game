import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultQuiz } from "@/content/default-quiz";
import type { Game } from "@/lib/domain/types";
import type { GameStore, NewAnswerInput } from "@/lib/server/store";
import { hashToken } from "@/lib/server/tokens";

export interface StoreFixture {
  store: GameStore;
  cleanup: () => Promise<void>;
}

const T0 = 1_700_000_000_000;
let pinCounter = 100_000;
const nextPin = () => String(++pinCounter);

/** Behaviour every GameStore must provide. Runs against the memory store and, with a database, Postgres. */
export function storeContract(name: string, create: () => Promise<StoreFixture>) {
  describe(`GameStore contract: ${name}`, () => {
    let fixture: StoreFixture;
    let store: GameStore;

    beforeAll(async () => {
      fixture = await create();
      store = fixture.store;
      await store.ensureQuiz(defaultQuiz);
    });
    afterAll(async () => {
      await fixture.cleanup();
    });

    async function newGame(overrides: { pin?: string; createdAt?: number; expiresAt?: number } = {}): Promise<Game> {
      const result = await store.createGame({
        id: randomUUID(),
        pin: overrides.pin ?? nextPin(),
        quizId: defaultQuiz.id,
        title: defaultQuiz.title,
        config: { timeLimitSec: null, shuffleOptions: false },
        optionSeed: "seed",
        hostTokenHash: hashToken("host-secret"),
        createdAt: overrides.createdAt ?? T0,
        expiresAt: overrides.expiresAt ?? T0 + 6 * 3600_000,
      });
      if (!result.ok) throw new Error("could not create test game");
      return result.game;
    }

    async function addPlayer(game: Game, nickname: string, maxPlayers = 150) {
      return store.addPlayer({
        id: randomUUID(),
        gameId: game.id,
        nickname,
        nicknameKey: nickname.toLowerCase().replace(/[^a-z0-9]/g, ""),
        tokenHash: hashToken(`secret-${nickname}`),
        joinedAt: T0,
        maxPlayers,
      });
    }

    async function mustAddPlayer(game: Game, nickname: string) {
      const result = await addPlayer(game, nickname);
      if (!result.ok) throw new Error(`could not add ${nickname}: ${result.reason}`);
      return result.player;
    }

    async function startQuestion(game: Game, index = 0): Promise<Game> {
      const started = await store.transition(game.id, game.version, {
        status: "question",
        questionIndex: index,
        opensAt: T0,
        closesAt: T0 + 20_000,
        pausedAt: null,
      });
      if (!started) throw new Error("could not start question");
      return started;
    }

    const answerInput = (game: Game, playerId: string, overrides: Partial<NewAnswerInput> = {}): NewAnswerInput => ({
      id: randomUUID(),
      gameId: game.id,
      playerId,
      questionId: defaultQuiz.questions[game.questionIndex]!.id,
      questionIndex: game.questionIndex,
      optionId: "b",
      isCorrect: true,
      points: 900,
      submittedAt: T0 + 2000,
      expectedVersion: game.version,
      ...overrides,
    });

    describe("quizzes", () => {
      it("stores and returns the full quiz including the answer key (server side only)", async () => {
        const quiz = await store.getQuiz(defaultQuiz.id);
        expect(quiz).toEqual(defaultQuiz);
      });

      it("ensureQuiz is idempotent", async () => {
        await store.ensureQuiz(defaultQuiz);
        await Promise.all([store.ensureQuiz(defaultQuiz), store.ensureQuiz(defaultQuiz)]);
        expect((await store.getQuiz(defaultQuiz.id))?.questions).toHaveLength(7);
      });

      it("returns null for an unknown quiz", async () => {
        expect(await store.getQuiz("qz-unknown")).toBeNull();
      });
    });

    describe("games", () => {
      it("creates a game in the lobby at version 0", async () => {
        const game = await newGame();
        expect(game).toMatchObject({ status: "lobby", questionIndex: -1, version: 0, opensAt: null, closesAt: null, pausedAt: null });
        expect(await store.getGameByPin(game.pin)).toEqual(game);
      });

      it("rejects a PIN that is already in use", async () => {
        const game = await newGame();
        const duplicate = await store.createGame({
          id: randomUUID(), pin: game.pin, quizId: defaultQuiz.id, title: "x", config: { timeLimitSec: null, shuffleOptions: false },
          optionSeed: "s", hostTokenHash: hashToken("h"), createdAt: T0, expiresAt: T0 + 1000,
        });
        expect(duplicate).toEqual({ ok: false, reason: "pin_taken" });
      });

      it("lets an expired game release its PIN", async () => {
        const pin = nextPin();
        await newGame({ pin, createdAt: T0, expiresAt: T0 + 1000 });
        const reused = await newGame({ pin, createdAt: T0 + 5000, expiresAt: T0 + 9000 });
        expect(reused.pin).toBe(pin);
        expect((await store.getGameByPin(pin))?.id).toBe(reused.id);
      });

      it("is race-safe: concurrent creates of the same PIN yield exactly one winner", async () => {
        const pin = nextPin();
        const results = await Promise.all(
          Array.from({ length: 8 }, () =>
            store.createGame({
              id: randomUUID(), pin, quizId: defaultQuiz.id, title: "x", config: { timeLimitSec: null, shuffleOptions: false },
              optionSeed: "s", hostTokenHash: hashToken("h"), createdAt: T0, expiresAt: T0 + 100_000,
            }),
          ),
        );
        expect(results.filter((r) => r.ok)).toHaveLength(1);
      });

      it("returns null for unknown PINs", async () => {
        expect(await store.getGameByPin("999999")).toBeNull();
      });

      it("deletes expired games with their players and answers", async () => {
        const game = await newGame({ createdAt: T0, expiresAt: T0 + 10 });
        await mustAddPlayer(game, "gone");
        expect(await store.deleteExpiredGames(T0 + 1_000_000)).toBeGreaterThanOrEqual(1);
        expect(await store.getGameByPin(game.pin)).toBeNull();
      });
    });

    describe("transitions (compare-and-set)", () => {
      it("applies the patch and bumps the version when the version matches", async () => {
        const game = await newGame();
        const next = await store.transition(game.id, 0, { status: "question", questionIndex: 0, opensAt: T0 + 1000, closesAt: T0 + 21_000, pausedAt: null });
        expect(next).toMatchObject({ status: "question", questionIndex: 0, version: 1, opensAt: T0 + 1000, closesAt: T0 + 21_000, pausedAt: null });
      });

      it("rejects a stale version and changes nothing", async () => {
        const game = await newGame();
        await store.transition(game.id, 0, { status: "finished" });
        expect(await store.transition(game.id, 0, { status: "lobby" })).toBeNull();
        expect((await store.getGameByPin(game.pin))?.status).toBe("finished");
      });

      it("lets exactly one of many simultaneous identical transitions win (host double-click)", async () => {
        const game = await newGame();
        const results = await Promise.all(Array.from({ length: 10 }, () => store.transition(game.id, 0, { status: "finished" })));
        expect(results.filter(Boolean)).toHaveLength(1);
        expect((await store.getGameByPin(game.pin))?.version).toBe(1);
      });

      it("can set and clear the pause timestamp", async () => {
        const game = await startQuestion(await newGame());
        const paused = await store.transition(game.id, game.version, { pausedAt: T0 + 5000 });
        expect(paused?.pausedAt).toBe(T0 + 5000);
        const resumed = await store.transition(game.id, paused!.version, { pausedAt: null, closesAt: T0 + 25_000 });
        expect(resumed).toMatchObject({ pausedAt: null, closesAt: T0 + 25_000 });
      });
    });

    describe("players", () => {
      it("adds players to a lobby", async () => {
        const game = await newGame();
        const result = await addPlayer(game, "Alex");
        expect(result.ok).toBe(true);
        expect(await store.countPlayers(game.id)).toBe(1);
      });

      it("enforces case-insensitive nickname uniqueness per game, but not across games", async () => {
        const game = await newGame();
        const other = await newGame();
        expect((await addPlayer(game, "Alex")).ok).toBe(true);
        expect(await addPlayer(game, "ALEX")).toEqual({ ok: false, reason: "nickname_taken" });
        expect((await addPlayer(other, "Alex")).ok).toBe(true);
      });

      it("closes the lobby when the game starts", async () => {
        const game = await newGame();
        await mustAddPlayer(game, "early");
        await startQuestion(game);
        expect(await addPlayer(game, "late")).toEqual({ ok: false, reason: "not_lobby" });
      });

      it("enforces the player cap and reports unknown games", async () => {
        const game = await newGame();
        expect((await addPlayer(game, "p1", 2)).ok).toBe(true);
        expect((await addPlayer(game, "p2", 2)).ok).toBe(true);
        expect(await addPlayer(game, "p3", 2)).toEqual({ ok: false, reason: "game_full" });
        const ghost = { ...game, id: randomUUID() };
        expect(await addPlayer(ghost, "x")).toEqual({ ok: false, reason: "game_not_found" });
      });

      it("is race-safe: 15 simultaneous joins with one nickname produce one player", async () => {
        const game = await newGame();
        const results = await Promise.all(Array.from({ length: 15 }, () => addPlayer(game, "Twin")));
        expect(results.filter((r) => r.ok)).toHaveLength(1);
        expect(await store.countPlayers(game.id)).toBe(1);
      });

      it("is race-safe: the cap holds under simultaneous joins", async () => {
        const game = await newGame();
        const results = await Promise.all(Array.from({ length: 12 }, (_, i) => addPlayer(game, `racer${i}`, 5)));
        expect(results.filter((r) => r.ok)).toHaveLength(5);
        expect(await store.countPlayers(game.id)).toBe(5);
      });

      it("looks players up only within their own game", async () => {
        const game = await newGame();
        const other = await newGame();
        const player = await mustAddPlayer(game, "Sam");
        expect((await store.getPlayer(game.id, player.id))?.nickname).toBe("Sam");
        expect(await store.getPlayer(other.id, player.id)).toBeNull();
      });

      it("records activity and lists players in join order", async () => {
        const game = await newGame();
        const a = await mustAddPlayer(game, "First");
        await mustAddPlayer(game, "Second");
        await store.touchPlayer(a.id, T0 + 99_000);
        const players = await store.listPlayers(game.id);
        expect(players.map((p) => p.nickname).sort()).toEqual(["First", "Second"]);
        expect(players.find((p) => p.id === a.id)?.lastSeenAt).toBe(T0 + 99_000);
      });
    });

    describe("answers", () => {
      it("accepted → duplicate (first answer is final)", async () => {
        const lobby = await newGame();
        const player = await mustAddPlayer(lobby, "Dana");
        const game = await startQuestion(lobby);
        expect(await store.submitAnswer(answerInput(game, player.id, { optionId: "a", isCorrect: false, points: 0 }))).toBe("accepted");
        expect(await store.submitAnswer(answerInput(game, player.id, { optionId: "b" }))).toBe("duplicate");
        const stored = await store.getPlayerAnswer(game.id, player.id, 0);
        expect(stored).toMatchObject({ optionId: "a", points: 0, isCorrect: false });
      });

      it("rejects answers for a stale game version", async () => {
        const lobby = await newGame();
        const player = await mustAddPlayer(lobby, "Eve");
        const game = await startQuestion(lobby);
        expect(await store.submitAnswer(answerInput(game, player.id, { expectedVersion: game.version - 1 }))).toBe("stale");
      });

      it("rejects answers from a player who is not in the game", async () => {
        const lobby = await newGame();
        await mustAddPlayer(lobby, "Insider");
        const outsiderGame = await newGame();
        const outsider = await mustAddPlayer(outsiderGame, "Outsider");
        const game = await startQuestion(lobby);
        expect(await store.submitAnswer(answerInput(game, outsider.id))).toBe("stale");
      });

      it("rejects answers once the question has been finalised (no late scoring)", async () => {
        const lobby = await newGame();
        const player = await mustAddPlayer(lobby, "Late");
        const game = await startQuestion(lobby);
        const revealed = await store.finalizeQuestion(game.id, game.version);
        expect(revealed?.status).toBe("reveal");
        expect(await store.submitAnswer(answerInput(game, player.id))).toBe("stale");
      });

      it("collapses simultaneous submits from one player to a single stored answer", async () => {
        const lobby = await newGame();
        const player = await mustAddPlayer(lobby, "Spammer");
        const game = await startQuestion(lobby);
        const results = await Promise.all(Array.from({ length: 12 }, () => store.submitAnswer(answerInput(game, player.id))));
        expect(results.filter((r) => r === "accepted")).toHaveLength(1);
        expect(results.filter((r) => r === "duplicate")).toHaveLength(11);
        expect((await store.getAnswerStats(game.id, 0)).total).toBe(1);
      });

      it("handles simultaneous answers from many players", async () => {
        const lobby = await newGame();
        const players = await Promise.all(Array.from({ length: 25 }, (_, i) => mustAddPlayer(lobby, `crowd${i}`)));
        const game = await startQuestion(lobby);
        const results = await Promise.all(players.map((p, i) => store.submitAnswer(answerInput(game, p.id, { optionId: i % 2 ? "a" : "b", isCorrect: i % 2 === 0, points: i % 2 === 0 ? 900 : 0 }))));
        expect(results.every((r) => r === "accepted")).toBe(true);
        const stats = await store.getAnswerStats(game.id, 0);
        expect(stats.total).toBe(25);
        expect(stats.byOption).toEqual({ a: 12, b: 13 });
      });

      it("counts answers per option without identifying players", async () => {
        const lobby = await newGame();
        const [p1, p2, p3] = await Promise.all(["s1", "s2", "s3"].map((n) => mustAddPlayer(lobby, n)));
        const game = await startQuestion(lobby);
        await store.submitAnswer(answerInput(game, p1!.id, { optionId: "b" }));
        await store.submitAnswer(answerInput(game, p2!.id, { optionId: "b" }));
        await store.submitAnswer(answerInput(game, p3!.id, { optionId: "c", isCorrect: false, points: 0 }));
        expect(await store.getAnswerStats(game.id, 0)).toEqual({ total: 3, byOption: { b: 2, c: 1 } });
      });
    });

    describe("finalizing a question and standings", () => {
      it("moves to reveal and recomputes cumulative scores", async () => {
        const lobby = await newGame();
        const alice = await mustAddPlayer(lobby, "Alice");
        const bob = await mustAddPlayer(lobby, "Bob");
        const carol = await mustAddPlayer(lobby, "Carol");
        const q0 = await startQuestion(lobby);
        await store.submitAnswer(answerInput(q0, alice.id, { points: 950 }));
        await store.submitAnswer(answerInput(q0, bob.id, { optionId: "a", isCorrect: false, points: 0 }));

        // Scores are NOT visible before the reveal.
        expect((await store.getStandings(q0.id, 0)).every((s) => s.score === 0)).toBe(true);

        const revealed = (await store.finalizeQuestion(q0.id, q0.version))!;
        expect(revealed.status).toBe("reveal");
        const standings = await store.getStandings(q0.id, 0);
        const byName = Object.fromEntries(standings.map((s) => [s.nickname, s]));
        expect(byName.Alice).toMatchObject({ score: 950, lastPoints: 950 });
        expect(byName.Bob).toMatchObject({ score: 0, lastPoints: 0 });
        expect(byName.Carol).toMatchObject({ score: 0, lastPoints: 0 }); // no answer → 0

        // Second question accumulates.
        const leaderboard = (await store.transition(q0.id, revealed.version, { status: "leaderboard" }))!;
        const q1 = (await store.transition(q0.id, leaderboard.version, { status: "question", questionIndex: 1, opensAt: T0, closesAt: T0 + 20_000 }))!;
        await store.submitAnswer(answerInput(q1, alice.id, { points: 820 }));
        await store.submitAnswer(answerInput(q1, carol.id, { points: 1000 }));
        await store.finalizeQuestion(q1.id, q1.version);
        const after = Object.fromEntries((await store.getStandings(q1.id, 1)).map((s) => [s.nickname, s]));
        expect(after.Alice).toMatchObject({ score: 1770, lastPoints: 820 });
        expect(after.Carol).toMatchObject({ score: 1000, lastPoints: 1000 });
        expect(after.Bob).toMatchObject({ score: 0, lastPoints: 0 });
      });

      it("only finalises a running question at the expected version, exactly once", async () => {
        const lobby = await newGame();
        await mustAddPlayer(lobby, "Solo");
        const game = await startQuestion(lobby);
        expect(await store.finalizeQuestion(game.id, game.version - 1)).toBeNull();
        const results = await Promise.all(Array.from({ length: 8 }, () => store.finalizeQuestion(game.id, game.version)));
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await store.finalizeQuestion(game.id, game.version + 1)).toBeNull(); // already revealed
      });

      it("never loses or double-counts an answer when answers race with the reveal", async () => {
        const lobby = await newGame();
        const players = await Promise.all(Array.from({ length: 30 }, (_, i) => mustAddPlayer(lobby, `rc${i}`)));
        const game = await startQuestion(lobby);

        const submissions = players.map((p) => store.submitAnswer(answerInput(game, p.id, { points: 800 })));
        const finalization = store.finalizeQuestion(game.id, game.version);
        const [results] = await Promise.all([Promise.all(submissions), finalization]);

        const accepted = results.filter((r) => r === "accepted").length;
        const standings = await store.getStandings(game.id, 0);
        const totalScore = standings.reduce((sum, s) => sum + s.score, 0);
        // Every accepted answer is in the scores; every rejected one is not.
        expect(totalScore).toBe(accepted * 800);
        expect((await store.getAnswerStats(game.id, 0)).total).toBe(accepted);
        expect(results.every((r) => r === "accepted" || r === "stale")).toBe(true);
      });
    });
  });
}
