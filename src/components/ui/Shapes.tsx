/** Shapes pair with colours so answer options are distinguishable without colour vision. */
export function Shape({ index, className = "size-8" }: { index: number; className?: string }) {
  const common = { className, "aria-hidden": true, viewBox: "0 0 24 24", fill: "currentColor" } as const;
  switch (index % 4) {
    case 0:
      return (
        <svg {...common}>
          <path d="M12 3 22 20H2z" />
        </svg>
      );
    case 1:
      return (
        <svg {...common}>
          <path d="M12 1.5 22.5 12 12 22.5 1.5 12z" />
        </svg>
      );
    case 2:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      );
  }
}

export function CheckIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  );
}

export function CrossIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
