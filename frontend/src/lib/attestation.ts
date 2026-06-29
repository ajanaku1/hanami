import { keccak256, encodeAbiParameters, toHex, type Hex } from "viem";

// Client-side mirror of the backend's attestationHashFromTrace (backend/src/og-chain.ts). Recomputes
// the on-chain attestation hash purely from the public x_0g_trace, so anyone can confirm the value
// recorded on 0G Chain was genuinely derived from a TEE-verified inference — no trust in Hanami.
//   keccak256(abi.encode(keccak256(utf8 requestId), provider, teeVerified))
export function recomputeAttestationHash(trace: {
  requestId: string;
  provider: string;
  teeVerified: boolean;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "bool" }],
      [keccak256(toHex(trace.requestId)), trace.provider as Hex, trace.teeVerified],
    ),
  );
}
