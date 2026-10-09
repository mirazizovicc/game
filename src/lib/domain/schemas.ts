import { z } from "zod";
import { MAX_TIME_LIMIT_SEC, MIN_TIME_LIMIT_SEC } from "./constants";

/** Request-body schemas shared by route handlers and tests. All are strict: unknown keys are rejected. */

export const createGameSchema = z
  .object({
    accessCode: z.string().max(200).optional(),
    timeLimitSec: z.number().int().min(MIN_TIME_LIMIT_SEC).max(MAX_TIME_LIMIT_SEC).nullable().optional(),
    shuffleOptions: z.boolean().optional(),
  })
  .strict();
export type CreateGameInput = z.infer<typeof createGameSchema>;

export const joinGameSchema = z.object({ nickname: z.string().max(200) }).strict();

export const answerSchema = z
  .object({
    questionIndex: z.number().int().min(0).max(1000),
    optionId: z.string().regex(/^[a-z0-9_-]{1,16}$/),
  })
  .strict();

export const hostActionSchema = z
  .object({
    action: z.enum(["start", "pause", "resume", "close", "advance", "end"]),
    expectedVersion: z.number().int().min(0),
  })
  .strict();
