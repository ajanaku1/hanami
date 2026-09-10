import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Receipt, type ReceiptModel } from "@/components/door/Receipt";

afterEach(cleanup);

function model(overrides: Partial<ReceiptModel> = {}): ReceiptModel {
  return {
    decision: "approved",
    attestationHash: `0x${"22".repeat(32)}`,
    attestationPath: "direct",
    nullifier: `0x${"33".repeat(32)}`,
    ticket: { id: "7", expiresAt: 1_759_000_000, status: "live" },
    ticketState: "issued",
    brief: { status: "ready", summary: "2 flips in 7 days", sourcesRead: 7 },
    txHash: `0x${"ab".repeat(32)}`,
    ...overrides,
  };
}

describe("Receipt", () => {
  it("states the decision and the ticket it issued", () => {
    render(<Receipt model={model()} />);

    expect(screen.getByRole("heading", { name: /approved/i })).toBeVisible();
    expect(screen.getByText(/#7/)).toBeVisible();
    expect(screen.getByText(/soulbound · revocable by the owner/i)).toBeVisible();
    expect(screen.getByText(/expires/i)).toBeVisible();
  });

  it("shows the three identifiers a judge can check", () => {
    render(<Receipt model={model()} />);

    const text = document.body.textContent ?? "";
    expect(text).toContain(`0x${"22".repeat(32)}`.slice(0, 10));
    expect(text).toContain(`0x${"ab".repeat(32)}`.slice(0, 10));
    expect(screen.getByText(/proof of human/i)).toBeVisible();
  });

  it("names the attestation path", () => {
    render(<Receipt model={model({ attestationPath: "direct" })} />);
    expect(screen.getByText(/enclave signature|direct/i)).toBeVisible();

    cleanup();
    render(<Receipt model={model({ attestationPath: "router" })} />);
    expect(screen.getByText(/router/i)).toBeVisible();
  });

  it("says how much evidence the bouncer read", () => {
    render(<Receipt model={model()} />);
    expect(screen.getByText(/7 sources/i)).toBeVisible();
  });

  it("carries no ticket on a rejection", () => {
    render(<Receipt model={model({ decision: "rejected", ticket: null, ticketState: "none" })} />);

    expect(screen.getByRole("heading", { name: /not approved|rejected/i })).toBeVisible();
    expect(screen.queryByText(/soulbound/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/#7/)).not.toBeInTheDocument();
  });

  it("says a ticket is still being recovered rather than pretending there is none", () => {
    render(<Receipt model={model({ ticket: null, ticketState: "pending-retry" })} />);

    expect(screen.getByRole("status")).toHaveTextContent(/still being recorded|recovering/i);
    expect(screen.getByRole("heading", { name: /approved/i })).toBeVisible();
  });

  it("never shows another applicant's evidence or the raw brief", () => {
    render(<Receipt model={model()} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/flipsWithin7d|sourcesRead"/);
  });
});
