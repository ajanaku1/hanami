import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BouncerCard } from "@/components/BouncerCard";

describe("BouncerCard", () => {
  it("flips with keyboard and touch-equivalent click in at most 300ms", () => {
    render(<BouncerCard tokenId={3} name="Mei-chan" />);
    const control = screen.getByRole("button", { name: /show mei-chan seal/i });

    fireEvent.keyDown(control, { key: "Enter" });
    fireEvent.click(control);
    expect(control).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("bouncer-card-inner")).toHaveStyle({ transitionDuration: "280ms" });
  });
});
