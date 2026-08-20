import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketCard } from "@/components/MarketCard";
import type { Campaign } from "@/lib/api";

const campaign: Campaign = {
  slug: "sakura-society",
  name: "Sakura Society",
  bouncer_token_id: 3,
  bouncer_address: "0x0000000000000000000000000000000000000001",
  campaign_address: "0x0000000000000000000000000000000000000002",
  target_chain: "base",
  wl_size_cap: 100,
  persona_uri: `0g://0x${"a".repeat(64)}`,
  lorebook_uri: null,
  image_uri: null,
  owner_address: "0x0000000000000000000000000000000000000003",
  finalized_at: null,
  merkle_root: null,
  visibility: "public",
  publication_policy: "certification-required",
  safety: { state: "certified", latestRunId: "run-1", reportRoot: `0x${"b".repeat(64)}`, contentHash: `0x${"3".repeat(64)}`, publicationEligible: true },
  rep_score: 4,
  created_at: 100,
  approved_count: 12,
  rejected_count: 5,
  pending_count: 2,
};

describe("MarketCard", () => {
  it("shows certification, owner, capacity, destination, and apply action without hover", () => {
    render(<MarketCard c={campaign} />);

    expect(screen.getByText("Certified")).toBeVisible();
    expect(screen.getByText(/0x0000…0003/i)).toBeVisible();
    expect(screen.getByText("12 / 100 approved")).toBeVisible();
    expect(screen.getByText("Base")).toBeVisible();
    expect(screen.getByRole("link", { name: /apply/i })).toBeVisible();
  });
});
