"use client";

import { useEffect, useState } from "react";

/**
 * Returns the server's current time in ms, re-rendering every `intervalMs` while `active`.
 * Display only: the server independently enforces every deadline.
 */
export function useServerNow(clockOffset: number, active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  useEffect(() => {
    if (!active) return;
    // The first tick lands within `intervalMs`, which is invisible for a countdown.
    const id = setInterval(() => setNow(Date.now() + clockOffset), intervalMs);
    return () => clearInterval(id);
  }, [clockOffset, active, intervalMs]);
  return now;
}

/** Whole seconds remaining until `deadline`, rounded up (so 0 only when time is truly up). */
export function secondsLeft(deadline: number | null, now: number): number {
  if (deadline === null) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
