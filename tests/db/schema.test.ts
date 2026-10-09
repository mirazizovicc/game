import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultQuiz } from "@/content/default-quiz";
import { hashToken } from "@/lib/server/tokens";
import { ADMIN_URL, createTestDatabase, migrationSql, type TestDatabase } from "./helpers";

describe.skipIf(!ADMIN_URL)("database schema, constraints and access control", () => {
  let db: TestDatabase;
  const hash = hashToken("x");

  beforeAll(async () => {
    db = await createTestDatabase();
    await db.store.ensureQuiz(defaultQuiz);
  });
  afterAll(async () => {
    await db.drop();
  });

  async function insertGame(pin: string, id = randomUUID()) {
    await db.pool.query(
      "insert into games (id, pin, quiz_id, title, option_seed, host_token_hash, expires_at) values ($1,$2,$3,'t','s',$4, now() + interval '1 hour')",
      [id, pin, defaultQuiz.id, hash],
    );
    return id;
  }
  async function insertPlayer(gameId: string, nickname: string, key = nickname.toLowerCase()) {
    const id = randomUUID();
    await db.pool.query("insert into players (id, game_id, nickname, nickname_key, token_hash) values ($1,$2,$3,$4,$5)", [id, gameId, nickname, key, hash]);
    return id;
  }

  it("migrations are idempotent (safe to run twice)", async () => {
    for (const sql of migrationSql()) await db.pool.query(sql);
  });

  describe("constraints", () => {
    it("rejects malformed and duplicate PINs", async () => {
      await expect(insertGame("12345")).rejects.toThrow(/check/i);
      await expect(insertGame("12345a")).rejects.toThrow(/check/i);
      await insertGame("700001");
      await expect(insertGame("700001")).rejects.toThrow(/unique|duplicate/i);
    });

    it("rejects an unknown game status and a negative version", async () => {
      const id = await insertGame("700002");
      await expect(db.pool.query("update games set status = 'hacked' where id = $1", [id])).rejects.toThrow(/check/i);
      await expect(db.pool.query("update games set version = -1 where id = $1", [id])).rejects.toThrow(/check/i);
    });

    it("rejects a running question without a deadline", async () => {
      const id = await insertGame("700003");
      await expect(db.pool.query("update games set status = 'question', question_index = 0 where id = $1", [id])).rejects.toThrow(/check/i);
    });

    it("enforces case-insensitive nickname uniqueness through nickname_key", async () => {
      const gameId = await insertGame("700004");
      await insertPlayer(gameId, "Alex", "alex");
      await expect(insertPlayer(gameId, "ALEX", "alex")).rejects.toThrow(/unique|duplicate/i);
      const other = await insertGame("700005");
      await insertPlayer(other, "Alex", "alex");
    });

    it("rejects out-of-range nicknames and negative scores", async () => {
      const gameId = await insertGame("700006");
      await expect(insertPlayer(gameId, "A", "a")).rejects.toThrow(/check/i);
      await expect(insertPlayer(gameId, "x".repeat(17), "x".repeat(17))).rejects.toThrow(/check/i);
      const player = await insertPlayer(gameId, "Valid", "valid");
      await expect(db.pool.query("update players set score = -5 where id = $1", [player])).rejects.toThrow(/check/i);
    });

    it("enforces one answer per player per question at the database level", async () => {
      const gameId = await insertGame("700007");
      const playerId = await insertPlayer(gameId, "Once", "once");
      const insert = (optionId: string) =>
        db.pool.query(
          "insert into answers (id, game_id, player_id, question_id, question_index, selected_option_id, submitted_at, is_correct, points) values ($1,$2,$3,$4,0,$5,now(),true,900)",
          [randomUUID(), gameId, playerId, defaultQuiz.questions[0]!.id, optionId],
        );
      await insert("a");
      await expect(insert("b")).rejects.toThrow(/unique|duplicate/i);
    });

    it("rejects impossible answer scores (more than 1000, or points for a wrong answer)", async () => {
      const gameId = await insertGame("700008");
      const playerId = await insertPlayer(gameId, "Cheat", "cheat");
      const insert = (correct: boolean, points: number, index: number) =>
        db.pool.query(
          "insert into answers (id, game_id, player_id, question_id, question_index, selected_option_id, submitted_at, is_correct, points) values ($1,$2,$3,$4,$5,'a',now(),$6,$7)",
          [randomUUID(), gameId, playerId, defaultQuiz.questions[0]!.id, index, correct, points],
        );
      await expect(insert(true, 1001, 0)).rejects.toThrow(/check/i);
      await expect(insert(false, 500, 1)).rejects.toThrow(/check/i);
      await expect(insert(true, -1, 2)).rejects.toThrow(/check/i);
    });

    it("rejects answers that reference a missing player or question (foreign keys)", async () => {
      const gameId = await insertGame("700009");
      await expect(
        db.pool.query(
          "insert into answers (id, game_id, player_id, question_id, question_index, selected_option_id, submitted_at, is_correct, points) values ($1,$2,$3,$4,0,'a',now(),true,900)",
          [randomUUID(), gameId, randomUUID(), defaultQuiz.questions[0]!.id],
        ),
      ).rejects.toThrow(/foreign key/i);
    });

    it("cascades: deleting a game removes its players and answers", async () => {
      const gameId = await insertGame("700010");
      const playerId = await insertPlayer(gameId, "Temp", "temp");
      await db.pool.query(
        "insert into answers (id, game_id, player_id, question_id, question_index, selected_option_id, submitted_at, is_correct, points) values ($1,$2,$3,$4,0,'a',now(),true,900)",
        [randomUUID(), gameId, playerId, defaultQuiz.questions[0]!.id],
      );
      await db.pool.query("delete from games where id = $1", [gameId]);
      expect((await db.pool.query("select count(*)::int n from players where game_id = $1", [gameId])).rows[0].n).toBe(0);
      expect((await db.pool.query("select count(*)::int n from answers where game_id = $1", [gameId])).rows[0].n).toBe(0);
    });

    it("rejects questions with an invalid option count or time limit", async () => {
      await expect(
        db.pool.query("insert into questions (id, quiz_id, position, prompt, options, time_limit_sec) values ('bad1', $1, 99, 'p', '[]'::jsonb, 20)", [defaultQuiz.id]),
      ).rejects.toThrow(/check/i);
      await expect(
        db.pool.query("insert into questions (id, quiz_id, position, prompt, options, time_limit_sec) values ('bad2', $1, 98, 'p', '[{\"id\":\"a\",\"text\":\"x\"},{\"id\":\"b\",\"text\":\"y\"}]'::jsonb, 1)", [defaultQuiz.id]),
      ).rejects.toThrow(/check/i);
    });
  });

  describe("unauthorized access (Supabase anon / authenticated roles)", () => {
    const tables = ["quizzes", "questions", "question_keys", "games", "players", "answers"];

    it("enables row level security on every table", async () => {
      const { rows } = await db.pool.query(
        "select relname, relrowsecurity from pg_class where relname = any($1) and relnamespace = 'public'::regnamespace",
        [tables],
      );
      expect(rows).toHaveLength(tables.length);
      for (const row of rows) expect(row.relrowsecurity, row.relname).toBe(true);
    });

    for (const role of ["anon", "authenticated"]) {
      it(`${role} cannot read the answer key or any other table`, async () => {
        const client = await db.pool.connect();
        try {
          await client.query(`set role ${role}`);
          for (const table of tables) {
            await expect(client.query(`select * from ${table} limit 1`), `${role} select ${table}`).rejects.toThrow(/permission denied/i);
          }
        } finally {
          await client.query("reset role");
          client.release();
        }
      });

      it(`${role} cannot write: no inserts, updates or deletes`, async () => {
        const client = await db.pool.connect();
        try {
          await client.query(`set role ${role}`);
          await expect(client.query("update question_keys set correct_option_id = 'a'")).rejects.toThrow(/permission denied/i);
          await expect(client.query("update players set score = 999999")).rejects.toThrow(/permission denied/i);
          await expect(client.query("delete from games")).rejects.toThrow(/permission denied/i);
          await expect(
            client.query("insert into players (id, game_id, nickname, nickname_key, token_hash) values (gen_random_uuid(), gen_random_uuid(), 'hax', 'hax', $1)", [hash]),
          ).rejects.toThrow(/permission denied/i);
        } finally {
          await client.query("reset role");
          client.release();
        }
      });
    }

    it("even if privileges were re-granted by mistake, RLS (no policies) still hides every row", async () => {
      const gameId = await insertGame("700020");
      await insertPlayer(gameId, "Hidden", "hidden");
      const client = await db.pool.connect();
      try {
        await client.query("begin");
        await client.query("grant select on all tables in schema public to anon");
        await client.query("set local role anon");
        for (const table of tables) {
          const { rows } = await client.query(`select * from ${table}`);
          expect(rows, table).toHaveLength(0);
        }
      } finally {
        await client.query("rollback"); // undo the grant
        client.release();
      }
    });
  });
});
