import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DoorPanel, type DoorModel } from "@/components/door/DoorPanel";

// The widget itself talks to World App over a bridge; the panel's contract is what it renders
// around it and which preset it asks for, so the widget is stubbed and its props recorded.
const widgetProps: Record<string, unknown>[] = [];
vi.mock("@worldcoin/idkit", () => ({
  IDKitRequestWidget: (props: Record<string, unknown>) => {
    widgetProps.push(props);
    return null;
  },
  orbLegacy: (opts: unknown) => ({ preset: "orbLegacy", opts }),
  selfieCheckLegacy: (opts: unknown) => ({ preset: "selfieCheckLegacy", opts }),
  deviceLegacy: (opts: unknown) => ({ preset: "deviceLegacy", opts }),
}));

// This project does not enable Vitest globals, so React Testing Library's automatic cleanup never
// runs. Without this, one test's DOM is still mounted while the next one queries.
afterEach(cleanup);

const WALLET = "0x00000000000000000000000000000000000000aa";

function model(overrides: Partial<DoorModel> = {}): DoorModel {
  return {
    state: "none",
    requiredCredential: "orb",
    method: null,
    wallet: WALLET,
    appId: "app_test",
    action: "hanami-door",
    rpContext: { rp_id: "rp_test", nonce: "n", created_at: 1, expires_at: 2, signature: "0xsig" },
    onProof: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

describe("DoorPanel", () => {
  it("asks for a proof before the interview and names the credential", () => {
    render(<DoorPanel model={model()} />);

    expect(screen.getByRole("heading", { name: /the door/i })).toBeVisible();
    expect(screen.getByText(/orb/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /verify with world id/i })).toBeVisible();
  });

  it("chooses the preset the campaign requires", () => {
    widgetProps.length = 0;
    render(<DoorPanel model={model({ requiredCredential: "selfie" })} />);
    expect((widgetProps[0]?.preset as { preset: string }).preset).toBe("selfieCheckLegacy");

    widgetProps.length = 0;
    render(<DoorPanel model={model({ requiredCredential: "device" })} />);
    expect((widgetProps[0]?.preset as { preset: string }).preset).toBe("deviceLegacy");
  });

  it("signs the wallet as the signal so the proof is bound to it", () => {
    widgetProps.length = 0;
    render(<DoorPanel model={model()} />);

    const preset = widgetProps[0]?.preset as { opts: { signal: string } };
    expect(preset.opts.signal).toBe(WALLET);
    expect(widgetProps[0]?.app_id).toBe("app_test");
    expect(widgetProps[0]?.action).toBe("hanami-door");
    expect(widgetProps[0]?.rp_context).toEqual({
      rp_id: "rp_test",
      nonce: "n",
      created_at: 1,
      expires_at: 2,
      signature: "0xsig",
    });
  });

  it("shows progress while the proof is being checked", () => {
    render(<DoorPanel model={model({ state: "pending" })} />);

    expect(screen.getByRole("status")).toHaveTextContent(/checking/i);
    expect(screen.queryByRole("button", { name: /verify with world id/i })).not.toBeInTheDocument();
  });

  it("confirms a verified door in words, not only in colour", () => {
    render(<DoorPanel model={model({ state: "verified", method: "orb" })} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/verified/i);
    expect(status).toHaveTextContent(/orb/i);
    expect(screen.queryByRole("button", { name: /verify with world id/i })).not.toBeInTheDocument();
  });

  it("offers a retry after a rejected proof", () => {
    render(<DoorPanel model={model({ state: "rejected" })} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/could not be verified/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  it("tells a person who has already applied that it is over, with no retry", () => {
    render(<DoorPanel model={model({ state: "used" })} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/already applied/i);
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /verify with world id/i })).not.toBeInTheDocument();
  });

  it("separates a verifier being down from a refusal, and lets the applicant retry", () => {
    render(<DoorPanel model={model({ state: "unavailable" })} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/could not be reached/i);
    expect(alert).not.toHaveTextContent(/rejected/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  it("states a closed campaign without offering the Door", () => {
    render(<DoorPanel model={model({ state: "closed" })} />);

    expect(screen.getByRole("status")).toHaveTextContent(/closed/i);
    expect(screen.queryByRole("button", { name: /verify with world id/i })).not.toBeInTheDocument();
  });

  it("states a full campaign without offering the Door", () => {
    render(<DoorPanel model={model({ state: "full" })} />);

    expect(screen.getByRole("status")).toHaveTextContent(/full/i);
    expect(screen.queryByRole("button", { name: /verify with world id/i })).not.toBeInTheDocument();
  });

  it("waits for a wallet before offering the Door", () => {
    render(<DoorPanel model={model({ wallet: null })} />);

    expect(screen.getByRole("status")).toHaveTextContent(/connect/i);
    expect(screen.queryByRole("button", { name: /verify with world id/i })).not.toBeInTheDocument();
  });

  it("moves focus to the outcome so a screen reader hears it", () => {
    const { rerender } = render(<DoorPanel model={model({ state: "pending" })} />);
    rerender(<DoorPanel model={model({ state: "verified", method: "orb" })} />);

    expect(screen.getByRole("status")).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(screen.getByRole("status"));
  });

  it("never renders proof material", () => {
    render(<DoorPanel model={model({ state: "verified", method: "orb" })} />);
    expect(document.body.textContent).not.toMatch(/nullifier|merkle|proof:/i);
  });
});
