"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { api } from "@/lib/api";

type Props = {
  slug: string;
  ownerAddress: string;
  current: "public" | "private";
  onChange?: (next: "public" | "private") => void;
};

export function VisibilityToggle({ slug, ownerAddress, current, onChange }: Props) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [vis, setVis] = useState(current);

  const isOwner = isConnected && address && address.toLowerCase() === ownerAddress.toLowerCase();

  async function toggle() {
    if (!isOwner || !address) return;
    const next: "public" | "private" = vis === "public" ? "private" : "public";
    setBusy(true);
    setErr(null);
    try {
      const nonce = Date.now();
      const message = `Hanami: set ${slug} visibility to ${next} at ${nonce}`;
      const signature = await signMessageAsync({ message });
      await api.setVisibility(slug, { visibility: next, signature, caller: address, nonce });
      setVis(next);
      onChange?.(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) {
    return (
      <span className="text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] font-mono">
        {vis === "public" ? "public · listed in gallery" : "private · invite only"}
      </span>
    );
  }

  const isPublic = vis === "public";
  return (
    <div className="flex items-center gap-3 text-[11px] tracking-[0.16em] uppercase">
      <span className="text-[var(--hanami-ink-soft)]">
        {isPublic ? "public · listed" : "private · hidden"}
      </span>
      <button
        onClick={toggle}
        disabled={busy}
        className="border border-[var(--hanami-rule)] px-3 py-1.5 hover:border-[var(--hanami-ink)] transition-colors disabled:opacity-40"
      >
        {busy ? "signing…" : isPublic ? "make private" : "make public"}
      </button>
      {err && <span className="text-[var(--hanami-stamp)] font-mono normal-case tracking-normal text-[11px]">{err}</span>}
    </div>
  );
}
