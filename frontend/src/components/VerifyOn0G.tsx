"use client";

import { useState } from "react";
import { api, type VerifyResult } from "@/lib/api";
import { recomputeAttestationHash } from "@/lib/attestation";
import { friendlyError } from "@/lib/errors";

type Props = { slug: string; wallet: string };

type State =
  | { phase: "idle" }
  | { phase: "verifying" }
  | { phase: "done"; data: VerifyResult; recomputed: string; match: boolean }
  | { phase: "error"; message: string };

// "Verify on 0G" — fetches the decision's x_0g_trace, recomputes the attestation hash in the
// browser, and shows it matching (byte-for-byte) the hash recorded on 0G Chain. Hash-Diff direction.
export function VerifyOn0G({ slug, wallet }: Props) {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function verify() {
    setState({ phase: "verifying" });
    try {
      const data = await api.verifyDecision(slug, wallet);
      const recomputed = recomputeAttestationHash(data.trace);
      const match = recomputed.toLowerCase() === data.attestationHash.toLowerCase();
      setState({ phase: "done", data, recomputed, match });
    } catch (e) {
      setState({ phase: "error", message: friendlyError(e) });
    }
  }

  return (
    <div className="border border-[var(--hanami-rule)] bg-[#fbf8f1] max-w-md">
      <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--hanami-rule)]">
        <span className="text-[10px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)]">
          TEE attestation · x_0g_trace
        </span>
        {state.phase === "done" && (
          <span className={`text-[10px] tracking-[0.12em] px-2 py-1 border ${
            state.data.trace.teeVerified
              ? "text-[var(--hanami-moss)] border-[var(--hanami-moss)]"
              : "text-[var(--hanami-stamp)] border-[var(--hanami-stamp)]"
          }`}>
            tee_verified {state.data.trace.teeVerified ? "✓" : "✗"}
          </span>
        )}
      </div>

      {state.phase === "done" ? (
        <div className="px-4 py-3.5 text-[12px]">
          <TraceRow k="request id" v={state.data.trace.requestId} />
          <TraceRow k="provider" v={state.data.trace.provider} />
          <TraceRow k="tee_verified" v={String(state.data.trace.teeVerified)} />
          <div className="border-t border-dashed border-[var(--hanami-rule)] mt-1.5 pt-3">
            <TraceRow
              k="recomputed"
              v={state.recomputed}
              highlight={state.match ? "match" : "mismatch"}
            />
            <TraceRow k="on-chain" v={state.data.attestationHash} />
          </div>
          <p className="mt-3 text-[12px] text-[var(--hanami-ink-soft)]">
            {state.match ? (
              <>Recomputed hash <b className="text-[var(--hanami-moss)]">matches</b> the on-chain attestation byte-for-byte.</>
            ) : (
              <span className="text-[var(--hanami-stamp)]">Recomputed hash does not match — do not trust this decision.</span>
            )}
            {state.data.decisionTx && (
              <>
                {" "}
                <a className="text-[var(--hanami-sakura)] border-b border-[var(--hanami-sakura)]" target="_blank"
                   rel="noopener" href={`https://chainscan.0g.ai/tx/${state.data.decisionTx}`}>decision tx →</a>
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="px-4 py-4">
          <button
            onClick={verify}
            disabled={state.phase === "verifying"}
            className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-5 py-2.5 text-[11px] tracking-[0.16em] uppercase disabled:opacity-40 transition-opacity"
          >
            {state.phase === "verifying" ? "verifying…" : "Verify on 0G"}
          </button>
          <p className="mt-3 text-[12px] text-[var(--hanami-ink-soft)]">
            {state.phase === "error"
              ? <span className="text-[var(--hanami-stamp)] font-mono text-[11px]">{state.message}</span>
              : "Recompute keccak256(requestId, provider, tee_verified) in your browser and match it against 0G Chain."}
          </p>
        </div>
      )}
    </div>
  );
}

function TraceRow({ k, v, highlight }: { k: string; v: string; highlight?: "match" | "mismatch" }) {
  const bg = highlight === "match" ? "bg-[rgba(74,100,66,0.16)]" : highlight === "mismatch" ? "bg-[rgba(181,74,74,0.16)]" : "";
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2.5 py-1">
      <span className="text-[10px] tracking-[0.12em] uppercase text-[var(--hanami-ink-soft)] pt-0.5">{k}</span>
      <span className={`font-mono text-[12px] break-all ${bg}`}>{v}</span>
    </div>
  );
}
