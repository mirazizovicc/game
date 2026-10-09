"use client";

import { useState } from "react";
import { OptionTile, type TileState } from "@/components/ui/OptionTile";
import { CheckIcon } from "@/components/ui/Shapes";
import { api, ApiError } from "@/lib/client/api";
import type { GameView } from "@/lib/domain/view";

/** Rendered with `key={question.id}` so every question starts with fresh local state. */
interface Props {
  pin: string;
  view: GameView;
  now: number;
  onChanged: () => void;
}

export function PlayerQuestion({ pin, view, now, onChanged }: Props) {
  const question = view.question;
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string; retry?: string } | null>(null);
  const [sending, setSending] = useState(false);

  if (!question) return null;

  const paused = view.phase === "paused";
  const totalMs = question.timeLimitSec * 1000;
  const remainingMs = paused ? (view.remainingMsWhenPaused ?? 0) : Math.max(0, (view.closesAt ?? now) - now);
  const seconds = Math.ceil(remainingMs / 1000);
  const answered = view.me?.answered === true;
  const chosen = view.me?.selectedOptionId ?? pending;
  const locked = answered || sending || paused;

  async function submit(optionId: string) {
    if (locked) return;
    setPending(optionId);
    setSending(true);
    setMessage(null);
    try {
      await api.answer(pin, question!.index, optionId);
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.code === "ALREADY_ANSWERED") {
        onChanged(); // our earlier request got through; just resync
      } else if (e instanceof ApiError && e.isNetwork) {
        setPending(null);
        setMessage({ tone: "error", text: "Couldn't reach the server. Tap your answer again — it's only counted once.", retry: optionId });
      } else if (e instanceof ApiError) {
        setPending(null);
        setMessage({ tone: "error", text: e.message });
        onChanged();
      } else {
        throw e;
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pt-2">
      <div className="flex items-center justify-between">
        <p className="rounded-full bg-burgundy-600 px-3 py-1 font-display text-sm font-extrabold">
          Question {view.questionIndex + 1} / {view.totalQuestions}
        </p>
        <p className={`font-display text-2xl font-extrabold tabular-nums ${seconds <= 5 && !paused ? "text-bad" : "text-gold"}`} role="timer" aria-label={paused ? "Paused" : `${seconds} seconds left`}>
          {paused ? "Paused" : seconds}
        </p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full rounded-full bg-gold transition-[width] duration-200 ease-linear" style={{ width: `${totalMs > 0 ? (remainingMs / totalMs) * 100 : 0}%` }} />
      </div>

      <h1 className="font-display text-2xl font-extrabold leading-snug">{question.prompt}</h1>

      <div className="flex flex-col gap-3" role="group" aria-label="Answer options">
        {question.options.map((option, position) => {
          let state: TileState = "idle";
          if (locked) state = option.id === chosen ? "selected" : "locked";
          return <OptionTile key={option.id} position={position} option={option} state={state} size="player" onSelect={submit} />;
        })}
      </div>

      <div aria-live="polite" className="min-h-14">
        {answered && (
          <div className="flex animate-pop-in items-center gap-3 rounded-2xl bg-good/15 px-4 py-3 text-good">
            <CheckIcon className="size-7 shrink-0" />
            <div>
              <p className="font-display text-lg font-extrabold">Answer submitted!</p>
              <p className="text-sm text-ivory-dim">Waiting for the others… Results come after the timer.</p>
            </div>
          </div>
        )}
        {!answered && sending && <p className="px-1 py-2 font-semibold text-ivory-dim">Sending your answer…</p>}
        {!answered && !sending && paused && <p className="rounded-2xl bg-gold px-4 py-3 text-center font-bold text-ink-950">The host paused the game.</p>}
        {!answered && !sending && !paused && remainingMs === 0 && <p className="px-1 py-2 text-center font-semibold text-gold">Time&apos;s up — locking in answers…</p>}
        {message && (
          <p role="alert" className={`rounded-2xl px-4 py-3 font-semibold ${message.tone === "error" ? "bg-bad/15 text-bad" : "bg-ink-800"}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
