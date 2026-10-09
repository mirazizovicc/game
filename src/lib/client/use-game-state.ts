"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameView } from "@/lib/domain/view";
import { api, ApiError } from "./api";

export type Connection = "connecting" | "live" | "reconnecting" | "ended";

export interface GameStateResult {
  view: GameView | null;
  connection: Connection;
  /** Set when polling has stopped for good (expired game, not joined, not the host...). */
  fatal: ApiError | null;
  /** Milliseconds to add to Date.now() to get the server's clock. */
  clockOffset: number;
  /** Fetch immediately (e.g. right after the user acted). */
  refresh: () => void;
}

const FATAL_CODES = new Set(["GAME_NOT_FOUND", "GAME_EXPIRED", "UNAUTHORIZED", "BACKEND_NOT_CONFIGURED"]);

function nextDelay(view: GameView | null, failures: number): number {
  if (failures > 0) return Math.min(1000 * 2 ** (failures - 1), 5000); // 1s, 2s, 4s, 5s…
  if (typeof document !== "undefined" && document.hidden) return 4000;
  return view?.phase === "lobby" ? 1500 : 1000;
}

/**
 * Keeps a browser in sync with the server by polling the role-specific state
 * endpoint. The server is the only source of truth: this hook never derives
 * game state locally. Responses that arrive out of order are discarded, and the
 * clock offset is re-estimated on every response so countdowns follow the
 * server's clock rather than the device's.
 */
export function useGameState(pin: string, role: "host" | "player"): GameStateResult {
  const [view, setView] = useState<GameView | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [fatal, setFatal] = useState<ApiError | null>(null);
  const [clockOffset, setClockOffset] = useState(0);

  const viewRef = useRef<GameView | null>(null);
  const failuresRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const inFlightRef = useRef(false);
  const tickRef = useRef<() => void>(() => {});

  const schedule = useCallback((delay: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (stoppedRef.current) return;
    timerRef.current = setTimeout(() => tickRef.current(), delay);
  }, []);

  useEffect(() => {
    stoppedRef.current = false;

    const tick = async () => {
      if (stoppedRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const { view: incoming, sentAt, receivedAt } = await api.state(pin, role);
        const current = viewRef.current;
        const isNewer =
          !current ||
          incoming.version > current.version ||
          (incoming.version === current.version && incoming.serverTime >= current.serverTime);
        if (isNewer) {
          viewRef.current = incoming;
          setView(incoming);
        }
        // Half the round trip is the best estimate of one-way latency.
        setClockOffset(incoming.serverTime - (sentAt + receivedAt) / 2);
        failuresRef.current = 0;
        setConnection("live");
      } catch (error) {
        if (error instanceof ApiError && FATAL_CODES.has(error.code)) {
          stoppedRef.current = true;
          setFatal(error);
          setConnection("ended");
          return;
        }
        failuresRef.current += 1;
        if (failuresRef.current >= 2) setConnection("reconnecting");
        if (!(error instanceof ApiError)) console.error("[useGameState] unexpected error", error);
      } finally {
        inFlightRef.current = false;
        schedule(nextDelay(viewRef.current, failuresRef.current));
      }
    };
    tickRef.current = tick;
    void tick();

    const wake = () => {
      if (!document.hidden) {
        failuresRef.current = 0;
        void tickRef.current();
      }
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [pin, role, schedule]);

  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void tickRef.current();
  }, []);

  return { view, connection, fatal, clockOffset, refresh };
}
