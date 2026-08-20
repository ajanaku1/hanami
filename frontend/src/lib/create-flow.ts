import type { Address, Hex } from "viem";
import type { PrepareCampaignResult } from "@/lib/api";

export type CreateStage = "prepare" | "mint" | "authorize" | "campaign" | "index" | "done";
export type CreateStageStatus =
  | "pending"
  | "active"
  | "wallet"
  | "submitted"
  | "confirmed"
  | "done"
  | "failed";

export type CreateFlowState = {
  stage: CreateStage;
  status: CreateStageStatus;
  prepared: PrepareCampaignResult | null;
  tokenId: bigint | null;
  mintTx: Hex | null;
  authorizeTx: Hex | null;
  authorizeConfirmed: boolean;
  campaignAddress: Address | null;
  campaignTx: Hex | null;
};

export const CREATE_STAGES: CreateStage[] = ["prepare", "mint", "authorize", "campaign", "index"];

export const INITIAL_CREATE_FLOW: CreateFlowState = {
  stage: "prepare",
  status: "pending",
  prepared: null,
  tokenId: null,
  mintTx: null,
  authorizeTx: null,
  authorizeConfirmed: false,
  campaignAddress: null,
  campaignTx: null,
};

const TRANSACTION_STAGES = new Set<CreateStage>(["mint", "authorize", "campaign"]);

export function stageStatus(stage: CreateStage, flow: CreateFlowState): CreateStageStatus {
  const currentIndex = CREATE_STAGES.indexOf(flow.stage);
  const stageIndex = CREATE_STAGES.indexOf(stage);
  if (stageIndex < currentIndex) return TRANSACTION_STAGES.has(stage) ? "confirmed" : "done";
  if (stageIndex > currentIndex) return "pending";
  return flow.status;
}

export function nextIncompleteStage(flow: CreateFlowState): CreateStage {
  if (!flow.prepared) return "prepare";
  if (flow.tokenId === null) return "mint";
  if (!flow.authorizeConfirmed) return "authorize";
  if (!flow.campaignAddress) return "campaign";
  return "index";
}

export function assertReceiptConfirmed(
  status: "success" | "reverted",
  stage: "mint" | "authorize" | "campaign",
): void {
  if (status === "reverted") throw new Error(`${stage} transaction reverted on 0G. Safe to retry.`);
}
