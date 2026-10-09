const COLORS = ["var(--color-gold)", "var(--color-rose-400)", "var(--color-silver)", "var(--color-opt-b)", "var(--color-good)", "var(--color-ivory)"];

/** Deterministic pseudo-random so server and client render the same markup. Hidden for reduced motion. */
export function Confetti({ pieces = 44 }: { pieces?: number }) {
  return (
    <div aria-hidden className="confetti pointer-events-none fixed inset-0 overflow-hidden">
      {Array.from({ length: pieces }, (_, i) => {
        const left = (i * 37) % 100;
        const delay = ((i * 53) % 45) / 10;
        const duration = 3.6 + ((i * 17) % 30) / 10;
        const drift = ((i * 29) % 21) - 10;
        return (
          <span
            key={i}
            className="absolute top-0 block animate-confetti rounded-[2px]"
            style={
              {
                left: `${left}%`,
                width: `${6 + (i % 4) * 2}px`,
                height: `${10 + (i % 3) * 4}px`,
                background: COLORS[i % COLORS.length],
                animationDelay: `${delay}s`,
                animationDuration: `${duration}s`,
                "--drift": `${drift}vw`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
