import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyMigrations } from "../src/db/index.js";
import { buildVerifyPayload } from "../src/tickets/verify.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

const ALICE = "0x00000000000000000000000000000000000000aa";
const NOW = 1_757_000_000;
const ATTESTATION = `0x${"22".repeat(32)}`;
const TX = `0x${"ab".repeat(32)}`;
const NULLIFIER = `0x${"33".repeat(32)}`;

const SIGNED = {
  kind: "tee-signature",
  text: "the enclave signed this",
  signature: `0x${"44".repeat(65)}`,
  signingAddress: "0x00000000000000000000000000000000000000ee",
  provider: "0x00000000000000000000000000000000000000pp".slice(0, 42),
  chatId: "chat-1",
  model: "llama-3.3",
};

type ApplicantOverrides = {
  decision?: string | null;
  attestationHash?: string | null;
  attestationPath?: string | null;
  nullifier?: string | null;
  ticketId?: number | null;
  attestationJson?: string | null;
};

async function setup(overrides: ApplicantOverrides = {}) {
  dir = await mkdtemp(join(tmpdir(), "hanami-verify-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);

  await client.execute({
    sql:
      "INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, owner_address, created_at, contract_version) " +
      "VALUES ('mei-chan', 'Mei', 1, '0x1', '0x2', '0g', 100, 'ipfs://p', '0x3', ?, 2)",
    args: [NOW],
  });

  await client.execute({
    sql:
      "INSERT INTO applicants (campaign_slug, wallet_address, started_at, decision, decision_tx, attestation_hash, attestation_json, attestation_path, nullifier, ticket_id) " +
      "VALUES ('mei-chan', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      ALICE,
      NOW,
      overrides.decision === undefined ? "approved" : overrides.decision,
      TX,
      overrides.attestationHash === undefined ? ATTESTATION : overrides.attestationHash,
      overrides.attestationJson === undefined ? JSON.stringify(SIGNED) : overrides.attestationJson,
      overrides.attestationPath === undefined ? "direct" : overrides.attestationPath,
      overrides.nullifier === undefined ? NULLIFIER : overrides.nullifier,
      overrides.ticketId === undefined ? 7 : overrides.ticketId,
    ],
  });

  return client;
}

async function payload(db: Client) {
  return buildVerifyPayload(db, "mei-chan", ALICE);
}

describe("buildVerifyPayload", () => {
  test("carries the nullifier, the ticket, and the path beside the attestation", async () => {
    const db = await setup();

    const result = await payload(db);
    assert.equal(result.status, 200);
    const body = result.body as Record<string, unknown>;

    assert.equal(body.decision, "approved");
    assert.equal(body.decisionTx, TX);
    assert.equal(body.attestationHash, ATTESTATION);
    assert.equal(body.attestationPath, "direct");
    assert.equal(body.nullifier, NULLIFIER);
    assert.equal(body.ticketId, "7");
  });

  test("keeps the enclave signature bundle the panel already verifies", async () => {
    const db = await setup();

    const body = (await payload(db)).body as { kind: string; signature: Record<string, unknown> };

    assert.equal(body.kind, "tee-signature");
    assert.equal(body.signature.signature, SIGNED.signature);
    assert.equal(body.signature.signingAddress, SIGNED.signingAddress);
    assert.equal(body.signature.text, SIGNED.text);
  });

  test("a router decision reports the router path and its trace", async () => {
    const db = await setup({
      attestationPath: "router",
      attestationJson: JSON.stringify({
        kind: "router",
        trace: { request_id: "req-9", provider: "0xprov", tee_verified: true },
      }),
    });

    const body = (await payload(db)).body as { kind: string; attestationPath: string; trace: Record<string, unknown> };

    assert.equal(body.kind, "router");
    assert.equal(body.attestationPath, "router");
    assert.deepEqual(body.trace, { requestId: "req-9", provider: "0xprov", teeVerified: true });
  });

  test("a rejected applicant has no ticket, and says so rather than inventing one", async () => {
    const db = await setup({ decision: "rejected", ticketId: null });

    const body = (await payload(db)).body as Record<string, unknown>;

    assert.equal(body.decision, "rejected");
    assert.equal(body.ticketId, null);
    assert.equal(body.nullifier, NULLIFIER);
  });

  test("a V1 decision predating the Door reports no nullifier and the router path", async () => {
    const db = await setup({
      nullifier: null,
      ticketId: null,
      attestationPath: null,
      attestationJson: JSON.stringify({
        kind: "router",
        trace: { request_id: "req-1", provider: "0xprov", tee_verified: true },
      }),
    });

    const body = (await payload(db)).body as Record<string, unknown>;

    assert.equal(body.nullifier, null);
    assert.equal(body.ticketId, null);
    assert.equal(body.attestationPath, "router", "an unrecorded path is the router path, not a blank");
  });

  test("a decision recorded before the path column existed is read from the attestation itself", async () => {
    const db = await setup({ attestationPath: null });

    const body = (await payload(db)).body as Record<string, unknown>;
    assert.equal(body.attestationPath, "direct", "an enclave signature is the direct path however it was recorded");
  });

  test("404s for a wallet that never applied", async () => {
    const db = await setup();
    const result = await buildVerifyPayload(db, "mei-chan", "0x00000000000000000000000000000000000000bb");
    assert.equal(result.status, 404);
  });

  test("409s while the interview is still running", async () => {
    const db = await setup({ decision: null, attestationHash: null });
    assert.equal((await payload(db)).status, 409);
  });

  test("falls back to the last attested turn when no attestation was stored", async () => {
    const db = await setup({ attestationJson: null, attestationPath: null });
    const applicant = await db.execute("SELECT id FROM applicants LIMIT 1");
    const id = Number(applicant.rows[0]?.id);
    await db.execute({
      sql: "INSERT INTO turns (applicant_id, turn_index, role, content, router_request_id, provider, tee_verified, created_at) VALUES (?, 1, 'bouncer', 'verdict', 'req-legacy', '0xprov', 1, ?)",
      args: [id, NOW],
    });

    const body = (await payload(db)).body as { kind: string; trace: Record<string, unknown>; attestationPath: string };

    assert.equal(body.kind, "router");
    assert.equal(body.attestationPath, "router");
    assert.equal(body.trace.requestId, "req-legacy");
  });

  test("404s when nothing attested the decision at all", async () => {
    const db = await setup({ attestationJson: null });
    assert.equal((await payload(db)).status, 404);
  });

  test("never returns proof material beyond the anonymous nullifier", async () => {
    const db = await setup();
    const body = JSON.stringify((await payload(db)).body);

    assert.doesNotMatch(body, /merkle_root|verification_level|"proof"/);
  });
});
