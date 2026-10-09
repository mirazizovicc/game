import type { Metadata } from "next";
import { HostScreen } from "@/components/host/HostScreen";
import { ModeBanner } from "@/components/ModeBanner";

export const metadata: Metadata = { title: "Host screen" };

export default async function HostGamePage({ params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  return <HostScreen pin={pin} banner={<ModeBanner />} />;
}
