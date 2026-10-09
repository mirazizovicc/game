import type { GameView } from "@/lib/domain/view";

export function PlayerLobby({ view }: { view: GameView }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div className="animate-pop-in rounded-full bg-good/15 px-4 py-1.5 text-sm font-bold text-good">You&apos;re in!</div>
      <h1 className="font-display text-4xl font-extrabold leading-tight">
        Hi, <span className="text-gold">{view.me?.nickname}</span>
      </h1>
      <p className="text-lg text-ivory-dim">Waiting for the host to start the game. Keep this page open.</p>
      <div className="rounded-2xl bg-ink-800 px-6 py-4" aria-live="polite">
        <p className="font-display text-5xl font-extrabold tabular-nums">{view.playerCount}</p>
        <p className="text-sm text-ivory-dim">{view.playerCount === 1 ? "player" : "players"} in the lobby</p>
      </div>
      <p className="max-w-xs text-sm text-ivory-mute">
        Tip: correct answers matter most. Speed adds only a small bonus, so take a moment to think.
      </p>
    </div>
  );
}
