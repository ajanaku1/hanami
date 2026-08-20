"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { api, type Campaign } from "@/lib/api";
import { MarketCard } from "@/components/MarketCard";
import { MarketGridSkeleton } from "@/components/Skeleton";
import { ConnectButton } from "@/components/ConnectButton";
import { VisibilityToggle } from "@/components/VisibilityToggle";
import { friendlyError } from "@/lib/errors";
import { PageShell } from "@/components/ui/PageShell";

export default function MinePage() {
  const { address, isConnected } = useAccount();
  const [mine, setMine] = useState<Campaign[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    api.listCampaignsByOwner(address).then((r) => setMine(r.campaigns)).catch((e) => setErr(friendlyError(e)));
  }, [address, isConnected]);

  return (
    <PageShell actions={<ConnectButton compact />} width="full">
      <section>
        <p className="eyebrow">Owner workspace</p>
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

        {err && <p className="text-sm text-[var(--hanami-stamp)] mb-4">{err}</p>}
        {isConnected && mine === null && !err && <MarketGridSkeleton count={3} />}

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
                  <VisibilityToggle slug={c.slug} ownerAddress={c.owner_address} current={c.visibility} safety={c.safety} />
                </div>
                <div className="px-1 flex flex-wrap gap-4 text-[11px] tracking-[0.08em] uppercase">
                  <Link href={`/c/${c.slug}/admin`}>admin →</Link>
                  <a target="_blank" rel="noopener" href={`https://chainscan.0g.ai/address/${c.campaign_address}`}>chain →</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
