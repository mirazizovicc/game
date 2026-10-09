import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-burgundy-600 text-ivory shadow-[0_8px_0_0_var(--color-burgundy-800)] hover:bg-burgundy-500 active:translate-y-[3px] active:shadow-[0_5px_0_0_var(--color-burgundy-800)]",
  secondary:
    "bg-ivory text-ink-950 shadow-[0_8px_0_0_#a79f88] hover:bg-white active:translate-y-[3px] active:shadow-[0_5px_0_0_#a79f88]",
  ghost: "bg-white/5 text-ivory ring-1 ring-inset ring-white/20 hover:bg-white/10",
  danger: "bg-transparent text-bad ring-1 ring-inset ring-bad/60 hover:bg-bad/10",
};

const SIZES: Record<Size, string> = {
  md: "min-h-12 px-5 text-base",
  lg: "min-h-14 px-7 text-lg",
  xl: "min-h-16 px-9 text-xl",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  children: ReactNode;
}

export function Button({ variant = "primary", size = "md", busy = false, className = "", disabled, children, ...rest }: ButtonProps) {
  const isDisabled = disabled || busy;
  return (
    <button
      type="button"
      {...rest}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-display font-bold tracking-tight transition-[transform,box-shadow,background-color] duration-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {busy && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
