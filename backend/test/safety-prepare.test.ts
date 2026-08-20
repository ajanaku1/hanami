import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyMigrations } from "../src/db/index.js";
import { hashBouncerContent } from "../src/safety/content-hash.js";
import {
  CertificationError,
  promoteCertifiedDraft,
  requireCertifiedDraft,
  requiredNewCampaignPublication,
} from "../src/safety/certification.js";
import { SafetyRepository } from "../src/safety/repository.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

const persona = "A private bouncer persona with enough exact content to certify safely.";
const lorebook = "A private exact lorebook.";
const ownerAddress = "0x0000000000000000000000000000000000000001";

async function setup(passed = true) {
  dir = await mkdtemp(join(tmpdir(), "hanami-safety-prepare-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);
  const repository = new SafetyRepository(client, () => "11111111-1111-4111-8111-111111111111");
  const run = await repository.createOrGetRun({
    scope: "draft",
    slug: "sakura-society",
    ownerAddress,
    contentHash: hashBouncerContent(persona, lorebook),
    personaUri: `0g://0x${"a".repeat(64)}`,
    lorebookUri: `0g://0x${"b".repeat(64)}`,
  }, 100);
  if (passed) await repository.markPassed(run.id, `0x${"c".repeat(64)}`, 110);
  return { repository, runId: run.id };
}

describe("certified campaign preparation", () => {
  test("reuses certified text roots without another private text upload", async () => {
    const { repository, runId } = await setup();

    const certified = await requireCertifiedDraft(repository, {
      safetyRunId: runId,
      slug: "sakura-society",
      ownerAddress,
      persona,
      lorebook,
    });

    assert.equal(certified.personaUri, `0g://0x${"a".repeat(64)}`);
    assert.equal(certified.lorebookUri, `0g://0x${"b".repeat(64)}`);
    assert.equal(certified.reportRoot, `0x${"c".repeat(64)}`);
  });

  test("rejects non-passing, mismatched owner, slug, or exact content", async () => {
    const pending = await setup(false);
    await assert.rejects(
      requireCertifiedDraft(pending.repository, {
        safetyRunId: pending.runId,
        slug: "sakura-society",
        ownerAddress,
        persona,
        lorebook,
      }),
      (error: unknown) => error instanceof CertificationError && error.code === "CERTIFICATION_REQUIRED",
    );

    await pending.repository.markPassed(pending.runId, `0x${"c".repeat(64)}`, 110);
    const mutations = [
      { ownerAddress: "0x0000000000000000000000000000000000000002" },
      { slug: "different-slug" },
      { persona: `${persona} edited` },
    ];
    for (const mutation of mutations) {
      await assert.rejects(
        requireCertifiedDraft(pending.repository, {
          safetyRunId: pending.runId,
          slug: "sakura-society",
          ownerAddress,
          persona,
          lorebook,
          ...mutation,
        }),
        (error: unknown) => error instanceof CertificationError && error.code === "CERTIFICATION_MISMATCH",
      );
    }
  });

  test("forces every newly indexed campaign private and certification-required", () => {
    assert.deepEqual(requiredNewCampaignPublication(), {
      visibility: "private",
      publicationPolicy: "certification-required",
    });
  });

  test("carries the certified draft report into the immutable minted campaign", async () => {
    const { repository, runId } = await setup();

    await promoteCertifiedDraft(repository, {
      safetyRunId: runId,
      slug: "sakura-society",
      ownerAddress,
      personaUri: `0g://0x${"a".repeat(64)}`,
      lorebookUri: `0g://0x${"b".repeat(64)}`,
    });
    await promoteCertifiedDraft(repository, {
      safetyRunId: runId,
      slug: "sakura-society",
      ownerAddress,
      personaUri: `0g://0x${"a".repeat(64)}`,
      lorebookUri: `0g://0x${"b".repeat(64)}`,
    });
    const campaignRun = await repository.findLatestCampaignRun({
      slug: "sakura-society",
      ownerAddress,
      personaUri: `0g://0x${"a".repeat(64)}`,
      lorebookUri: `0g://0x${"b".repeat(64)}`,
    });

    assert.equal(campaignRun?.scope, "campaign");
    assert.equal(campaignRun?.reportRoot, `0x${"c".repeat(64)}`);
  });
});
