"use client";

import Link from "next/link";
import { useState } from "react";
import { Portrait, pickVariant } from "./Portrait";
import { Seal } from "./Seal";
import type { Campaign } from "@/lib/api";

const CHAIN_LABEL: Record<string, string> = {
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
  op: "Optimism",
  "0g": "0G",
};

const SAFETY_LABEL: Record<Campaign["safety"]["state"], string> = {
  certified: "Certified",
  legacy: "Legacy public",
  required: "Safety required",
  running: "Safety running",
  failed: "Safety failed",
  interrupted: "Safety interrupted",
};

function campaignStatus(isFinalized: boolean, isPublic: boolean): "finalized" | "open" | "private" {
  if (isFinalized) return "finalized";
  return isPublic ? "open" : "private";
}

function campaignStatusColor(status: ReturnType<typeof campaignStatus>): string {
  if (status === "finalized") return "var(--hanami-ink-soft)";
  if (status === "open") return "var(--hanami-moss)";
  return "var(--hanami-stamp)";
}

export function MarketCard({ c }: { c: Campaign }) {
  const [hovered, setHovered] = useState(false);
  const variant = pickVariant(c.bouncer_token_id);
  const isPublic = c.visibility === "public";
  const isFinalized = c.finalized_at !== null;
  const status = campaignStatus(isFinalized, isPublic);
  const statusColor = campaignStatusColor(status);

  const cap = c.wl_size_cap;
  const approved = c.approved_count ?? 0;
  const rejected = c.rejected_count ?? 0;
  const fillPct = cap > 0 ? Math.min(100, Math.round((approved / cap) * 100)) : 0;

  return (
    <article
      className="group bg-[var(--hanami-paper-soft)] border border-[var(--hanami-rule)] hover:border-[var(--hanami-ink)] transition-colors flex flex-col"
      style={{ boxShadow: "0 16px 48px -32px rgba(26,23,20,0.25)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* image area — flips on pointer hover */}
      <div className="relative aspect-square overflow-hidden" style={{ perspective: 1400 }}>
        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transition: "transform 280ms cubic-bezier(0.32,0.72,0.32,1)",
            transform: hovered ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
            <Portrait variant={variant} imageUri={c.image_uri} className="w-full h-full" />
          </div>
          <div
            className="absolute inset-0 bg-white flex items-center justify-center p-6"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <Seal seed={c.bouncer_token_id} className="w-full h-full" />
          </div>
        </div>
        {/* status corner */}
        <div className="absolute top-3 left-3 px-2 py-1 bg-[var(--hanami-paper)] text-[10px] tracking-[0.18em] uppercase font-mono"
             style={{ color: statusColor, border: `1px solid var(--hanami-rule)` }}>
          {status}
        </div>
        <div className="absolute top-3 right-3 px-2 py-1 bg-[var(--hanami-paper)] text-[10px] tracking-[0.18em] uppercase font-mono"
             style={{ border: `1px solid var(--hanami-rule)` }}>
          №{c.bouncer_token_id}
        </div>
        <div className="absolute bottom-3 left-3 px-2 py-1 bg-[var(--hanami-paper)] text-[10px] tracking-[0.14em] uppercase font-mono border border-[var(--hanami-rule)]">
          {SAFETY_LABEL[c.safety.state]}
        </div>
      </div>

      {/* meta */}
      <div className="px-5 pt-5 pb-3">
        <div className="font-serif text-[22px] leading-tight">{c.name}</div>
        <div className="text-[11px] text-[var(--hanami-ink-soft)] mt-0.5 font-mono">
          by {c.owner_address.slice(0, 6)}…{c.owner_address.slice(-4)}
        </div>
      </div>

      {/* progress bar */}
      <div className="px-5 pb-2">
        <div className="flex justify-between text-[10px] tracking-[0.12em] uppercase text-[var(--hanami-ink-soft)] mb-1.5">
          <span>{approved} / {cap} approved</span>
          <span>{fillPct}%</span>
        </div>
        <div className="h-[3px] bg-[var(--hanami-rule)] relative">
          <div className="absolute inset-y-0 left-0 bg-[var(--hanami-sakura)]" style={{ width: `${fillPct}%` }} />
        </div>
      </div>

      {/* stats grid */}
      <dl className="grid grid-cols-2 gap-px bg-[var(--hanami-rule)] mt-3 text-[12px] border-t border-[var(--hanami-rule)]">
        <Stat k="approved" v={approved.toString()} />
        <Stat k="rejected" v={rejected.toString()} />
        <Stat k="cap" v={cap.toString()} />
        <Stat k="dest chain" v={CHAIN_LABEL[c.target_chain] ?? c.target_chain} />
      </dl>

      {/* footer — apply CTA only when public + open */}
      <div className="px-5 py-4 border-t border-[var(--hanami-rule)] mt-auto bg-[var(--hanami-paper-soft)]">
        {isPublic && !isFinalized ? (
          <Link href={`/c/${c.slug}`}
            className="block w-full text-center bg-[var(--hanami-ink)] text-[var(--hanami-paper)] py-2.5 text-[12px] tracking-[0.1em] uppercase hover:bg-[var(--hanami-indigo)] transition-colors"
            style={{ borderBottom: "none" }}>
            Apply
          </Link>
        ) : isFinalized ? (
          <div className="text-center text-[12px] tracking-[0.1em] uppercase text-[var(--hanami-ink-soft)] py-2.5">
            Whitelist finalized
          </div>
        ) : (
          <div className="text-center text-[12px] tracking-[0.1em] uppercase text-[var(--hanami-ink-soft)] py-2.5">
            Private · invite only
          </div>
        )}
      </div>
    </article>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-[var(--hanami-paper-soft)] px-5 py-3">
      <div className="text-[10px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] mb-0.5">{k}</div>
      <div className="font-serif text-[16px] leading-tight">{v}</div>
    </div>
  );
}
