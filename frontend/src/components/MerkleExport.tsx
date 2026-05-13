"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { api, type MerkleExportResult } from "@/lib/api";
import { friendlyError } from "@/lib/errors";

type Props = { slug: string; ownerAddress: string; finalized: boolean; alreadyOnChain: string | null };

export function MerkleExport({ slug, ownerAddress, finalized, alreadyOnChain }: Props) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [data, setData] = useState<MerkleExportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"export" | "finalize" | null>(null);
  const [finalizedTx, setFinalizedTx] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isOwner = isConnected && address && address.toLowerCase() === ownerAddress.toLowerCase();

  async function loadExport() {
    setBusy("export"); setErr(null);
    try { setData(await api.exportMerkle(slug)); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(null); }
  }

  async function finalize() {
    if (!isOwner || !address) return;
    setBusy("finalize"); setErr(null);
    try {
      const nonce = Date.now();
      const signature = await signMessageAsync({ message: `Hanami: finalize ${slug} at ${nonce}` });
      const r = await api.finalizeMerkle(slug, { signature, caller: address, nonce });
      setFinalizedTx(r.txHash);
      setData((d) => d ? { ...d, finalized: true, onChainRoot: r.root } : d);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  function downloadJson() {
    if (!data) return;
    const json = JSON.stringify({ root: data.root, leaves: data.leaves }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `hanami-${slug}-merkle.json`; a.click();
    URL.revokeObjectURL(url);
  }

  async function copySnippet() {
    if (!data) return;
    await navigator.clipboard.writeText(data.solidityHelper);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!data) {
    return (
      <div>
        <button onClick={loadExport} disabled={busy === "export"}
          className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-6 py-3 text-sm tracking-[0.08em] uppercase hover:bg-[var(--hanami-indigo)] disabled:opacity-40 transition-colors">
          {busy === "export" ? "building tree…" : "Build Merkle root"}
        </button>
        {err && <p className="text-[var(--hanami-stamp)] text-sm font-mono mt-2">{err}</p>}
      </div>
    );
  }

  if (data.leafCount === 0) {
    return (
      <p className="text-[var(--hanami-ink-soft)] text-sm max-w-[58ch]">
        No approved applicants yet. The tree is empty. Once approvals come in, come back here to export and finalize.
      </p>
    );
  }

  const isFinalized = data.finalized || finalized;

  return (
    <div className="space-y-5">
      <div className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)] p-5">
        <div className="text-[11px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)] mb-2">Merkle root</div>
        <div className="font-mono text-xs break-all">{data.root}</div>
        <div className="mt-3 text-[11px] text-[var(--hanami-ink-soft)]">
          {data.leafCount} approved address{data.leafCount === 1 ? "" : "es"}
          {isFinalized && (data.onChainRoot ?? alreadyOnChain) && (
            <> · <span className="text-[var(--hanami-moss)]">finalized on chain</span></>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={downloadJson}
          className="border border-[var(--hanami-rule)] hover:border-[var(--hanami-ink)] px-5 py-2.5 text-xs tracking-[0.1em] uppercase transition-colors">
          Download JSON
        </button>
        <button onClick={copySnippet}
          className="border border-[var(--hanami-rule)] hover:border-[var(--hanami-ink)] px-5 py-2.5 text-xs tracking-[0.1em] uppercase transition-colors">
          {copied ? "copied ✓" : "Copy Solidity snippet"}
        </button>
        {isOwner && !isFinalized && (
          <button onClick={finalize} disabled={busy === "finalize"}
            className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-5 py-2.5 text-xs tracking-[0.1em] uppercase hover:bg-[var(--hanami-indigo)] disabled:opacity-40 transition-colors">
            {busy === "finalize" ? "signing + sending…" : "Publish root on-chain"}
          </button>
        )}
      </div>

      {finalizedTx && (
        <div className="text-[11px] font-mono">
          finalize tx: <a target="_blank" rel="noopener" href={`https://chainscan-galileo.0g.ai/tx/${finalizedTx}`}>{finalizedTx.slice(0, 12)}…</a>
        </div>
      )}
      {err && <p className="text-[var(--hanami-stamp)] text-sm font-mono">{err}</p>}

      <details className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)]">
        <summary className="px-5 py-3 cursor-pointer text-[11px] tracking-[0.14em] uppercase text-[var(--hanami-ink-soft)] select-none">
          Snippet preview
        </summary>
        <pre className="px-5 pb-4 text-[11px] leading-relaxed overflow-x-auto font-mono whitespace-pre-wrap">{data.solidityHelper}</pre>
      </details>
    </div>
  );
}
