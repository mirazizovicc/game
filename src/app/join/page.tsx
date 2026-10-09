import type { Metadata } from "next";
import { ModeBanner } from "@/components/ModeBanner";
import { JoinFlow } from "@/components/forms/JoinFlow";
import { normalizePin } from "@/lib/domain/pin";

export const metadata: Metadata = { title: "Join a game" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ pin?: string | string[] }> }) {
  const { pin } = await searchParams;
  const initialPin = normalizePin(Array.isArray(pin) ? (pin[0] ?? "") : (pin ?? "")).slice(0, 6);
  return (
    <>
      <ModeBanner />
      <JoinFlow initialPin={initialPin} />
    </>
  );
}
