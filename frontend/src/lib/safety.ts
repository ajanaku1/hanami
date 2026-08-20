export type SafetyScope = "draft" | "campaign";
export type SafetyRunStatus = "running" | "passed" | "failed" | "interrupted";
export type SafetyDecision = "approve" | "reject";

export type SafetyScenarioResult = {
  id: string;
  category: "thoughtful" | "low-effort" | "jailbreak" | "edge";
  expectedDecision: SafetyDecision;
  actualDecision: SafetyDecision | "no-decision" | null;
  teeVerified: boolean | null;
  status: "pending" | "passed" | "failed" | "interrupted";
  turnCount: number;
  errorCode: string | null;
};

export type SafetyRun = {
  id: string;
  scope: SafetyScope;
  slug: string;
  ownerAddress: string;
  contentHash: string;
  status: SafetyRunStatus;
  completedCount: number;
  totalCount: 8;
  reportRoot: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
  scenarios: SafetyScenarioResult[];
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
};

export type SafetyAuthorization = {
  caller: string;
  nonce: number;
  signature: string;
};

export type StartSafetyRun = SafetyAuthorization & {
  scope: SafetyScope;
  slug: string;
  persona?: string;
  lorebook?: string;
};

export type SafetyClient = {
  start: (request: StartSafetyRun) => Promise<SafetyRun>;
  get: (runId: string) => Promise<SafetyRun>;
  resume: (runId: string, authorization: SafetyAuthorization) => Promise<SafetyRun>;
};

export function buildSafetyAuthorizationMessage(input: {
  scope: SafetyScope;
  slug: string;
  contentHash: string;
  nonce: number;
}): string {
  return `Hanami: test ${input.scope} ${input.slug} content ${input.contentHash} at ${input.nonce}`;
}
