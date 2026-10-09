import { NextResponse } from "next/server";
import { answerSchema } from "@/lib/domain/schemas";
import { getGameService } from "@/lib/server/container";
import { credentialsFor, readBody, route } from "@/lib/server/http";

/**
 * Records an answer. The response deliberately says nothing about correctness
 * or points — those are revealed with the question results.
 */
export const POST = route(async (req, pin) => {
  const body = await readBody(req, answerSchema);
  const result = await getGameService().submitAnswer(pin, credentialsFor(req, pin), body);
  return NextResponse.json(result, { status: 201 });
});
