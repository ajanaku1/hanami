import { encodeAbiParameters, keccak256, type Hex } from "viem";

export function hashBouncerContent(persona: string, lorebook: string): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "string" }],
      [persona, lorebook],
    ),
  );
}

export function isCertifiedContent(
  certifiedHash: string | null,
  persona: string,
  lorebook: string,
): boolean {
  return certifiedHash !== null && certifiedHash === hashBouncerContent(persona, lorebook);
}
