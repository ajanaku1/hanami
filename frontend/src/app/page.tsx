import Link from "next/link";
import { PetalsCanvas } from "@/components/PetalsCanvas";
import { BouncerCard } from "@/components/BouncerCard";

export default function Home() {
  return (
    <>
      <PetalsCanvas />
      <header className="relative z-10 flex justify-between items-center px-10 py-5">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-[24px] tracking-wider">Hanami</span>
          <span className="text-[18px] text-[var(--hanami-ink-soft)]" style={{ fontFamily: "var(--font-serif-loaded)" }}>花見</span>
        </div>
        <nav className="text-xs tracking-[0.08em] uppercase text-[var(--hanami-ink-soft)]">
          <Link href="/create" className="ml-6 border-none">Mint</Link>
          <Link href="/c/sakura-society" className="ml-6 border-none">Gallery</Link>
          <a className="ml-6 border-none" href="https://chainscan-galileo.0g.ai/address/0xA4D38fcB1C8aD17920bEF7AE97E2b8D5E72F68b7" target="_blank" rel="noopener">Contract</a>
        </nav>
      </header>

      <main className="relative z-10 max-w-[1240px] mx-auto px-10 py-16 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-20 items-center">
        <div>
          <h1 className="font-serif font-medium leading-[0.95] tracking-tight" style={{ fontSize: 80, marginBottom: 18 }}>
            An AI bouncer <span className="italic text-[var(--hanami-sakura)]">for your whitelist.</span>
          </h1>
          <p className="font-serif italic text-[26px] text-[var(--hanami-ink-soft)] mb-7 max-w-[22ch]">
            Every bouncer iNFT mints its own seal.
          </p>
          <p className="text-[16px] max-w-[44ch] text-[var(--hanami-ink)] mb-9">
            Your project sets the criteria. The bouncer holds a private conversation
            with each applicant inside a TEE. The bouncer itself is an ERC-7857 iNFT
            with a generated seal.
          </p>
          <div className="flex gap-5 items-center">
            <Link
              href="/create"
              className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-7 py-3.5 text-[13px] tracking-[0.08em] uppercase hover:bg-[var(--hanami-indigo)] transition-colors"
              style={{ borderBottom: "none" }}
            >
              Mint a bouncer
            </Link>
            <Link href="/c/sakura-society" className="text-[13px] text-[var(--hanami-ink-soft)]">
              Talk to Mei-chan, token №3 →
            </Link>
          </div>
        </div>

        <div className="justify-self-center w-full max-w-[380px]">
          <BouncerCard tokenId={3} name="Mei-chan" subtitle="Aoyama · 23 yrs" sealRoot="0g://0552…a590" />
          <div className="mt-6 text-center text-[11px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)]">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--hanami-sakura)] mr-2 align-middle" />
            hover or click to flip
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-[var(--hanami-rule)] mt-24 px-10 py-6 flex justify-between text-[11px] tracking-[0.12em] uppercase text-[var(--hanami-ink-soft)]">
        <span>Hanami · 2026</span>
        <span>Built on 0G — Compute · Storage · Chain · ERC-7857</span>
      </footer>
    </>
  );
}
