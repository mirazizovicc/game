import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { GamePatch } from "../domain/game-machine";
import type { AnswerRecord, Game, GameConfig, GameStatus, Player, Question, Quiz, Standing } from "../domain/types";
import type {
  AddPlayerResult,
  AnswerStats,
  CreateGameResult,
  GameStore,
  NewAnswerInput,
  NewGameInput,
  NewPlayerInput,
  SubmitAnswerResult,
} from "./store";

/** epoch-ms ↔ timestamptz helpers (the domain works in epoch milliseconds). */
const toMs = (column: string) => `(extract(epoch from ${column}) * 1000)::bigint`;
const fromMs = (placeholder: string) => `to_timestamp(${placeholder}::double precision / 1000.0)`;

const GAME_COLUMNS = `
  id, pin, quiz_id, title, status, question_index, version,
  ${toMs("opens_at")} as opens_at, ${toMs("closes_at")} as closes_at, ${toMs("paused_at")} as paused_at,
  config, option_seed, ${toMs("created_at")} as created_at, ${toMs("expires_at")} as expires_at, host_token_hash`;

const PLAYER_COLUMNS = `
  id, game_id, nickname, nickname_key, score, token_hash,
  ${toMs("joined_at")} as joined_at, ${toMs("last_seen_at")} as last_seen_at`;

const numberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

function mapGame(row: QueryResultRow): Game {
  return {
    id: row.id,
    pin: row.pin,
    quizId: row.quiz_id,
    title: row.title,
    status: row.status as GameStatus,
    questionIndex: Number(row.question_index),
    version: Number(row.version),
    opensAt: numberOrNull(row.opens_at),
    closesAt: numberOrNull(row.closes_at),
    pausedAt: numberOrNull(row.paused_at),
    config: row.config as GameConfig,
    optionSeed: row.option_seed,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    hostTokenHash: row.host_token_hash,
  };
}

function mapPlayer(row: QueryResultRow): Player {
  return {
    id: row.id,
    gameId: row.game_id,
    nickname: row.nickname,
    nicknameKey: row.nickname_key,
    score: Number(row.score),
    tokenHash: row.token_hash,
    joinedAt: Number(row.joined_at),
    lastSeenAt: Number(row.last_seen_at),
  };
}

const UNIQUE_VIOLATION = "23505";

/**
 * Production store. Talks to PostgreSQL (Supabase) through the server-only
 * DATABASE_URL. Consistency rules:
 *  - joins lock the game row `FOR UPDATE` (serialised with "start");
 *  - answers lock it `FOR SHARE` (concurrent with each other, serialised with reveal);
 *  - reveal locks it `FOR UPDATE`;
 *  - uniqueness (PIN, nickname per game, one answer per player per question)
 *    is enforced by unique constraints, not by application checks.
 */
export class PostgresStore implements GameStore {
  readonly kind = "postgres" as const;

  constructor(private readonly pool: Pool) {}

  private async tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      try {
        await client.query("rollback");
      } catch (rollbackError) {
        console.error("[postgres-store] rollback failed", rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async ensureQuiz(quiz: Quiz): Promise<void> {
    await this.tx(async (client) => {
      const inserted = await client.query(
        "insert into quizzes (id, title, description) values ($1, $2, $3) on conflict (id) do nothing",
        [quiz.id, quiz.title, quiz.description],
      );
      if (inserted.rowCount === 0) return; // already stored — quizzes are immutable
      for (const [position, question] of quiz.questions.entries()) {
        await client.query(
          "insert into questions (id, quiz_id, position, prompt, options, time_limit_sec) values ($1, $2, $3, $4, $5::jsonb, $6)",
          [question.id, quiz.id, position, question.prompt, JSON.stringify(question.options), question.timeLimitSec],
        );
        await client.query(
          "insert into question_keys (question_id, correct_option_id, explanation) values ($1, $2, $3)",
          [question.id, question.correctOptionId, question.explanation],
        );
      }
    });
  }

  async getQuiz(quizId: string): Promise<Quiz | null> {
    const quizRes = await this.pool.query("select id, title, description from quizzes where id = $1", [quizId]);
    const quizRow = quizRes.rows[0];
    if (!quizRow) return null;
    const questionRes = await this.pool.query(
      `select q.id, q.prompt, q.options, q.time_limit_sec, k.correct_option_id, k.explanation
         from questions q join question_keys k on k.question_id = q.id
        where q.quiz_id = $1 order by q.position`,
      [quizId],
    );
    const questions: Question[] = questionRes.rows.map((row) => ({
      id: row.id,
      prompt: row.prompt,
      options: row.options,
      timeLimitSec: Number(row.time_limit_sec),
      correctOptionId: row.correct_option_id,
      explanation: row.explanation,
    }));
    return { id: quizRow.id, title: quizRow.title, description: quizRow.description, questions };
  }

  async createGame(input: NewGameInput): Promise<CreateGameResult> {
    return this.tx(async (client) => {
      // An expired game must not hold its PIN forever.
      await client.query(`delete from games where pin = $1 and expires_at < ${fromMs("$2")}`, [input.pin, input.createdAt]);
      const result = await client.query(
        `insert into games (id, pin, quiz_id, title, config, option_seed, host_token_hash, created_at, expires_at)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, ${fromMs("$8")}, ${fromMs("$9")})
         on conflict (pin) do nothing
         returning ${GAME_COLUMNS}`,
        [input.id, input.pin, input.quizId, input.title, JSON.stringify(input.config), input.optionSeed, input.hostTokenHash, input.createdAt, input.expiresAt],
      );
      const row = result.rows[0];
      return row ? { ok: true as const, game: mapGame(row) } : { ok: false as const, reason: "pin_taken" as const };
    });
  }

  async getGameByPin(pin: string): Promise<Game | null> {
    const result = await this.pool.query(`select ${GAME_COLUMNS} from games where pin = $1`, [pin]);
    return result.rows[0] ? mapGame(result.rows[0]) : null;
  }

  async addPlayer(input: NewPlayerInput): Promise<AddPlayerResult> {
    return this.tx<AddPlayerResult>(async (client) => {
      const game = await client.query("select status from games where id = $1 for update", [input.gameId]);
      if (!game.rows[0]) return { ok: false, reason: "game_not_found" };
      if (game.rows[0].status !== "lobby") return { ok: false, reason: "not_lobby" };
      const count = await client.query("select count(*)::int as n from players where game_id = $1", [input.gameId]);
      if (Number(count.rows[0].n) >= input.maxPlayers) return { ok: false, reason: "game_full" };
      const inserted = await client.query(
        `insert into players (id, game_id, nickname, nickname_key, token_hash, joined_at, last_seen_at)
         values ($1, $2, $3, $4, $5, ${fromMs("$6")}, ${fromMs("$6")})
         on conflict (game_id, nickname_key) do nothing
         returning ${PLAYER_COLUMNS}`,
        [input.id, input.gameId, input.nickname, input.nicknameKey, input.tokenHash, input.joinedAt],
      );
      return inserted.rows[0] ? { ok: true, player: mapPlayer(inserted.rows[0]) } : { ok: false, reason: "nickname_taken" };
    });
  }

  async getPlayer(gameId: string, playerId: string): Promise<Player | null> {
    const result = await this.pool.query(`select ${PLAYER_COLUMNS} from players where id = $1 and game_id = $2`, [playerId, gameId]);
    return result.rows[0] ? mapPlayer(result.rows[0]) : null;
  }

  async touchPlayer(playerId: string, at: number): Promise<void> {
    await this.pool.query(`update players set last_seen_at = ${fromMs("$2")} where id = $1`, [playerId, at]);
  }

  async listPlayers(gameId: string): Promise<Player[]> {
    const result = await this.pool.query(`select ${PLAYER_COLUMNS} from players where game_id = $1 order by joined_at, id`, [gameId]);
    return result.rows.map(mapPlayer);
  }

  async countPlayers(gameId: string): Promise<number> {
    const result = await this.pool.query("select count(*)::int as n from players where game_id = $1", [gameId]);
    return Number(result.rows[0].n);
  }

  async transition(gameId: string, expectedVersion: number, patch: GamePatch): Promise<Game | null> {
    const sets: string[] = ["version = version + 1"];
    const values: unknown[] = [gameId, expectedVersion];
    const add = (column: string, value: unknown, asTimestamp = false) => {
      values.push(value);
      sets.push(`${column} = ${asTimestamp ? (value === null ? `$${values.length}::timestamptz` : fromMs(`$${values.length}`)) : `$${values.length}`}`);
    };
    if (patch.status !== undefined) add("status", patch.status);
    if (patch.questionIndex !== undefined) add("question_index", patch.questionIndex);
    if (patch.opensAt !== undefined) add("opens_at", patch.opensAt, true);
    if (patch.closesAt !== undefined) add("closes_at", patch.closesAt, true);
    if (patch.pausedAt !== undefined) add("paused_at", patch.pausedAt, true);
    const result = await this.pool.query(
      `update games set ${sets.join(", ")} where id = $1 and version = $2 returning ${GAME_COLUMNS}`,
      values,
    );
    return result.rows[0] ? mapGame(result.rows[0]) : null;
  }

  async finalizeQuestion(gameId: string, expectedVersion: number): Promise<Game | null> {
    return this.tx(async (client) => {
      const updated = await client.query(
        `update games set status = 'reveal', paused_at = null, version = version + 1
          where id = $1 and version = $2 and status = 'question'
          returning ${GAME_COLUMNS}`,
        [gameId, expectedVersion],
      );
      const row = updated.rows[0];
      if (!row) return null;
      // Cumulative score = sum of server-computed points; idempotent and race-free
      // because the UPDATE above holds the game row lock that answers must share.
      await client.query(
        `update players p set score = coalesce((select sum(a.points) from answers a where a.player_id = p.id), 0)
          where p.game_id = $1`,
        [gameId],
      );
      return mapGame(row);
    });
  }

  async submitAnswer(input: NewAnswerInput): Promise<SubmitAnswerResult> {
    return this.tx<SubmitAnswerResult>(async (client) => {
      const game = await client.query("select version, status from games where id = $1 for share", [input.gameId]);
      const row = game.rows[0];
      if (!row || Number(row.version) !== input.expectedVersion || row.status !== "question") return "stale";
      try {
        const inserted = await client.query(
          `insert into answers (id, game_id, player_id, question_id, question_index, selected_option_id, submitted_at, is_correct, points)
           select $1, p.game_id, p.id, $4, $5, $6, ${fromMs("$7")}, $8, $9
             from players p where p.id = $3 and p.game_id = $2
           on conflict (player_id, question_index) do nothing
           returning id`,
          [input.id, input.gameId, input.playerId, input.questionId, input.questionIndex, input.optionId, input.submittedAt, input.isCorrect, input.points],
        );
        if (inserted.rows[0]) return "accepted";
        const existing = await client.query("select 1 from answers where player_id = $1 and question_index = $2", [input.playerId, input.questionIndex]);
        return existing.rows[0] ? "duplicate" : "stale";
      } catch (error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) return "duplicate";
        throw error;
      }
    });
  }

  async getAnswerStats(gameId: string, questionIndex: number): Promise<AnswerStats> {
    const result = await this.pool.query(
      "select selected_option_id, count(*)::int as n from answers where game_id = $1 and question_index = $2 group by selected_option_id",
      [gameId, questionIndex],
    );
    const byOption: Record<string, number> = {};
    let total = 0;
    for (const row of result.rows) {
      byOption[row.selected_option_id] = Number(row.n);
      total += Number(row.n);
    }
    return { total, byOption };
  }

  async getPlayerAnswer(gameId: string, playerId: string, questionIndex: number): Promise<AnswerRecord | null> {
    const result = await this.pool.query(
      `select id, game_id, player_id, question_id, question_index, selected_option_id, ${toMs("submitted_at")} as submitted_at, is_correct, points
         from answers where game_id = $1 and player_id = $2 and question_index = $3`,
      [gameId, playerId, questionIndex],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      gameId: row.game_id,
      playerId: row.player_id,
      questionId: row.question_id,
      questionIndex: Number(row.question_index),
      optionId: row.selected_option_id,
      submittedAt: Number(row.submitted_at),
      isCorrect: row.is_correct,
      points: Number(row.points),
    };
  }

  async getStandings(gameId: string, questionIndex: number): Promise<Standing[]> {
    const result = await this.pool.query(
      `select p.id, p.nickname, p.nickname_key, p.score, coalesce(a.points, 0) as last_points
         from players p left join answers a on a.player_id = p.id and a.question_index = $2
        where p.game_id = $1`,
      [gameId, questionIndex],
    );
    return result.rows.map((row) => ({
      playerId: row.id,
      nickname: row.nickname,
      nicknameKey: row.nickname_key,
      score: Number(row.score),
      lastPoints: Number(row.last_points),
    }));
  }

  async deleteExpiredGames(before: number): Promise<number> {
    const result = await this.pool.query(`delete from games where expires_at < ${fromMs("$1")}`, [before]);
    return result.rowCount ?? 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
