import { NextResponse, type NextRequest } from "next/server";
import { createGameSchema } from "@/lib/domain/schemas";
import { getGameService } from "@/lib/server/container";
import { clientKey, errorResponse, hostCookieName, readBody, setSessionCookie } from "@/lib/server/http";

/** Create a game. Sets the host cookie; the host secret is never returned in the body. */
export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req, createGameSchema);
    const created = await getGameService().createGame(body, clientKey(req));
    const res = NextResponse.json({ pin: created.pin }, { status: 201 });
    setSessionCookie(res, req, hostCookieName(created.pin), created.hostToken, created.expiresAt);
    return res;
  } catch (error) {
    return errorResponse(error);
  }
}
