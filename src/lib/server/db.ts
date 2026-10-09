import { Pool } from "pg";

function sslOptions(connectionString: string, env: NodeJS.ProcessEnv) {
  const host = new URL(connectionString).hostname;
  if (["localhost", "127.0.0.1", "::1"].includes(host) || env.DATABASE_SSL === "disable") return false;
  // Supabase uses its own CA. Provide it via DATABASE_CA_CERT for full verification,
  // or explicitly opt out (traffic stays encrypted but the server is not authenticated).
  if (env.DATABASE_SSL_NO_VERIFY === "true") return { rejectUnauthorized: false };
  if (env.DATABASE_CA_CERT) return { ca: env.DATABASE_CA_CERT.replace(/\\n/g, "\n"), rejectUnauthorized: true };
  return { rejectUnauthorized: true };
}

export function createPool(connectionString: string, env: NodeJS.ProcessEnv = process.env): Pool {
  const pool = new Pool({
    connectionString,
    ssl: sslOptions(connectionString, env),
    // Serverless-friendly: few connections per instance, released quickly.
    max: Number(env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  pool.on("error", (error) => console.error("[db] idle client error", error));
  return pool;
}
