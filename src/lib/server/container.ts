import { randomUUID } from "node:crypto";
import { defaultQuiz } from "@/content/default-quiz";
import { readServerConfig, resolveStorageMode, type StorageMode } from "./config";
import { createPool } from "./db";
import { AppError } from "./errors";
import { createGameService, type GameService } from "./game-service";
import { MemoryStore } from "./memory-store";
import { PostgresStore } from "./postgres-store";
import { RateLimiter } from "./rate-limiter";
import type { GameStore } from "./store";
import { cryptoRandomInt, newToken } from "./tokens";

interface Container {
  mode: StorageMode;
  service: GameService | null;
  store: GameStore | null;
  hostAccessCodeRequired: boolean;
}

// Pinned on globalThis so dev-server hot reloads and separately-bundled route
// handlers share ONE store/pool instead of each creating their own.
const globalKey = Symbol.for("digital-divide-challenge.container");
type GlobalWithContainer = typeof globalThis & { [globalKey]?: Container };

function build(): Container {
  const config = readServerConfig();
  const mode = resolveStorageMode(config);
  if (mode === "unconfigured") {
    return { mode, service: null, store: null, hostAccessCodeRequired: config.hostAccessCode !== null };
  }
  const store: GameStore =
    mode === "postgres" ? new PostgresStore(createPool(config.databaseUrl as string)) : new MemoryStore();
  const rateLimiter = new RateLimiter();
  const service = createGameService({
    store,
    quiz: defaultQuiz,
    now: Date.now,
    randomInt: cryptoRandomInt,
    newId: randomUUID,
    newToken,
    rateLimiter,
    hostAccessCode: config.hostAccessCode,
    extraBlockedTerms: config.extraBlockedTerms,
  });
  return { mode, service, store, hostAccessCodeRequired: config.hostAccessCode !== null };
}

function container(): Container {
  const holder = globalThis as GlobalWithContainer;
  holder[globalKey] ??= build();
  return holder[globalKey];
}

export function getGameService(): GameService {
  const { service } = container();
  if (!service) {
    throw new AppError(
      "BACKEND_NOT_CONFIGURED",
      "The game backend is not configured. The site owner must set DATABASE_URL (see README → Supabase setup).",
    );
  }
  return service;
}

export function getRuntimeInfo(): { mode: StorageMode; hostAccessCodeRequired: boolean } {
  const { mode, hostAccessCodeRequired } = container();
  return { mode, hostAccessCodeRequired };
}
