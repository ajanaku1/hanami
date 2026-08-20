import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildSystemPrompt, decisionForTurn } from "../src/bouncer.js";

describe("decisionForTurn", () => {
  test("ignores approvals before the three-message evidence minimum", () => {
    assert.equal(decisionForTurn("Welcome.\n<DECISION:APPROVE>", 1, false), null);
    assert.equal(decisionForTurn("Welcome.\n<DECISION:APPROVE>", 2, false), null);
  });

  test("preserves early safety rejections and mature approvals", () => {
    assert.equal(decisionForTurn("No.\n<DECISION:REJECT>", 1, false)?.kind, "reject");
    assert.equal(decisionForTurn("Welcome.\n<DECISION:APPROVE>", 3, false)?.kind, "approve");
  });

  test("accepts harmless verdict tag spacing and casing variants", () => {
    assert.equal(decisionForTurn("Welcome.\n<DECISION: APPROVE>", 3, true)?.kind, "approve");
    assert.equal(decisionForTurn("No.\n<decision:reject>", 3, true)?.kind, "reject");
  });

  test("fails closed when a required final turn omits its verdict", () => {
    assert.equal(decisionForTurn("I am still considering this.", 3, true)?.kind, "reject");
  });
});

describe("buildSystemPrompt", () => {
  test("binds every persona to the same general two-signal approval invariant", () => {
    const prompt = buildSystemPrompt("private persona", "private lorebook");

    assert.match(prompt, /two independent positive signals/i);
    assert.match(prompt, /do not require every private criterion/i);
  });
});
