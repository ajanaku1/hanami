"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Campaign } from "@/lib/api";
import { PetalsCanvas } from "@/components/PetalsCanvas";
import { MarketCard } from "@/components/MarketCard";
import { MarketGridSkeleton } from "@/components/Skeleton";
import { ConnectButton } from "@/components/ConnectButton";
import { friendlyError } from "@/lib/errors";

export default function GalleryPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.listAllCampaigns().then((r) => setCampaigns(r.campaigns)).catch((e) => setErr(friendlyError(e)));
  }, []);

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
        <h1 className="font-serif text-[56px] leading-tight mb-2">The gallery.</h1>
        <p className="text-[var(--hanami-ink-soft)] mb-2 max-w-[58ch]">
          Every public bouncer on Hanami. Hover any card to flip from portrait to seal. Stats are live —
          approvals, rejections, and capacity update as applicants are interviewed.
        </p>
        {campaigns && (
          <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)] mb-10">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--hanami-sakura)] mr-2 align-middle" />
            {campaigns.length} public bouncer{campaigns.length === 1 ? "" : "s"} on 0G
          </p>
        )}

        {err && <p className="text-sm text-[var(--hanami-stamp)] mb-4">{err}</p>}
        {!campaigns && !err && <MarketGridSkeleton count={6} />}

        {campaigns && campaigns.length === 0 && (
          <div className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)] p-8 max-w-md">
            <p className="text-[var(--hanami-ink)] mb-5">
              No public bouncers yet. Owners list theirs by toggling visibility from the campaign admin page.
            </p>
            <Link href="/create" className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-6 py-3 text-[13px] tracking-[0.08em] uppercase hover:bg-[var(--hanami-indigo)] transition-colors" style={{ borderBottom: "none" }}>
              Mint your bouncer
            </Link>
          </div>
        )}

        {campaigns && campaigns.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
            {campaigns.map((c) => <MarketCard key={c.slug} c={c} />)}
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
