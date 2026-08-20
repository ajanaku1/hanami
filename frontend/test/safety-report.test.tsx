import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SafetyReport } from "@/components/safety/SafetyReport";
import type { SafetyRun, SafetyScenarioResult } from "@/lib/safety";

const scenarios: SafetyScenarioResult[] = [
  ["T1-gallerist-context", "thoughtful", "approve"],
  ["T2-thoughtful-knowledge", "thoughtful", "approve"],
  ["L1-pure-low-effort", "low-effort", "reject"],
  ["L2-enthusiastic-but-empty", "low-effort", "reject"],
  ["J1-direct-injection", "jailbreak", "reject"],
  ["J2-social-engineering", "jailbreak", "reject"],
  ["J3-roleplay-bypass", "jailbreak", "reject"],
  ["E1-thoughtful-but-flippy", "edge", "reject"],
].map(([id, category, expectedDecision]) => ({
  id,
  category: category as SafetyScenarioResult["category"],
  expectedDecision: expectedDecision as SafetyScenarioResult["expectedDecision"],
  actualDecision: expectedDecision as SafetyScenarioResult["actualDecision"],
  teeVerified: true,
  status: "passed",
  turnCount: 3,
  errorCode: null,
}));

function safetyRun(status: SafetyRun["status"]): SafetyRun {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    scope: "draft",
    slug: "sakura-society",
    ownerAddress: "0x0000000000000000000000000000000000000001",
    contentHash: `0x${"3".repeat(64)}`,
    status,
    completedCount: status === "passed" ? 8 : 2,
    totalCount: 8,
    reportRoot: status === "passed" ? `0x${"b".repeat(64)}` : null,
    error: status === "interrupted"
      ? { code: "INFERENCE_FAILED", message: "Provider unavailable. Resume to continue.", retryable: true }
      : null,
    scenarios: status === "failed"
      ? scenarios.map((item, index) => index === 0
        ? { ...item, actualDecision: "reject", status: "failed" }
        : item)
      : scenarios,
    createdAt: 100,
    updatedAt: 110,
    completedAt: status === "passed" || status === "failed" ? 110 : null,
  };
}

describe("SafetyReport", () => {
  it("renders all eight scenarios with text status and TEE evidence", () => {
    render(<SafetyReport run={safetyRun("passed")} />);
    const table = screen.getByRole("table", { name: /eight-scenario safety matrix/i });

    expect(within(table).getAllByRole("row")).toHaveLength(9);
    expect(screen.getAllByText("Passed")).toHaveLength(8);
    expect(screen.getAllByText(/actual approve/i)).toHaveLength(2);
    expect(screen.getAllByText(/actual reject/i)).toHaveLength(6);
    expect(screen.getAllByText("TEE verified")).toHaveLength(8);
    expect(screen.getByText(`0x${"b".repeat(64)}`)).toBeVisible();
  });

  it("discloses a decision mismatch without private prompts, replies, or reasoning", () => {
    render(<SafetyReport run={safetyRun("failed")} />);

    expect(screen.getByText(/expected approve, received reject/i)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/persona|lorebook|private reply|reasoning/i);
  });

  it("offers resume only for a retryable interruption", () => {
    const onRetry = vi.fn();
    render(<SafetyReport run={safetyRun("interrupted")} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: /resume safety test/i }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(/provider unavailable/i);
  });
});
