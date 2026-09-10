import { Hono, type MiddlewareHandler } from "hono";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { proofFor, recordProof } from "./proofs.js";
import type { Credential, IdkitResult, VerifyOutcome } from "./world-verify.js";

/// The Door: the routes that verify a proof-of-human and the guard that stands in front of every
/// interview. Dependencies are injected so the whole thing is testable without World, a chain, or
/// the production database.

export type DoorDeps = {
  db: Client;
  now: () => number;
  verifyProof: (request: { result: IdkitResult; signal: string }) => Promise<VerifyOutcome>;
};

export type GuardDeps = { db: Client; now: () => number };

/// Credential strength. Not a taxonomy of what the credentials mean — only which ones satisfy a
/// campaign that asked for another. A campaign asking for a device check is satisfied by an Orb;
/// a campaign asking for an Orb is not satisfied by a device.
const STRENGTH: Record<string, number> = { device: 1, selfie: 2, orb: 3 };

function satisfies(carried: string, required: string): boolean {
  return (STRENGTH[carried] ?? 0) >= (STRENGTH[required] ?? 0);
}

type CampaignRow = {
  slug: string;
  wl_size_cap: number;
  required_credential: string | null;
  close_at: number | null;
};

async function loadCampaign(db: Client, slug: string): Promise<CampaignRow | null> {
  const res = await db.execute({
    sql: "SELECT slug, wl_size_cap, required_credential, close_at FROM campaigns WHERE slug = ?",
    args: [slug],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    slug: String(row.slug),
    wl_size_cap: Number(row.wl_size_cap),
    required_credential: row.required_credential === null ? null : String(row.required_credential),
    close_at: row.close_at === null ? null : Number(row.close_at),
  };
}

function isClosed(campaign: CampaignRow, now: number): boolean {
  return campaign.close_at !== null && now >= campaign.close_at;
}

async function approvedCount(db: Client, slug: string): Promise<number> {
  const res = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM applicants WHERE campaign_slug = ? AND decision = 'approved'",
    args: [slug],
  });
  return Number(res.rows[0]?.n ?? 0);
}

const verifyBody = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  idkitResult: z.object({
    proof: z.string(),
    merkle_root: z.string(),
    nullifier_hash: z.string(),
    verification_level: z.string(),
  }),
});

export function createDoorRoutes(deps: DoorDeps, rateLimit?: MiddlewareHandler): Hono {
  const app = new Hono();
  if (rateLimit) app.use("/:slug/door/verify", rateLimit);

  app.post("/:slug/door/verify", async (c) => {
    const slug = c.req.param("slug");
    const parsed = verifyBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid request" }, 400);

    const wallet = parsed.data.walletAddress.toLowerCase();
    const campaign = await loadCampaign(deps.db, slug);
    if (!campaign) return c.json({ error: "campaign not found" }, 404);

    const required = (campaign.required_credential ?? "orb") as Credential;
    if (isClosed(campaign, deps.now())) {
      return c.json({ state: "closed", requiredCredential: required, method: null }, 410);
    }

    // Checked before the proof is recorded. A person gets one attempt per campaign, and a full
    // campaign should not be what spends it.
    if ((await approvedCount(deps.db, slug)) >= campaign.wl_size_cap) {
      return c.json({ state: "full", requiredCredential: required, method: null }, 200);
    }

    const outcome = await deps.verifyProof({ result: parsed.data.idkitResult, signal: wallet });
    if (outcome.status === "unavailable") {
      return c.json({ state: "unavailable", requiredCredential: required, method: null }, 503);
    }
    if (outcome.status === "rejected") {
      return c.json({ state: "none", requiredCredential: required, method: null }, 422);
    }
    if (!satisfies(outcome.method, required)) {
      return c.json({ state: "none", requiredCredential: required, method: outcome.method }, 412);
    }

    const recorded = await recordProof(deps.db, {
      campaignSlug: slug,
      wallet,
      nullifier: outcome.nullifier,
      method: outcome.method,
      agentId: null,
      verifiedAt: deps.now(),
    });

    if (recorded.state === "used") {
      return c.json({ state: "used", requiredCredential: required, method: null }, 409);
    }
    return c.json({ state: "verified", requiredCredential: required, method: recorded.proof.method }, 200);
  });

  app.get("/:slug/door/status", async (c) => {
    const slug = c.req.param("slug");
    const wallet = (c.req.query("wallet") ?? "").toLowerCase();

    const campaign = await loadCampaign(deps.db, slug);
    if (!campaign) return c.json({ error: "campaign not found" }, 404);
    const required = (campaign.required_credential ?? "orb") as Credential;

    if (isClosed(campaign, deps.now())) {
      return c.json({ state: "closed", requiredCredential: required, method: null });
    }

    const proof = wallet ? await proofFor(deps.db, slug, wallet) : null;
    if (proof) return c.json({ state: "verified", requiredCredential: required, method: proof.method });

    if ((await approvedCount(deps.db, slug)) >= campaign.wl_size_cap) {
      return c.json({ state: "full", requiredCredential: required, method: null });
    }
    return c.json({ state: "none", requiredCredential: required, method: null });
  });

  return app;
}

/// Stands in front of /begin and /turns. No proof for this wallet on this campaign, no interview —
/// for a browser applicant and an agent alike, because both are recorded in the same proofs table.
export function createDoorGuard(deps: GuardDeps): MiddlewareHandler {
  return async (c, next) => {
    const slug = c.req.param("slug");
    if (!slug) return next();

    const body = await c.req.raw.clone().json().catch(() => null);
    const wallet = String((body as { walletAddress?: string } | null)?.walletAddress ?? "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) return c.json({ error: "invalid request" }, 400);

    const campaign = await loadCampaign(deps.db, slug);
    if (!campaign) return c.json({ error: "campaign not found" }, 404);
    if (isClosed(campaign, deps.now())) return c.json({ error: "campaign closed" }, 410);

    const proof = await proofFor(deps.db, slug, wallet);
    if (!proof) return c.json({ error: "door required" }, 403);

    return next();
  };
}
