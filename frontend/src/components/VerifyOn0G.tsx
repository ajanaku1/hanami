"use client";

import { useState } from "react";
import { api, type VerifyResult } from "@/lib/api";
import { recomputeAttestationHash, recomputeSignatureHash, recoverTeeSigner } from "@/lib/attestation";
import { friendlyError } from "@/lib/errors";

type Props = { slug: string; wallet: string };

type Done =
  | { kind: "router"; data: VerifyResult; recomputed: string; match: boolean }
  | { kind: "tee-signature"; data: VerifyResult; recomputed: string; hashMatch: boolean; recovered: string; signerMatch: boolean };

type State =
  | { phase: "idle" }
  | { phase: "verifying" }
  | { phase: "done"; result: Done }
  | { phase: "error"; message: string };

// "Verify on 0G" — fetches the decision's attestation and re-derives it in the browser to match the
// value recorded on 0G Chain, and shows the three identifiers the decision was recorded with: the
// attestation hash, the Door's anonymous nullifier, and the decision transaction. Two proofs,
// depending on how the decision was attested:
//   - tee-signature (Direct broker): recompute keccak256(signature) to match the on-chain hash AND
//     recover the signature to the provider's on-chain teeSignerAddress — the enclave signed it.
//   - router: recompute keccak256(requestId, provider, tee_verified) and match on chain.
export function VerifyOn0G({ slug, wallet }: Props) {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function verify() {
    setState({ phase: "verifying" });
    try {
      setState({ phase: "done", result: await runVerification(slug, wallet) });
    } catch (e) {
      setState({ phase: "error", message: friendlyError(e) });
    }
  }

  return (
    <div className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-raised)] max-w-md">
      <Header state={state} />
      {state.phase === "done" ? (
        <>
          {state.result.kind === "tee-signature"
            ? <SignatureProof result={state.result} />
            : <RouterProof result={state.result} />}
          <Recorded data={state.result.data} kind={state.result.kind} />
        </>
      ) : (
        <IdleOrError state={state} onVerify={verify} />
      )}
    </div>
  );
}

async function runVerification(slug: string, wallet: string): Promise<Done> {
  const data = await api.verifyDecision(slug, wallet);
  if (data.kind === "tee-signature") {
    const recomputed = recomputeSignatureHash(data.signature.signature);
    const recovered = await recoverTeeSigner(data.signature.text, data.signature.signature);
    return {
      kind: "tee-signature",
      data,
      recomputed,
      hashMatch: recomputed.toLowerCase() === data.attestationHash.toLowerCase(),
      recovered,
      signerMatch: recovered.toLowerCase() === data.signature.signingAddress.toLowerCase(),
    };
  }
  const recomputed = recomputeAttestationHash(data.trace);
  return { kind: "router", data, recomputed, match: recomputed.toLowerCase() === data.attestationHash.toLowerCase() };
}

function Header({ state }: { state: State }) {
  const label = state.phase === "done" && state.result.kind === "tee-signature"
    ? "TEE signature · 0G Compute"
    : "TEE attestation · x_0g_trace";
  const ok = state.phase === "done" && (state.result.kind === "tee-signature"
    ? state.result.hashMatch && state.result.signerMatch
    : state.result.match);
  return (
    <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--hanami-rule)]">
      <span className="text-[10px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)]">{label}</span>
      {state.phase === "done" && (
        <span className={`text-[10px] tracking-[0.12em] px-2 py-1 border ${
          ok ? "text-[var(--hanami-moss)] border-[var(--hanami-moss)]" : "text-[var(--hanami-stamp)] border-[var(--hanami-stamp)]"
        }`}>
          {ok ? "verified ✓" : "mismatch ✗"}
        </span>
      )}
    </div>
  );
}

function SignatureProof({ result }: { result: Extract<Done, { kind: "tee-signature" }> }) {
  const { data, recomputed, hashMatch, recovered, signerMatch } = result;
  const sig = "signature" in data ? data.signature : null;
  const ok = hashMatch && signerMatch;
  return (
    <div className="px-4 py-3.5 text-[12px]">
      <TraceRow k="signed text" v={sig?.text ?? ""} />
      <TraceRow k="signature" v={sig?.signature ?? ""} />
      <div className="border-t border-dashed border-[var(--hanami-rule)] mt-1.5 pt-3">
        <TraceRow k="keccak(sig)" v={recomputed} highlight={hashMatch ? "match" : "mismatch"} />
        <TraceRow k="on-chain" v={data.attestationHash} />
      </div>
      <div className="border-t border-dashed border-[var(--hanami-rule)] mt-1.5 pt-3">
        <TraceRow k="recovered" v={recovered} highlight={signerMatch ? "match" : "mismatch"} />
        <TraceRow k="tee signer" v={sig?.signingAddress ?? ""} />
      </div>
      <p className="mt-3 text-[12px] text-[var(--hanami-ink-soft)]">
        {ok ? (
          <>The signature <b className="text-[var(--hanami-moss)]">recovers to the provider&apos;s on-chain TEE signer</b> and its keccak matches the hash on 0G Chain. The enclave signed this decision — no trust in Hanami or the Router.</>
        ) : (
          <span className="text-[var(--hanami-stamp)]">Verification failed — do not trust this decision.</span>
        )}
        <DecisionTxLink tx={data.decisionTx} />
      </p>
    </div>
  );
}

function RouterProof({ result }: { result: Extract<Done, { kind: "router" }> }) {
  const { data, recomputed, match } = result;
  const trace = "trace" in data ? data.trace : null;
  return (
    <div className="px-4 py-3.5 text-[12px]">
      <TraceRow k="request id" v={trace?.requestId ?? ""} />
      <TraceRow k="provider" v={trace?.provider ?? ""} />
      <TraceRow k="tee_verified" v={String(trace?.teeVerified)} />
      <div className="border-t border-dashed border-[var(--hanami-rule)] mt-1.5 pt-3">
        <TraceRow k="recomputed" v={recomputed} highlight={match ? "match" : "mismatch"} />
        <TraceRow k="on-chain" v={data.attestationHash} />
      </div>
      <p className="mt-3 text-[12px] text-[var(--hanami-ink-soft)]">
        {match ? (
          <>Recomputed hash <b className="text-[var(--hanami-moss)]">matches</b> the on-chain attestation byte-for-byte.</>
        ) : (
          <span className="text-[var(--hanami-stamp)]">Recomputed hash does not match — do not trust this decision.</span>
        )}
        <DecisionTxLink tx={data.decisionTx} />
      </p>
    </div>
  );
}

const PATH_LABEL = {
  direct: "Enclave signature (direct)",
  router: "Router trace (router)",
} as const;

/// The three identifiers recorded with the decision, shown in full so they can be checked against
/// 0G Chain by hand. A decision made before the Door has no nullifier, and a rejection has no
/// ticket; both say so rather than showing an empty row.
function Recorded({ data, kind }: { data: VerifyResult; kind: Done["kind"] }) {
  const path = data.attestationPath ?? (kind === "tee-signature" ? "direct" : "router");
  const ticketId = data.ticketId ?? null;

  return (
    <div className="px-4 py-3.5 border-t border-[var(--hanami-rule)] text-[12px]">
      <div className="text-[10px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] pb-2">
        Recorded on 0G
      </div>
      <TraceRow k="attestation" v={data.attestationHash} />
      <TraceRow k="proof of human" v={data.nullifier ?? "no proof of human recorded"} />
      <TraceRow k="decision tx" v={data.decisionTx ?? "not recorded"} />
      <TraceRow k="path" v={PATH_LABEL[path]} />
      <TraceRow k="ticket" v={ticketId ? `#${ticketId}` : "no ticket issued"} />
    </div>
  );
}

function DecisionTxLink({ tx }: { tx: string | null }) {
  if (!tx) return null;
  return (
    <>
      {" "}
      <a className="text-[var(--hanami-sakura)] border-b border-[var(--hanami-sakura)]" target="_blank"
         rel="noopener" href={`https://chainscan.0g.ai/tx/${tx}`}>decision tx →</a>
    </>
  );
}

function IdleOrError({ state, onVerify }: { state: State; onVerify: () => void }) {
  return (
    <div className="px-4 py-4">
      <button
        onClick={onVerify}
        disabled={state.phase === "verifying"}
        className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-5 py-2.5 text-[11px] tracking-[0.16em] uppercase disabled:opacity-40 transition-opacity"
      >
        {state.phase === "verifying" ? "verifying…" : "Verify on 0G"}
      </button>
      <p className="mt-3 text-[12px] text-[var(--hanami-ink-soft)]">
        {state.phase === "error"
          ? <span className="text-[var(--hanami-stamp)] font-mono text-[11px]">{state.message}</span>
          : "Recompute the attestation in your browser and match it against 0G Chain — no wallet needed."}
      </p>
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
