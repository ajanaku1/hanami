/// The Door's server side. The browser produces a proof with IDKit; this module forwards it,
/// unchanged, to World's v4 verify endpoint and reduces the answer to one of three outcomes.
///
/// Two rules shape everything here. The proof is never re-derived, re-signed, or edited on the way
/// through — a proof is only meaningful if the verifier sees exactly what the wallet produced. And
/// no proof material ever reaches a log line, an error message, or a response body: the only thing
/// that leaves this module is the anonymous nullifier and the credential level.

export type Credential = "selfie" | "orb" | "device";

/// The IDKit result, passed through verbatim. Its shape is World's, not ours.
export type IdkitResult = {
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  verification_level: string;
};

export type VerifyRequest = {
  result: IdkitResult;
  /// The lowercase wallet address. IDKit signed it, which is what binds the proof to one wallet.
  signal: string;
  appId: string;
  rpId: string;
  action: string;
};

export type VerifyOutcome =
  /// The proof is good. `nullifier` is the anonymous one-person-per-action identifier.
  | { status: "verified"; nullifier: string; method: Credential }
  /// World says no. The applicant may try again.
  | { status: "rejected" }
  /// We could not get an answer. Not the applicant's fault, and never recorded as a refusal.
  | { status: "unavailable" };

type VerifyResponse = { status: number; ok: boolean; json(): Promise<unknown> };
export type VerifyFetch = (url: string, init: RequestInit) => Promise<VerifyResponse>;

const VERIFY_BASE = "https://developer.world.org/api/v4/verify";

/// Legacy 3.0 proofs (which Selfie Check issues today) verify through the same v4 endpoint with no
/// field remapping, so one path serves all three credentials.
function credentialOf(level: unknown): Credential {
  if (level === "device" || level === "secure_document") return "device";
  if (level === "selfie" || level === "selfie_check") return "selfie";
  return "orb";
}

export async function verifyWorldProof(
  request: VerifyRequest,
  fetchImpl: VerifyFetch,
  log: (line: string) => void = () => {},
): Promise<VerifyOutcome> {
  const body = {
    proof: request.result.proof,
    merkle_root: request.result.merkle_root,
    nullifier_hash: request.result.nullifier_hash,
    verification_level: request.result.verification_level,
    action: request.action,
    signal: request.signal,
  };

  let response: VerifyResponse;
  try {
    response = await fetchImpl(`${VERIFY_BASE}/${request.rpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Deliberately not logging the error: a fetch failure can carry the request body with it.
    log("door: World verify unreachable");
    return { status: "unavailable" };
  }

  if (response.status >= 500) {
    log(`door: World verify returned ${response.status}`);
    return { status: "unavailable" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    log("door: World verify returned an unreadable body");
    return { status: "unavailable" };
  }

  if (!response.ok) {
    log("door: World verify rejected a proof");
    return { status: "rejected" };
  }

  const answer = payload as { success?: boolean; nullifier_hash?: string; verification_level?: string };
  if (answer.success !== true) {
    log("door: World verify rejected a proof");
    return { status: "rejected" };
  }

  return {
    status: "verified",
    // World echoes the nullifier back; fall back to the submitted one only if it does not.
    nullifier: answer.nullifier_hash ?? request.result.nullifier_hash,
    method: credentialOf(answer.verification_level ?? request.result.verification_level),
  };
}
