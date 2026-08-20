import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CampaignSafetyPanel } from "@/components/safety/CampaignSafetyPanel";

describe("Admin safety publication state", () => {
  it("explains the irreversible legacy-public transition without offering a redundant test", () => {
    render(<CampaignSafetyPanel model={{
      safety: {
        state: "legacy",
        latestRunId: null,
        reportRoot: null,
        contentHash: `0x${"3".repeat(64)}`,
        publicationEligible: true,
      },
      isOwner: true,
      busy: false,
      onStart: vi.fn(),
      onResume: vi.fn(),
      run: null,
    }} />);

    expect(screen.getByText("Legacy public")).toBeVisible();
    expect(screen.getByText(/making it private permanently enables the new publication gate/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /run safety test/i })).not.toBeInTheDocument();
  });
});
