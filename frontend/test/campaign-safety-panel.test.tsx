import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CampaignSafetyPanel } from "@/components/safety/CampaignSafetyPanel";

describe("CampaignSafetyPanel", () => {
  it("shows a certified publication state and its 0G evidence", () => {
    render(<CampaignSafetyPanel model={{
      safety: { state: "certified", latestRunId: "run-1", reportRoot: `0x${"b".repeat(64)}`, contentHash: `0x${"3".repeat(64)}`, publicationEligible: true },
      isOwner: true,
      busy: false,
      onStart: vi.fn(),
      onResume: vi.fn(),
      run: null,
    }} />);

    expect(screen.getByText("Certified to publish")).toBeVisible();
    expect(screen.getByText(`0x${"b".repeat(64)}`)).toBeVisible();
  });

  it("gives the owner one clear action when certification is required", () => {
    const onStart = vi.fn();
    render(<CampaignSafetyPanel model={{
      safety: { state: "required", latestRunId: null, reportRoot: null, contentHash: `0x${"3".repeat(64)}`, publicationEligible: false },
      isOwner: true,
      busy: false,
      onStart,
      onResume: vi.fn(),
      run: null,
    }} />);

    fireEvent.click(screen.getByRole("button", { name: /run safety test/i }));
    expect(onStart).toHaveBeenCalledOnce();
    expect(screen.getByText(/publication remains locked/i)).toBeVisible();
  });
});
