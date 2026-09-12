/// Where the ledger brief meets the request cycle: one function that gets an applicant their brief,
/// and one route that hands it back to them.
///
/// The brief is read once per applicant and kept, so a reload does not spend a second gateway read
/// and the bouncer, the receipt, and the Roster all cite the same figures. An unavailable brief is
/// the exception — nothing was learned, so the next look tries again.
///
/// A brief is per-applicant and private (FR-020). The Door is what proves a wallet is a party to
/// this campaign, so a wallet with no verified proof is refused rather than told anything.

import { Hono } from "hono";
import type { Client } from "@libsql/client";
import { proofFor } from "../door/proofs.js";
import { buildBrief, type LedgerBrief } from "./brief.js";

export type BriefDeps = {
  db: Client;
  now: () => number;
  /// Reads the wallet's history. Injected so the routes are testable without the gateway.
  readLedger: (wallet: string) => Promise<LedgerBrief>;
};

function unavailableFor(wallet: string, readAt: number): LedgerBrief {
  return buildBrief({ wallet, trades: [], swaps: [], sourcesRead: [], readAt });
}

async function storedBrief(db: Client, slug: string, wallet: string): Promise<LedgerBrief | null> {
  const res = await db.execute({
    sql: "SELECT brief_json FROM applicants WHERE campaign_slug = ? AND wallet_address = ?",
    args: [slug, wallet],
  });
  const raw = res.rows[0]?.brief_json;
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as LedgerBrief;
  } catch {
    return null;
  }
}

/// The applicant row is created here when the brief is read before the first turn; the interview
/// upserts the same row, so whichever happens first wins and neither fails on the other.
async function ensureApplicantRow(db: Client, slug: string, wallet: string, now: number): Promise<void> {
  await db.execute({
    sql: `INSERT INTO applicants (campaign_slug, wallet_address, started_at) VALUES (?, ?, ?)
          ON CONFLICT(campaign_slug, wallet_address) DO NOTHING`,
    args: [slug, wallet, now],
  });
}

export async function ensureBrief(deps: BriefDeps, slug: string, wallet: string): Promise<LedgerBrief> {
  const applicant = wallet.toLowerCase();

  const existing = await storedBrief(deps.db, slug, applicant);
  // `unavailable` means the read failed, not that the wallet is clean, so it is worth another try.
  if (existing && existing.status !== "unavailable") return existing;

  await ensureApplicantRow(deps.db, slug, applicant, deps.now());

  let brief: LedgerBrief;
  try {
    brief = await deps.readLedger(applicant);
  } catch (err) {
    // A gateway failure is never the applicant's problem: the interview goes ahead without evidence.
    console.error("ledger read failed:", (err as Error).message);
    brief = unavailableFor(applicant, deps.now());
  }

  await deps.db.execute({
    sql: "UPDATE applicants SET brief_json = ?, brief_status = ? WHERE campaign_slug = ? AND wallet_address = ?",
    args: [JSON.stringify(brief), brief.status, slug, applicant],
  });

  return brief;
}

export function createBriefRoutes(deps: BriefDeps): Hono {
  const app = new Hono();

  app.get("/:slug/brief", async (c) => {
    const slug = c.req.param("slug");
    const wallet = (c.req.query("wallet") ?? "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) return c.json({ error: "invalid request" }, 400);

    const campaign = await deps.db.execute({ sql: "SELECT slug FROM campaigns WHERE slug = ?", args: [slug] });
    if (!campaign.rows[0]) return c.json({ error: "campaign not found" }, 404);

    // The only claim to a brief is a verified Door for that wallet on this campaign.
    const proof = await proofFor(deps.db, slug, wallet);
    if (!proof) return c.json({ error: "door required" }, 403);

    return c.json(await ensureBrief(deps, slug, wallet));
  });

  return app;
}
