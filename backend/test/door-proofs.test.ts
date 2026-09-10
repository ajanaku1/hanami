import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyMigrations } from "../src/db/index.js";
import { proofFor, recordProof } from "../src/door/proofs.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

const ALICE = "0x00000000000000000000000000000000000000aa";
const BOB = "0x00000000000000000000000000000000000000bb";
const NULLIFIER = "0xnullifier-alice";

async function freshDb(): Promise<Client> {
  dir = await mkdtemp(join(tmpdir(), "hanami-proofs-test-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);
  await client.execute(
    "INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, owner_address, created_at) " +
      "VALUES ('mei-chan', 'Mei', 1, '0x1', '0x2', '0g', 100, 'ipfs://p', '0x3', 1757000000)",
  );
  return client;
}

const proof = (wallet: string, nullifier: string) => ({
  campaignSlug: "mei-chan",
  wallet,
  nullifier,
  method: "orb" as const,
  agentId: null,
  verifiedAt: 1_757_000_000,
});

describe("door proofs", () => {
  test("records a first proof and reads it back", async () => {
    const db = await freshDb();

    const result = await recordProof(db, proof(ALICE, NULLIFIER));
    assert.equal(result.state, "verified");
    assert.equal(result.proof.wallet, ALICE);
    assert.equal(result.proof.method, "orb");

    const stored = await proofFor(db, "mei-chan", ALICE);
    assert.equal(stored?.nullifier, NULLIFIER);
  });

  test("refuses the same person from a second wallet", async () => {
    const db = await freshDb();
    await recordProof(db, proof(ALICE, NULLIFIER));

    const second = await recordProof(db, proof(BOB, NULLIFIER));
    assert.equal(second.state, "used", "one person, one attempt, whatever wallet they hold");
    assert.equal(second.proof.wallet, ALICE, "the refusal names the proof that already exists");

    assert.equal(await proofFor(db, "mei-chan", BOB), null, "the second wallet gets no door");
    const rows = await db.execute("SELECT COUNT(*) AS n FROM proofs");
    assert.equal(rows.rows[0]?.n, 1);
  });

  test("re-verifying the same wallet is idempotent", async () => {
    const db = await freshDb();
    const first = await recordProof(db, proof(ALICE, NULLIFIER));
    const again = await recordProof(db, proof(ALICE, NULLIFIER));

    assert.equal(again.state, "verified");
    assert.equal(again.proof.id, first.proof.id, "no second row, no new attempt");

    const rows = await db.execute("SELECT COUNT(*) AS n FROM proofs");
    assert.equal(rows.rows[0]?.n, 1);
  });

  test("a wallet that is already through the Door keeps its original proof", async () => {
    const db = await freshDb();
    const first = await recordProof(db, proof(ALICE, NULLIFIER));

    const other = await recordProof(db, proof(ALICE, "0xnullifier-someone-else"));
    assert.equal(other.proof.id, first.proof.id);
    assert.equal(other.proof.nullifier, NULLIFIER, "a second person cannot re-key a wallet already inside");
  });

  test("concurrent verifications of one proof resolve to exactly one row", async () => {
    const db = await freshDb();

    const results = await Promise.all([
      recordProof(db, proof(ALICE, NULLIFIER)),
      recordProof(db, proof(BOB, NULLIFIER)),
      recordProof(db, proof(ALICE, NULLIFIER)),
    ]);

    const rows = await db.execute("SELECT COUNT(*) AS n FROM proofs");
    assert.equal(rows.rows[0]?.n, 1, "the database, not the application, picks the winner");

    // Alice raced herself and Bob; the row that exists is the only truth, and every caller is
    // told the same thing about it.
    const stored = await proofFor(db, "mei-chan", ALICE);
    assert.equal(stored?.nullifier, NULLIFIER);
    assert.equal(await proofFor(db, "mei-chan", BOB), null);
    for (const result of results) {
      assert.equal(result.proof.wallet, ALICE);
    }
    assert.deepEqual(
      results.map((r) => r.state).sort(),
      ["used", "verified", "verified"],
      "Bob is refused, Alice is let through however many times she asks",
    );
  });

  test("the same person may apply to a different campaign", async () => {
    const db = await freshDb();
    await db.execute(
      "INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, owner_address, created_at) " +
        "VALUES ('other', 'Other', 2, '0x1', '0x2', '0g', 100, 'ipfs://p', '0x3', 1757000000)",
    );
    await recordProof(db, proof(ALICE, NULLIFIER));

    const elsewhere = await recordProof(db, { ...proof(ALICE, NULLIFIER), campaignSlug: "other" });
    assert.equal(elsewhere.state, "verified", "the Door is per campaign");
  });

  test("an agent proof records its agent id", async () => {
    const db = await freshDb();
    const result = await recordProof(db, {
      ...proof(ALICE, "0xhuman-id"),
      method: "agentkit",
      agentId: "0x00000000000000000000000000000000000000a9",
    });

    assert.equal(result.state, "verified");
    assert.equal(result.proof.method, "agentkit");
    assert.equal(result.proof.agentId, "0x00000000000000000000000000000000000000a9");
  });
});
