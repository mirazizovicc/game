import { NextResponse } from "next/server";
import { joinGameSchema } from "@/lib/domain/schemas";
import { getGameService } from "@/lib/server/container";
import { clientKey, credentialsFor, playerCookieName, readBody, route, setSessionCookie } from "@/lib/server/http";

export const POST = route(async (req, pin) => {
  const body = await readBody(req, joinGameSchema);
  const joined = await getGameService().joinGame(pin, body.nickname, credentialsFor(req, pin), clientKey(req));
  const res = NextResponse.json({ player: joined.player, rejoined: joined.rejoined }, { status: joined.rejoined ? 200 : 201 });
  // Keep the cookie alive for the whole game (the service enforces the real expiry).
  setSessionCookie(res, req, playerCookieName(pin), joined.cookieValue, Date.now() + 12 * 60 * 60 * 1000);
  return res;
});
