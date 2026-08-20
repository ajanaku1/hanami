import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyMigrations } from "../src/db/index.js";
import { SafetyRepository } from "../src/safety/repository.js";
import {
  PublicationError,
  deriveCampaignSafety,
  decideVisibilityChange,
  type CampaignPublicationSource,
} from "../src/safety/publication.js";

let client: Client | undefined;
let dir: string | undefined;

afterEach(async () => {
  client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = undefined;
  dir = undefined;
});

const campaign: CampaignPublicationSource = {
  slug: "sakura-society",
  ownerAddress: "0x0000000000000000000000000000000000000001",
  visibility: "private",
  publicationPolicy: "certification-required",
  personaUri: `0g://0x${"a".repeat(64)}`,
  lorebookUri: null,
};

async function setup() {
  dir = await mkdtemp(join(tmpdir(), "hanami-safety-visibility-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  await applyMigrations(client);
  return new SafetyRepository(client, () => "11111111-1111-4111-8111-111111111111");
}

describe("campaign publication safety", () => {
  test("preserves legacy-public operation until the owner makes it private", async () => {
    const repository = await setup();
    const legacy = { ...campaign, visibility: "public" as const, publicationPolicy: "legacy-public" as const };

    const safety = await deriveCampaignSafety(repository, legacy);
    const transition = decideVisibilityChange(legacy, "private", safety);

    assert.equal(safety.state, "legacy");
    assert.equal(safety.publicationEligible, true);
    assert.deepEqual(transition, { visibility: "private", publicationPolicy: "certification-required" });
  });

  test("blocks publication without a matching campaign pass", async () => {
    const repository = await setup();
    const safety = await deriveCampaignSafety(repository, campaign);

    assert.equal(safety.state, "required");
    assert.throws(
      () => decideVisibilityChange(campaign, "public", safety),
      (error: unknown) => error instanceof PublicationError && error.code === "CERTIFICATION_REQUIRED",
    );
  });

  test("allows publication only for a pass matching immutable roots", async () => {
    const repository = await setup();
    const run = await repository.createOrGetRun({
      scope: "campaign",
      slug: campaign.slug,
      ownerAddress: campaign.ownerAddress,
      contentHash: `0x${"3".repeat(64)}`,
      personaUri: campaign.personaUri,
      lorebookUri: campaign.lorebookUri,
    }, 100);
    await repository.markPassed(run.id, `0x${"c".repeat(64)}`, 110);

    const safety = await deriveCampaignSafety(repository, campaign);
    const transition = decideVisibilityChange(campaign, "public", safety);
    const changedRoots = await deriveCampaignSafety(repository, {
      ...campaign,
      personaUri: `0g://0x${"d".repeat(64)}`,
    });

    assert.equal(safety.state, "certified");
    assert.equal(safety.reportRoot, `0x${"c".repeat(64)}`);
    assert.deepEqual(transition, { visibility: "public", publicationPolicy: "certification-required" });
    assert.equal(changedRoots.state, "required");
  });
});
