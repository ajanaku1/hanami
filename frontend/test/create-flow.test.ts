import { describe, expect, it } from "vitest";
import {
  assertReceiptConfirmed,
  INITIAL_CREATE_FLOW,
  nextIncompleteStage,
  stageStatus,
  type CreateFlowState,
} from "@/lib/create-flow";

function flow(overrides: Partial<CreateFlowState>): CreateFlowState {
  return { ...INITIAL_CREATE_FLOW, ...overrides };
}

const prepared: NonNullable<CreateFlowState["prepared"]> = {
  personaURI: "0g://persona",
  lorebookURI: "0g://lorebook",
  imageURI: "0g://image",
  personaRoot: `0x${"1".repeat(64)}`,
  lorebookRoot: `0x${"2".repeat(64)}`,
  imageRoot: `0x${"3".repeat(64)}`,
  safetyReportRoot: `0x${"4".repeat(64)}`,
  backendAddress: "0x0000000000000000000000000000000000000001",
  registryAddress: "0x0000000000000000000000000000000000000002",
  factoryAddress: "0x0000000000000000000000000000000000000003",
};

describe("create transaction flow", () => {
  it("never labels a reverted receipt as confirmed", () => {
    expect(() => assertReceiptConfirmed("reverted", "mint")).toThrow(/mint transaction reverted/i);
    expect(() => assertReceiptConfirmed("success", "mint")).not.toThrow();
  });

  it("distinguishes wallet approval, submission, confirmation, and failure", () => {
    expect(stageStatus("mint", flow({ stage: "mint", status: "wallet" }))).toBe("wallet");
    expect(stageStatus("mint", flow({
      stage: "mint",
      status: "submitted",
      mintTx: `0x${"1".repeat(64)}`,
    }))).toBe("submitted");
    expect(stageStatus("mint", flow({
      stage: "authorize",
      status: "wallet",
      tokenId: BigInt(7),
    }))).toBe("confirmed");
    expect(stageStatus("authorize", flow({
      stage: "authorize",
      status: "failed",
      tokenId: BigInt(7),
    }))).toBe("failed");
  });

  it("retries the first incomplete step without discarding confirmed work", () => {
    const failedAuthorization = flow({
      stage: "authorize",
      status: "failed",
      prepared,
      tokenId: BigInt(7),
      mintTx: `0x${"1".repeat(64)}`,
      authorizeTx: `0x${"2".repeat(64)}`,
      authorizeConfirmed: false,
    });

    expect(nextIncompleteStage(failedAuthorization)).toBe("authorize");
    expect(failedAuthorization.tokenId).toBe(BigInt(7));

    expect(nextIncompleteStage({
      ...failedAuthorization,
      authorizeConfirmed: true,
      campaignAddress: "0x0000000000000000000000000000000000000007",
    })).toBe("index");
  });
});
