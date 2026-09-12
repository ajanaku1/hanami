/// The record pinned to 0G Storage at decision time.
///
/// It is the artifact an auditor reads, so it carries the brief the bouncer was given alongside the
/// turns — evidence and conversation in one place. A missing brief is written as `null` rather than
/// left out, so "no brief was read" cannot be confused with "this file predates briefs".

import type { LedgerBrief } from "./ledger/brief.js";

export type TranscriptInput = {
  campaign: string;
  wallet: string;
  decision: "approved" | "rejected";
  turns: unknown[];
  brief: LedgerBrief | null;
};

export function buildTranscript(input: TranscriptInput): string {
  return JSON.stringify({
    campaign: input.campaign,
    applicant: input.wallet.toLowerCase(),
    decision: input.decision,
    brief: input.brief,
    turns: input.turns,
  });
}
