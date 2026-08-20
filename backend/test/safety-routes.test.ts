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
const persona = "PRIVATE_PERSONA_NEEDLE ".repeat(4);
const lorebook = "PRIVATE_LOREBOOK_NEEDLE";
const nonce = 1_724_150_000_000;

async function authorization(
  account: typeof owner,
  scope: "draft" | "campaign",
  slug: string,
  contentHash: `0x${string}`,
) {
  const message = buildSafetyAuthorizationMessage({ scope, slug, contentHash, nonce });
  return { caller: account.address, nonce, signature: await account.signMessage({ message }) };
}

async function setup(rateLimit = 10) {
  dir = await mkdtemp(join(tmpdir(), "hanami-safety-routes-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);
  const repository = new SafetyRepository(client, () => "11111111-1111-4111-8111-111111111111");
  const uploads: string[] = [];
  const scheduled: string[] = [];
  const routes = createSafetyRoutes({
    repository,
    uploadText: async (text) => {
      uploads.push(text);
      return `0x${uploads.length.toString(16).padStart(64, "0")}`;
    },
    loadCampaign: async () => null,
    scheduleExecution: (runId) => {
      scheduled.push(runId);
    },
    nowMs: () => nonce,
    nowSeconds: () => Math.floor(nonce / 1000),
    rateLimit: { limit: rateLimit, windowMs: 60_000 },
  });
  const app = new Hono();
  app.route("/api", routes);
  return { app, repository, uploads, scheduled };
}

function parse(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("safety routes", () => {
  test("starts an idempotent draft once and returns only privacy-safe progress", async () => {
    const { app, uploads, scheduled } = await setup();
    const contentHash = hashBouncerContent(persona, lorebook);
    const auth = await authorization(owner, "draft", "sakura-society", contentHash);
    const body = { scope: "draft", slug: "sakura-society", persona, lorebook, ...auth };

    const first = await app.request("/api/safety-runs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.1" },
      body: JSON.stringify(body),
    });
    const duplicate = await app.request("/api/safety-runs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.1" },
      body: JSON.stringify(body),
    });
    const payload = await parse(first);
    const serialized = JSON.stringify(payload);

    assert.equal(first.status, 202);
    assert.equal(duplicate.status, 202);
    assert.equal(uploads.length, 2);
    assert.equal(scheduled.length, 1);
    assert.equal(payload.totalCount, 8);
    assert.equal((payload.scenarios as unknown[]).length, 8);
    assert.equal(serialized.includes("PRIVATE_PERSONA_NEEDLE"), false);
    assert.equal(serialized.includes("PRIVATE_LOREBOOK_NEEDLE"), false);
    assert.equal(serialized.includes("personaUri"), false);
    assert.equal(serialized.includes("lorebookUri"), false);
  });

  test("rejects a signature that does not bind the submitted content", async () => {
    const { app, uploads } = await setup();
    const wrongHash = hashBouncerContent(`${persona} edited`, lorebook);
    const auth = await authorization(owner, "draft", "sakura-society", wrongHash);

    const response = await app.request("/api/safety-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "draft", slug: "sakura-society", persona, lorebook, ...auth }),
    });

    assert.equal(response.status, 401);
    assert.equal(uploads.length, 0);
  });

  test("polls a run without exposing stored content locations", async () => {
    const { app } = await setup();
    const contentHash = hashBouncerContent(persona, lorebook);
    const auth = await authorization(owner, "draft", "sakura-society", contentHash);
    const started = await app.request("/api/safety-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "draft", slug: "sakura-society", persona, lorebook, ...auth }),
    });
    const runId = (await parse(started)).id;

    const response = await app.request(`/api/safety-runs/${runId}`);
    const payload = await parse(response);

    assert.equal(response.status, 200);
    assert.equal(payload.id, runId);
    assert.equal(JSON.stringify(payload).includes("0g://"), false);
  });

  test("resumes an interrupted run only for its signing owner", async () => {
    const { app, repository, scheduled } = await setup();
    const contentHash = hashBouncerContent(persona, lorebook);
    const auth = await authorization(owner, "draft", "sakura-society", contentHash);
    const started = await app.request("/api/safety-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "draft", slug: "sakura-society", persona, lorebook, ...auth }),
    });
    const runId = String((await parse(started)).id);
    await repository.markInterrupted(runId, "INFERENCE_FAILED", "Safe retry message", 2);
    const strangerAuth = await authorization(stranger, "draft", "sakura-society", contentHash);
    const denied = await app.request(`/api/safety-runs/${runId}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(strangerAuth),
    });
    const ownerAuth = await authorization(owner, "draft", "sakura-society", contentHash);
    const resumed = await app.request(`/api/safety-runs/${runId}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ownerAuth),
    });

    assert.equal(denied.status, 403);
    assert.equal(resumed.status, 202);
    assert.equal(scheduled.length, 2);
  });

  test("rate-limits repeated starts with a sanitized response", async () => {
    const { app } = await setup(1);
    const contentHash = hashBouncerContent(persona, lorebook);
    const auth = await authorization(owner, "draft", "sakura-society", contentHash);
    const request = () => app.request("/api/safety-runs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
      body: JSON.stringify({ scope: "draft", slug: "sakura-society", persona, lorebook, ...auth }),
    });

    await request();
    const limited = await request();
    const payload = await parse(limited);

    assert.equal(limited.status, 429);
    assert.deepEqual(payload, { error: { code: "RATE_LIMITED", message: "Too many safety requests. Try again shortly." } });
  });
});
