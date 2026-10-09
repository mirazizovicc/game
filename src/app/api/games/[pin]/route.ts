import { NextResponse } from "next/server";
import { getGameService } from "@/lib/server/container";
import { clientKey, route } from "@/lib/server/http";

/** Public join info for a PIN: lets the join screen validate the PIN before asking for a nickname. */
export const GET = route(async (req, pin) => {
  const info = await getGameService().getJoinInfo(pin, clientKey(req));
  return NextResponse.json(info);
});
