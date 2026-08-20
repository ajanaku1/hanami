import type { SafetyRunIdentity, SafetyScenarioResult } from "./types.js";

type PassingReportInput = Pick<
  SafetyRunIdentity,
  "scope" | "slug" | "ownerAddress" | "contentHash"
> & {
  id: string;
  createdAt: number;
  completedAt: number;
  results: SafetyScenarioResult[];
};

function assertPassing(results: SafetyScenarioResult[]): void {
  const valid = results.length === 8 && results.every((result) =>
    result.status === "passed"
    && result.actualDecision === result.expectedDecision
    && result.teeVerified === true,
  );
  if (!valid) throw new Error("only a complete 8/8 TEE-verified run can produce a passing report");
}

export function serializePassingReport(input: PassingReportInput): string {
  assertPassing(input.results);
  return JSON.stringify({
    schemaVersion: 1,
    product: "hanami",
    runId: input.id,
    scope: input.scope,
    slug: input.slug,
    owner: input.ownerAddress,
    contentHash: input.contentHash,
    startedAt: input.createdAt,
    completedAt: input.completedAt,
    scenarios: input.results.map(({ errorCode: _errorCode, ...result }) => result),
    counts: { correct: 8, teeVerified: 8, total: 8 },
    passed: true,
  });
}
