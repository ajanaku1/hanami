import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyMigrations } from "../src/db/index.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

/// A database as it stands in production before feature 002: campaigns and applicants exist with
/// Wave 3 columns and rows in them, so the migration has to be additive over live data.
async function wave3Database(): Promise<Client> {
  dir = await mkdtemp(join(tmpdir(), "hanami-door-schema-test-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.executeMultiple(`
    CREATE TABLE campaigns (
      slug TEXT PRIMARY KEY,
      owner_address TEXT NOT NULL,
      visibility TEXT NOT NULL
    );
    INSERT INTO campaigns (slug, owner_address, visibility)
      VALUES ('mei-chan', '0x0000000000000000000000000000000000000001', 'public');
    CREATE TABLE applicants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_slug TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      decision TEXT,
      decision_tx TEXT,
      reasoning_uri TEXT,
      transcript_uri TEXT,
      attestation_hash TEXT,
      attestation_json TEXT,
      UNIQUE(campaign_slug, wallet_address)
    );
    INSERT INTO applicants (campaign_slug, wallet_address, started_at)
      VALUES ('mei-chan', '0x00000000000000000000000000000000000000aa', 1757000000);
  `);
  return client;
}

async function columnsOf(db: Client, table: string): Promise<string[]> {
  const res = await db.execute(`PRAGMA table_info(${table})`);
  return res.rows.map((row) => String(row.name));
}

describe("door and ticket schema migration", () => {
  test("adds the campaign columns the Door and tickets need, with V1 defaults", async () => {
    const db = await wave3Database();
    await applyMigrations(db);

    const columns = await columnsOf(db, "campaigns");
    for (const name of ["required_credential", "close_at", "ticket_expiry", "contract_version"]) {
      assert.ok(columns.includes(name), `campaigns is missing ${name}`);
    }

    const row = await db.execute(
      "SELECT required_credential, close_at, ticket_expiry, contract_version FROM campaigns WHERE slug = 'mei-chan'",
    );
    assert.deepEqual(row.rows[0]?.required_credential, "orb");
    assert.equal(row.rows[0]?.close_at, null);
    assert.equal(row.rows[0]?.ticket_expiry, null);
    assert.equal(row.rows[0]?.contract_version, 1, "existing campaigns stay on the V1 contract path");
  });

  test("adds the applicant columns for proof, brief, ticket, and attestation path", async () => {
    const db = await wave3Database();
    await applyMigrations(db);

    const columns = await columnsOf(db, "applicants");
    for (const name of [
      "nullifier",
      "proof_method",
      "agent_id",
      "brief_json",
      "brief_status",
      "ticket_id",
      "attestation_path",
    ]) {
      assert.ok(columns.includes(name), `applicants is missing ${name}`);
    }

    const existing = await db.execute("SELECT wallet_address, nullifier, ticket_id FROM applicants");
    assert.equal(existing.rows.length, 1, "the pre-existing applicant row survives the migration");
    assert.equal(existing.rows[0]?.nullifier, null);
    assert.equal(existing.rows[0]?.ticket_id, null);
  });

  test("creates proofs with one row per human and one row per wallet, per campaign", async () => {
    const db = await wave3Database();
    await applyMigrations(db);

    const columns = await columnsOf(db, "proofs");
    assert.deepEqual(columns.sort(), [
      "agent_id",
      "campaign_slug",
      "id",
      "method",
      "nullifier",
      "verified_at",
      "wallet_address",
    ]);

    const insert = `INSERT INTO proofs (campaign_slug, wallet_address, nullifier, method, agent_id, verified_at)
                    VALUES (?, ?, ?, ?, NULL, 1757000000)`;
    await db.execute({
      sql: insert,
      args: ["mei-chan", "0x00000000000000000000000000000000000000aa", "0xnull-1", "orb"],
    });

    // One human, one attempt: the same nullifier from a second wallet is refused.
    await assert.rejects(
      db.execute({
        sql: insert,
        args: ["mei-chan", "0x00000000000000000000000000000000000000bb", "0xnull-1", "orb"],
      }),
      /UNIQUE/i,
    );

    // One proof per wallet: a second nullifier on the same wallet is refused too.
    await assert.rejects(
      db.execute({
        sql: insert,
        args: ["mei-chan", "0x00000000000000000000000000000000000000aa", "0xnull-2", "orb"],
      }),
      /UNIQUE/i,
    );

    // Both constraints are scoped to the campaign, so the same human may apply elsewhere.
    await db.execute({
      sql: "INSERT INTO campaigns (slug, owner_address, visibility) VALUES ('other', '0x01', 'public')",
    });
    await db.execute({
      sql: insert,
      args: ["other", "0x00000000000000000000000000000000000000aa", "0xnull-1", "orb"],
    });

    const count = await db.execute("SELECT COUNT(*) AS n FROM proofs");
    assert.equal(count.rows[0]?.n, 2);
  });

  test("is idempotent across restarts", async () => {
    const db = await wave3Database();
    await applyMigrations(db);
    await applyMigrations(db);

    const columns = await columnsOf(db, "campaigns");
    assert.equal(columns.filter((name) => name === "contract_version").length, 1);
  });
});
