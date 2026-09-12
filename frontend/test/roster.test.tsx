import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RosterTable } from "@/components/roster/RosterTable";
import { RevokeButton } from "@/components/roster/RevokeButton";
import { CampaignSettingsPanel } from "@/components/roster/CampaignSettingsPanel";
import { unixToLocal } from "@/lib/campaign-settings";
import type { RosterRow } from "@/lib/api";

afterEach(cleanup);

const rows: RosterRow[] = [
  {
    wallet: "0x00000000000000000000000000000000000000aa",
    ticketId: "7",
    issuedAt: 1_757_000_100,
    expiresAt: 1_759_000_000,
    status: "live",
    briefSummary: "Ledger brief ready",
    viaAgent: null,
  },
  {
    wallet: "0x00000000000000000000000000000000000000bb",
    ticketId: "8",
    issuedAt: 1_757_000_200,
    expiresAt: 1_759_000_000,
    status: "revoked",
    briefSummary: "No on-chain record found",
    viaAgent: "0x00000000000000000000000000000000000000a9",
  },
  {
    wallet: "0x00000000000000000000000000000000000000cc",
    ticketId: "9",
    issuedAt: 1_757_000_300,
    expiresAt: 1_757_100_000,
    status: "expired",
    briefSummary: "Ledger brief unavailable",
    viaAgent: null,
  },
];

describe("RosterTable", () => {
  it("lists every ticket with its wallet, id, expiry and evidence", () => {
    render(<RosterTable rows={rows} onRevoke={vi.fn()} />);

    expect(screen.getAllByRole("row")).toHaveLength(4); // header plus three
    expect(screen.getByText("#7")).toBeVisible();
    expect(screen.getByText(/ledger brief ready/i)).toBeVisible();
  });

  it("names each status in words", () => {
    render(<RosterTable rows={rows} onRevoke={vi.fn()} />);

    expect(screen.getByText(/^live$/i)).toBeVisible();
    expect(screen.getByText(/^revoked$/i)).toBeVisible();
    expect(screen.getByText(/^expired$/i)).toBeVisible();
  });

  it("marks the applications that came through an agent", () => {
    render(<RosterTable rows={rows} onRevoke={vi.fn()} />);
    expect(screen.getAllByText(/via agent/i)).toHaveLength(1);
  });

  it("offers revoke only where there is something live to revoke", () => {
    render(<RosterTable rows={rows} onRevoke={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /revoke/i })).toHaveLength(1);
  });

  it("says so plainly when nobody holds a ticket yet", () => {
    render(<RosterTable rows={[]} onRevoke={vi.fn()} />);
    expect(screen.getByText(/no tickets issued yet/i)).toBeVisible();
  });
});

describe("RevokeButton", () => {
  it("asks for confirmation before doing anything", () => {
    const onRevoke = vi.fn();
    render(<RevokeButton ticketId="7" onRevoke={onRevoke} />);

    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    expect(onRevoke).not.toHaveBeenCalled();
    expect(screen.getByText(/this cannot be undone/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onRevoke).toHaveBeenCalledWith("7");
  });

  it("names the network while the wallet is signing", () => {
    render(<RevokeButton ticketId="7" onRevoke={vi.fn()} state="pending" />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/0g/i);
    expect(status).toHaveTextContent(/confirm in your wallet|waiting/i);
  });

  it("confirms success in words", () => {
    render(<RevokeButton ticketId="7" onRevoke={vi.fn()} state="success" />);
    expect(screen.getByRole("status")).toHaveTextContent(/revoked/i);
    expect(screen.queryByRole("button", { name: /^revoke$/i })).not.toBeInTheDocument();
  });

  it("offers a retry after a failure and says what failed", () => {
    const onRevoke = vi.fn();
    render(<RevokeButton ticketId="7" onRevoke={onRevoke} state="error" error="the wallet rejected the request" />);

    expect(screen.getByRole("alert")).toHaveTextContent(/the wallet rejected the request/i);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRevoke).toHaveBeenCalledWith("7");
  });

  it("cannot be fired twice while a revoke is in flight", () => {
    const onRevoke = vi.fn();
    render(<RevokeButton ticketId="7" onRevoke={onRevoke} state="pending" />);
    expect(screen.queryByRole("button", { name: /^revoke$/i })).not.toBeInTheDocument();
    expect(onRevoke).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- owner settings (US5)

describe("CampaignSettingsPanel", () => {
  // Minute-aligned: datetime-local carries minutes, so a round trip through the fields would
  // otherwise drop the seconds and make the saved value look wrong.
  const NOW = 1_756_999_980;
  const DAY = 86_400;

  function panel(over: Partial<React.ComponentProps<typeof CampaignSettingsPanel>> = {}) {
    const onSave = vi.fn();
    render(
      <CampaignSettingsPanel
        settings={{ requiredCredential: "orb", closeAt: NOW + 7 * DAY, ticketExpiry: null }}
        now={NOW}
        state="idle"
        onSave={onSave}
        {...over}
      />,
    );
    return onSave;
  }

  it("shows the campaign's current credential and dates", () => {
    panel();

    expect((screen.getByRole("radio", { name: /orb/i }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/closes/i) as HTMLInputElement).value).toBe(unixToLocal(NOW + 7 * DAY));
  });

  it("leaves an unset expiry empty rather than filling in a date the owner never chose", () => {
    panel();
    expect((screen.getByLabelText(/expire/i) as HTMLInputElement).value).toBe("");
  });

  it("saves the settings the owner changed, in seconds", () => {
    const onSave = panel();

    fireEvent.click(screen.getByRole("radio", { name: /selfie/i }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ requiredCredential: "selfie", closeAt: NOW + 7 * DAY }),
    );
  });

  it("refuses to save a date already past, and says why", () => {
    const onSave = panel({ settings: { requiredCredential: "orb", closeAt: NOW - DAY, ticketExpiry: null } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/past|already/i);
  });

  it("says the door is open on this campaign and which proof it asks for", () => {
    panel();
    expect(document.body.textContent ?? "").toMatch(/door/i);
  });

  it("reports a save in flight and cannot be fired twice", () => {
    const onSave = panel({ state: "saving" });

    const button = screen.getByRole("button", { name: /saving|save/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("confirms a save in words", () => {
    panel({ state: "saved" });
    expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
  });

  it("shows what failed and leaves the settings in place to try again", () => {
    panel({ state: "error", error: "not owner" });

    expect(screen.getByRole("alert")).toHaveTextContent(/not owner/i);
    expect((screen.getByRole("button", { name: /save/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});
