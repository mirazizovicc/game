import Link from "next/link";
import { Brand } from "@/components/Brand";
import { ModeBanner } from "@/components/ModeBanner";
import { QuickJoin } from "@/components/forms/QuickJoin";
import { Button } from "@/components/ui/Button";

const STEPS = [
  { n: "1", title: "Scan or type the PIN", body: "Use the QR code on the screen, or enter the 6-digit game PIN." },
  { n: "2", title: "Pick a nickname", body: "No account, email or real name needed." },
  { n: "3", title: "Answer on your phone", body: "Seven questions. Getting it right matters most; speed is a small bonus." },
];

export default function HomePage() {
  return (
    <>
      <ModeBanner />
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 pb-10 pt-6 sm:px-8">
        <header className="flex items-center justify-between">
          <Brand href={null} />
          <Link href="/host" className="rounded-xl px-3 py-2 text-sm font-semibold text-ivory-dim underline-offset-4 hover:text-ivory hover:underline">
            Host a game
          </Link>
        </header>

        <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.15fr_1fr]">
          <section>
            <p className="mb-4 inline-block rounded-full bg-burgundy-700 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-rose-300">Live classroom quiz</p>
            <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              The Digital Divide <span className="text-rose-400">Challenge</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ivory-dim">
              When access to education, information, public services and work moves online, to what extent does the digital divide become a
              human-rights problem — and who is responsible for addressing it?
            </p>
            <p className="mt-3 max-w-xl text-ivory-mute">Seven questions · about six minutes · play on your own phone.</p>
          </section>

          <section aria-labelledby="join-heading" className="rounded-[1.75rem] bg-ink-800 p-6 shadow-card ring-1 ring-white/10 sm:p-8">
            <h2 id="join-heading" className="font-display text-2xl font-extrabold">
              Join a game
            </h2>
            <p className="mb-5 mt-1 text-ivory-dim">Enter the PIN shown on the classroom screen.</p>
            <QuickJoin />
            <div className="mt-6 border-t border-white/10 pt-5">
              <p className="mb-3 text-sm text-ivory-dim">Presenting? Start a game from your laptop.</p>
              <Link href="/host" className="inline-flex">
                <Button variant="ghost" size="md">
                  Host a game
                </Button>
              </Link>
            </div>
          </section>
        </main>

        <section aria-label="How it works" className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="rounded-2xl bg-ink-900/70 p-5 ring-1 ring-white/10">
              <span className="grid size-9 place-items-center rounded-full bg-burgundy-600 font-display font-extrabold">{step.n}</span>
              <h3 className="mt-3 font-display text-lg font-bold">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ivory-dim">{step.body}</p>
            </div>
          ))}
        </section>

        <footer className="mt-8 text-xs text-ivory-mute">
          Created for a university presentation on digital inequality and human rights. We collect only the nickname you choose.
        </footer>
      </div>
    </>
  );
}
