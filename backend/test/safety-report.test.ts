import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SCENARIOS } from "../src/safety/scenarios.js";
import { serializePassingReport } from "../src/safety/report.js";
import type { SafetyScenarioResult } from "../src/safety/types.js";

const results: SafetyScenarioResult[] = SCENARIOS.map((scenario) => ({
  id: scenario.id,
  category: scenario.category,
  expectedDecision: scenario.expectedDecision,
  actualDecision: scenario.expectedDecision,
  teeVerified: true,
  status: "passed",
  turnCount: 3,
  errorCode: null,
}));

describe("fixed safety suite", () => {
  test("contains the approved eight scenarios in four categories", () => {
    assert.equal(SCENARIOS.length, 8);
    assert.deepEqual(
      Object.fromEntries(
        ["thoughtful", "low-effort", "jailbreak", "edge"].map((category) => [
          category,
          SCENARIOS.filter((scenario) => scenario.category === category).length,
        ]),
      ),
      { thoughtful: 2, "low-effort": 2, jailbreak: 3, edge: 1 },
    );
    assert.equal(new Set(SCENARIOS.map((scenario) => scenario.id)).size, 8);
  });
});

describe("serializePassingReport", () => {
  test("contains reproducible decisions but no private source or replies", () => {
    const privateNeedles = [
      "PRIVATE_PERSONA_NEEDLE",
      "PRIVATE_LOREBOOK_NEEDLE",
      "PRIVATE_REPLY_NEEDLE",
      "PRIVATE_REASONING_NEEDLE",
    ];
    const serialized = serializePassingReport({
      id: "11111111-1111-4111-8111-111111111111",
      scope: "draft",
      slug: "sakura-society",
      ownerAddress: "0x0000000000000000000000000000000000000001",
      contentHash: "0x319b2fe63b680c13c394d642270186440d22d0eab6f47111ddeee17b3eb75fd9",
      createdAt: 1_724_150_000,
      completedAt: 1_724_150_120,
      results,
    });
    const report = JSON.parse(serialized) as Record<string, unknown>;

    assert.equal(report.passed, true);
    assert.equal((report.scenarios as unknown[]).length, 8);
    assert.deepEqual(report.counts, { correct: 8, teeVerified: 8, total: 8 });
    for (const needle of privateNeedles) assert.equal(serialized.includes(needle), false);
    for (const forbiddenKey of ["persona", "lorebook", "prompt", "reply", "reasoning", "transcript"]) {
      assert.equal(serialized.includes(`\"${forbiddenKey}\"`), false);
    }
  });

  test("refuses to serialize an incorrect or unverified result as passing", () => {
    const incorrect = results.map((result, index) =>
      index === 0 ? { ...result, actualDecision: "reject" as const, status: "failed" as const } : result,
    );
    assert.throws(() =>
      serializePassingReport({
        id: "11111111-1111-4111-8111-111111111111",
        scope: "draft",
        slug: "sakura-society",
        ownerAddress: "0x0000000000000000000000000000000000000001",
        contentHash: "0x319b2fe63b680c13c394d642270186440d22d0eab6f47111ddeee17b3eb75fd9",
        createdAt: 1,
        completedAt: 2,
        results: incorrect,
      }),
    );
  });
});
