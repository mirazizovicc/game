import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError } from "./errors";
import type { Credentials } from "./game-service";

const MAX_BODY_BYTES = 4_096;

export const hostCookieName = (pin: string) => `dd_h_${pin}`;
export const playerCookieName = (pin: string) => `dd_p_${pin}`;

/** Best-effort client identity for rate limiting (first hop of X-Forwarded-For on Vercel). */
export function clientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export function credentialsFor(req: NextRequest, pin: string): Credentials {
  return {
    hostToken: req.cookies.get(hostCookieName(pin))?.value,
    playerCookie: req.cookies.get(playerCookieName(pin))?.value,
  };
}

export async function readBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new AppError("BAD_REQUEST", "Request body is too large.");
  let json: unknown;
  try {
    json = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    throw new AppError("BAD_REQUEST", "Request body must be valid JSON.");
  }
  return schema.parse(json);
}

export function setSessionCookie(res: NextResponse, req: NextRequest, name: string, value: string, expiresAt: number): void {
  const secure = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  res.cookies.set(name, value, { httpOnly: true, sameSite: "lax", secure, path: "/", expires: new Date(expiresAt) });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, ...(error.details ?? {}) } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "The request was not valid." } }, { status: 400 });
  }
  // Unexpected: log the real cause on the server, show a generic message to the client.
  console.error("[api] unexpected error", error);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." } }, { status: 500 });
}

type PinContext = { params: Promise<{ pin: string }> };

/** Wraps a handler so every failure becomes a typed JSON error (never a silent failure or HTML 500). */
export function route(handler: (req: NextRequest, pin: string) => Promise<NextResponse>) {
  return async (req: NextRequest, ctx: PinContext): Promise<NextResponse> => {
    try {
      const { pin } = await ctx.params;
      return await handler(req, pin);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
