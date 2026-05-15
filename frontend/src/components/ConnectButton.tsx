"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { zeroG } from "@/lib/wagmi";

type Props = { compact?: boolean };

export function ConnectButton({ compact = false }: Props) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const ctaCls = compact
    ? "text-[11px] tracking-[0.16em] uppercase border-b border-[var(--hanami-rule)] hover:border-[var(--hanami-ink)] transition-colors pb-0.5"
    : "bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-6 py-3 text-[13px] tracking-[0.08em] uppercase hover:bg-[var(--hanami-indigo)] disabled:opacity-40 transition-colors";

  // wrong chain — single action, no dropdown
  if (isConnected && address && chainId !== zeroG.id) {
    return (
      <button onClick={() => switchChain({ chainId: zeroG.id })} disabled={switching} className={ctaCls}>
        {switching ? "switching…" : "switch to 0G"}
      </button>
    );
  }

  // connected — dropdown
  if (isConnected && address) {
    return (
      <div ref={wrapRef} className="relative z-[100]">
        <button onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase border border-[var(--hanami-rule)] hover:border-[var(--hanami-ink)] px-3 py-2 bg-transparent transition-colors">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--hanami-moss)]" />
          <span className="font-mono normal-case tracking-normal text-[12px]">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
          <span className="text-[var(--hanami-ink-soft)]" aria-hidden>▾</span>
        </button>
        {open && (
          <div className="absolute right-0 top-[calc(100%+6px)] min-w-[200px] bg-[var(--hanami-paper)] border border-[var(--hanami-rule)] shadow-[0_24px_64px_-32px_rgba(26,23,20,0.25)] z-[200]">
            <Link href="/mine" onClick={() => setOpen(false)}
              className="block px-4 py-3 text-[12px] tracking-[0.12em] uppercase hover:bg-[var(--hanami-paper-soft)]"
              style={{ borderBottom: "1px solid var(--hanami-rule)" }}>
              My bouncers
            </Link>
            <button onClick={() => { disconnect(); setOpen(false); }}
              className="block w-full text-left px-4 py-3 text-[12px] tracking-[0.12em] uppercase hover:bg-[var(--hanami-paper-soft)] text-[var(--hanami-stamp)]">
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  // not connected
  const injected = connectors.find((c) => c.type === "injected") ?? connectors[0];
  return (
    <div className={compact ? "flex items-center gap-3" : "flex flex-col gap-2"}>
      <button
        onClick={() => injected && connect({ connector: injected })}
        disabled={isPending || !injected}
        className={ctaCls}
      >
        {isPending ? "connecting…" : "connect wallet"}
      </button>
      {error && !compact && <p className="text-[11px] text-[var(--hanami-stamp)] font-mono">{error.message}</p>}
    </div>
  );
}
