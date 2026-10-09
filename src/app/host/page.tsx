import type { Metadata } from "next";
import { ModeBanner } from "@/components/ModeBanner";
import { HostSetup } from "@/components/forms/HostSetup";

export const metadata: Metadata = { title: "Host a game" };

export default function HostPage() {
  return (
    <>
      <ModeBanner />
      <HostSetup />
    </>
  );
}
