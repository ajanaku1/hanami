import Link from "next/link";
import { landing } from "@/copy";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center px-8 py-32">
      <div className="max-w-2xl w-full">
        <h1 className="font-serif text-[var(--text-display)] leading-none mb-10">{landing.title}</h1>

        <p className="font-serif italic text-[var(--text-2xl)] text-[var(--hanami-ink)] mb-8">
          {landing.tagline}
        </p>

        <p className="text-[var(--hanami-ink-soft)] leading-relaxed mb-16 max-w-[58ch]">
          {landing.body}
        </p>

        <div className="flex flex-wrap gap-x-8 gap-y-3 items-baseline">
          <Link
            href="/create"
            className="text-[var(--hanami-paper)] bg-[var(--hanami-ink)] px-6 py-3 text-sm tracking-wide hover:bg-[var(--hanami-indigo)] transition-colors border-none"
            style={{ borderBottom: "none" }}
          >
            {landing.ctaPrimary}
          </Link>
          <Link
            href="/c/sakura-society"
            className="text-sm text-[var(--hanami-ink-soft)]"
          >
            {landing.ctaSecondary} →
          </Link>
        </div>

        <hr className="mt-24" />

        <p className="text-xs text-[var(--hanami-ink-soft)] mono">
          <span className="seal" />
          contracts live on 0G Galileo testnet
        </p>
      </div>
    </main>
  );
}
