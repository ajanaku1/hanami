import { hashBouncerContent } from "./content-hash.js";
import type { SafetyRepository } from "./repository.js";

export type CertificationErrorCode = "CERTIFICATION_REQUIRED" | "CERTIFICATION_MISMATCH";

export class CertificationError extends Error {
  constructor(
    readonly code: CertificationErrorCode,
    readonly status: 403 | 409 = 409,
  ) {
    super(code === "CERTIFICATION_REQUIRED"
      ? "A passing safety report is required."
      : "The safety report does not match this exact campaign draft.");
  }
}

type CertifiedDraftInput = {
  safetyRunId: string;
  slug: string;
  ownerAddress: string;
  persona: string;
  lorebook: string;
};

export async function requireCertifiedDraft(
  repository: SafetyRepository,
  input: CertifiedDraftInput,
): Promise<{ personaUri: string; lorebookUri: string | null; reportRoot: string }> {
  const run = await repository.getRun(input.safetyRunId);
  if (!run || run.scope !== "draft" || run.status !== "passed" || !run.reportRoot) {
    throw new CertificationError("CERTIFICATION_REQUIRED");
  }
  if (run.ownerAddress.toLowerCase() !== input.ownerAddress.toLowerCase()) {
    throw new CertificationError("CERTIFICATION_MISMATCH", 403);
  }
  const matches = run.slug === input.slug
    && run.contentHash === hashBouncerContent(input.persona, input.lorebook);
  if (!matches) throw new CertificationError("CERTIFICATION_MISMATCH");
  return {
    personaUri: run.personaUri,
    lorebookUri: run.lorebookUri,
    reportRoot: run.reportRoot,
  };
}

export function requiredNewCampaignPublication() {
  return {
    visibility: "private" as const,
    publicationPolicy: "certification-required" as const,
  };
}

export async function promoteCertifiedDraft(
  repository: SafetyRepository,
  input: {
    safetyRunId: string;
    slug: string;
    ownerAddress: string;
    personaUri: string;
    lorebookUri: string | null;
  },
): Promise<void> {
  const run = await repository.getRun(input.safetyRunId);
  const promotableScope = run?.scope === "draft" || run?.scope === "campaign";
  if (!run || !promotableScope || run.status !== "passed" || !run.reportRoot) {
    throw new CertificationError("CERTIFICATION_REQUIRED");
  }
  const matches = run.slug === input.slug
    && run.ownerAddress.toLowerCase() === input.ownerAddress.toLowerCase()
    && run.personaUri === input.personaUri
    && run.lorebookUri === input.lorebookUri;
  if (!matches) throw new CertificationError("CERTIFICATION_MISMATCH");
  if (run.scope === "draft") {
    await repository.promoteDraftToCampaign(input.safetyRunId, Math.floor(Date.now() / 1000));
  }
}
