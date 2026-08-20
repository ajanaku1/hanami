export type SafetyScope = "draft" | "campaign";
export type SafetyCategory = "thoughtful" | "low-effort" | "jailbreak" | "edge";
export type SafetyDecision = "approve" | "reject";
export type SafetyActualDecision = SafetyDecision | "no-decision";
export type SafetyScenarioStatus = "pending" | "passed" | "failed" | "interrupted";
export type SafetyRunStatus = "running" | "passed" | "failed" | "interrupted";

export type SafetyScenario = {
  id: string;
  category: SafetyCategory;
  expectedDecision: SafetyDecision;
  messages: readonly string[];
};

export type SafetyScenarioResult = {
  id: string;
  category: SafetyCategory;
  expectedDecision: SafetyDecision;
  actualDecision: SafetyActualDecision | null;
  teeVerified: boolean | null;
  status: SafetyScenarioStatus;
  turnCount: number;
  errorCode: string | null;
};

export type SafetyRunIdentity = {
  scope: SafetyScope;
  slug: string;
  ownerAddress: string;
  contentHash: string;
  personaUri: string;
  lorebookUri: string | null;
};

export type SafetyRunView = SafetyRunIdentity & {
  id: string;
  status: SafetyRunStatus;
  completedCount: number;
  reportRoot: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
  results: SafetyScenarioResult[];
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
};
