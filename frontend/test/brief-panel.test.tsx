import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BriefPanel, type BriefView } from "@/components/door/BriefPanel";

afterEach(cleanup);

function brief(overrides: Partial<BriefView> = {}): BriefView {
  return {
    status: "ready",
    flipsWithin7d: 4,
    sameCounterpartySales: 2,
    medianHoldingDays: 18.5,
    swapCount: 63,
    sourcesRead: [
      { name: "opensea-v2", subgraphId: "sg-opensea", ok: true, count: 120 },
      { name: "looksrare", subgraphId: "sg-looks", ok: true, count: 8 },
      { name: "x2y2", subgraphId: "sg-x2y2", ok: false, count: 0 },
      { name: "uniswap-v3", subgraphId: "sg-uni", ok: true, count: 63 },
    ],
    truncated: false,
    ...overrides,
  };
}

describe("BriefPanel", () => {
  it("says it is reading while the ledger is still being read", () => {
    render(<BriefPanel brief={null} loading />);

    expect(screen.getByRole("status").textContent).toMatch(/reading/i);
    expect(screen.queryByText(/flips/i)).toBeNull();
  });

  it("shows all four figures once the brief is ready", () => {
    render(<BriefPanel brief={brief()} />);

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/4/);
    expect(text).toMatch(/sold within 7 days/i);
    expect(text).toMatch(/back to the same/i);
    expect(text).toMatch(/18\.5/);
    expect(text).toMatch(/63/);
  });

  it("names the sources it read and the ones it could not", () => {
    render(<BriefPanel brief={brief()} />);

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/opensea-v2/);
    expect(text).toMatch(/looksrare/);
    expect(text).toMatch(/uniswap-v3/);
    expect(text).toMatch(/x2y2/);
    // The row, not the label: a failed source has to read as failed where it is named.
    expect(screen.getByText(/x2y2/).closest("li")?.textContent).toMatch(/unavailable|not read/i);
  });

  it("says in words that this is evidence and not the decision", () => {
    render(<BriefPanel brief={brief()} />);

    expect(document.body.textContent ?? "").toMatch(/evidence/i);
    expect(document.body.textContent ?? "").toMatch(/does not decide|not a verdict/i);
  });

  it("admits when a page cap hid older activity", () => {
    render(<BriefPanel brief={brief({ truncated: true })} />);
    expect(document.body.textContent ?? "").toMatch(/older activity/i);
  });

  it("says nothing about truncation when nothing was truncated", () => {
    render(<BriefPanel brief={brief()} />);
    expect(document.body.textContent ?? "").not.toMatch(/older activity/i);
  });

  it("reports an unmatched history as unknown rather than as zero days", () => {
    render(<BriefPanel brief={brief({ medianHoldingDays: null })} />);

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/unknown|no matched/i);
    expect(text).not.toMatch(/0 days/);
  });

  it("tells a fresh wallet its history is empty, and that this is not a refusal", () => {
    render(<BriefPanel brief={brief({ status: "empty" })} />);

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/no trading history|empty/i);
    expect(text).not.toMatch(/sold within 7 days/i);
    expect(text).toMatch(/interview|goes ahead|continues/i);
  });

  it("says the ledger could not be read, and that the interview goes ahead anyway", () => {
    render(<BriefPanel brief={brief({ status: "unavailable" })} />);

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/could not be read|unavailable/i);
    expect(text).toMatch(/interview|goes ahead|continues/i);
    expect(text).not.toMatch(/18\.5/);
  });

  it("shows nothing at all before a read has been asked for", () => {
    const { container } = render(<BriefPanel brief={null} />);
    expect(container.textContent).toBe("");
  });

  it("carries a heading and status text, not colour alone", () => {
    render(<BriefPanel brief={brief()} />);

    expect(screen.getByRole("heading", { name: /ledger/i })).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("never prints raw field names or proof material", () => {
    render(<BriefPanel brief={brief()} />);

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/flipsWithin7d|sameCounterpartySales|nullifier/);
  });
});
