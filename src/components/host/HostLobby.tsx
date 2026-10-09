"use client";

import { QRCodeSVG } from "qrcode.react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import type { GameView } from "@/lib/domain/view";
import { HostControls } from "./HostControls";

interface HostLobbyProps {
  view: GameView;
  joinBase: string;
  busy: boolean;
  onStart: () => void;
  onEnd: () => void;
}

export function HostLobby({ view, joinBase, busy, onStart }: HostLobbyProps) {
  const joinUrl = `${joinBase}/join?pin=${view.pin}`;
  const display = joinBase.replace(/^https?:\/\//, "");
  const isLocal = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(display);
  const roster = view.roster ?? [];

  return (
    <div className="flex h-full flex-col gap-[2.4vh]">
      <header className="flex shrink-0 items-center justify-between">
        <Brand href={null} />
        <p className="font-display text-[min(1.8vw,3.2vh)] font-bold text-ivory-dim">{view.title}</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-[2.6vw]">
        <section className="flex min-h-0 flex-col items-center justify-center gap-[2vh] rounded-[1.75rem] bg-ink-800 p-[2vw] shadow-card" aria-label="How to join">
          <p className="text-center font-display text-[min(2.2vw,4vh)] font-bold text-ivory-dim">
            Join at <span className="text-ivory">{display}/join</span>
          </p>
          <p className="text-center text-[min(1.5vw,2.8vh)] font-semibold uppercase tracking-[0.25em] text-rose-300">Game PIN</p>
          <p
            className="font-display text-[min(9.5vw,19vh)] font-extrabold leading-none tracking-[0.06em] tabular-nums"
            aria-label={`Game PIN ${view.pin.split("").join(" ")}`}
          >
            {view.pin}
          </p>
          <div className="rounded-2xl bg-ivory p-[1.2vh]">
            <QRCodeSVG value={joinUrl} level="M" marginSize={1} bgColor="#f8f3e6" fgColor="#070b18" className="size-[min(21vw,32vh)]" role="img" aria-label={`QR code that opens ${joinUrl}`} />
          </div>
          {isLocal && (
            <p role="alert" className="max-w-[90%] rounded-xl bg-gold px-4 py-2 text-center text-sm font-semibold text-ink-950">
              Phones can&apos;t open &ldquo;{display}&rdquo;. Open this page using your computer&apos;s network address (for example http://192.168.x.x:3000) or set NEXT_PUBLIC_APP_URL.
            </p>
          )}
        </section>

        <section className="flex min-h-0 flex-col rounded-[1.75rem] bg-ink-900/80 p-[2vw] ring-1 ring-white/10" aria-label="Players who have joined">
          <div className="mb-[1.6vh] flex shrink-0 items-end justify-between">
            <h1 className="font-display text-[min(3.2vw,6vh)] font-extrabold leading-none">Players</h1>
            <p className="font-display text-[min(6vw,11vh)] font-extrabold leading-none tabular-nums text-gold" aria-live="polite">
              {view.playerCount}
              <span className="sr-only"> players joined</span>
            </p>
          </div>
          {roster.length === 0 ? (
            <div className="grid flex-1 place-items-center text-center">
              <p className="font-display text-[min(2.6vw,4.6vh)] font-bold text-ivory-dim">Waiting for players…<br />Scan the QR code or enter the PIN.</p>
            </div>
          ) : (
            <ul className="flex min-h-0 flex-1 flex-wrap content-start gap-[1vh] overflow-hidden">
              {roster.map((player) => (
                <li
                  key={player.id}
                  className={`animate-pop-in rounded-full bg-ink-700 px-[1.4vw] py-[0.8vh] font-display text-[min(2vw,3.6vh)] font-bold ${player.connected ? "" : "opacity-50"}`}
                  title={player.connected ? undefined : "Connection lost"}
                >
                  {player.nickname}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <HostControls status={view.playerCount === 0 ? "Start unlocks as soon as one player has joined." : "Everyone in? New players can't join once you start."}>
        <Button size="xl" onClick={onStart} busy={busy} disabled={view.playerCount < 1}>
          Start game
        </Button>
      </HostControls>
    </div>
  );
}
