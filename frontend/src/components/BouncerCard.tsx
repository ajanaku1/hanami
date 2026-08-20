"use client";

import { useState } from "react";
import { Portrait, pickVariant } from "./Portrait";
import { Seal } from "./Seal";

type Props = {
  tokenId: number;
  name: string;
  subtitle?: string;
  sealRoot?: string;
  imageUri?: string | null;
  className?: string;
  forceFlip?: boolean;
};

export function BouncerCard({ tokenId, name, subtitle, sealRoot, imageUri, className, forceFlip = false }: Props) {
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const flipped = forceFlip || hovered || clicked;
  const variant = pickVariant(tokenId);

  return (
    <button
      type="button"
      aria-label={`Show ${name} ${flipped ? "portrait" : "seal"}`}
      aria-pressed={flipped}
      className={`relative w-full aspect-[0.72/1] ${className ?? ""}`}
      style={{ perspective: 1600 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setClicked((v) => !v)}
    >
      <div
        data-testid="bouncer-card-inner"
        className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          transitionProperty: "transform",
          transitionDuration: "280ms",
          transitionTimingFunction: "cubic-bezier(0.32,0.72,0.32,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* FRONT — portrait */}
        <div
          className="absolute inset-0 flex flex-col bg-[var(--hanami-paper-soft)] border border-[var(--hanami-rule)]"
          style={{ backfaceVisibility: "hidden", boxShadow: "0 30px 80px -36px rgba(26,23,20,0.45)" }}
        >
          <div className="flex justify-between px-4 py-3 text-[10px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)] border-b border-[var(--hanami-rule)]">
            <span>Bouncer</span>
            <span className="font-mono">№{tokenId}</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <Portrait variant={variant} imageUri={imageUri} className="w-full h-full" />
          </div>
          <div className="flex justify-between items-baseline px-4 py-3 border-t border-[var(--hanami-rule)]">
            <span className="font-serif text-[20px] font-medium">{name}</span>
            {subtitle && <span className="text-[11px] text-[var(--hanami-ink-soft)] tracking-[0.12em] uppercase">{subtitle}</span>}
          </div>
        </div>
        {/* BACK — seal */}
        <div
          className="absolute inset-0 flex flex-col bg-[var(--hanami-paper-soft)] border border-[var(--hanami-rule)]"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", boxShadow: "0 30px 80px -36px rgba(26,23,20,0.45)" }}
        >
          <div className="flex justify-between px-4 py-3 text-[10px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)] border-b border-[var(--hanami-rule)]">
            <span>Seal of №{tokenId}</span>
            <span className="font-mono">ERC-7857</span>
          </div>
          <div className="flex-1 bg-[var(--hanami-paper-raised)] flex items-center justify-center p-4">
            <Seal seed={tokenId} className="w-[75%] h-[75%]" />
          </div>
          <div className="flex justify-between items-baseline px-4 py-3 border-t border-[var(--hanami-rule)]">
            <span className="font-serif italic text-[16px]">花見 · №{tokenId}</span>
            {sealRoot && (
              <span className="font-mono text-[10px] text-[var(--hanami-ink-soft)]">
                {sealRoot.startsWith("0g://") ? sealRoot.slice(5, 13) : sealRoot.slice(0, 8)}…
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
