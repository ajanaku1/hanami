import { verifyMessage, type Address, type Hex } from "viem";

const AUTH_WINDOW_MS = 10 * 60 * 1000;

type SafetyScope = "draft" | "campaign";

type RunIdentity = {
  scope: SafetyScope;
  slug: string;
  contentHash: Hex;
  nonce: number;
};

type SafetyAuthorization = RunIdentity & {
  caller: Address;
  signature: Hex;
};

export type SafetyAuthCode = "STALE_NONCE" | "INVALID_SIGNATURE";

export class SafetyAuthError extends Error {
  constructor(public readonly code: SafetyAuthCode) {
    super(code === "STALE_NONCE" ? "safety authorization expired" : "safety signature did not verify");
    this.name = "SafetyAuthError";
  }
}

export function buildSafetyAuthorizationMessage(identity: RunIdentity): string {
  return `Hanami: test ${identity.scope} ${identity.slug} content ${identity.contentHash} at ${identity.nonce}`;
}

export async function verifySafetyAuthorization(
  authorization: SafetyAuthorization,
  now = Date.now(),
): Promise<string> {
  if (Math.abs(now - authorization.nonce) > AUTH_WINDOW_MS) {
    throw new SafetyAuthError("STALE_NONCE");
  }

  const valid = await verifyMessage({
    address: authorization.caller,
    message: buildSafetyAuthorizationMessage(authorization),
    signature: authorization.signature,
  });
  if (!valid) throw new SafetyAuthError("INVALID_SIGNATURE");
  return authorization.caller.toLowerCase();
}
