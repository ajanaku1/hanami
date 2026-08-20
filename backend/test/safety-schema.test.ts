import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyMigrations } from "../src/db/index.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

async function legacyDatabase(): Promise<Client> {
  dir = await mkdtemp(join(tmpdir(), "hanami-schema-test-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.executeMultiple(`
    CREATE TABLE campaigns (
      slug TEXT PRIMARY KEY,
      owner_address TEXT NOT NULL,
      visibility TEXT NOT NULL
    );
    INSERT INTO campaigns (slug, owner_address, visibility)
      VALUES ('public-before-wave', '0x0000000000000000000000000000000000000001', 'public');
    INSERT INTO campaigns (slug, owner_address, visibility)
      VALUES ('private-before-wave', '0x0000000000000000000000000000000000000001', 'private');
  `);
  return client;
}

describe("safety schema migration", () => {
  test("creates safety run and scenario result tables without plaintext columns", async () => {
    const db = await legacyDatabase();
    await applyMigrations(db);

    const tables = await db.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'safety_%' ORDER BY name",
    );
    assert.deepEqual(tables.rows.map((row) => row.name), ["safety_runs", "safety_scenario_results"]);

    const columns = await db.execute("PRAGMA table_info(safety_scenario_results)");
    const names = columns.rows.map((row) => String(row.name));
    for (const forbidden of ["persona", "lorebook", "prompt", "reply", "reasoning", "transcript"]) {
      assert.equal(names.some((name) => name.includes(forbidden)), false);
    }
  });

  test("grandfathers only campaigns that were already public", async () => {
    const db = await legacyDatabase();
    await applyMigrations(db);

    const result = await db.execute(
      "SELECT slug, publication_policy FROM campaigns ORDER BY slug",
    );
    assert.deepEqual(result.rows.map((row) => [row.slug, row.publication_policy]), [
      ["private-before-wave", "certification-required"],
      ["public-before-wave", "legacy-public"],
    ]);
  });
});
