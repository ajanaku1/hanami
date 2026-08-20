import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { hashBouncerContent } from "../src/safety/content-hash.js";

describe("hashBouncerContent", () => {
  test("matches the canonical exact-content vector", () => {
    assert.equal(
      hashBouncerContent("Hanami persona\nwith whitespace", "Project lore"),
      "0x319b2fe63b680c13c394d642270186440d22d0eab6f47111ddeee17b3eb75fd9",
    );
  });

  test("treats whitespace edits as different certified content", () => {
    const original = hashBouncerContent("A deliberate persona", "Project lore");
    const edited = hashBouncerContent("A deliberate persona ", "Project lore");

    assert.notEqual(edited, original);
  });

  test("distinguishes empty and non-empty lorebooks", () => {
    const empty = hashBouncerContent("A deliberate persona", "");
    const present = hashBouncerContent("A deliberate persona", " ");

    assert.notEqual(present, empty);
  });
});
