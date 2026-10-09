"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { isValidPin, normalizePin } from "@/lib/domain/pin";

export function QuickJoin() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const clean = normalizePin(pin);
        if (!isValidPin(clean)) {
          setError("The game PIN has 6 digits.");
          return;
        }
        router.push(`/join?pin=${clean}`);
      }}
    >
      <div>
        <label htmlFor="quick-pin" className="mb-2 block text-sm font-semibold text-ivory-dim">
          Game PIN
        </label>
        <input
          id="quick-pin"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={7}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "quick-pin-error" : undefined}
          placeholder="123 456"
          className="w-full rounded-2xl border-2 border-ink-600 bg-ink-950 px-5 py-4 text-center font-display text-4xl font-extrabold tracking-[0.2em] placeholder:text-ink-600 focus:border-gold focus:outline-none"
        />
        {error && (
          <p id="quick-pin-error" role="alert" className="mt-2 font-semibold text-bad">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full">
        Enter
      </Button>
    </form>
  );
}
