"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { api, type Campaign } from "@/lib/api";
import { PetalsCanvas } from "@/components/PetalsCanvas";
import { MarketCard } from "@/components/MarketCard";
import { ConnectButton } from "@/components/ConnectButton";
import { VisibilityToggle } from "@/components/VisibilityToggle";

export default function MinePage() {
  const { address, isConnected } = useAccount();
  const [mine, setMine] = useState<Campaign[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) { setMine(null); return; }
    api.listCampaignsByOwner(address).then((r) => setMine(r.campaigns)).catch((e) => setErr(String(e)));
  }, [address, isConnected]);

  return (
    <>
      <PetalsCanvas />
      <header className="relative z-50 flex justify-between items-start px-10 py-5">
        <div className="flex flex-col items-start">
          <Link href="/" className="flex items-baseline gap-3" style={{ borderBottom: "none" }}>
            <span className="font-serif text-[24px] tracking-wider">Hanami</span>
            <span className="text-[18px] text-[var(--hanami-ink-soft)]">花見</span>
          </Link>
          <Link href="/" className="mt-1 text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] hover:text-[var(--hanami-ink)] transition-colors" style={{ borderBottom: "none" }}>
            ← back
          </Link>
        </div>
        <ConnectButton compact />
      </header>

      <main className="relative z-10 max-w-[1320px] mx-auto px-10 py-10">
        <h1 className="font-serif text-[48px] leading-tight mb-2">Your bouncers.</h1>
        <p className="text-[var(--hanami-ink-soft)] mb-10 max-w-[58ch]">
          Every bouncer this wallet owns. Toggle visibility to control whether each one is listed in the public gallery.
        </p>

        {!isConnected && (
          <div className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)] p-8 max-w-md">
            <p className="text-[var(--hanami-ink-soft)] mb-5">Connect to see the bouncers you own.</p>
            <ConnectButton />
          </div>
        )}

        {err && <p className="font-mono text-sm text-[var(--hanami-stamp)]">{err}</p>}
        {isConnected && mine === null && !err && <p className="text-[var(--hanami-ink-soft)]">…</p>}

        {isConnected && mine && mine.length === 0 && (
          <div className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)] p-8 max-w-md">
            <p className="text-[var(--hanami-ink)] mb-5">You haven&apos;t minted a bouncer with this wallet yet.</p>
            <Link href="/create" className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-6 py-3 text-[13px] tracking-[0.08em] uppercase hover:bg-[var(--hanami-indigo)] transition-colors" style={{ borderBottom: "none" }}>
              Mint your first
            </Link>
          </div>
        )}

        {isConnected && mine && mine.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
            {mine.map((c) => (
              <div key={c.slug} className="flex flex-col gap-3">
                <MarketCard c={c} />
                <div className="px-1">
                  <VisibilityToggle slug={c.slug} ownerAddress={c.owner_address} current={c.visibility} />
                </div>
                <div className="px-1 flex flex-wrap gap-4 text-[11px] tracking-[0.08em] uppercase">
                  <Link href={`/c/${c.slug}/admin`}>admin →</Link>
                  <a target="_blank" rel="noopener" href={`https://chainscan-galileo.0g.ai/address/${c.campaign_address}`}>chain →</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="relative z-10 border-t border-[var(--hanami-rule)] mt-20 px-10 py-6 flex justify-between text-[11px] tracking-[0.12em] uppercase text-[var(--hanami-ink-soft)]">
        <span>Hanami · 2026</span>
        <span>Built on 0G — Compute · Storage · Chain · ERC-7857</span>
      </footer>
    </>
  );
}
