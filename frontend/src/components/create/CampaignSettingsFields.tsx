"use client";

import { Field } from "@/components/ui/Field";
import {
  settingsErrors,
  type CampaignSettingsDraft,
  type Credential,
} from "@/lib/campaign-settings";

/// The Door and ticket half of the create form.
///
/// The credential choice is the strictest thing an owner picks here, so each option carries one
/// line saying what it actually asks of an applicant — a choice between three proper nouns is not
/// a choice. Dates are checked as they are typed, because the alternative is finding out after
/// three signed transactions.

const CREDENTIALS: Array<{ value: Credential; label: string; hint: string }> = [
  { value: "orb", label: "Orb", hint: "Verified in person at an Orb. The strongest, and the fewest people hold it." },
  { value: "selfie", label: "Selfie Check", hint: "A liveness check on the applicant's phone. Strong, and widely available." },
  { value: "device", label: "Device", hint: "One person per device. The weakest of the three — easiest to pass, easiest to farm." },
];

export function CampaignSettingsFields({
  value,
  onChange,
  now,
}: {
  value: CampaignSettingsDraft;
  onChange: (next: CampaignSettingsDraft) => void;
  now: number;
}) {
  const errors = settingsErrors(value, now);

  return (
    <section aria-labelledby="door-settings-heading" className="space-y-5">
      <div>
        <h2 id="door-settings-heading" className="text-sm mb-1.5">The Door</h2>
        <p className="text-xs text-[var(--hanami-ink-soft)] max-w-[58ch]">
          Every applicant proves they are a person before the interview starts. One person, one
          attempt.
        </p>
      </div>

      <fieldset className="ui-field">
        <legend className="ui-field__label">Proof this campaign asks for</legend>
        <div className="grid gap-2 mt-2">
          {CREDENTIALS.map((credential) => (
            <label key={credential.value} className="flex gap-3 items-start text-[13px]">
              <input
                type="radio"
                name="requiredCredential"
                value={credential.value}
                checked={value.requiredCredential === credential.value}
                onChange={() => onChange({ ...value, requiredCredential: credential.value })}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{credential.label}</span>
                <span className="block text-[var(--hanami-ink-soft)]">{credential.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Campaign closes" hint="After this, the Door is shut and no one else can apply.">
        <input
          type="datetime-local"
          required
          className="product-input"
          value={value.closeAt}
          onChange={(event) => onChange({ ...value, closeAt: event.target.value })}
        />
      </Field>

      <Field label="Tickets expire" hint="Leave empty and the expiry follows the closing time.">
        <input
          type="datetime-local"
          className="product-input"
          value={value.ticketExpiry}
          onChange={(event) => onChange({ ...value, ticketExpiry: event.target.value })}
        />
      </Field>

      {errors.closeAt || errors.ticketExpiry ? (
        <div role="alert" className="ui-notice" data-tone="error">
          {errors.closeAt ?? errors.ticketExpiry}
        </div>
      ) : null}
    </section>
  );
}
