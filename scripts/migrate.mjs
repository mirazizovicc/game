#!/usr/bin/env node
// Applies supabase/migrations/*.sql to the database in DATABASE_URL (or MIGRATE_DATABASE_URL).
// Use this for plain PostgreSQL or when you prefer not to use the Supabase CLI.
// Applied files are recorded in `app_schema_migrations`, so re-running is safe.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (or MIGRATE_DATABASE_URL) is not set. See README → Supabase setup.");
  process.exit(1);
}

function sslFor(connectionString) {
  const host = new URL(connectionString).hostname;
  if (["localhost", "127.0.0.1", "::1"].includes(host) || process.env.DATABASE_SSL === "disable") return false;
  if (process.env.DATABASE_SSL_NO_VERIFY === "true") return { rejectUnauthorized: false };
  return process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true } : { rejectUnauthorized: true };
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });
await client.connect();
try {
  await client.query(
    "create table if not exists app_schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const { rows } = await client.query("select name from app_schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into app_schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`apply  ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  console.log("Migrations up to date.");
} finally {
  await client.end();
}
