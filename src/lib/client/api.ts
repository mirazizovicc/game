import type { GameView, JoinInfo } from "@/lib/domain/view";
import type { HostAction } from "@/lib/domain/game-machine";

/** Typed error from the API (or from a failed network request). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The request never reached the server, or the response never came back. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<{ data: T; sentAt: number; receivedAt: number }> {
  const sentAt = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new ApiError("NETWORK", "You appear to be offline.", 0);
  }
  const receivedAt = Date.now();
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON response (e.g. a proxy error page) — handled below.
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } & Record<string, unknown> } | null)?.error;
    const { code, message, ...details } = err ?? {};
    throw new ApiError(code ?? "HTTP_ERROR", message ?? `Request failed (${res.status}).`, res.status, details);
  }
  return { data: body as T, sentAt, receivedAt };
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  createGame: async (input: { accessCode?: string; timeLimitSec?: number | null; shuffleOptions?: boolean }) =>
    (await request<{ pin: string }>("/api/games", json(input))).data,

  joinInfo: async (pin: string) => (await request<JoinInfo>(`/api/games/${pin}`)).data,

  join: async (pin: string, nickname: string) =>
    (await request<{ player: { id: string; nickname: string }; rejoined: boolean }>(`/api/games/${pin}/join`, json({ nickname }))).data,

  state: async (pin: string, role: "host" | "player") => {
    const { data, sentAt, receivedAt } = await request<GameView>(`/api/games/${pin}/state?role=${role}`);
    return { view: data, sentAt, receivedAt };
  },

  answer: async (pin: string, questionIndex: number, optionId: string) =>
    (await request<{ accepted: true }>(`/api/games/${pin}/answer`, json({ questionIndex, optionId }))).data,

  hostAction: async (pin: string, action: HostAction, expectedVersion: number) =>
    (await request<{ version: number }>(`/api/games/${pin}/host`, json({ action, expectedVersion }))).data,

  health: async () => (await request<{ mode: "postgres" | "memory" | "unconfigured"; hostAccessCodeRequired: boolean }>("/api/health")).data,
};
