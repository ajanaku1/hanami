import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyMigrations } from "../src/db/index.js";
import { recordApplicantDecision, retryTicket, type DecideDeps } from "../src/tickets/decide.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

const ALICE = "0x00000000000000000000000000000000000000aa";
const CAMPAIGN = "0x00000000000000000000000000000000000000c2";
const TX = `0x${"ab".repeat(32)}` as const;
const ATTESTATION = `0x${"22".repeat(32)}` as const;
const NULLIFIER = "0xnullifier";
const CLOSE_AT = 1_757_600_000;
const TICKET_EXPIRY = 1_759_000_000;

async function seed(contractVersion: number) {
  dir = await mkdtemp(join(tmpdir(), "hanami-decide-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);
  await client.execute({
    sql:
      "INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, owner_address, created_at, close_at, ticket_expiry, contract_version) " +
      "VALUES ('mei-chan', 'Mei', 1, '0x1', ?, '0g', 100, 'ipfs://p', '0x3', 1757000000, ?, ?, ?)",
    args: [CAMPAIGN, CLOSE_AT, TICKET_EXPIRY, contractVersion],
  });
  await client.execute({
    sql: "INSERT INTO applicants (campaign_slug, wallet_address, started_at) VALUES ('mei-chan', ?, 1757000000)",
    args: [ALICE],
  });
  await client.execute({
    sql:
      "INSERT INTO proofs (campaign_slug, wallet_address, nullifier, method, agent_id, verified_at) VALUES ('mei-chan', ?, ?, 'orb', NULL, 1757000000)",
    args: [ALICE, NULLIFIER],
  });
  const row = await client.execute("SELECT id FROM applicants");
  return { db: client, applicantId: Number(row.rows[0]?.id) };
}

function deps(overrides: Partial<DecideDeps> = {}): DecideDeps {
  return {
    recordRouted: async () => ({
      txHash: TX,
      attestationHash: ATTESTATION,
      reasoningHash: `0x${"11".repeat(32)}`,
      ticketId: 7n,
    }),
    readTicketId: async () => 7n,
    ...overrides,
  } as DecideDeps;
}

const decision = (approve: boolean) => ({
  slug: "mei-chan",
  applicantId: 1,
  wallet: ALICE,
  approve,
  reasoning: "reasoning",
  attestation: {
    kind: "router" as const,
    trace: { request_id: "req-1", provider: "0xprovider", tee_verified: true },
  },
  attestationPath: "router" as const,
});

describe("recording a decision on a V2 campaign", () => {
  test("carries the stored nullifier to the chain and keeps the minted ticket", async () => {
    const { db, applicantId } = await seed(2);
    const seen: unknown[] = [];

    const receipt = await recordApplicantDecision(db, deps({
      recordRouted: async (args) => {
        seen.push(args);
        return { txHash: TX, attestationHash: ATTESTATION, reasoningHash: `0x${"11".repeat(32)}`, ticketId: 7n };
      },
    }), { ...decision(true), applicantId });

    assert.equal((seen[0] as { nullifierHash: string }).nullifierHash, NULLIFIER);
    assert.equal((seen[0] as { contractVersion: number }).contractVersion, 2);
    assert.deepEqual(receipt.ticket, { id: "7", expiresAt: TICKET_EXPIRY, status: "live" });
    assert.equal(receipt.decision, "approved");
    assert.equal(receipt.ticketState, "issued");

    const row = await db.execute("SELECT ticket_id, nullifier, attestation_path, decision FROM applicants");
    assert.equal(row.rows[0]?.ticket_id, 7);
    assert.equal(row.rows[0]?.nullifier, NULLIFIER);
    assert.equal(row.rows[0]?.attestation_path, "router");
    assert.equal(row.rows[0]?.decision, "approved");
  });

  test("a rejection carries no ticket", async () => {
    const { db, applicantId } = await seed(2);

    const receipt = await recordApplicantDecision(db, deps({
      recordRouted: async () => ({
        txHash: TX,
        attestationHash: ATTESTATION,
        reasoningHash: `0x${"11".repeat(32)}`,
        ticketId: null,
      }),
    }), { ...decision(false), applicantId });

    assert.equal(receipt.decision, "rejected");
    assert.equal(receipt.ticket, null);
    assert.equal(receipt.ticketState, "none");

    const row = await db.execute("SELECT ticket_id FROM applicants");
    assert.equal(row.rows[0]?.ticket_id, null);
  });

  test("refuses to decide for a wallet that never passed the Door", async () => {
    const { db, applicantId } = await seed(2);
    await db.execute("DELETE FROM proofs");

    await assert.rejects(
      recordApplicantDecision(db, deps(), { ...decision(true), applicantId }),
      /door/i,
    );
  });

  test("a ticket lost after the chain call is recoverable, not a failed decision", async () => {
    const { db, applicantId } = await seed(2);

    // The transaction landed; reading the minted id back is what failed.
    const receipt = await recordApplicantDecision(db, deps({
      recordRouted: async () => ({
        txHash: TX,
        attestationHash: ATTESTATION,
        reasoningHash: `0x${"11".repeat(32)}`,
        ticketId: null,
      }),
    }), { ...decision(true), applicantId });

    assert.equal(receipt.decision, "approved", "the decision stands: it is already on chain");
    assert.equal(receipt.ticketState, "pending-retry");
    assert.equal(receipt.ticket, null);

    const row = await db.execute("SELECT decision, decision_tx, ticket_id FROM applicants");
    assert.equal(row.rows[0]?.decision, "approved");
    assert.equal(row.rows[0]?.decision_tx, TX);
    assert.equal(row.rows[0]?.ticket_id, null);
  });
});

describe("retrying a lost ticket", () => {
  test("reads the ticket back from the chain and persists it", async () => {
    const { db, applicantId } = await seed(2);
    await db.execute({
      sql: "UPDATE applicants SET decision = 'approved', decision_tx = ? WHERE id = ?",
      args: [TX, applicantId],
    });

    const result = await retryTicket(db, deps({ readTicketId: async () => 9n }), "mei-chan", ALICE);
    assert.deepEqual(result.ticket, { id: "9", expiresAt: TICKET_EXPIRY, status: "live" });

    const row = await db.execute("SELECT ticket_id FROM applicants");
    assert.equal(row.rows[0]?.ticket_id, 9);
  });

  test("says so when the chain still has no ticket for that wallet", async () => {
    const { db, applicantId } = await seed(2);
    await db.execute({
      sql: "UPDATE applicants SET decision = 'approved' WHERE id = ?",
      args: [applicantId],
    });

    const result = await retryTicket(db, deps({ readTicketId: async () => null }), "mei-chan", ALICE);
    assert.equal(result.ticket, null);
    assert.equal(result.ticketState, "pending-retry");
  });

  test("refuses to invent a ticket for a rejected applicant", async () => {
    const { db, applicantId } = await seed(2);
    await db.execute({
      sql: "UPDATE applicants SET decision = 'rejected' WHERE id = ?",
      args: [applicantId],
    });

    await assert.rejects(retryTicket(db, deps(), "mei-chan", ALICE), /not approved/i);
  });
});

describe("V1 campaigns are untouched", () => {
  test("a V1 decision takes the old path and reports no ticket", async () => {
    const { db, applicantId } = await seed(1);
    const seen: unknown[] = [];

    const receipt = await recordApplicantDecision(db, deps({
      recordRouted: async (args) => {
        seen.push(args);
        return { txHash: TX, attestationHash: ATTESTATION, reasoningHash: `0x${"11".repeat(32)}`, ticketId: null };
      },
    }), { ...decision(true), applicantId });

    assert.equal((seen[0] as { contractVersion: number }).contractVersion, 1);
    assert.equal(receipt.ticket, null);
    assert.equal(receipt.ticketState, "none", "a V1 campaign has no ticket to be missing");
    assert.equal(receipt.decision, "approved");
  });

  test("a V1 campaign decides even with no proof row, because it has no Door", async () => {
    const { db, applicantId } = await seed(1);
    await db.execute("DELETE FROM proofs");

    const receipt = await recordApplicantDecision(db, deps(), { ...decision(true), applicantId });
    assert.equal(receipt.decision, "approved");
  });
});
