/// The owner's controls over the Door and the tickets it leads to: which credential this campaign
/// asks for, when it closes, and how long a ticket stays live.
///
/// Two rules shape the validation. A closing time or an expiry already in the past is refused
/// rather than accepted and quietly ignored — an owner who mistypes a date should be told, not
/// left with a campaign that is already shut. And an expiry that was not given follows the closing
/// time, because a ticket outliving its campaign is a decision, not a default.

import { Hono } from "hono";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { authorizeOwner } from "./roster.js";

export type Credential = "selfie" | "orb" | "device";

export type Settings = {
  requiredCredential: Credential;
  closeAt: number | null;
  ticketExpiry: number | null;
};

export type SettingsInput = {
  requiredCredential?: string | null;
  closeAt?: number | null;
  ticketExpiry?: number | null;
};

export type Resolved = { ok: true; value: Settings } | { ok: false; error: string };

const CREDENTIALS: Credential[] = ["selfie", "orb", "device"];

export function resolveSettings(input: SettingsInput, now: number): Resolved {
  const credential = input.requiredCredential ?? "orb";
  if (!CREDENTIALS.includes(credential as Credential)) {
    return { ok: false, error: `unknown credential: ${credential}` };
  }

  const closeAt = input.closeAt ?? null;
  if (closeAt !== null && closeAt <= now) {
    return { ok: false, error: "the closing time has already passed" };
  }

  // No closing time means no default expiry to inherit; the owner has to say one or leave both open.
  const ticketExpiry = input.ticketExpiry ?? closeAt;
  if (ticketExpiry !== null && ticketExpiry <= now) {
    return { ok: false, error: "the ticket expiry has already passed" };
  }

  return { ok: true, value: { requiredCredential: credential as Credential, closeAt, ticketExpiry } };
}

const settingsBody = z.object({
  caller: z.string(),
  nonce: z.number(),
  signature: z.string(),
  requiredCredential: z.string().optional(),
  closeAt: z.number().int().nullable().optional(),
  ticketExpiry: z.number().int().nullable().optional(),
});

export function createSettingsRoutes(deps: { db: Client; now: () => number }): Hono {
  const app = new Hono();

  app.post("/:slug/settings", async (c) => {
    const slug = c.req.param("slug");
    const parsed = settingsBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "not authorized" }, 401);

    const owned = await authorizeOwner(deps.db, slug, `settings ${slug}`, parsed.data);
    if ("error" in owned) return c.json({ error: owned.error }, owned.status);

    const resolved = resolveSettings(parsed.data, deps.now());
    if (!resolved.ok) return c.json({ error: resolved.error }, 422);

    await deps.db.execute({
      sql: "UPDATE campaigns SET required_credential = ?, close_at = ?, ticket_expiry = ? WHERE slug = ?",
      args: [resolved.value.requiredCredential, resolved.value.closeAt, resolved.value.ticketExpiry, slug],
    });

    return c.json(resolved.value);
  });

  return app;
}
