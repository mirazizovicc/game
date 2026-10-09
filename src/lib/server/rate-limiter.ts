/**
 * Sliding-window limiter, in memory. On serverless hosting each instance keeps
 * its own counters, so this is a best-effort brake against spam — not a hard
 * guarantee. The hard guarantees (one answer per question, capped player count,
 * unique nicknames) are enforced by database constraints.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Returns true if the action is allowed (and records it). */
  allow(key: string, max: number, windowMs: number): boolean {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now, windowMs);
    return true;
  }

  private prune(now: number, windowMs: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= windowMs)) this.hits.delete(key);
    }
  }
}
