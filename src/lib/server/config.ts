import { parseBlocklist } from "../domain/nickname";

export interface ServerConfig {
  databaseUrl: string | null;
  /** Local demo mode: allow the in-memory store even in a production build. */
  allowMemoryStore: boolean;
  /** When set, creating a game requires this code (recommended on public deployments). */
  hostAccessCode: string | null;
  extraBlockedTerms: string[];
  isProduction: boolean;
  /** Public base URL used to build the QR code (falls back to the browser origin). */
  publicAppUrl: string | null;
}

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const databaseUrl = env.DATABASE_URL?.trim() || null;
  return {
    databaseUrl,
    allowMemoryStore: env.ALLOW_MEMORY_STORE === "true",
    hostAccessCode: env.HOST_ACCESS_CODE?.trim() || null,
    extraBlockedTerms: parseBlocklist(env.NICKNAME_BLOCKLIST),
    isProduction: env.NODE_ENV === "production",
    publicAppUrl: env.NEXT_PUBLIC_APP_URL?.trim() || null,
  };
}

export type StorageMode = "postgres" | "memory" | "unconfigured";

/**
 * - DATABASE_URL set                       → real multiplayer backend (PostgreSQL / Supabase).
 * - no DATABASE_URL, development           → in-memory LOCAL DEMO mode.
 * - no DATABASE_URL, production build      → refuse to run unless ALLOW_MEMORY_STORE=true,
 *   because serverless instances do not share memory and the game would silently break.
 */
export function resolveStorageMode(config: ServerConfig): StorageMode {
  if (config.databaseUrl) return "postgres";
  if (!config.isProduction || config.allowMemoryStore) return "memory";
  return "unconfigured";
}
