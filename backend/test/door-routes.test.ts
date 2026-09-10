import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { applyMigrations } from "../src/db/index.js";
import { createDoorGuard, createDoorRoutes } from "../src/door/routes.js";
import type { VerifyOutcome } from "../src/door/world-verify.js";

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
const NOW = 1_757_000_000;

const IDKIT = {
  proof: "0xproof",
  merkle_root: "0xroot",
  nullifier_hash: "0xnullifier",
  verification_level: "orb",
};

type Options = {
  outcome?: VerifyOutcome;
  requiredCredential?: string;
  closeAt?: number | null;
  wlSizeCap?: number;
  now?: number;
};

async function setup(options: Options = {}) {
  dir = await mkdtemp(join(tmpdir(), "hanami-door-routes-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);

  await client.execute({
    sql:
      "INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, owner_address, created_at, required_credential, close_at, contract_version) " +
      "VALUES ('mei-chan', 'Mei', 1, '0x1', '0x2', '0g', ?, 'ipfs://p', '0x3', ?, ?, ?, 2)",
    args: [options.wlSizeCap ?? 100, NOW, options.requiredCredential ?? "orb", options.closeAt ?? null],
  });

  const verified: VerifyOutcome = { status: "verified", nullifier: "0xnullifier", method: "orb" };
  const seen: unknown[] = [];
  const app = new Hono();
  app.route(
    "/api/campaigns",
    createDoorRoutes({
      db: client,
      now: () => options.now ?? NOW,
      verifyProof: async (request) => {
        seen.push(request);
        return options.outcome ?? verified;
      },
    }),
  );

  return { app, db: client, seen };
}

async function verify(app: Hono, wallet: string, idkitResult: unknown = IDKIT) {
  return app.request("/api/campaigns/mei-chan/door/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet, idkitResult }),
  });
}

describe("POST /door/verify", () => {
  test("verifies a proof and binds it to the wallet", async () => {
    const { app, db, seen } = await setup();

    const response = await verify(app, ALICE);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      state: "verified",
      requiredCredential: "orb",
      method: "orb",
    });

    assert.equal((seen[0] as { signal: string }).signal, ALICE, "the wallet is the signal");
    const rows = await db.execute("SELECT wallet_address, nullifier FROM proofs");
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0]?.wallet_address, ALICE);
  });

  test("refuses a second wallet for the same person with 409", async () => {
    const { app } = await setup();
    await verify(app, ALICE);

    const response = await verify(app, BOB);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).state, "used");
  });

  test("refuses everyone once the campaign has closed with 410", async () => {
    const { app } = await setup({ closeAt: NOW - 1 });

    const response = await verify(app, ALICE);
    assert.equal(response.status, 410);
    assert.equal((await response.json()).state, "closed");
  });

  test("refuses a proof World rejected with 422", async () => {
    const { app, db } = await setup({ outcome: { status: "rejected" } });

    const response = await verify(app, ALICE);
    assert.equal(response.status, 422);
    const rows = await db.execute("SELECT COUNT(*) AS n FROM proofs");
    assert.equal(rows.rows[0]?.n, 0, "a rejected proof spends nobody's attempt");
  });

  test("refuses a credential weaker than the campaign requires with 412", async () => {
    const { app } = await setup({
      requiredCredential: "orb",
      outcome: { status: "verified", nullifier: "0xn", method: "device" },
    });

    const response = await verify(app, ALICE);
    assert.equal(response.status, 412);
  });

  test("accepts a stronger credential than required", async () => {
    const { app } = await setup({
      requiredCredential: "device",
      outcome: { status: "verified", nullifier: "0xn", method: "orb" },
    });

    assert.equal((await verify(app, ALICE)).status, 200);
  });

  test("reports an unreachable verifier as unavailable, not as a refusal", async () => {
    const { app } = await setup({ outcome: { status: "unavailable" } });

    const response = await verify(app, ALICE);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).state, "unavailable");
  });

  test("refuses a full campaign before spending the applicant's one attempt", async () => {
    const { app, db } = await setup({ wlSizeCap: 1 });
    await db.execute(
      "INSERT INTO applicants (campaign_slug, wallet_address, started_at, decision) VALUES ('mei-chan', '0xcc', 1757000000, 'approved')",
    );

    const response = await verify(app, ALICE);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state, "full");
    const rows = await db.execute("SELECT COUNT(*) AS n FROM proofs");
    assert.equal(rows.rows[0]?.n, 0);
  });

  test("rejects a malformed body with 400", async () => {
    const { app } = await setup();
    const response = await verify(app, "not-a-wallet");
    assert.equal(response.status, 400);
  });

  test("is rate limited like the other public routes", async () => {
    const { app } = await setup();
    let calls = 0;
    const limited = new Hono();
    limited.use("*", async (c, next) => {
      calls += 1;
      if (calls > 1) return c.json({ error: "rate limited" }, 429);
      await next();
    });
    limited.route("/", app);

    assert.equal((await verify(limited, ALICE)).status, 200);
    assert.equal((await verify(limited, BOB)).status, 429);
  });
});

describe("GET /door/status", () => {
  test("reports none before a proof and verified after", async () => {
    const { app } = await setup();

    const before = await app.request(`/api/campaigns/mei-chan/door/status?wallet=${ALICE}`);
    assert.deepEqual(await before.json(), { state: "none", requiredCredential: "orb", method: null });

    await verify(app, ALICE);
    const after = await app.request(`/api/campaigns/mei-chan/door/status?wallet=${ALICE}`);
    assert.deepEqual(await after.json(), { state: "verified", requiredCredential: "orb", method: "orb" });
  });

  test("reports closed after the campaign close, whatever the wallet holds", async () => {
    const { app } = await setup({ closeAt: NOW + 10 });
    await verify(app, ALICE);

    const { app: closed } = await setup({ closeAt: NOW - 1 });
    const response = await closed.request(`/api/campaigns/mei-chan/door/status?wallet=${ALICE}`);
    assert.equal((await response.json()).state, "closed");
  });
});

describe("the Door guard on /begin and /turns", () => {
  async function guarded(options: Options = {}) {
    const { app, db } = await setup(options);
    const guard = createDoorGuard({ db, now: () => options.now ?? NOW });
    const inner = new Hono();
    inner.use("/api/campaigns/:slug/begin", guard);
    inner.use("/api/campaigns/:slug/turns", guard);
    inner.post("/api/campaigns/:slug/begin", (c) => c.json({ reply: "hello" }));
    inner.post("/api/campaigns/:slug/turns", (c) => c.json({ reply: "go on" }));
    return { app, inner, db };
  }

  const call = (inner: Hono, path: string, wallet: string) =>
    inner.request(`/api/campaigns/mei-chan/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walletAddress: wallet, message: "hi" }),
    });

  test("refuses an interview without a proof with 403", async () => {
    const { inner } = await guarded();

    for (const path of ["begin", "turns"]) {
      const response = await call(inner, path, ALICE);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error, "door required");
    }
  });

  test("lets a verified wallet through", async () => {
    const { app, inner } = await guarded();
    await verify(app, ALICE);

    for (const path of ["begin", "turns"]) {
      assert.equal((await call(inner, path, ALICE)).status, 200);
    }
  });

  test("refuses a verified wallet once the campaign has closed with 410", async () => {
    const { app, db } = await guarded({ closeAt: NOW + 10 });
    await verify(app, ALICE);

    const guard = createDoorGuard({ db, now: () => NOW + 20 });
    const inner = new Hono();
    inner.use("/api/campaigns/:slug/begin", guard);
    inner.post("/api/campaigns/:slug/begin", (c) => c.json({ reply: "hello" }));

    const response = await call(inner, "begin", ALICE);
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error, "campaign closed");
  });

  test("a proof for one campaign does not open another campaign's door", async () => {
    const { app, inner, db } = await guarded();
    await verify(app, ALICE);
    await db.execute(
      "INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, owner_address, created_at) " +
        "VALUES ('other', 'Other', 2, '0x1', '0x2', '0g', 100, 'ipfs://p', '0x3', 1757000000)",
    );

    const response = await inner.request("/api/campaigns/other/begin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walletAddress: ALICE }),
    });
    assert.equal(response.status, 403);
  });
});
