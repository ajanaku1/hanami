import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { privateKeyToAccount } from "viem/accounts";
import { applyMigrations } from "../src/db/index.js";
import { buildSafetyAuthorizationMessage } from "../src/safety/auth.js";
import { hashBouncerContent } from "../src/safety/content-hash.js";
import { SafetyRepository } from "../src/safety/repository.js";
import { createSafetyRoutes } from "../src/safety/routes.js";

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
const nonce = 1_724_150_000_000;
const persona = "Immutable private campaign intelligence with enough text for a valid bouncer.";
const lorebook = "Immutable lore.";
const personaUri = `0g://0x${"a".repeat(64)}`;
const lorebookUri = `0g://0x${"b".repeat(64)}`;

async function signed(account: typeof owner) {
  const contentHash = hashBouncerContent(persona, lorebook);
  const message = buildSafetyAuthorizationMessage({
    scope: "campaign",
    slug: "sakura-society",
    contentHash,
    nonce,
  });
  return { caller: account.address, nonce, signature: await account.signMessage({ message }) };
}

async function setup(readText: (uri: string) => Promise<string> = async (uri) => uri === personaUri ? persona : lorebook) {
  dir = await mkdtemp(join(tmpdir(), "hanami-safety-campaign-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);
  const repository = new SafetyRepository(client, () => "11111111-1111-4111-8111-111111111111");
  let uploads = 0;
  const app = new Hono();
  app.route("/api", createSafetyRoutes({
    repository,
    uploadText: async () => {
      uploads += 1;
      return `0x${"f".repeat(64)}`;
    },
    loadCampaign: async () => ({
      slug: "sakura-society",
      ownerAddress: owner.address,
      personaUri,
      lorebookUri,
    }),
    readText,
    scheduleExecution: () => {},
    nowMs: () => nonce,
    nowSeconds: () => Math.floor(nonce / 1000),
  }));
  return { app, repository, getUploads: () => uploads };
}

describe("campaign safety start", () => {
  test("certifies the immutable stored intelligence without uploading it again", async () => {
    const { app, repository, getUploads } = await setup();

    const response = await app.request("/api/safety-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "campaign", slug: "sakura-society", ...await signed(owner) }),
    });
    const payload = await response.json() as { id: string; contentHash: string };
    const stored = await repository.getRun(payload.id);

    assert.equal(response.status, 202);
    assert.equal(payload.contentHash, hashBouncerContent(persona, lorebook));
    assert.equal(stored?.personaUri, personaUri);
    assert.equal(stored?.lorebookUri, lorebookUri);
    assert.equal(getUploads(), 0);
  });

  test("rejects a valid signature from a wallet that does not own the campaign", async () => {
    const { app } = await setup();

    const response = await app.request("/api/safety-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "campaign", slug: "sakura-society", ...await signed(stranger) }),
    });

    assert.equal(response.status, 403);
  });

  test("sanitizes 0G read failures instead of exposing an internal error", async () => {
    const { app } = await setup(async () => {
      throw new Error("PRIVATE_STORAGE_HOST_AND_TOKEN");
    });

    const response = await app.request("/api/safety-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "campaign", slug: "sakura-society", ...await signed(owner) }),
    });
    const payload = await response.text();

    assert.equal(response.status, 503);
    assert.equal(payload.includes("PRIVATE_STORAGE_HOST_AND_TOKEN"), false);
    assert.match(payload, /STORAGE_UNAVAILABLE/);
  });
});
