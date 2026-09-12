import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyOn0G } from "@/components/VerifyOn0G";
import type { VerifyResult } from "@/lib/api";

// The panel's job is to re-derive what is on chain and show the applicant the three identifiers
// recorded with the decision. The recompute helpers are the real ones; only the fetch is stubbed.
const verifyDecision = vi.fn();
vi.mock("@/lib/api", () => ({ api: { verifyDecision: (...args: unknown[]) => verifyDecision(...args) } }));

afterEach(cleanup);
beforeEach(() => verifyDecision.mockReset());

const WALLET = "0x00000000000000000000000000000000000000aa";
const TX = `0x${"ab".repeat(32)}`;
const NULLIFIER = `0x${"33".repeat(32)}`;
const PROVIDER = "0x00000000000000000000000000000000000000cc";
const OTHER_SIGNER = "0x00000000000000000000000000000000000000ee";

// A real secp256k1 signature over a known text, so signer recovery is exercised rather than faked.
const SIGNED_TEXT = "hanami decision";
const KEY = `0x${"11".repeat(32)}` as const;
let SIGNATURE = "";
let TEE_SIGNER = "";

beforeAll(async () => {
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(KEY);
  TEE_SIGNER = account.address;
  SIGNATURE = await account.signMessage({ message: SIGNED_TEXT });
});

function routerResult(over: Partial<Record<string, unknown>> = {}): VerifyResult {
  return {
    decision: "approved",
    decisionTx: TX,
    attestationHash: `0x${"cd".repeat(32)}`,
    attestationPath: "router",
    nullifier: NULLIFIER,
    ticketId: "12",
    kind: "router",
    trace: { requestId: "req-9", provider: PROVIDER, teeVerified: true },
    ...over,
  } as VerifyResult;
}

function signedResult(over: { attestationHash?: string; signingAddress?: string } = {}): VerifyResult {
  return {
    decision: "approved",
    decisionTx: TX,
    attestationHash: over.attestationHash ?? `0x${"ef".repeat(32)}`,
    attestationPath: "direct",
    nullifier: NULLIFIER,
    ticketId: "12",
    kind: "tee-signature",
    signature: {
      text: SIGNED_TEXT,
      signature: SIGNATURE,
      signingAddress: over.signingAddress ?? TEE_SIGNER,
      provider: PROVIDER,
      chatId: "chat-1",
      model: "llama-3.3",
    },
  } as VerifyResult;
}

async function runVerify(result: VerifyResult) {
  verifyDecision.mockResolvedValue(result);
  render(<VerifyOn0G slug="mei-chan" wallet={WALLET} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /verify on 0g/i }));
  });
  await waitFor(() => expect(verifyDecision).toHaveBeenCalled());
}

describe("VerifyOn0G", () => {
  it("shows all three recorded identifiers, not the attestation alone", async () => {
    await runVerify(routerResult());

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toContain(routerResult().attestationHash);
      expect(text).toContain(NULLIFIER);
      expect(text).toContain(TX);
    });
  });

  it("labels a router decision as the router path", async () => {
    await runVerify(routerResult());

    await waitFor(() => expect(document.body.textContent ?? "").toMatch(/router/i));
    expect(document.body.textContent ?? "").not.toMatch(/enclave signature \(direct\)/i);
  });

  it("labels an enclave-signed decision as the direct path", async () => {
    await runVerify(signedResult());

    await waitFor(() => expect(document.body.textContent ?? "").toMatch(/direct/i));
  });

  it("names the ticket the approval minted", async () => {
    await runVerify(routerResult());

    await waitFor(() => expect(document.body.textContent ?? "").toMatch(/#12/));
  });

  it("says a rejected decision minted no ticket rather than showing a blank", async () => {
    await runVerify(routerResult({ decision: "rejected", ticketId: null }));

    await waitFor(() => expect(document.body.textContent ?? "").toMatch(/no ticket/i));
  });

  it("reports a matching recompute as verified", async () => {
    const { recomputeAttestationHash } = await import("@/lib/attestation");
    const trace = { requestId: "req-9", provider: PROVIDER, teeVerified: true };
    await runVerify(routerResult({ attestationHash: recomputeAttestationHash(trace), trace }));

    await waitFor(() => expect(document.body.textContent ?? "").toMatch(/verified/i));
    expect(document.body.textContent ?? "").not.toMatch(/mismatch/i);
  });

  it("reports a recompute that does not match as a mismatch, and says not to trust it", async () => {
    await runVerify(routerResult({ attestationHash: `0x${"00".repeat(32)}` }));

    await waitFor(() => expect(document.body.textContent ?? "").toMatch(/mismatch/i));
    expect(document.body.textContent ?? "").toMatch(/do not trust/i);
  });

  it("recovers the enclave signer and says the enclave signed it", async () => {
    const { recomputeSignatureHash } = await import("@/lib/attestation");
    await runVerify(signedResult({ attestationHash: recomputeSignatureHash(SIGNATURE) }));

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toMatch(/recovered/i);
      expect(text).toMatch(/tee signer/i);
      expect(text).toContain(TEE_SIGNER);
      expect(text).toMatch(/verified/i);
    });
  });

  it("does not claim an enclave signed it when recovery lands on another address", async () => {
    const { recomputeSignatureHash } = await import("@/lib/attestation");
    await runVerify(signedResult({
      attestationHash: recomputeSignatureHash(SIGNATURE),
      signingAddress: OTHER_SIGNER,
    }));

    await waitFor(() => expect(document.body.textContent ?? "").toMatch(/mismatch|do not trust/i));
  });

  it("shows a decision with no Door as having no proof of human, not a blank hash", async () => {
    await runVerify(routerResult({ nullifier: null }));

    await waitFor(() => expect(document.body.textContent ?? "").toMatch(/no proof of human|not recorded/i));
  });

  it("verifies nothing until asked", () => {
    render(<VerifyOn0G slug="mei-chan" wallet={WALLET} />);
    expect(verifyDecision).not.toHaveBeenCalled();
    expect(document.body.textContent ?? "").not.toContain(NULLIFIER);
  });
});
