import Link from "next/link";

/** A bridge across a gap — the divide, and closing it. Original mark, not derived from any other product. */
export function BrandMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect x="1" y="1" width="38" height="38" rx="11" fill="var(--color-burgundy-600)" />
      <path d="M6 27h8v-8H6zM26 27h8v-8h-8z" fill="var(--color-ivory)" />
      <path d="M6 15h28" stroke="var(--color-gold)" strokeWidth="3" strokeLinecap="round" />
      <path d="M14 27h12" stroke="var(--color-ivory)" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 5" />
    </svg>
  );
}

export function Brand({ href = "/", compact = false }: { href?: string | null; compact?: boolean }) {
  const content = (
    <span className="inline-flex items-center gap-3">
      <BrandMark />
      <span className={`font-display font-extrabold leading-none tracking-tight ${compact ? "text-lg" : "text-xl"}`}>
        Digital Divide <span className="text-rose-400">Challenge</span>
      </span>
    </span>
  );
  return href ? (
    <Link href={href} className="inline-flex rounded-xl" aria-label="Digital Divide Challenge — home">
      {content}
    </Link>
  ) : (
    content
  );
}
