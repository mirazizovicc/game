"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/** Bottom bar of the projector screen. Kept visually quiet so the content stays the focus. */
export function HostControls({ children, status }: { children: ReactNode; status?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-[1.6vh]">
      <div className="min-h-6 text-sm text-ivory-dim" aria-live="polite">
        {status}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/** Two-step destructive button: the first click arms it, the second confirms (no tiny browser dialog on the projector). */
export function ConfirmButton({ label, confirmLabel, onConfirm, disabled }: { label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <Button
      variant="danger"
      size="md"
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}
