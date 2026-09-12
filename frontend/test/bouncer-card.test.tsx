import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BouncerCard } from "@/components/BouncerCard";

// Globals are off in this project, so RTL's automatic cleanup never runs.
afterEach(cleanup);

describe("BouncerCard", () => {
  it("flips with keyboard and touch-equivalent click in at most 300ms", () => {
    render(<BouncerCard tokenId={3} name="Mei-chan" />);
    const control = screen.getByRole("button", { name: /show mei-chan seal/i });

    fireEvent.keyDown(control, { key: "Enter" });
    fireEvent.click(control);
    expect(control).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("bouncer-card-inner")).toHaveStyle({ transitionDuration: "280ms" });
  });

  it("names how many tickets are live when the campaign issues them", () => {
    render(<BouncerCard tokenId={3} name="Mei-chan" liveTicketCount={4} />);

    expect(screen.getByText(/4 live tickets/i)).toBeVisible();
  });

  it("says one ticket in the singular", () => {
    render(<BouncerCard tokenId={3} name="Mei-chan" liveTicketCount={1} />);

    expect(screen.getByText(/1 live ticket\b/i)).toBeVisible();
  });

  it("says nothing about tickets for a campaign that issues none", () => {
    render(<BouncerCard tokenId={3} name="Mei-chan" />);

    expect(document.body.textContent ?? "").not.toMatch(/live ticket/i);
  });
});
