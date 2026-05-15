import Link from "next/link";
import { PetalsCanvas } from "@/components/PetalsCanvas";
import { BouncerCard } from "@/components/BouncerCard";
import { FeaturedBouncers } from "@/components/FeaturedBouncers";
import { InkDivider } from "@/components/InkDivider";

export default function Home() {
  return (
    <>
      <PetalsCanvas />

      <header className="relative z-50 flex justify-between items-center px-6 sm:px-10 py-5 gap-4">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-[24px] tracking-wider">Hanami</span>
          <span className="text-[18px] text-[var(--hanami-ink-soft)]" style={{ fontFamily: "var(--font-serif-loaded)" }}>花見</span>
        </div>
        <nav className="flex items-center gap-4 sm:gap-6 text-xs tracking-[0.08em] uppercase text-[var(--hanami-ink-soft)]">
          <Link href="/create" className="border-none">Mint</Link>
          <Link href="/gallery" className="border-none">Gallery</Link>
          <a className="border-none hidden sm:inline" href="https://chainscan.0g.ai/address/0x764883319e51e46F683aB54D93F26bcBb74A7030" target="_blank" rel="noopener">Contract</a>
        </nav>
      </header>

      {/* HERO */}
      <section className="relative z-10 max-w-[1240px] mx-auto px-6 sm:px-10 py-10 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-20 items-center">
        <div>
          <h1 className="font-serif font-medium leading-[0.95] tracking-tight text-[44px] sm:text-[60px] lg:text-[80px] mb-4 lg:mb-[18px]">
            An AI bouncer <span className="italic text-[var(--hanami-sakura)]">for your whitelist.</span>
          </h1>
          <p className="font-serif italic text-[20px] sm:text-[26px] text-[var(--hanami-ink-soft)] mb-7 max-w-[22ch]">
            Every bouncer iNFT mints its own seal.
          </p>
          <p className="text-[15px] sm:text-[16px] max-w-[44ch] text-[var(--hanami-ink)] mb-9">
            Your project sets the criteria. The bouncer holds a private conversation
            with each applicant inside a TEE. The bouncer itself is an ERC-7857 iNFT
            with a generated seal.
          </p>
          <div className="flex flex-wrap gap-5 items-center">
            <Link href="/create" className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-7 py-3.5 text-[13px] tracking-[0.08em] uppercase hover:bg-[var(--hanami-indigo)] transition-colors" style={{ borderBottom: "none" }}>
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
      </section>

      <InkDivider />

      {/* HOW IT WORKS */}
      <section className="relative z-10 max-w-[1240px] mx-auto px-6 sm:px-10 py-10">
        <div className="mb-12 max-w-[60ch]">
          <div className="text-[11px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)] mb-3">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--hanami-sakura)] mr-2 align-middle" />
            How it works
          </div>
          <h2 className="font-serif text-[32px] sm:text-[44px] leading-tight mb-3">From persona to Merkle root in four moves.</h2>
          <p className="text-[var(--hanami-ink-soft)]">
            Hanami runs the first pass on your whitelist. Your team reviews the borderline cases by hand,
            then drops the exported root into your existing mint contract on any EVM chain.
          </p>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 list-none p-0">
          <Step n="01" title="Write the persona">
            Describe the bouncer in your own voice — the values, the criteria, what makes a member.
            Persona is encrypted-by-tokenURI and stored on 0G Storage.
          </Step>
          <Step n="02" title="Mint the bouncer">
            One on-chain transaction: a new ERC-7857 iNFT on 0G Chain. You get a shareable applicant link
            and a procedural seal derived from the tokenId.
          </Step>
          <Step n="03" title="Applicants interview">
            Each applicant connects their wallet and holds a 3–6 turn private conversation with the bouncer.
            Inference runs inside a TEE; every verdict is on-chain with its attestation hash.
          </Step>
          <Step n="04" title="Export the root">
            When you&apos;re ready, finalize the campaign. You get a Merkle root + proofs. Drop the root into
            your mint contract on Ethereum, Base, Arbitrum, OP, or 0G.
          </Step>
        </ol>

        <div className="mt-12">
          <Link href="/create" className="text-[13px] tracking-[0.08em] uppercase">Start with a persona →</Link>
        </div>
      </section>

      <InkDivider />

      {/* FEATURED BOUNCERS */}
      <section className="relative z-10 max-w-[1240px] mx-auto px-6 sm:px-10 py-10">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)] mb-3">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--hanami-sakura)] mr-2 align-middle" />
              Featured bouncers
            </div>
            <h2 className="font-serif text-[32px] sm:text-[44px] leading-tight">Recent mints.</h2>
          </div>
          <Link href="/gallery" className="text-[13px] tracking-[0.08em] uppercase">See the full gallery →</Link>
        </div>
        <FeaturedBouncers />
      </section>

      <InkDivider />

      {/* BUILT ON 0G */}
      <section className="relative z-10 max-w-[1240px] mx-auto px-6 sm:px-10 py-10">
        <div className="mb-12 max-w-[60ch]">
          <div className="text-[11px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)] mb-3">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--hanami-sakura)] mr-2 align-middle" />
            Why Hanami is on 0G
          </div>
          <h2 className="font-serif text-[32px] sm:text-[44px] leading-tight mb-3">Four primitives, one tool.</h2>
          <p className="text-[var(--hanami-ink-soft)]">
            The bouncer&apos;s reasoning is private but verifiable. The persona is durable. The iNFT is
            tradable. The Merkle root is chain-agnostic. Each piece sits on the part of 0G that fits.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
          <Pillar tag="0G Compute · Sealed inference" name="The interview runs inside a TEE">
            Every applicant turn is forwarded to a TEE-attested provider. The bouncer&apos;s criteria stay
            private — jailbreak attempts and screenshot leaks don&apos;t expose them. We verify the
            provider signature on every response and reject any reply that didn&apos;t pass.
          </Pillar>
          <Pillar tag="0G Storage · KV + Log" name="Persona, lorebook, and reasoning land on 0G">
            The bouncer&apos;s persona prompt and reference lorebook are uploaded to 0G Storage at mint.
            Every approved decision&apos;s reasoning is also pinned. The encryptedPersonaURI on the iNFT
            points at the storage root.
          </Pillar>
          <Pillar tag="0G Chain · ERC-7857 iNFT" name="The bouncer is its own NFT">
            BouncerRegistry implements ERC-7857 — the iNFT standard. Each bouncer holds a private
            persona pointer, accumulates a reputation score from approvals, and authorizes campaign
            contracts to record decisions on its behalf.
          </Pillar>
          <Pillar tag="EIP-712 · Merkle export" name="Drops into any EVM mint">
            The campaign&apos;s approved list exports as a Merkle root + per-applicant proofs. Paste the
            root into your mint contract on Ethereum, Base, Arbitrum, Optimism, or 0G itself.
            One bouncer, any chain.
          </Pillar>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[var(--hanami-rule)] mt-16 px-10 py-8 flex flex-wrap gap-6 justify-between text-[11px] tracking-[0.12em] uppercase text-[var(--hanami-ink-soft)]">
        <span>Hanami · 2026</span>
        <span>
          Built on 0G — Compute · Storage · Chain · ERC-7857
        </span>
        <a href="https://chainscan.0g.ai/address/0x764883319e51e46F683aB54D93F26bcBb74A7030" target="_blank" rel="noopener">
          Registry on Chainscan →
        </a>
      </footer>
    </>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li>
      <div className="font-mono text-[11px] tracking-[0.2em] text-[var(--hanami-sakura)] mb-3">{n}</div>
      <div className="font-serif text-[22px] leading-tight mb-2">{title}</div>
      <p className="text-[13px] text-[var(--hanami-ink-soft)] leading-relaxed">{children}</p>
    </li>
  );
}

function Pillar({ tag, name, children }: { tag: string; name: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-sakura)] mb-2 font-mono">{tag}</div>
      <h3 className="font-serif text-[24px] leading-tight mb-3">{name}</h3>
      <p className="text-[14px] text-[var(--hanami-ink)] leading-relaxed max-w-[52ch]">{children}</p>
    </div>
  );
}
