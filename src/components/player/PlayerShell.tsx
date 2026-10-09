import type { ReactNode } from "react";
import { BrandMark } from "@/components/Brand";
import { ConnectionBadge } from "@/components/ui/ConnectionBadge";
import type { Connection } from "@/lib/client/use-game-state";

interface PlayerShellProps {
  connection: Connection;
  nickname?: string;
  score?: number;
  children: ReactNode;
}

/** Mobile frame: narrow column, safe-area padding, persistent nickname/score strip. */
export function PlayerShell({ connection, nickname, score, children }: PlayerShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <ConnectionBadge connection={connection} />
      <header className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <BrandMark className="size-8 shrink-0" />
        {nickname && (
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <span className="min-w-0 truncate text-sm font-semibold">{nickname}</span>
            {score !== undefined && (
              <span className="shrink-0 rounded-full bg-ink-700 px-2.5 py-1 font-display text-sm font-bold tabular-nums">{score.toLocaleString("en-US")} pts</span>
            )}
          </div>
        )}
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</main>
    </div>
  );
}
