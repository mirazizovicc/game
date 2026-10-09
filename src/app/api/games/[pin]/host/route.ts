import { NextResponse } from "next/server";
import { hostActionSchema } from "@/lib/domain/schemas";
import { getGameService } from "@/lib/server/container";
import { credentialsFor, readBody, route } from "@/lib/server/http";

/** Host-only lifecycle control: start, pause, resume, close, advance, end. */
export const POST = route(async (req, pin) => {
  const body = await readBody(req, hostActionSchema);
  const result = await getGameService().hostAction(pin, credentialsFor(req, pin), body);
  return NextResponse.json(result);
});
