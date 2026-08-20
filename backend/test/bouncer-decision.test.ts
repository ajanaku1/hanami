import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decisionForTurn } from "../src/bouncer.js";

describe("decisionForTurn", () => {
  test("ignores approvals before the three-message evidence minimum", () => {
    assert.equal(decisionForTurn("Welcome.\n<DECISION:APPROVE>", 1, false), null);
    assert.equal(decisionForTurn("Welcome.\n<DECISION:APPROVE>", 2, false), null);
  });

  test("preserves early safety rejections and mature approvals", () => {
    assert.equal(decisionForTurn("No.\n<DECISION:REJECT>", 1, false)?.kind, "reject");
    assert.equal(decisionForTurn("Welcome.\n<DECISION:APPROVE>", 3, false)?.kind, "approve");
  });

  test("fails closed when a required final turn omits its verdict", () => {
    assert.equal(decisionForTurn("I am still considering this.", 3, true)?.kind, "reject");
  });
});
