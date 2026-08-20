"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { api, type CampaignSafety } from "@/lib/api";
import { friendlyError } from "@/lib/errors";

type Props = {
  slug: string;
  ownerAddress: string;
  current: "public" | "private";
  onChange?: (next: "public" | "private") => void;
  safety?: CampaignSafety;
};

function toggleLabel(input: { busy: boolean; isPublic: boolean; publicationBlocked: boolean }): string {
  if (input.busy) return "signing…";
  if (input.isPublic) return "make private";
  if (input.publicationBlocked) return "certification required";
  return "make public";
}

export function VisibilityToggle({ slug, ownerAddress, current, onChange, safety }: Props) {
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
      setErr(friendlyError(e));
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
  const publicationBlocked = !isPublic && safety?.publicationEligible === false;
  return (
    <div className="flex items-center gap-3 text-[11px] tracking-[0.16em] uppercase">
      <span className="text-[var(--hanami-ink-soft)]">
        {isPublic ? "public · listed" : "private · hidden"}
      </span>
      <button
        onClick={toggle}
        disabled={busy || publicationBlocked}
        className="border border-[var(--hanami-rule)] px-3 py-1.5 hover:border-[var(--hanami-ink)] transition-colors disabled:opacity-40"
      >
        {toggleLabel({ busy, isPublic, publicationBlocked })}
      </button>
      {err && <span className="text-[var(--hanami-stamp)] font-mono normal-case tracking-normal text-[11px]">{err}</span>}
      {isPublic && safety?.state === "legacy" && (
        <span className="normal-case tracking-normal text-[11px] text-[var(--hanami-ink-soft)]">Making private permanently enables certification.</span>
      )}
    </div>
  );
}
