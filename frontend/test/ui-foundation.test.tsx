import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AsyncNotice } from "@/components/ui/AsyncNotice";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AppHeader } from "@/components/ui/AppHeader";

describe("production UI primitives", () => {
  it("keeps native semantics and visible state text", () => {
    render(
      <>
        <Button busy>Run safety test</Button>
        <Field label="Campaign name" hint="Shown to applicants">
          <input />
        </Field>
        <StatusBadge tone="certified">Certified</StatusBadge>
        <AsyncNotice tone="error">Storage could not be reached.</AsyncNotice>
      </>,
    );

    expect(screen.getByRole("button", { name: /run safety test/i })).toBeDisabled();
    expect(screen.getByLabelText("Campaign name")).toBeVisible();
    expect(screen.getByText("Shown to applicants")).toBeVisible();
    expect(screen.getByText("Certified")).toHaveAttribute("data-tone", "certified");
    expect(screen.getByRole("alert")).toHaveTextContent(/storage could not be reached/i);
  });

  it("exposes a consistent landmark and complete primary navigation", () => {
    render(<AppHeader />);

    const navigation = screen.getByRole("navigation", { name: /primary/i });
    expect(navigation).toBeVisible();
    expect(screen.getByRole("link", { name: /hanami home/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Create" })).toHaveAttribute("href", "/create");
    expect(screen.getByRole("link", { name: "Gallery" })).toHaveAttribute("href", "/gallery");
    expect(screen.getByRole("link", { name: "Mine" })).toHaveAttribute("href", "/mine");
  });

  it("persists an accessible light and dark theme choice", () => {
    window.localStorage.setItem("hanami-theme", "light");
    document.documentElement.dataset.theme = "light";
    const view = render(<AppHeader />);

    const toggle = within(view.container).getByRole("button", { name: "Switch to dark mode" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("hanami-theme")).toBe("dark");
    expect(toggle).toHaveAccessibleName("Switch to light mode");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });
});
