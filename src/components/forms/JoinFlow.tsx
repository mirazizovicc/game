"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/client/api";
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from "@/lib/domain/constants";
import { isValidPin, normalizePin } from "@/lib/domain/pin";

type Step = "pin" | "nickname";

interface Problem {
  title: string;
  message: string;
  /** Terminal problems offer a way out instead of a retry. */
  terminal?: boolean;
}

function describe(error: unknown): Problem {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "GAME_NOT_FOUND":
        return { title: "PIN not found", message: "That PIN doesn't match any game. Check the number on the classroom screen." };
      case "GAME_EXPIRED":
        return { title: "This game has expired", message: error.message, terminal: true };
      case "GAME_STARTED":
        return { title: "The game has already started", message: error.message, terminal: true };
      case "GAME_FULL":
        return { title: "This game is full", message: error.message, terminal: true };
      case "NETWORK":
        return { title: "You're offline", message: "We couldn't reach the server. Check your connection and try again." };
      case "BACKEND_NOT_CONFIGURED":
        return { title: "Game server not ready", message: error.message, terminal: true };
      default:
        return { title: "Couldn't continue", message: error.message };
    }
  }
  console.error("[JoinFlow] unexpected error", error);
  return { title: "Something went wrong", message: "Please try again." };
}

/** Two quick steps: confirm the PIN, then choose a nickname. No account, no email. */
export function JoinFlow({ initialPin }: { initialPin: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("pin");
  const [pin, setPin] = useState(initialPin);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [gameTitle, setGameTitle] = useState<string | null>(null);
  const autoChecked = useRef(false);
  const nicknameRef = useRef<HTMLInputElement>(null);

  async function checkPin(candidate: string) {
    const clean = normalizePin(candidate);
    if (!isValidPin(clean)) {
      setProblem({ title: "Check the PIN", message: "The game PIN has 6 digits." });
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const info = await api.joinInfo(clean);
      setPin(clean);
      if (!info.joinable) {
        setProblem({
          title: "The game has already started",
          message: "New players can't join once the host has started. Ask the host to create a new game.",
          terminal: true,
        });
        return;
      }
      setGameTitle(info.title);
      setStep("nickname");
    } catch (error) {
      setProblem(describe(error));
    } finally {
      setBusy(false);
    }
  }

  // Arriving from the QR code: the PIN is already in the URL, so verify it straight away.
  useEffect(() => {
    if (autoChecked.current || !initialPin) return;
    autoChecked.current = true;
    void checkPin(initialPin);
  }, [initialPin]);

  useEffect(() => {
    if (step === "nickname") nicknameRef.current?.focus();
  }, [step]);

  async function join() {
    const trimmed = nickname.trim();
    if (Array.from(trimmed).length < NICKNAME_MIN_LENGTH) {
      setProblem({ title: "Nickname too short", message: `Use at least ${NICKNAME_MIN_LENGTH} characters.` });
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await api.join(pin, trimmed);
      router.push(`/play/${pin}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === "UNAUTHORIZED") router.push(`/play/${pin}`);
      else setProblem(describe(error));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-6">
      <header className="mb-8">
        <Brand compact />
      </header>

      <div className="flex flex-1 flex-col justify-center gap-6">
        {step === "pin" ? (
          <form
            noValidate
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void checkPin(pin);
            }}
          >
            <div>
              <h1 className="font-display text-4xl font-extrabold leading-tight">Enter game PIN</h1>
              <p className="mt-2 text-ivory-dim">You&apos;ll find it on the classroom screen.</p>
            </div>
            <div>
              <label htmlFor="pin" className="sr-only">
                Game PIN (6 digits)
              </label>
              <input
                id="pin"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]*"
                maxLength={7}
                value={pin}
                autoFocus={!initialPin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setProblem(null);
                }}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? "join-problem" : undefined}
                placeholder="123 456"
                className="w-full rounded-2xl border-2 border-ink-600 bg-ink-950 px-5 py-5 text-center font-display text-5xl font-extrabold tracking-[0.18em] placeholder:text-ink-600 focus:border-gold focus:outline-none"
              />
            </div>
            <Button type="submit" size="lg" className="w-full" busy={busy}>
              {busy ? "Checking…" : "Enter"}
            </Button>
          </form>
        ) : (
          <form
            noValidate
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
          >
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-rose-300">PIN {pin}</p>
              <h1 className="mt-1 font-display text-4xl font-extrabold leading-tight">Choose a nickname</h1>
              <p className="mt-2 text-ivory-dim">
                {gameTitle ? <>You&apos;re joining <strong className="text-ivory">{gameTitle}</strong>. </> : null}
                Everyone sees this on the big screen, so keep it friendly. No real name needed.
              </p>
            </div>
            <div>
              <label htmlFor="nickname" className="mb-2 block text-sm font-semibold text-ivory-dim">
                Nickname ({NICKNAME_MIN_LENGTH}–{NICKNAME_MAX_LENGTH} characters)
              </label>
              <input
                id="nickname"
                ref={nicknameRef}
                value={nickname}
                maxLength={NICKNAME_MAX_LENGTH + 4}
                autoComplete="off"
                autoCapitalize="words"
                spellCheck={false}
                enterKeyHint="go"
                onChange={(e) => {
                  setNickname(e.target.value);
                  setProblem(null);
                }}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? "join-problem" : undefined}
                className="w-full rounded-2xl border-2 border-ink-600 bg-ink-950 px-5 py-4 font-display text-3xl font-bold focus:border-gold focus:outline-none"
              />
            </div>
            <Button type="submit" size="lg" className="w-full" busy={busy}>
              {busy ? "Joining…" : "Join game"}
            </Button>
            <button
              type="button"
              className="w-full rounded-xl py-3 text-sm font-semibold text-ivory-dim underline-offset-4 hover:underline"
              onClick={() => {
                setStep("pin");
                setProblem(null);
              }}
            >
              Use a different PIN
            </button>
          </form>
        )}

        <div aria-live="assertive">
          {problem && (
            <div id="join-problem" role="alert" className="rounded-2xl border border-bad/50 bg-bad/10 px-4 py-3">
              <p className="font-display text-lg font-extrabold text-bad">{problem.title}</p>
              <p className="mt-0.5 text-ivory">{problem.message}</p>
              {problem.terminal && (
                <Link href="/" className="mt-3 inline-flex min-h-11 items-center font-bold underline underline-offset-4">
                  Back to start
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
