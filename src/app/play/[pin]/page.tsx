import type { Metadata } from "next";
import { ModeBanner } from "@/components/ModeBanner";
import { PlayerScreen } from "@/components/player/PlayerScreen";

export const metadata: Metadata = { title: "Play" };

export default async function PlayPage({ params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  return (
    <>
      <ModeBanner />
      <PlayerScreen pin={pin} />
    </>
  );
}
