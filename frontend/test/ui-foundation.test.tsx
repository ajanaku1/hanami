import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AsyncNotice } from "@/components/ui/AsyncNotice";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AppHeader } from "@/components/ui/AppHeader";
import { BriefPanel } from "@/components/door/BriefPanel";
import { Receipt } from "@/components/door/Receipt";
import { RosterTable } from "@/components/roster/RosterTable";

// Globals are off in this project, so RTL's automatic cleanup never runs.
afterEach(cleanup);

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

// ---------------------------------------------------------------- feature 002 surfaces
//
// The two reference viewports are 390x844 and 1280x800. jsdom does not lay anything out, so what is
// asserted here is what actually decides whether these surfaces read at 390px: that the one wide
// thing scrolls in its own container instead of pushing the page sideways, that nothing carries a
// fixed width wider than the narrow viewport, and that every state is named in words rather than
// signalled by colour alone.

const NARROW = 390;

describe("Door, Brief, Receipt and Roster at both viewports", () => {
  const rosterRows = [
    {
      wallet: "0x00000000000000000000000000000000000000aa",
      ticketId: "7",
      issuedAt: 1_757_000_100,
      expiresAt: 1_759_000_000,
      status: "live" as const,
      briefSummary: "Ledger brief ready",
      viaAgent: null,
    },
  ];

  const brief = {
    status: "ready" as const,
    flipsWithin7d: 4,
    sameCounterpartySales: 1,
    medianHoldingDays: 18.5,
    swapCount: 63,
    sourcesRead: [{ name: "opensea-v2", subgraphId: "sg", ok: true, count: 12 }],
    truncated: false,
  };

  const receipt = {
    decision: "approved" as const,
    attestationHash: `0x${"cd".repeat(32)}`,
    attestationPath: "direct" as const,
    nullifier: `0x${"33".repeat(32)}`,
    ticket: { id: "7", expiresAt: 1_759_000_000, status: "live" },
    ticketState: "issued" as const,
    brief: { status: "ready" as const, summary: "2 flips", sourcesRead: 6 },
    txHash: `0x${"ab".repeat(32)}`,
  };

  it("gives the roster's wide table its own scroll container, so the page never scrolls sideways", () => {
    const { container } = render(<RosterTable rows={rosterRows} onRevoke={() => {}} />);

    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    const scroller = table?.closest("div");
    expect(scroller?.className).toMatch(/overflow-x-auto/);
  });

  it("keeps every column labelled, so a scrolled table is still readable", () => {
    render(<RosterTable rows={rosterRows} onRevoke={() => {}} />);

    for (const column of ["Holder", "Ticket", "Issued", "Expires", "Status", "Evidence", "Action"]) {
      expect(screen.getByRole("columnheader", { name: column })).toBeVisible();
    }
  });

  it("gives each new surface a heading, so they are navigable by structure", () => {
    render(
      <>
        <BriefPanel brief={brief} />
        <Receipt model={receipt} />
      </>,
    );

    expect(screen.getByRole("heading", { name: /ledger brief/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: /approved/i })).toBeVisible();
  });

  it("names every state in words rather than by colour", () => {
    render(
      <>
        <BriefPanel brief={{ ...brief, status: "unavailable" }} />
        <RosterTable rows={rosterRows} onRevoke={() => {}} />
      </>,
    );

    expect(screen.getByRole("status").textContent).toMatch(/could not be read/i);
    expect(screen.getByText(/^live$/i)).toBeVisible();
  });

  it("puts anything wider than the narrow viewport inside its own scroller, never on the page", () => {
    const { container } = render(
      <>
        <BriefPanel brief={brief} />
        <Receipt model={receipt} />
        <RosterTable rows={rosterRows} onRevoke={() => {}} />
      </>,
    );

    for (const element of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
      for (const match of element.className.toString().matchAll(/(?:^|\s)(?:min-)?w-\[(\d+)px\]/g)) {
        if (Number(match[1]) <= NARROW) continue;
        // A table is allowed to be wider than the phone; the page is not. The exception is only an
        // exception inside a container that scrolls horizontally on its own.
        const scroller = element.closest(".overflow-x-auto");
        expect(scroller, `${element.tagName} is ${match[1]}px wide outside a scroller`).not.toBeNull();
      }
    }
  });

  it("announces the brief's progress to a screen reader while it is being read", () => {
    render(<BriefPanel brief={null} loading />);

    expect(screen.getByRole("status").textContent).toMatch(/reading/i);
  });

  it("keeps the one destructive action reachable and named", () => {
    render(<RosterTable rows={rosterRows} onRevoke={() => {}} />);

    const revoke = screen.getByRole("button", { name: /revoke/i });
    expect(revoke).toBeVisible();
    expect(revoke).toHaveAccessibleName();
  });
});
