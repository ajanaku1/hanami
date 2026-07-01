import { keccak256, encodeAbiParameters, toHex, hashMessage, recoverAddress, type Hex } from "viem";

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

// Mirror of the backend's attestationHashFor for the Direct-broker path (backend/src/og-chain.ts):
// the on-chain attestation hash is keccak256 of the provider's raw TEE signature.
export function recomputeSignatureHash(signature: string): Hex {
  return keccak256(signature as Hex);
}

// Recover the signer of a TEE-signed message the way the 0G Compute SDK verifies it:
// recoverAddress(hashMessage(text), signature). If this equals the provider's on-chain
// teeSignerAddress, the signature was produced inside the enclave — no trust in Hanami or the Router.
export async function recoverTeeSigner(text: string, signature: string): Promise<string> {
  return recoverAddress({ hash: hashMessage(text), signature: signature as Hex });
}
