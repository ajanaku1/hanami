import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyMigrations } from "../src/db/index.js";
import { SafetyRepository } from "../src/safety/repository.js";
import {
  InferencePacer,
  SafetyRunner,
  type SafetyInference,
} from "../src/safety/runner.js";
import type { SafetyDecision, SafetyRunIdentity } from "../src/safety/types.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

const identity: SafetyRunIdentity = {
  scope: "draft",
  slug: "sakura-society",
  ownerAddress: "0x0000000000000000000000000000000000000001",
  contentHash: `0x${"3".repeat(64)}`,
  personaUri: `0g://0x${"a".repeat(64)}`,
  lorebookUri: null,
};

async function setup() {
  dir = await mkdtemp(join(tmpdir(), "hanami-safety-runner-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);
  const repo = new SafetyRepository(client, () => "11111111-1111-4111-8111-111111111111");
  const run = await repo.createOrGetRun(identity, 100);
  return { repo, run };
}

function decidingInference(
  override?: (scenarioId: string, turnIndex: number, expected: SafetyDecision) => {
    decision: SafetyDecision | null;
    teeVerified: boolean;
  },
): SafetyInference {
  return async ({ scenario, turnIndex }) => {
    const value = override?.(scenario.id, turnIndex, scenario.expectedDecision) ?? {
      decision: turnIndex === scenario.messages.length - 1 ? scenario.expectedDecision : null,
      teeVerified: true,
    };
    return { reply: `private reply ${scenario.id}`, ...value };
  };
}

describe("SafetyRunner", () => {
  test("persists a report only after strict 8/8 expected, TEE-verified decisions", async () => {
    const { repo, run } = await setup();
    let uploaded = "";
    const runner = new SafetyRunner({
      repository: repo,
      infer: decidingInference(),
      uploadReport: async (report) => {
        uploaded = report;
        return `0x${"b".repeat(64)}`;
      },
      now: () => 200,
      pacer: new InferencePacer(0),
    });

    const result = await runner.execute(run.id, "PRIVATE_PERSONA", "PRIVATE_LOREBOOK");

    assert.equal(result.status, "passed");
    assert.equal(result.completedCount, 8);
    assert.equal(result.results.every((item) => item.status === "passed"), true);
    assert.equal(uploaded.includes("PRIVATE_PERSONA"), false);
    assert.equal(uploaded.includes("private reply"), false);
  });

  test("marks the last fixed scenario message as the required verdict turn", async () => {
    const { repo, run } = await setup();
    const verdictTurns: Array<{ turnIndex: number; finalTurn: boolean }> = [];
    const runner = new SafetyRunner({
      repository: repo,
      infer: async ({ scenario, turnIndex, finalTurn }) => {
        verdictTurns.push({ turnIndex, finalTurn });
        return {
          reply: "private",
          decision: finalTurn ? scenario.expectedDecision : null,
          teeVerified: true,
        };
      },
      uploadReport: async () => `0x${"b".repeat(64)}`,
      now: () => 200,
      pacer: new InferencePacer(0),
    });

    const result = await runner.execute(run.id, "persona", "lorebook");

    assert.equal(result.status, "passed");
    assert.equal(verdictTurns.filter(({ finalTurn }) => finalTurn).length, 8);
    assert.equal(verdictTurns.every(({ turnIndex, finalTurn }) => finalTurn === (turnIndex === 2)), true);
  });

  test("treats a wrong or missing decision as a genuine failed verdict", async () => {
    const { repo, run } = await setup();
    let uploads = 0;
    const runner = new SafetyRunner({
      repository: repo,
      infer: decidingInference((scenarioId, turnIndex, expected) => ({
        decision: turnIndex === 2
          ? scenarioId === "T1-gallerist-context" ? "reject" : scenarioId === "T2-thoughtful-knowledge" ? null : expected
          : null,
        teeVerified: true,
      })),
      uploadReport: async () => {
        uploads += 1;
        return `0x${"b".repeat(64)}`;
      },
      now: () => 200,
      pacer: new InferencePacer(0),
    });

    const result = await runner.execute(run.id, "persona", "lorebook");

    assert.equal(result.status, "failed");
    assert.equal(result.results.find((item) => item.id === "T1-gallerist-context")?.actualDecision, "reject");
    assert.equal(result.results.find((item) => item.id === "T2-thoughtful-knowledge")?.actualDecision, "no-decision");
    assert.equal(uploads, 0);
  });

  test("classifies false or missing TEE evidence as a retryable interruption", async () => {
    const { repo, run } = await setup();
    const runner = new SafetyRunner({
      repository: repo,
      infer: decidingInference((scenarioId, turnIndex, expected) => ({
        decision: turnIndex === 2 ? expected : null,
        teeVerified: scenarioId !== "T1-gallerist-context",
      })),
      uploadReport: async () => `0x${"b".repeat(64)}`,
      now: () => 200,
      pacer: new InferencePacer(0),
    });

    const result = await runner.execute(run.id, "persona", "lorebook");

    assert.equal(result.status, "interrupted");
    assert.equal(result.error?.code, "TEE_UNVERIFIED");
    assert.equal(result.error?.retryable, true);
  });

  test("uses at most two scenario workers and globally paces inference starts", async () => {
    const { repo, run } = await setup();
    let virtualNow = 0;
    let active = 0;
    let maxActive = 0;
    const starts: number[] = [];
    const activeScenarios = new Set<string>();
    const infer: SafetyInference = async ({ scenario, turnIndex }) => {
      if (!activeScenarios.has(scenario.id)) {
        activeScenarios.add(scenario.id);
        active += 1;
        maxActive = Math.max(maxActive, active);
      }
      starts.push(virtualNow);
      await Promise.resolve();
      if (turnIndex === 2) {
        activeScenarios.delete(scenario.id);
        active -= 1;
      }
      return {
        reply: "private",
        decision: turnIndex === 2 ? scenario.expectedDecision : null,
        teeVerified: true,
      };
    };
    const pacer = new InferencePacer(25, () => virtualNow, async (delay) => {
      virtualNow += delay;
    });
    const runner = new SafetyRunner({
      repository: repo,
      infer,
      uploadReport: async () => `0x${"b".repeat(64)}`,
      now: () => 200,
      pacer,
    });

    await runner.execute(run.id, "persona", "lorebook");

    assert.equal(maxActive, 2);
    assert.equal(starts.every((start, index) => index === 0 || start - starts[index - 1]! >= 25), true);
  });

  test("resume skips completed scenario checkpoints", async () => {
    const { repo, run } = await setup();
    await repo.saveScenario(run.id, {
      id: "T1-gallerist-context",
      category: "thoughtful",
      expectedDecision: "approve",
      actualDecision: "approve",
      teeVerified: true,
      status: "passed",
      turnCount: 3,
      errorCode: null,
    }, 150);
    const called = new Set<string>();
    const base = decidingInference();
    const runner = new SafetyRunner({
      repository: repo,
      infer: async (input) => {
        called.add(input.scenario.id);
        return base(input);
      },
      uploadReport: async () => `0x${"b".repeat(64)}`,
      now: () => 200,
      pacer: new InferencePacer(0),
    });

    const result = await runner.execute(run.id, "persona", "lorebook");

    assert.equal(result.status, "passed");
    assert.equal(called.has("T1-gallerist-context"), false);
  });

  test("resume retries only report persistence after an upload interruption", async () => {
    const { repo, run } = await setup();
    let inferenceCalls = 0;
    let uploadCalls = 0;
    const runner = new SafetyRunner({
      repository: repo,
      infer: async (input) => {
        inferenceCalls += 1;
        return decidingInference()(input);
      },
      uploadReport: async () => {
        uploadCalls += 1;
        if (uploadCalls === 1) throw new Error("storage provider unavailable: PRIVATE_REPLY");
        return `0x${"b".repeat(64)}`;
      },
      now: () => 200,
      pacer: new InferencePacer(0),
    });

    const interrupted = await runner.execute(run.id, "persona", "lorebook");
    const callsAfterScenarios = inferenceCalls;
    const resumed = await runner.execute(run.id, "persona", "lorebook");

    assert.equal(interrupted.status, "interrupted");
    assert.equal(interrupted.error?.code, "REPORT_UPLOAD_FAILED");
    assert.equal(interrupted.error?.message.includes("PRIVATE_REPLY"), false);
    assert.equal(resumed.status, "passed");
    assert.equal(inferenceCalls, callsAfterScenarios);
    assert.equal(uploadCalls, 2);
  });
});
