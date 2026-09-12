"use client";

import { useState } from "react";
import { CampaignSettingsFields } from "@/components/create/CampaignSettingsFields";
import {
  settingsErrors,
  toSettingsPayload,
  unixToLocal,
  type CampaignSettingsDraft,
  type Credential,
} from "@/lib/campaign-settings";

/// The same Door and ticket settings as the create form, for a campaign that already exists.
///
/// The panel edits a copy and reports the change only on save, so an owner can look at a date
/// without changing anything. A date already in the past is refused here as well as on the server:
/// the owner should be told before a signature, not after.

export type CampaignSettings = {
  requiredCredential: Credential;
  closeAt: number | null;
  ticketExpiry: number | null;
};

export type SaveState = "idle" | "saving" | "saved" | "error";

export function CampaignSettingsPanel({
  settings,
  now,
  state,
  error,
  onSave,
}: {
  settings: CampaignSettings;
  now: number;
  state: SaveState;
  error?: string;
  onSave: (next: CampaignSettings) => void;
}) {
  const [draft, setDraft] = useState<CampaignSettingsDraft>(() => ({
    requiredCredential: settings.requiredCredential,
    closeAt: settings.closeAt === null ? "" : unixToLocal(settings.closeAt),
    ticketExpiry: settings.ticketExpiry === null ? "" : unixToLocal(settings.ticketExpiry),
  }));
  const invalid = settingsErrors(draft, now);
  const blocked = Boolean(invalid.closeAt || invalid.ticketExpiry);

  // The fields already say what is wrong with a date; saving simply does not happen.
  function save() {
    if (blocked) return;
    const payload = toSettingsPayload(draft);
    onSave({
      requiredCredential: payload.requiredCredential,
      closeAt: payload.closeAt,
      ticketExpiry: payload.ticketExpiry,
    });
  }

  return (
    <section aria-labelledby="campaign-settings-heading" className="space-y-4">
      <h2 id="campaign-settings-heading" className="text-sm">
        Door and tickets
      </h2>

      <CampaignSettingsFields value={draft} onChange={setDraft} now={now} />

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={state === "saving"}
          className="ui-button ui-button--primary"
        >
          {state === "saving" ? "Saving…" : "Save settings"}
        </button>

        {state === "saved" ? (
          <span role="status" className="ui-status" data-tone="certified">
            Saved
          </span>
        ) : null}
      </div>

      {state === "error" && error ? (
        <div role="alert" className="ui-notice" data-tone="error">
          {error}
        </div>
      ) : null}
    </section>
  );
}
