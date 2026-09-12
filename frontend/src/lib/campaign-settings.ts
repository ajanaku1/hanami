/// The Door and ticket settings an owner chooses when creating a campaign, and the rules the
/// browser checks before three transactions are signed against them.
///
/// Dates are held as `datetime-local` strings, which is what the input gives us and what the owner
/// reads back. They become unix seconds only at the edge, on the way to the backend, which applies
/// the same rules again — this check is here so a mistyped year is caught before a mint, not to be
/// the only check.

export type Credential = "selfie" | "orb" | "device";

export type CampaignSettingsDraft = {
  requiredCredential: Credential;
  /// `datetime-local` value; empty means nothing chosen yet.
  closeAt: string;
  /// Empty means the ticket expiry follows the closing time.
  ticketExpiry: string;
};

export type SettingsErrors = { closeAt?: string; ticketExpiry?: string };

export function localToUnix(local: string): number | null {
  if (!local) return null;
  const ms = new Date(local).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

export function unixToLocal(unix: number): string {
  const at = new Date(unix * 1000);
  // `datetime-local` reads wall-clock time, so the offset has to come off before slicing.
  const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function settingsErrors(draft: CampaignSettingsDraft, now: number): SettingsErrors {
  const errors: SettingsErrors = {};

  const closeAt = localToUnix(draft.closeAt);
  if (closeAt === null) {
    errors.closeAt = "Choose a closing time for this campaign.";
  } else if (closeAt <= now) {
    errors.closeAt = "That closing time has already passed.";
  }

  const expiry = localToUnix(draft.ticketExpiry);
  if (expiry !== null && expiry <= now) {
    errors.ticketExpiry = "That expiry has already passed.";
  }

  return errors;
}

/// What the backend is sent: seconds, with an omitted expiry left for the server to default.
export function toSettingsPayload(draft: CampaignSettingsDraft) {
  return {
    requiredCredential: draft.requiredCredential,
    closeAt: localToUnix(draft.closeAt),
    ticketExpiry: localToUnix(draft.ticketExpiry),
  };
}
