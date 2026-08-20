import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  SafetyAuthError,
  buildSafetyAuthorizationMessage,
  verifySafetyAuthorization,
} from "../src/safety/auth.js";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const now = 1_724_150_000_000;
const request = {
  scope: "draft" as const,
  slug: "sakura-society",
  contentHash: "0x319b2fe63b680c13c394d642270186440d22d0eab6f47111ddeee17b3eb75fd9" as const,
  nonce: now,
};

async function signRequest() {
  return account.signMessage({ message: buildSafetyAuthorizationMessage(request) });
}

describe("verifySafetyAuthorization", () => {
  test("accepts the wallet that signed the exact run identity", async () => {
    const signature = await signRequest();

    const caller = await verifySafetyAuthorization(
      { ...request, caller: account.address, signature },
      now,
    );

    assert.equal(caller, account.address.toLowerCase());
  });

  test("rejects a signature replayed for edited content", async () => {
    const signature = await signRequest();

    await assert.rejects(
      verifySafetyAuthorization(
        {
          ...request,
          contentHash: "0x419b2fe63b680c13c394d642270186440d22d0eab6f47111ddeee17b3eb75fd9",
          caller: account.address,
          signature,
        },
        now,
      ),
      (error: unknown) => error instanceof SafetyAuthError && error.code === "INVALID_SIGNATURE",
    );
  });

  test("rejects a nonce older than ten minutes", async () => {
    const signature = await signRequest();

    await assert.rejects(
      verifySafetyAuthorization(
        { ...request, caller: account.address, signature },
        now + 10 * 60 * 1000 + 1,
      ),
      (error: unknown) => error instanceof SafetyAuthError && error.code === "STALE_NONCE",
    );
  });
});
