import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { privateKeyToAccount } from "viem/accounts";
import { applyMigrations } from "../src/db/index.js";
import { buildRoster, createRosterRoutes, type ChainTicket } from "../src/tickets/roster.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

const owner = privateKeyToAccount(`0x${"1".repeat(64)}`);
const stranger = privateKeyToAccount(`0x${"2".repeat(64)}`);
const ALICE = "0x00000000000000000000000000000000000000aa";
const BOB = "0x00000000000000000000000000000000000000bb";
const CAROL = "0x00000000000000000000000000000000000000cc";
const CAMPAIGN = "0x00000000000000000000000000000000000000c2";
const NOW = 1_757_000_000;

async function seed() {
  dir = await mkdtemp(join(tmpdir(), "hanami-roster-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);
  await client.execute({
    sql:
      "INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, owner_address, created_at, contract_version) " +
      "VALUES ('mei-chan', 'Mei', 1, '0x1', ?, '0g', 100, 'ipfs://p', ?, 1757000000, 2)",
    args: [CAMPAIGN, owner.address.toLowerCase()],
  });

  const rows: [string, string, number | null, string | null, string | null][] = [
    ["approved", ALICE, 7, JSON.stringify({ status: "ready", flipsWithin7d: 2 }), null],
    ["approved", BOB, 8, JSON.stringify({ status: "empty" }), "0x00000000000000000000000000000000000000a9"],
    ["rejected", CAROL, null, JSON.stringify({ status: "ready" }), null],
  ];
  for (const [decision, wallet, ticketId, brief, agentId] of rows) {
    await client.execute({
      sql:
        "INSERT INTO applicants (campaign_slug, wallet_address, started_at, finished_at, decision, ticket_id, brief_json, agent_id) " +
        "VALUES ('mei-chan', ?, 1757000000, 1757000100, ?, ?, ?, ?)",
      args: [wallet, decision, ticketId, brief, agentId],
    });
  }
  return client;
}

const CHAIN: Record<string, ChainTicket> = {
  "7": { live: true, revoked: false, expiresAt: 1_759_000_000 },
  "8": { live: false, revoked: true, expiresAt: 1_759_000_000 },
};

const readTickets = async (ids: string[]): Promise<Record<string, ChainTicket>> =>
  Object.fromEntries(ids.map((id) => [id, CHAIN[id] ?? { live: false, revoked: false, expiresAt: 0 }]));

describe("buildRoster", () => {
  test("lists only ticket holders, with status read from the chain", async () => {
    const db = await seed();
    const rows = await buildRoster(db, { readTickets, now: () => NOW }, "mei-chan");

    assert.deepEqual(rows.map((r) => r.wallet), [ALICE, BOB]);
    assert.equal(rows[0]?.status, "live");
    assert.equal(rows[1]?.status, "revoked", "the chain says revoked, so the roster does");
  });

  test("marks an expired ticket from the chain's expiry, not from the database", async () => {
    const db = await seed();
    const rows = await buildRoster(
      db,
      {
        readTickets: async () => ({
          "7": { live: false, revoked: false, expiresAt: NOW - 1 },
          "8": { live: false, revoked: true, expiresAt: NOW + 1 },
        }),
        now: () => NOW,
      },
      "mei-chan",
    );

    assert.equal(rows[0]?.status, "expired");
    assert.equal(rows[1]?.status, "revoked", "revocation outranks expiry");
  });

  test("marks the applications that came through an agent", async () => {
    const db = await seed();
    const rows = await buildRoster(db, { readTickets, now: () => NOW }, "mei-chan");

    assert.equal(rows[0]?.viaAgent, null);
    assert.equal(rows[1]?.viaAgent, "0x00000000000000000000000000000000000000a9");
  });

  test("summarises the brief without republishing it", async () => {
    const db = await seed();
    const rows = await buildRoster(db, { readTickets, now: () => NOW }, "mei-chan");

    assert.match(String(rows[0]?.briefSummary), /ready/i);
    assert.match(String(rows[1]?.briefSummary), /no on-chain record|empty/i);
    assert.equal(JSON.stringify(rows).includes("flipsWithin7d"), false, "the roster is a summary");
  });
});

describe("roster routes", () => {
  async function app() {
    const db = await seed();
    const revokes: unknown[] = [];
    const server = new Hono();
    server.route(
      "/api/campaigns",
      createRosterRoutes({
        db,
        readTickets,
        now: () => NOW,
        prepareRevoke: (campaign, ticketId) => {
          revokes.push({ campaign, ticketId });
          return { to: campaign, data: "0xdeadbeef", chainId: 16661 };
        },
      }),
    );
    return { server, db, revokes };
  }

  async function auth(account: typeof owner, action: string, nonce = Date.now()) {
    const message = `Hanami: ${action} at ${nonce}`;
    return { caller: account.address, nonce, signature: await account.signMessage({ message }) };
  }

  test("gives the owner the roster", async () => {
    const { server } = await app();
    const { caller, nonce, signature } = await auth(owner, "roster mei-chan");

    const response = await server.request(
      `/api/campaigns/mei-chan/roster?caller=${caller}&nonce=${nonce}&signature=${signature}`,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { wallet: string }[];
    assert.equal(body.length, 2);
  });

  test("refuses anyone who is not the owner", async () => {
    const { server } = await app();
    const { caller, nonce, signature } = await auth(stranger, "roster mei-chan");

    const response = await server.request(
      `/api/campaigns/mei-chan/roster?caller=${caller}&nonce=${nonce}&signature=${signature}`,
    );
    assert.equal(response.status, 403);
  });

  test("refuses an unsigned request", async () => {
    const { server } = await app();
    const response = await server.request("/api/campaigns/mei-chan/roster");
    assert.equal(response.status, 401);
  });

  test("prepares a revoke for the owner to sign, and never sends one itself", async () => {
    const { server, revokes } = await app();
    const { caller, nonce, signature } = await auth(owner, "revoke 7 on mei-chan");

    const response = await server.request("/api/campaigns/mei-chan/tickets/7/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caller, nonce, signature }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { to: CAMPAIGN, data: "0xdeadbeef", chainId: 16661 });
    assert.deepEqual(revokes, [{ campaign: CAMPAIGN, ticketId: 7n }]);
  });

  test("refuses to prepare a revoke for a non-owner", async () => {
    const { server, revokes } = await app();
    const { caller, nonce, signature } = await auth(stranger, "revoke 7 on mei-chan");

    const response = await server.request("/api/campaigns/mei-chan/tickets/7/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caller, nonce, signature }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(revokes, []);
  });

  test("refuses a stale nonce", async () => {
    const { server } = await app();
    const { caller, nonce, signature } = await auth(owner, "roster mei-chan", Date.now() - 20 * 60 * 1000);

    const response = await server.request(
      `/api/campaigns/mei-chan/roster?caller=${caller}&nonce=${nonce}&signature=${signature}`,
    );
    assert.equal(response.status, 400);
  });
});
