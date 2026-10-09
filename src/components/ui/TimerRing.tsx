interface TimerRingProps {
  remainingMs: number;
  totalMs: number;
  paused?: boolean;
  className?: string;
  label?: string;
}

/** Circular countdown. Colour AND the number communicate urgency. */
export function TimerRing({ remainingMs, totalMs, paused = false, className = "size-28", label = "seconds left" }: TimerRingProps) {
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const urgent = seconds <= 5 && !paused;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className={`@container relative grid place-items-center ${className} ${urgent ? "animate-pulse-soft" : ""}`}
      role="timer"
      aria-label={paused ? "Timer paused" : `${seconds} ${label}`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={urgent ? "var(--color-bad)" : "var(--color-gold)"}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="relative font-display text-[38cqw] font-extrabold tabular-nums leading-none">
        {paused ? "II" : seconds}
      </span>
    </div>
  );
}
