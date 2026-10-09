import { NextResponse } from "next/server";
import { getGameService } from "@/lib/server/container";
import { credentialsFor, route } from "@/lib/server/http";

/** Polled by the host (`?role=host`) and by players (default). Returns a role-specific view. */
export const GET = route(async (req, pin) => {
  const role = req.nextUrl.searchParams.get("role") === "host" ? "host" : "player";
  const view = await getGameService().getState(pin, role, credentialsFor(req, pin));
  return NextResponse.json(view);
});
