import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { PostgresStore } from "@/lib/server/postgres-store";

/** Admin connection used to create a throwaway database per test file. */
export const ADMIN_URL = process.env.TEST_DATABASE_URL;

export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

export function migrationSql(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
}

export interface TestDatabase {
  url: string;
  pool: Pool;
  store: PostgresStore;
  drop: () => Promise<void>;
}

function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

/**
 * Creates an isolated database, mimics Supabase's `anon` / `authenticated`
 * roles (with Supabase's default "grant everything" privileges), then applies
 * the real migrations.
 */
export async function createTestDatabase(options: { supabaseRoles?: boolean } = {}): Promise<TestDatabase> {
  if (!ADMIN_URL) throw new Error("TEST_DATABASE_URL is not set");
  const name = `ddc_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: ADMIN_URL, max: 1 });
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = withDatabase(ADMIN_URL, name);
  const pool = new Pool({ connectionString: url, max: 20 });
  // Dropping the database with FORCE during teardown terminates connections that are
  // still closing; those FATAL notices are expected and must not fail the run.
  pool.on("error", () => {});

  if (options.supabaseRoles !== false) {
    // Roles are cluster-wide; create once and ignore "already exists".
    for (const role of ["anon", "authenticated"]) {
      await pool.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${role}') then create role ${role} nologin; end if; end $$`);
    }
    await pool.query("grant usage on schema public to anon, authenticated");
    // Supabase grants these by default on every new public table — the migration must take them away.
    await pool.query("alter default privileges in schema public grant all on tables to anon, authenticated");
  }
  for (const sql of migrationSql()) await pool.query(sql);

  return {
    url,
    pool,
    store: new PostgresStore(pool),
    drop: async () => {
      await pool.end();
      const cleaner = new Pool({ connectionString: ADMIN_URL, max: 1 });
      await cleaner.query(`drop database if exists ${name} with (force)`);
      await cleaner.end();
    },
  };
}
