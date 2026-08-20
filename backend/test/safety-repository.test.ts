import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyMigrations } from "../src/db/index.js";
import { SafetyRepository } from "../src/safety/repository.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

async function repository(): Promise<SafetyRepository> {
  dir = await mkdtemp(join(tmpdir(), "hanami-safety-repo-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);
  return new SafetyRepository(client, () => "11111111-1111-4111-8111-111111111111");
}

const identity = {
  scope: "draft" as const,
  slug: "sakura-society",
  ownerAddress: "0x0000000000000000000000000000000000000001",
  contentHash: "0x319b2fe63b680c13c394d642270186440d22d0eab6f47111ddeee17b3eb75fd9",
  personaUri: "0g://0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  lorebookUri: null,
};

describe("SafetyRepository", () => {
  test("returns the same run for a duplicate exact identity", async () => {
    const repo = await repository();

    const first = await repo.createOrGetRun(identity, 100);
    const duplicate = await repo.createOrGetRun(identity, 101);

    assert.equal(duplicate.id, first.id);
    assert.equal(duplicate.createdAt, 100);
  });

  test("checkpoints a completed scenario and restores it", async () => {
    const repo = await repository();
    const run = await repo.createOrGetRun(identity, 100);

    await repo.saveScenario(run.id, {
      id: "T1-gallerist-context",
      category: "thoughtful",
      expectedDecision: "approve",
      actualDecision: "approve",
      teeVerified: true,
      status: "passed",
      turnCount: 3,
      errorCode: null,
    }, 110);
    const restored = await repo.getRun(run.id);

    assert.equal(restored?.completedCount, 1);
    assert.equal(restored?.results[0]?.id, "T1-gallerist-context");
  });

  test("matches only a persisted passing report for the exact identity", async () => {
    const repo = await repository();
    const run = await repo.createOrGetRun(identity, 100);

    assert.equal(await repo.findPassingRun(identity), null);
    await repo.markPassed(
      run.id,
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      120,
    );

    assert.equal((await repo.findPassingRun(identity))?.id, run.id);
    assert.equal(await repo.findPassingRun({ ...identity, contentHash: `0x${"4".repeat(64)}` }), null);
  });

  test("marks abandoned running work as an interruption", async () => {
    const repo = await repository();
    const run = await repo.createOrGetRun(identity, 100);

    const recovered = await repo.interruptStaleRuns(200, 150);
    const stored = await repo.getRun(run.id);

    assert.equal(recovered, 1);
    assert.equal(stored?.status, "interrupted");
    assert.equal(stored?.error?.code, "PROCESS_RESTARTED");
  });

  test("restarts a completed failure without carrying failed checkpoints forward", async () => {
    const repo = await repository();
    const run = await repo.createOrGetRun(identity, 100);
    await repo.saveScenario(run.id, {
      id: "T1-gallerist-context",
      category: "thoughtful",
      expectedDecision: "approve",
      actualDecision: "reject",
      teeVerified: true,
      status: "failed",
      turnCount: 2,
      errorCode: null,
    }, 110);
    await repo.markFailed(run.id, 120);

    await repo.restartFailedRun(run.id, 130);
    const restarted = await repo.getRun(run.id);

    assert.equal(restarted?.status, "running");
    assert.equal(restarted?.completedCount, 0);
    assert.equal(restarted?.completedAt, null);
    assert.deepEqual(restarted?.results, []);
  });
});
