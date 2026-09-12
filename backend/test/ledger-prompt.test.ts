import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderEvidence } from "../src/ledger/prompt.js";
import { buildSystemPrompt, buildTurnMessages } from "../src/bouncer.js";
import type { LedgerBrief } from "../src/ledger/brief.js";

const WALLET = "0x00000000000000000000000000000000000000aa";

function brief(over: Partial<LedgerBrief> = {}): LedgerBrief {
  return {
    wallet: WALLET,
    status: "ready",
    flipsWithin7d: 3,
    sameCounterpartySales: 1,
    medianHoldingDays: 12.5,
    swapCount: 40,
    sourcesRead: [
      { name: "opensea-v2", subgraphId: "sg-opensea", ok: true, count: 12 },
      { name: "x2y2", subgraphId: "sg-x2y2", ok: false, count: 0 },
      { name: "uniswap-v3", subgraphId: "sg-uni", ok: true, count: 40 },
    ],
    truncated: false,
    readAt: 1_750_000_000,
    ...over,
  };
}

describe("renderEvidence", () => {
  test("fences the block so the model cannot mistake it for the applicant speaking", () => {
    const block = renderEvidence(brief());
    const fences = block.match(/```/g) ?? [];

    assert.equal(fences.length, 2);
    assert.match(block, /```ledger-evidence/);
  });

  test("says plainly that this is evidence and not a verdict", () => {
    const block = renderEvidence(brief());

    assert.match(block, /evidence, not a verdict/i);
    assert.match(block, /do not decide/i);
  });

  test("carries all four figures", () => {
    const block = renderEvidence(brief());

    assert.match(block, /flips_within_7d:\s*3/);
    assert.match(block, /sales_back_to_same_counterparty:\s*1/);
    assert.match(block, /median_holding_days:\s*12\.5/);
    assert.match(block, /swap_count:\s*40/);
  });

  test("names the sources actually read and the ones that failed", () => {
    const block = renderEvidence(brief());

    assert.match(block, /opensea-v2/);
    assert.match(block, /uniswap-v3/);
    assert.match(block, /x2y2.*unavailable/i);
  });

  test("admits when a cap hid older activity", () => {
    assert.match(renderEvidence(brief({ truncated: true })), /older activity/i);
    assert.doesNotMatch(renderEvidence(brief()), /older activity/i);
  });

  test("an unmatched history reports no median rather than a zero", () => {
    assert.match(renderEvidence(brief({ medianHoldingDays: null })), /median_holding_days:\s*unknown/);
  });

  test("an empty history says the wallet is new, and still forbids deciding from it", () => {
    const block = renderEvidence(brief({ status: "empty", flipsWithin7d: 0, sameCounterpartySales: 0, medianHoldingDays: null, swapCount: 0 }));

    assert.match(block, /no trading history/i);
    assert.match(block, /evidence, not a verdict/i);
    assert.doesNotMatch(block, /flips_within_7d/);
  });

  test("an unavailable brief says there is no evidence, with no figures to lean on", () => {
    const block = renderEvidence(brief({ status: "unavailable" }));

    assert.match(block, /no ledger evidence/i);
    assert.doesNotMatch(block, /flips_within_7d/);
    assert.doesNotMatch(block, /12\.5/);
  });

  test("a missing brief reads the same as an unavailable one", () => {
    assert.match(renderEvidence(null), /no ledger evidence/i);
  });
});

describe("bouncerTurn evidence", () => {
  const input = { persona: "private persona", lorebook: "private lorebook", history: [{ role: "user" as const, content: "hi" }] };

  function systemOf(turnInput: Parameters<typeof buildTurnMessages>[0]): string {
    const system = buildTurnMessages(turnInput)[0];
    assert.ok(system && system.role === "system", "expected a system message first");
    return system.content;
  }

  test("the system message carries the evidence block when a brief was read", () => {
    const system = systemOf({ ...input, evidence: brief() });

    assert.match(system, /```ledger-evidence/);
    assert.match(system, /flips_within_7d:\s*3/);
  });

  test("the persona and the operating rules still come first", () => {
    const system = systemOf({ ...input, evidence: brief() });

    assert.ok(system.indexOf("private persona") < system.indexOf("```ledger-evidence"));
    assert.match(system, /two independent positive signals/i);
  });

  test("a turn with no brief carries no evidence block at all", () => {
    const system = systemOf(input);

    assert.doesNotMatch(system, /ledger-evidence/);
    assert.equal(system, systemOf({ ...input, evidence: undefined }));
  });

  test("an unavailable brief still tells the bouncer that no evidence arrived", () => {
    const system = systemOf({ ...input, evidence: brief({ status: "unavailable" }) });

    assert.match(system, /no ledger evidence/i);
  });

  test("the applicant history follows the system message untouched", () => {
    const messages = buildTurnMessages({ ...input, evidence: brief() });

    assert.equal(messages.length, 2);
    assert.deepEqual(messages[1], { role: "user", content: "hi" });
  });

  test("buildSystemPrompt is unchanged by the brief; evidence is appended, not woven in", () => {
    const system = systemOf({ ...input, evidence: brief() });

    assert.ok(system.startsWith(buildSystemPrompt(input.persona, input.lorebook)));
  });
});
