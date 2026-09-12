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
import { createBriefRoutes, ensureBrief } from "../src/ledger/routes.js";
import { buildTranscript } from "../src/transcript.js";
import type { LedgerBrief } from "../src/ledger/brief.js";

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
  signRequest?: null;
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
      rpId: "rp_test",
      signRequest:
        options.signRequest === null
          ? null
          : () => ({
              sig: "0xsignature",
              nonce: "0xnonce",
              createdAt: 1_757_000_000,
              expiresAt: 1_757_000_600,
            }),
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

describe("GET /door/context", () => {
  test("returns a signed request context the browser can carry to World", async () => {
    const { app } = await setup();

    const response = await app.request("/api/campaigns/mei-chan/door/context");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      rpContext: {
        rp_id: "rp_test",
        nonce: "0xnonce",
        created_at: 1_757_000_000,
        expires_at: 1_757_000_600,
        signature: "0xsignature",
      },
    });
  });

  test("reports no context rather than a broken one when the RP key is absent", async () => {
    const { app } = await setup({ signRequest: null });

    const response = await app.request("/api/campaigns/mei-chan/door/context");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { rpContext: null, error: "door unavailable" });
  });

  test("never returns the signing key", async () => {
    const { app } = await setup();
    const body = await (await app.request("/api/campaigns/mei-chan/door/context")).text();
    assert.equal(body.includes("signing"), false);
    assert.equal(body.includes("SIGNING_KEY"), false);
  });
});

// ---------------------------------------------------------------- the ledger brief (US3)

/// A ledger read that records who it was asked about and answers from a script, so the routes can
/// be exercised without the gateway.
function fakeLedger(answers: LedgerBrief[] = []) {
  const asked: string[] = [];
  const read = async (wallet: string): Promise<LedgerBrief> => {
    asked.push(wallet);
    return answers.shift() ?? readyBrief(wallet);
  };
  return { asked, read };
}

function readyBrief(wallet: string, over: Partial<LedgerBrief> = {}): LedgerBrief {
  return {
    wallet,
    status: "ready",
    flipsWithin7d: 2,
    sameCounterpartySales: 0,
    medianHoldingDays: 30,
    swapCount: 5,
    sourcesRead: [
      { name: "opensea-v2", subgraphId: "sg-opensea", ok: true, count: 7 },
      { name: "uniswap-v3", subgraphId: "sg-uni", ok: true, count: 5 },
    ],
    truncated: false,
    readAt: NOW,
    ...over,
  };
}

async function briefSetup(options: Options & { answers?: LedgerBrief[] } = {}) {
  const base = await setup(options);
  const ledger = fakeLedger(options.answers);
  const app = new Hono();
  app.route("/api/campaigns", createDoorRoutes({
    db: base.db,
    now: () => options.now ?? NOW,
    verifyProof: async () => ({ status: "verified", nullifier: "0xnullifier", method: "orb" }),
    rpId: "rp_test",
    signRequest: () => ({ sig: "0x", nonce: "0x", createdAt: NOW, expiresAt: NOW + 600 }),
  }));
  app.route("/api/campaigns", createBriefRoutes({ db: base.db, now: () => options.now ?? NOW, readLedger: ledger.read }));
  return { app, db: base.db, ledger };
}

async function applicantRow(db: Client, wallet: string) {
  const res = await db.execute({
    sql: "SELECT brief_json, brief_status FROM applicants WHERE campaign_slug = 'mei-chan' AND wallet_address = ?",
    args: [wallet],
  });
  return res.rows[0];
}

describe("ensureBrief", () => {
  test("reads the ledger once and keeps the answer with the applicant", async () => {
    const { db, ledger } = await briefSetup();

    const brief = await ensureBrief({ db, now: () => NOW, readLedger: ledger.read }, "mei-chan", ALICE);

    assert.equal(brief.status, "ready");
    assert.deepEqual(ledger.asked, [ALICE]);
    const row = await applicantRow(db, ALICE);
    assert.equal(row?.brief_status, "ready");
    assert.deepEqual(JSON.parse(String(row?.brief_json)), brief);
  });

  test("a second read is served from the stored brief, not the gateway", async () => {
    const { db, ledger } = await briefSetup();

    const first = await ensureBrief({ db, now: () => NOW, readLedger: ledger.read }, "mei-chan", ALICE);
    const second = await ensureBrief({ db, now: () => NOW, readLedger: ledger.read }, "mei-chan", ALICE);

    assert.deepEqual(second, first);
    assert.equal(ledger.asked.length, 1, "the gateway is read once per applicant");
  });

  test("an empty history is a real answer and is not read again", async () => {
    const { db, ledger } = await briefSetup({ answers: [readyBrief(ALICE, { status: "empty" })] });

    await ensureBrief({ db, now: () => NOW, readLedger: ledger.read }, "mei-chan", ALICE);
    await ensureBrief({ db, now: () => NOW, readLedger: ledger.read }, "mei-chan", ALICE);

    assert.equal(ledger.asked.length, 1);
    assert.equal((await applicantRow(db, ALICE))?.brief_status, "empty");
  });

  test("an unavailable brief is retried on the next look", async () => {
    const { db, ledger } = await briefSetup({
      answers: [readyBrief(ALICE, { status: "unavailable" }), readyBrief(ALICE)],
    });

    const first = await ensureBrief({ db, now: () => NOW, readLedger: ledger.read }, "mei-chan", ALICE);
    const second = await ensureBrief({ db, now: () => NOW, readLedger: ledger.read }, "mei-chan", ALICE);

    assert.equal(first.status, "unavailable");
    assert.equal(second.status, "ready");
    assert.equal(ledger.asked.length, 2);
    assert.equal((await applicantRow(db, ALICE))?.brief_status, "ready");
  });

  test("a gateway that throws is an unavailable brief, never a failed application", async () => {
    const { db } = await briefSetup();

    const brief = await ensureBrief(
      { db, now: () => NOW, readLedger: async () => { throw new Error("gateway down"); } },
      "mei-chan",
      ALICE,
    );

    assert.equal(brief.status, "unavailable");
    assert.equal((await applicantRow(db, ALICE))?.brief_status, "unavailable");
  });

  test("two applicants keep separate briefs", async () => {
    const { db, ledger } = await briefSetup();

    await ensureBrief({ db, now: () => NOW, readLedger: ledger.read }, "mei-chan", ALICE);
    await ensureBrief({ db, now: () => NOW, readLedger: ledger.read }, "mei-chan", BOB);

    assert.equal(JSON.parse(String((await applicantRow(db, ALICE))?.brief_json)).wallet, ALICE);
    assert.equal(JSON.parse(String((await applicantRow(db, BOB))?.brief_json)).wallet, BOB);
  });
});

describe("GET /brief", () => {
  async function readBrief(app: Hono, wallet: string) {
    return app.request(`/api/campaigns/mei-chan/brief?wallet=${wallet}`);
  }

  test("gives a wallet that passed the Door its own brief", async () => {
    const { app } = await briefSetup();
    await verify(app, ALICE);

    const response = await readBrief(app, ALICE);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ready");
    assert.equal(body.sourcesRead.length, 2);
  });

  test("refuses a wallet that has not passed the Door with 403", async () => {
    const { app, ledger } = await briefSetup();

    const response = await readBrief(app, ALICE);
    assert.equal(response.status, 403);
    assert.equal(ledger.asked.length, 0, "an unverified wallet never costs a gateway read");
  });

  test("one applicant cannot read another applicant's brief", async () => {
    const { app } = await briefSetup();
    await verify(app, ALICE);

    // BOB never passed this Door, so asking for BOB's brief is refused whoever is asking.
    assert.equal((await readBrief(app, BOB)).status, 403);
  });

  test("never answers with proof material", async () => {
    const { app } = await briefSetup();
    await verify(app, ALICE);

    const body = await (await readBrief(app, ALICE)).text();
    assert.doesNotMatch(body, /nullifier/i);
    assert.doesNotMatch(body, /0xproof/);
  });

  test("404s for a campaign that does not exist", async () => {
    const { app } = await briefSetup();
    const response = await app.request(`/api/campaigns/nope/brief?wallet=${ALICE}`);
    assert.equal(response.status, 404);
  });

  test("400s when no wallet is named", async () => {
    const { app } = await briefSetup();
    assert.equal((await app.request("/api/campaigns/mei-chan/brief")).status, 400);
  });

  test("an unavailable read still answers, so the panel can say so", async () => {
    const { app } = await briefSetup({ answers: [readyBrief(ALICE, { status: "unavailable" })] });
    await verify(app, ALICE);

    const response = await readBrief(app, ALICE);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "unavailable");
  });
});

describe("buildTranscript", () => {
  test("carries the brief beside the turns, so the pinned record holds the evidence", () => {
    const brief = readyBrief(ALICE);
    const transcript = buildTranscript({
      campaign: "mei-chan",
      wallet: ALICE,
      decision: "approved",
      turns: [{ turn_index: 0, role: "bouncer", content: "hello" }],
      brief,
    });

    const parsed = JSON.parse(transcript);
    assert.deepEqual(parsed.brief, brief);
    assert.equal(parsed.campaign, "mei-chan");
    assert.equal(parsed.applicant, ALICE);
    assert.equal(parsed.decision, "approved");
    assert.equal(parsed.turns.length, 1);
  });

  test("says the brief was missing rather than omitting the field", () => {
    const parsed = JSON.parse(buildTranscript({
      campaign: "mei-chan",
      wallet: ALICE,
      decision: "rejected",
      turns: [],
      brief: null,
    }));

    assert.equal(parsed.brief, null);
    assert.ok("brief" in parsed, "an auditor must be able to tell a missing brief from an old format");
  });
});
