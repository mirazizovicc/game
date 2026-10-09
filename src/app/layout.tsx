import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/inter";
import "./globals.css";
import type { Metadata, Viewport } from "next";

// Backend mode is read from the environment at request time, never baked in at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Digital Divide Challenge", template: "%s · Digital Divide Challenge" },
  description:
    "A live classroom quiz on the digital divide and human rights. Join with a PIN on your phone and compete with your class.",
  applicationName: "Digital Divide Challenge",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b18",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ivory focus:px-4 focus:py-2 focus:font-bold focus:text-ink-950"
        >
          Skip to content
        </a>
        <div id="content">{children}</div>
      </body>
    </html>
  );
}
