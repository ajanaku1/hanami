import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { privateKeyToAccount } from "viem/accounts";
import { applyMigrations } from "../src/db/index.js";
import { createSettingsRoutes, resolveSettings } from "../src/tickets/settings.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

const NOW = 1_757_000_000;
const DAY = 86_400;
const OWNER_KEY = `0x${"22".repeat(32)}` as const;
const owner = privateKeyToAccount(OWNER_KEY);
const STRANGER_KEY = `0x${"33".repeat(32)}` as const;
const stranger = privateKeyToAccount(STRANGER_KEY);

async function setup() {
  dir = await mkdtemp(join(tmpdir(), "hanami-settings-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);
  await client.execute({
    sql:
      "INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, owner_address, created_at, contract_version) " +
      "VALUES ('mei-chan', 'Mei', 1, '0x1', '0x2', '0g', 100, 'ipfs://p', ?, ?, 2)",
    args: [owner.address.toLowerCase(), NOW],
  });

  const app = new Hono();
  app.route("/api/campaigns", createSettingsRoutes({ db: client, now: () => NOW }));
  return { app, db: client };
}

/// The same signed-message authorization the roster and revoke routes use.
async function auth(slug: string, account = owner) {
  const nonce = Date.now();
  return {
    caller: account.address,
    nonce,
    signature: await account.signMessage({ message: `Hanami: settings ${slug} at ${nonce}` }),
  };
}

async function post(app: Hono, body: Record<string, unknown>) {
  return app.request("/api/campaigns/mei-chan/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function campaignRow(db: Client) {
  const res = await db.execute("SELECT required_credential, close_at, ticket_expiry FROM campaigns WHERE slug = 'mei-chan'");
  return res.rows[0];
}

describe("resolveSettings", () => {
  test("an expiry that was not given is the campaign's own closing time", () => {
    const resolved = resolveSettings({ requiredCredential: "orb", closeAt: NOW + DAY }, NOW);

    assert.ok(resolved.ok);
    assert.equal(resolved.value.ticketExpiry, NOW + DAY);
  });

  test("an expiry that was given is kept", () => {
    const resolved = resolveSettings({ requiredCredential: "orb", closeAt: NOW + DAY, ticketExpiry: NOW + 30 * DAY }, NOW);

    assert.ok(resolved.ok);
    assert.equal(resolved.value.ticketExpiry, NOW + 30 * DAY);
  });

  test("a closing time already past is refused", () => {
    const resolved = resolveSettings({ requiredCredential: "orb", closeAt: NOW - 1 }, NOW);

    assert.equal(resolved.ok, false);
    assert.match(resolved.ok ? "" : resolved.error, /clos(e|ing)/i);
  });

  test("an expiry already past is refused", () => {
    const resolved = resolveSettings({ requiredCredential: "orb", closeAt: NOW + DAY, ticketExpiry: NOW - 1 }, NOW);

    assert.equal(resolved.ok, false);
    assert.match(resolved.ok ? "" : resolved.error, /expir/i);
  });

  test("a campaign with no closing time leaves the expiry unset rather than guessing", () => {
    const resolved = resolveSettings({ requiredCredential: "orb", closeAt: null }, NOW);

    assert.ok(resolved.ok);
    assert.equal(resolved.value.closeAt, null);
    assert.equal(resolved.value.ticketExpiry, null);
  });

  test("only the three credentials the Door knows about are accepted", () => {
    assert.equal(resolveSettings({ requiredCredential: "passport" }, NOW).ok, false);
    for (const credential of ["selfie", "orb", "device"] as const) {
      assert.ok(resolveSettings({ requiredCredential: credential }, NOW).ok);
    }
  });
});

describe("POST /settings", () => {
  test("the owner sets the credential, the closing time, and the expiry", async () => {
    const { app, db } = await setup();

    const response = await post(app, { ...(await auth("mei-chan")), requiredCredential: "selfie", closeAt: NOW + DAY, ticketExpiry: NOW + 30 * DAY });

    assert.equal(response.status, 200);
    const row = await campaignRow(db);
    assert.equal(row?.required_credential, "selfie");
    assert.equal(Number(row?.close_at), NOW + DAY);
    assert.equal(Number(row?.ticket_expiry), NOW + 30 * DAY);
  });

  test("an omitted expiry follows the closing time", async () => {
    const { app, db } = await setup();

    await post(app, { ...(await auth("mei-chan")), requiredCredential: "orb", closeAt: NOW + 2 * DAY });

    assert.equal(Number((await campaignRow(db))?.ticket_expiry), NOW + 2 * DAY);
  });

  test("a closing time in the past is refused with 422 and changes nothing", async () => {
    const { app, db } = await setup();

    const response = await post(app, { ...(await auth("mei-chan")), requiredCredential: "orb", closeAt: NOW - DAY });

    assert.equal(response.status, 422);
    assert.equal((await campaignRow(db))?.close_at, null);
  });

  test("an expiry in the past is refused with 422", async () => {
    const { app } = await setup();

    const response = await post(app, { ...(await auth("mei-chan")), requiredCredential: "orb", closeAt: NOW + DAY, ticketExpiry: NOW - DAY });

    assert.equal(response.status, 422);
  });

  test("someone who is not the owner is refused with 403", async () => {
    const { app, db } = await setup();

    const response = await post(app, { ...(await auth("mei-chan", stranger)), requiredCredential: "device" });

    assert.equal(response.status, 403);
    assert.equal((await campaignRow(db))?.required_credential, "orb");
  });

  test("an unsigned request is refused with 401", async () => {
    const { app } = await setup();
    assert.equal((await post(app, { requiredCredential: "device" })).status, 401);
  });

  test("a signature for another campaign does not work here", async () => {
    const { app } = await setup();

    const response = await post(app, { ...(await auth("another-campaign")), requiredCredential: "device" });
    assert.equal(response.status, 401);
  });

  test("a stale signature is refused, so an old one cannot be replayed", async () => {
    const { app } = await setup();
    const nonce = Date.now() - 30 * 60 * 1000;
    const response = await post(app, {
      caller: owner.address,
      nonce,
      signature: await owner.signMessage({ message: `Hanami: settings mei-chan at ${nonce}` }),
      requiredCredential: "device",
    });

    assert.equal(response.status, 400);
  });

  test("404s for a campaign that does not exist", async () => {
    const { app } = await setup();
    const response = await app.request("/api/campaigns/nope/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(await auth("nope")), requiredCredential: "orb" }),
    });

    assert.equal(response.status, 404);
  });

  test("answers with the settings as they now stand", async () => {
    const { app } = await setup();

    const body = await (await post(app, { ...(await auth("mei-chan")), requiredCredential: "device", closeAt: NOW + DAY })).json();

    assert.deepEqual(body, { requiredCredential: "device", closeAt: NOW + DAY, ticketExpiry: NOW + DAY });
  });
});
