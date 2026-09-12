import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Address, Hex } from "viem";
import { applyMigrations } from "../src/db/index.js";
import { attestationPathOf, inferTurn, type InferDeps } from "../src/bouncer.js";
import { recordApplicantDecision, type DecideDeps } from "../src/tickets/decide.js";
import { buildVerifyPayload } from "../src/tickets/verify.js";
import type { Attestation, ChatTurn } from "../src/og-compute.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

const ALICE = "0x00000000000000000000000000000000000000aa" as Address;
const CAMPAIGN = "0x00000000000000000000000000000000000000c2" as Address;
const NOW = 1_757_000_000;
const TX = `0x${"ab".repeat(32)}` as Hex;
const ATTESTATION_HASH = `0x${"22".repeat(32)}` as Hex;
const NULLIFIER = `0x${"33".repeat(32)}`;

const SIGNED: Attestation = {
  kind: "tee-signature",
  text: "signed in the enclave",
  signature: `0x${"44".repeat(65)}`,
  signingAddress: "0x00000000000000000000000000000000000000ee",
  provider: "0x00000000000000000000000000000000000000cc",
  chatId: "chat-1",
  model: "llama-3.3",
};

const ROUTED: Attestation = {
  kind: "router",
  trace: { request_id: "req-9", provider: "0xprov", tee_verified: true },
};

const MESSAGES: ChatTurn[] = [{ role: "user", content: "hello" }];

function deps(over: Partial<InferDeps> = {}): InferDeps {
  return {
    directEnabled: () => true,
    chatDirect: async () => ({ content: "verdict", attestation: SIGNED }),
    chatRouter: async () => ({ content: "verdict", trace: { request_id: "req-9", provider: "0xprov", tee_verified: true } }),
    ...over,
  };
}

describe("attestationPathOf", () => {
  test("an enclave signature is the direct path", () => {
    assert.equal(attestationPathOf(SIGNED), "direct");
  });

  test("a router trace is the router path", () => {
    assert.equal(attestationPathOf(ROUTED), "router");
  });
});

describe("inferTurn", () => {
  test("a decision turn takes the signed path when the broker is configured", async () => {
    const result = await inferTurn(MESSAGES, true, deps());

    assert.equal(result.attestation.kind, "tee-signature");
    assert.equal(attestationPathOf(result.attestation), "direct");
    assert.equal(result.trace.tee_verified, true);
  });

  test("a signed path that fails falls back to the Router rather than failing the turn", async () => {
    let routerCalls = 0;
    const result = await inferTurn(MESSAGES, true, deps({
      chatDirect: async () => { throw new Error("ledger not funded"); },
      chatRouter: async () => {
        routerCalls += 1;
        return { content: "verdict", trace: { request_id: "req-9", provider: "0xprov", tee_verified: true } };
      },
    }));

    assert.equal(routerCalls, 1);
    assert.equal(attestationPathOf(result.attestation), "router");
    assert.equal(result.reply, "verdict");
  });

  test("an unconfigured broker never reaches the signed path", async () => {
    let directCalls = 0;
    const result = await inferTurn(MESSAGES, true, deps({
      directEnabled: () => false,
      chatDirect: async () => { directCalls += 1; return { content: "x", attestation: SIGNED }; },
    }));

    assert.equal(directCalls, 0);
    assert.equal(attestationPathOf(result.attestation), "router");
  });

  test("a turn that cannot carry a verdict stays on the Router even when the broker is on", async () => {
    let directCalls = 0;
    const result = await inferTurn(MESSAGES, false, deps({
      chatDirect: async () => { directCalls += 1; return { content: "x", attestation: SIGNED }; },
    }));

    assert.equal(directCalls, 0, "only the decision turn is worth the signed path");
    assert.equal(attestationPathOf(result.attestation), "router");
  });
});

describe("the path on the record", () => {
  async function setup() {
    dir = await mkdtemp(join(tmpdir(), "hanami-path-"));
    client = createClient({ url: `file:${join(dir, "test.db")}` });
    await applyMigrations(client);
    await client.execute({
      sql:
        "INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, owner_address, created_at, contract_version) " +
        "VALUES ('mei-chan', 'Mei', 1, '0x1', ?, '0g', 100, 'ipfs://p', '0x3', ?, 2)",
      args: [CAMPAIGN, NOW],
    });
    await client.execute({
      sql: "INSERT INTO applicants (campaign_slug, wallet_address, started_at) VALUES ('mei-chan', ?, ?)",
      args: [ALICE, NOW],
    });
    await client.execute({
      sql: "INSERT INTO proofs (campaign_slug, wallet_address, nullifier, method, verified_at) VALUES ('mei-chan', ?, ?, 'orb', ?)",
      args: [ALICE, NULLIFIER, NOW],
    });
    const res = await client.execute("SELECT id FROM applicants LIMIT 1");
    return { db: client, applicantId: Number(res.rows[0]?.id) };
  }

  const decideDeps: DecideDeps = {
    recordRouted: async () => ({ txHash: TX, attestationHash: ATTESTATION_HASH, reasoningHash: `0x${"55".repeat(32)}`, ticketId: 7n }),
    readTicketId: async () => 7n,
  };

  /// The decision branch records the decision and then, once the transcript is pinned, stores the
  /// attestation itself. Both halves happen here so the verify payload is read the way it is served.
  async function decide(db: Client, applicantId: number, attestation: Attestation) {
    const receipt = await recordApplicantDecision(db, decideDeps, {
      slug: "mei-chan",
      applicantId,
      wallet: ALICE,
      approve: true,
      reasoning: "welcome",
      attestation,
      attestationPath: attestationPathOf(attestation),
    });
    await db.execute({
      sql: "UPDATE applicants SET attestation_json = ? WHERE id = ?",
      args: [JSON.stringify(attestation), applicantId],
    });
    return receipt;
  }

  test("a signed decision is recorded, receipted, and verified as the direct path", async () => {
    const { db, applicantId } = await setup();

    const receipt = await decide(db, applicantId, SIGNED);
    assert.equal(receipt.attestationPath, "direct");

    const stored = await db.execute("SELECT attestation_path FROM applicants LIMIT 1");
    assert.equal(stored.rows[0]?.attestation_path, "direct");

    const payload = await buildVerifyPayload(db, "mei-chan", ALICE);
    assert.equal((payload.body as { attestationPath: string }).attestationPath, "direct");
  });

  test("a decision that fell back to the Router says so everywhere", async () => {
    const { db, applicantId } = await setup();

    const receipt = await decide(db, applicantId, ROUTED);
    assert.equal(receipt.attestationPath, "router");

    const payload = await buildVerifyPayload(db, "mei-chan", ALICE);
    assert.equal((payload.body as { attestationPath: string }).attestationPath, "router");
  });
});
