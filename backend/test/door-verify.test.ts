import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { verifyWorldProof, type IdkitResult, type VerifyFetch } from "../src/door/world-verify.js";

const RESULT: IdkitResult = {
  proof: "0xproof-material-that-must-never-be-logged",
  merkle_root: "0xroot",
  nullifier_hash: "0xnullifier",
  verification_level: "orb",
};

const CONFIG = { appId: "app_test", rpId: "rp_test", action: "hanami-door" };

function fetchReturning(status: number, body: unknown): VerifyFetch & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { status, ok: status < 400, async json() { return body; } };
  }) as VerifyFetch & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

describe("World verify", () => {
  test("forwards the IDKit result unchanged to the v4 endpoint for this rp", async () => {
    const fetchImpl = fetchReturning(200, { success: true, nullifier_hash: "0xnullifier" });

    const outcome = await verifyWorldProof(
      { result: RESULT, signal: "0x00000000000000000000000000000000000000aa", ...CONFIG },
      fetchImpl,
    );

    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(fetchImpl.calls[0]?.url, "https://developer.world.org/api/v4/verify/rp_test");
    const sent = JSON.parse(String(fetchImpl.calls[0]?.init.body));
    assert.equal(sent.proof, RESULT.proof, "the proof is forwarded byte for byte, not re-derived");
    assert.equal(sent.merkle_root, RESULT.merkle_root);
    assert.equal(sent.nullifier_hash, RESULT.nullifier_hash);
    assert.equal(sent.verification_level, RESULT.verification_level);
    assert.equal(sent.action, "hanami-door");
    assert.equal(sent.signal, "0x00000000000000000000000000000000000000aa");

    assert.deepEqual(outcome, { status: "verified", nullifier: "0xnullifier", method: "orb" });
  });

  test("maps a rejected proof to a retryable refusal", async () => {
    const fetchImpl = fetchReturning(400, { code: "invalid_proof", detail: "invalid" });
    const outcome = await verifyWorldProof({ result: RESULT, signal: "0xaa", ...CONFIG }, fetchImpl);
    assert.equal(outcome.status, "rejected");
  });

  test("maps an unreachable verifier to unavailable, not to a rejection", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as VerifyFetch;
    const outcome = await verifyWorldProof({ result: RESULT, signal: "0xaa", ...CONFIG }, fetchImpl);
    assert.equal(outcome.status, "unavailable", "a verifier being down is not the applicant's fault");
  });

  test("treats a 5xx from World as unavailable", async () => {
    const fetchImpl = fetchReturning(503, { detail: "service unavailable" });
    const outcome = await verifyWorldProof({ result: RESULT, signal: "0xaa", ...CONFIG }, fetchImpl);
    assert.equal(outcome.status, "unavailable");
  });

  test("reports the credential the proof actually carries", async () => {
    const fetchImpl = fetchReturning(200, { success: true, nullifier_hash: "0xn", verification_level: "device" });
    const outcome = await verifyWorldProof(
      { result: { ...RESULT, verification_level: "device" }, signal: "0xaa", ...CONFIG },
      fetchImpl,
    );
    assert.deepEqual(outcome, { status: "verified", nullifier: "0xn", method: "device" });
  });

  test("never puts proof material in an error or a log line", async () => {
    const logged: string[] = [];
    const fetchImpl = fetchReturning(400, { code: "invalid_proof", proof: RESULT.proof });

    const outcome = await verifyWorldProof(
      { result: RESULT, signal: "0xaa", ...CONFIG },
      fetchImpl,
      (line: string) => logged.push(line),
    );

    assert.equal(outcome.status, "rejected");
    const everything = logged.join("\n") + JSON.stringify(outcome);
    assert.equal(everything.includes(RESULT.proof), false, "the proof leaked");
    assert.equal(everything.includes(RESULT.merkle_root), false, "the merkle root leaked");
  });
});
