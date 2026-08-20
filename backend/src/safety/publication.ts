import type { SafetyRepository } from "./repository.js";

export type CampaignPublicationSource = {
  slug: string;
  ownerAddress: string;
  visibility: "public" | "private";
  publicationPolicy: "legacy-public" | "certification-required";
  personaUri: string;
  lorebookUri: string | null;
};

export type CampaignSafety = {
  state: "certified" | "legacy" | "required" | "running" | "failed" | "interrupted";
  latestRunId: string | null;
  reportRoot: string | null;
  contentHash: string | null;
  publicationEligible: boolean;
};

export class PublicationError extends Error {
  readonly code = "CERTIFICATION_REQUIRED";

  constructor() {
    super("A passing Bouncer Safety Report is required before publication.");
  }
}

function unresolvedState(run: Awaited<ReturnType<SafetyRepository["findLatestCampaignRun"]>>): CampaignSafety["state"] {
  if (run?.status === "running" || run?.status === "failed" || run?.status === "interrupted") {
    return run.status;
  }
  return "required";
}

export async function deriveCampaignSafety(
  repository: SafetyRepository,
  campaign: CampaignPublicationSource,
): Promise<CampaignSafety> {
  const run = await repository.findLatestCampaignRun(campaign);
  if (run?.status === "passed" && run.reportRoot) {
    return {
      state: "certified",
      latestRunId: run.id,
      reportRoot: run.reportRoot,
      contentHash: run.contentHash,
      publicationEligible: true,
    };
  }
  if (campaign.visibility === "public" && campaign.publicationPolicy === "legacy-public") {
    return {
      state: "legacy",
      latestRunId: run?.id ?? null,
      reportRoot: null,
      contentHash: run?.contentHash ?? null,
      publicationEligible: true,
    };
  }
  return {
    state: unresolvedState(run),
    latestRunId: run?.id ?? null,
    reportRoot: null,
    contentHash: run?.contentHash ?? null,
    publicationEligible: false,
  };
}

export function decideVisibilityChange(
  campaign: CampaignPublicationSource,
  visibility: "public" | "private",
  safety: CampaignSafety,
): { visibility: "public" | "private"; publicationPolicy: "legacy-public" | "certification-required" } {
  if (visibility === "public" && campaign.publicationPolicy === "certification-required" && safety.state !== "certified") {
    throw new PublicationError();
  }
  return {
    visibility,
    publicationPolicy: visibility === "private" ? "certification-required" : campaign.publicationPolicy,
  };
}
