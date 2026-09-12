import { Hono } from "hono";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { verifyMessage } from "viem";
import type { Address } from "viem";

/// The owner's view of who holds a ticket, and the one action they can take on it.
///
/// A ticket's status is read from the chain every time, never from the database. The database
/// knows a ticket was minted; only the chain knows whether it is still live, because expiry is a
/// function of time and revocation can happen from any wallet the owner is sitting at.

export type TicketStatus = "live" | "expired" | "revoked";

export type ChainTicket = { live: boolean; revoked: boolean; expiresAt: number };

export type RosterRow = {
  wallet: string;
  ticketId: string;
  issuedAt: number | null;
  expiresAt: number;
  status: TicketStatus;
  briefSummary: string;
  viaAgent: string | null;
};

export type RosterDeps = {
  readTickets: (ticketIds: string[]) => Promise<Record<string, ChainTicket>>;
  now: () => number;
};

export type RosterRouteDeps = RosterDeps & {
  db: Client;
  prepareRevoke: (campaign: Address, ticketId: bigint) => { to: string; data: string; chainId: number };
};

/// One line about the evidence the bouncer read. The brief itself is the applicant's and is not
/// republished on the owner's screen.
function summarise(briefJson: string | null): string {
  if (!briefJson) return "No brief recorded";
  try {
    const status = String((JSON.parse(briefJson) as { status?: string }).status ?? "");
    if (status === "ready") return "Ledger brief ready";
    if (status === "empty") return "No on-chain record found";
    if (status === "unavailable") return "Ledger brief unavailable";
  } catch {
    // A brief we cannot read is not worth guessing about.
  }
  return "No brief recorded";
}

function statusOf(ticket: ChainTicket, now: number): TicketStatus {
  // Revocation outranks expiry: an owner who withdrew a pass should see that they withdrew it,
  // not that it happened to lapse.
  if (ticket.revoked) return "revoked";
  if (ticket.live) return "live";
  return ticket.expiresAt !== 0 && now >= ticket.expiresAt ? "expired" : "revoked";
}

export async function buildRoster(db: Client, deps: RosterDeps, slug: string): Promise<RosterRow[]> {
  const res = await db.execute({
    sql:
      "SELECT wallet_address, ticket_id, finished_at, brief_json, agent_id FROM applicants " +
      "WHERE campaign_slug = ? AND ticket_id IS NOT NULL ORDER BY id ASC",
    args: [slug],
  });

  const ids = res.rows.map((row) => String(row.ticket_id));
  const chain = ids.length > 0 ? await deps.readTickets(ids) : {};
  const now = deps.now();

  return res.rows.map((row) => {
    const ticketId = String(row.ticket_id);
    const ticket = chain[ticketId] ?? { live: false, revoked: false, expiresAt: 0 };
    return {
      wallet: String(row.wallet_address),
      ticketId,
      issuedAt: row.finished_at === null ? null : Number(row.finished_at),
      expiresAt: ticket.expiresAt,
      status: statusOf(ticket, now),
      briefSummary: summarise(row.brief_json === null ? null : String(row.brief_json)),
      viaAgent: row.agent_id === null || row.agent_id === undefined ? null : String(row.agent_id),
    };
  });
}

const NONCE_WINDOW_MS = 10 * 60 * 1000;

export type Owned = { campaign: Address } | { error: string; status: 400 | 401 | 403 | 404 };

/// Same signed-message authorization the other owner routes use: the owner proves the wallet, the
/// nonce keeps the signature from being replayed later. Exported so every owner route authorizes
/// the same way rather than growing its own variant.
export async function authorizeOwner(
  db: Client,
  slug: string,
  action: string,
  auth: { caller?: string; nonce?: number; signature?: string },
): Promise<Owned> {
  if (!auth.caller || !auth.nonce || !auth.signature) return { error: "not authorized", status: 401 };

  const res = await db.execute({
    sql: "SELECT owner_address, campaign_address FROM campaigns WHERE slug = ?",
    args: [slug],
  });
  const row = res.rows[0];
  if (!row) return { error: "not found", status: 404 };
  if (Math.abs(Date.now() - auth.nonce) > NONCE_WINDOW_MS) return { error: "stale nonce", status: 400 };
  if (String(row.owner_address).toLowerCase() !== auth.caller.toLowerCase()) {
    return { error: "not owner", status: 403 };
  }

  const ok = await verifyMessage({
    address: auth.caller as Address,
    message: `Hanami: ${action} at ${auth.nonce}`,
    signature: auth.signature as `0x${string}`,
  }).catch(() => false);
  if (!ok) return { error: "signature did not verify", status: 401 };

  return { campaign: String(row.campaign_address) as Address };
}

const revokeBody = z.object({
  caller: z.string(),
  nonce: z.number(),
  signature: z.string(),
});

export function createRosterRoutes(deps: RosterRouteDeps): Hono {
  const app = new Hono();

  app.get("/:slug/roster", async (c) => {
    const slug = c.req.param("slug");
    // Reading the roster is part of opening Admin, and the openapi contract says this route
    // authorizes "as existing admin routes" — the same message, so the owner signs once to read.
    const owned = await authorizeOwner(deps.db, slug, `view ${slug} admin`, {
      caller: c.req.query("caller"),
      nonce: Number(c.req.query("nonce")) || undefined,
      signature: c.req.query("signature"),
    });
    if ("error" in owned) return c.json({ error: owned.error }, owned.status);

    return c.json(await buildRoster(deps.db, deps, slug));
  });

  /// Returns a transaction, and sends nothing. Revocation is the owner's authority on chain, and
  /// the backend holds the bouncer's operator key, never the owner's.
  app.post("/:slug/tickets/:ticketId/revoke", async (c) => {
    const slug = c.req.param("slug");
    const ticketId = c.req.param("ticketId");
    if (!/^\d+$/.test(ticketId)) return c.json({ error: "invalid ticket" }, 400);

    const parsed = revokeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "not authorized" }, 401);

    const owned = await authorizeOwner(deps.db, slug, `revoke ${ticketId} on ${slug}`, parsed.data);
    if ("error" in owned) return c.json({ error: owned.error }, owned.status);

    return c.json(deps.prepareRevoke(owned.campaign, BigInt(ticketId)));
  });

  return app;
}
