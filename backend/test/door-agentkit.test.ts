import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { applyMigrations } from "../src/db/index.js";
import { createAgentDoor, type AgentDoorDeps } from "../src/door/agentkit.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

const HUMAN_WALLET = "0x00000000000000000000000000000000000000aa";
const OTHER_WALLET = "0x00000000000000000000000000000000000000bb";
const AGENT = "0x00000000000000000000000000000000000000a9";
const HUMAN_ID = "human-42";
const NOW = 1_757_000_000;
const HEADER = "signed-agentkit-header";

type Options = {
  lookupHuman?: (address: string) => Promise<string | null>;
  verifyHeader?: AgentDoorDeps["verifyHeader"];
};

async function setup(options: Options = {}) {
  dir = await mkdtemp(join(tmpdir(), "hanami-agentkit-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);
  await client.execute({
    sql:
      "INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, owner_address, created_at, contract_version) " +
      "VALUES ('mei-chan', 'Mei', 1, '0x1', '0x2', '0g', 100, 'ipfs://p', '0x3', ?, 2)",
    args: [NOW],
  });

  const looked: string[] = [];
  const app = new Hono();
  app.use(
    "/api/campaigns/:slug/begin",
    createAgentDoor({
      db: client,
      now: () => NOW,
      resourceUri: "https://hanami.example",
      verifyHeader: options.verifyHeader ?? (async () => ({ address: AGENT })),
      lookupHuman:
        options.lookupHuman ??
        (async (address) => {
          looked.push(address);
          return HUMAN_ID;
        }),
    }),
  );
  app.post("/api/campaigns/:slug/begin", (c) => c.json({ reply: "hello" }));

  return { app, db: client, looked };
}

async function begin(app: Hono, headers: Record<string, string> = {}, wallet = HUMAN_WALLET) {
  return app.request("/api/campaigns/mei-chan/begin", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ walletAddress: wallet }),
  });
}

async function proofRow(db: Client) {
  const res = await db.execute("SELECT wallet_address, nullifier, method, agent_id FROM proofs");
  return res.rows[0];
}

describe("the agent Door", () => {
  test("a request with no agent header is left alone for the browser Door to judge", async () => {
    const { app, db } = await setup();

    const response = await begin(app);

    assert.equal(response.status, 200, "the middleware does not stand in front of a browser");
    assert.equal((await db.execute("SELECT COUNT(*) AS n FROM proofs")).rows[0]?.n, 0);
  });

  test("an agent that has not signed yet is challenged with 402, never a payment", async () => {
    const { app } = await setup();

    const response = await begin(app, { "x-hanami-client": "agent" });

    assert.equal(response.status, 402);
    const body = await response.json();
    assert.ok(body.accepts ?? body.extensions ?? body.agentkit, "the challenge names the agentkit extension");
    const text = JSON.stringify(body);
    assert.match(text, /agentkit/i);
    assert.doesNotMatch(text, /price|usdc|amount.{0,4}[1-9]/i, "this is proof of humanity, not a payment");
  });

  test("a registered agent passes and its human is recorded as the nullifier", async () => {
    const { app, db, looked } = await setup();

    const response = await begin(app, { agentkit: HEADER });

    assert.equal(response.status, 200);
    assert.deepEqual(looked, [AGENT]);
    const proof = await proofRow(db);
    assert.equal(proof?.wallet_address, HUMAN_WALLET);
    assert.equal(proof?.nullifier, HUMAN_ID, "the anonymous human, not the agent, is the identifier");
    assert.equal(proof?.method, "agentkit");
    assert.equal(proof?.agent_id, AGENT);
  });

  test("an unregistered agent is refused with 403 and told how to register", async () => {
    const { app, db } = await setup({ lookupHuman: async () => null });

    const response = await begin(app, { agentkit: HEADER });

    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /register/i);
    assert.equal((await db.execute("SELECT COUNT(*) AS n FROM proofs")).rows[0]?.n, 0);
  });

  test("an unreachable AgentBook is 503 and retryable, never 'unregistered'", async () => {
    const { app } = await setup({
      lookupHuman: async () => { throw new Error("world chain rpc timed out"); },
    });

    const response = await begin(app, { agentkit: HEADER });

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.retryable, true);
    assert.doesNotMatch(body.error, /register|unregistered/i, "a lookup we could not make is not a refusal");
  });

  test("a header that does not verify is refused and never reaches AgentBook", async () => {
    const { app, looked } = await setup({
      verifyHeader: async () => ({ error: "signature did not verify" }),
    });

    const response = await begin(app, { agentkit: HEADER });

    assert.equal(response.status, 403);
    assert.deepEqual(looked, []);
  });

  test("the same human applying from a second wallet is refused with 409", async () => {
    const { app } = await setup();
    assert.equal((await begin(app, { agentkit: HEADER })).status, 200);

    const response = await begin(app, { agentkit: HEADER }, OTHER_WALLET);

    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /already applied/i);
  });

  test("a wallet already through the Door is not looked up a second time", async () => {
    const { app, looked } = await setup();
    await begin(app, { agentkit: HEADER });

    const response = await begin(app, { agentkit: HEADER });

    assert.equal(response.status, 200);
    assert.equal(looked.length, 1, "the proof is already recorded; AgentBook is not asked again");
  });

  test("a request for a campaign that does not exist is not recorded", async () => {
    const { app, db } = await setup();

    const response = await app.request("/api/campaigns/nope/begin", {
      method: "POST",
      headers: { "content-type": "application/json", agentkit: HEADER },
      body: JSON.stringify({ walletAddress: HUMAN_WALLET }),
    });

    assert.equal(response.status, 404);
    assert.equal((await db.execute("SELECT COUNT(*) AS n FROM proofs")).rows[0]?.n, 0);
  });

  test("a malformed body is refused before anything is verified", async () => {
    const { app, looked } = await setup();

    const response = await app.request("/api/campaigns/mei-chan/begin", {
      method: "POST",
      headers: { "content-type": "application/json", agentkit: HEADER },
      body: JSON.stringify({ walletAddress: "not-a-wallet" }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(looked, []);
  });

  test("the agent's own wallet is never recorded as the applicant", async () => {
    const { app, db } = await setup();

    await begin(app, { agentkit: HEADER });

    const proof = await proofRow(db);
    assert.notEqual(proof?.wallet_address, AGENT, "the ticket belongs to the human, not the agent");
  });
});
