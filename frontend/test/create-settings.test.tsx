import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignSettingsFields } from "@/components/create/CampaignSettingsFields";
import { localToUnix, settingsErrors, unixToLocal, type CampaignSettingsDraft } from "@/lib/campaign-settings";

afterEach(cleanup);

const NOW = 1_757_000_000;
const DAY = 86_400;

function draft(over: Partial<CampaignSettingsDraft> = {}): CampaignSettingsDraft {
  return { requiredCredential: "orb", closeAt: unixToLocal(NOW + 7 * DAY), ticketExpiry: "", ...over };
}

describe("campaign settings validation", () => {
  it("reads a local datetime back as the instant it names", () => {
    // datetime-local carries minutes, not seconds, so the round trip lands on the minute.
    const minute = Math.floor((NOW + DAY) / 60) * 60;
    expect(localToUnix(unixToLocal(minute))).toBe(minute);
  });

  it("treats an empty datetime as nothing chosen, not as 1970", () => {
    expect(localToUnix("")).toBeNull();
  });

  it("asks for a closing time before the campaign can be created", () => {
    expect(settingsErrors(draft({ closeAt: "" }), NOW).closeAt).toMatch(/closing time/i);
  });

  it("refuses a closing time already in the past", () => {
    expect(settingsErrors(draft({ closeAt: unixToLocal(NOW - DAY) }), NOW).closeAt).toMatch(/past|already/i);
  });

  it("refuses an expiry already in the past", () => {
    expect(settingsErrors(draft({ ticketExpiry: unixToLocal(NOW - DAY) }), NOW).ticketExpiry).toMatch(/past|already/i);
  });

  it("accepts a valid pair with nothing to say", () => {
    expect(settingsErrors(draft({ ticketExpiry: unixToLocal(NOW + 30 * DAY) }), NOW)).toEqual({});
  });

  it("leaves an omitted expiry to the closing time rather than calling it an error", () => {
    expect(settingsErrors(draft(), NOW)).toEqual({});
  });
});

describe("CampaignSettingsFields", () => {
  function renderFields(over: Partial<CampaignSettingsDraft> = {}, onChange = vi.fn()) {
    render(<CampaignSettingsFields value={draft(over)} onChange={onChange} now={NOW} />);
    return onChange;
  }

  it("offers all three credentials as radios", () => {
    renderFields();

    for (const label of [/selfie/i, /orb/i, /device/i]) {
      expect(screen.getByRole("radio", { name: label })).toBeTruthy();
    }
  });

  it("explains each credential in one line rather than leaving the choice bare", () => {
    renderFields();

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/phone/i);
    expect(text).toMatch(/in person|orb/i);
    expect(text).toMatch(/weakest|easiest|lowest/i);
  });

  it("marks the campaign's own credential as chosen", () => {
    renderFields({ requiredCredential: "selfie" });

    expect((screen.getByRole("radio", { name: /selfie/i }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: /orb/i }) as HTMLInputElement).checked).toBe(false);
  });

  it("reports a credential change to its owner", () => {
    const onChange = renderFields();

    fireEvent.click(screen.getByRole("radio", { name: /device/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ requiredCredential: "device" }));
  });

  it("asks for a closing time and marks it required", () => {
    renderFields();

    const close = screen.getByLabelText(/closes/i) as HTMLInputElement;
    expect(close.type).toBe("datetime-local");
    expect(close.required).toBe(true);
  });

  it("says the expiry follows the closing time when it is left empty", () => {
    renderFields();

    expect(document.body.textContent ?? "").toMatch(/follows the closing time|same as/i);
  });

  it("keeps an expiry the owner typed instead of overriding it", () => {
    const onChange = renderFields();
    const expiry = screen.getByLabelText(/expire/i) as HTMLInputElement;

    fireEvent.change(expiry, { target: { value: unixToLocal(NOW + 30 * DAY) } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ticketExpiry: unixToLocal(NOW + 30 * DAY) }));
  });

  it("shows a past closing time as an error the owner can read", () => {
    renderFields({ closeAt: unixToLocal(NOW - DAY) });

    expect(screen.getByRole("alert").textContent).toMatch(/past|already/i);
  });

  it("says nothing alarming when both dates are fine", () => {
    renderFields({ ticketExpiry: unixToLocal(NOW + DAY) });

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
