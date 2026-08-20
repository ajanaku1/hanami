import "dotenv/config";
import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { db, get, all, run, initDb } from "./db/index.js";
import { uploadText, uploadBlob, readByRoot } from "./og-storage.js";
import { generatePortrait } from "./og-image.js";
import { bouncerTurn, bouncerGreeting } from "./bouncer.js";
import { recordDecision, incrementRep, finalizeMerkleRoot, readBouncerOwner, readIsAuthorized, BOUNCER_REGISTRY, CAMPAIGN_FACTORY } from "./og-chain.js";
import { buildExport } from "./merkle.js";
import type { ChatTurn, Attestation } from "./og-compute.js";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SafetyRepository } from "./safety/repository.js";
import { SafetyRunner, type SafetyInference } from "./safety/runner.js";
import { createSafetyRoutes } from "./safety/routes.js";
import { hashBouncerContent } from "./safety/content-hash.js";
import {
  CertificationError,
  promoteCertifiedDraft,
  requireCertifiedDraft,
  requiredNewCampaignPublication,
} from "./safety/certification.js";
import {
  PublicationError,
  decideVisibilityChange,
  deriveCampaignSafety,
  type CampaignPublicationSource,
} from "./safety/publication.js";

// Local PNG cache. 0G Storage is the canonical home (rootHash committed on-chain), but
// finalityRequired:false uploads aren't immediately downloadable via the indexer — the file
// has to replicate first. We mirror every generated portrait to disk so the frontend can
// render it instantly while finalization catches up in the background.
const IMAGE_CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".image-cache");
mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
const cachePath = (root: string) => join(IMAGE_CACHE_DIR, `${root}.png`);

const app = new Hono();
app.use("*", cors());

// Lightweight in-memory rate limiter. The backend runs single-instance on Render, so a process-local
// sliding window is enough to stop a trivial flood from draining the 0G Compute Router escrow on the
// expensive endpoints (LLM chat, 90s portrait gen, Storage uploads). Not a substitute for an edge WAF.
const rlHits = new Map<string, number[]>();
function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || c.req.header("x-real-ip") || "unknown";
}
function rateLimit(opts: { key: string; limit: number; windowMs: number }) {
  return async (c: Context, next: Next) => {
    const id = `${opts.key}:${clientIp(c)}`;
    const now = Date.now();
    const hits = (rlHits.get(id) ?? []).filter((t) => now - t < opts.windowMs);
    hits.push(now);
    rlHits.set(id, hits);
    if (hits.length > opts.limit) return c.json({ error: "rate limited — slow down" }, 429);
    await next();
  };
}
app.use("/api/campaigns/prepare", rateLimit({ key: "prepare", limit: 5, windowMs: 600_000 }));
app.use("/api/campaigns/:slug/begin", rateLimit({ key: "begin", limit: 10, windowMs: 60_000 }));
app.use("/api/campaigns/:slug/turns", rateLimit({ key: "turns", limit: 30, windowMs: 60_000 }));

// Surface the real failure reason to the client. Without this, any throw from the 0G Compute
// router, 0G Storage, or an on-chain tx bubbles to Hono's default handler as an opaque
// "500 Internal Server Error", which the UI can only render as a generic "network blip" — making
// a transient upstream outage (or a cold-start wake-up) look like a permanent client bug. We log
// the full error server-side and return a short, classified message the frontend can map to copy.
app.onError((err, c) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[${c.req.method} ${c.req.path}]`, err);
  // A 5xx from an upstream, a per-attempt timeout, a network reset, or a not-yet-replicated 0G
  // Storage blob are all transient — tell the client it's safe to retry rather than giving up.
  const transient = /router 5\d\d|timeout|fetch failed|TimeoutError|AbortError|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|UND_ERR|No locations found|could not detect network|SERVER_ERROR/i.test(msg);
  return c.json({ error: msg, transient }, transient ? 503 : 500);
});

const backendAddress = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex).address;

app.get("/health", (c) => c.json({
  ok: true,
  contracts: { BOUNCER_REGISTRY, CAMPAIGN_FACTORY },
  backend: backendAddress,
}));

// Step 1 of the user-signed mint flow. Backend uploads persona + lorebook to 0G Storage and
// generates the portrait (0G Compute z-image → 0G Storage). The user then signs three txs
// directly: mintBouncer, authorizeUsage(backend), createCampaign. Backend never touches the
// user's iNFT — only reads it after the fact.
const prepareBody = z.object({
  slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/),
  persona: z.string().min(50),
  lorebook: z.string().default(""),
  ownerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  safetyRunId: z.string().uuid(),
});

app.post("/api/campaigns/prepare", async (c) => {
  const parsed = prepareBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const body = parsed.data;

  const exists = await get("SELECT 1 FROM campaigns WHERE slug = ?", [body.slug]);
  if (exists) return c.json({ error: "slug taken" }, 409);

  let certified;
  try {
    certified = await requireCertifiedDraft(safetyRepository, body);
  } catch (error) {
    if (error instanceof CertificationError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    throw error;
  }

  // Portrait gen + upload. 90s cap so a stuck mainnet storage node can't hang the prepare call.
  // On failure we still return success with imageURI="" — the user can mint without a portrait,
  // and the procedural SVG fallback in <Portrait> takes over in the UI.
  let imageRoot = "";
  try {
    const png = await generatePortrait(body.persona);
    const imgUp = await Promise.race([
      uploadBlob(png),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("0G Storage upload timed out after 90s")), 90_000),
      ),
    ]);
    imageRoot = imgUp.rootHash;
    try { writeFileSync(cachePath(imageRoot), png); } catch (e) { console.warn("image cache write failed:", e); }
    // Durable copy in the DB (Turso survives restarts; the 0G blob and disk cache may not).
    try {
      await run("INSERT OR REPLACE INTO portraits (root, png_b64, created_at) VALUES (?, ?, ?)",
        [imageRoot, png.toString("base64"), Math.floor(Date.now() / 1000)]);
    } catch (e) { console.warn("portrait DB persist failed:", e); }
  } catch (err) {
    console.error("portrait pipeline failed, returning imageURI='':", (err as Error).message);
  }

  return c.json({
    personaURI: certified.personaUri,
    lorebookURI: certified.lorebookUri ?? "",
    imageURI: imageRoot ? `0g://${imageRoot}` : "",
    personaRoot: certified.personaUri.slice(5),
    lorebookRoot: certified.lorebookUri?.slice(5) ?? "",
    imageRoot: imageRoot || "",
    safetyReportRoot: certified.reportRoot,
    backendAddress,
    registryAddress: BOUNCER_REGISTRY,
    factoryAddress: CAMPAIGN_FACTORY,
  });
});

// Step 2 of the mint flow. After the user has signed all three txs and we have a tokenId +
// campaign address, the frontend posts here. Backend reads on-chain state to verify the user
// actually owns the iNFT they're claiming and has authorized us, then persists the campaign row.
const indexBody = z.object({
  slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  targetChain: z.enum(["ethereum", "base", "arbitrum", "op", "0g"]),
  wlSizeCap: z.number().int().positive().max(100000),
  ownerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  visibility: z.enum(["public", "private"]).default("private"),
  personaURI: z.string().regex(/^0g:\/\/0x[a-fA-F0-9]{64}$/),
  lorebookURI: z.string().regex(/^(0g:\/\/0x[a-fA-F0-9]{64})?$/).default(""),
  imageURI: z.string().regex(/^(0g:\/\/0x[a-fA-F0-9]{64})?$/).default(""),
  bouncerTokenId: z.string().regex(/^[0-9]+$/),
  bouncerMintTx: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  authorizeTx: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  campaignAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  campaignTx: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  safetyRunId: z.string().uuid(),
});

app.post("/api/campaigns/index", async (c) => {
  const parsed = indexBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const body = parsed.data;
  const publication = requiredNewCampaignPublication();

  const exists = await get("SELECT 1 FROM campaigns WHERE slug = ?", [body.slug]);
  if (exists) return c.json({ error: "slug taken" }, 409);

  const tokenId = BigInt(body.bouncerTokenId);
  const onChainOwner = await readBouncerOwner(tokenId);
  if (!onChainOwner) return c.json({ error: "bouncer iNFT not found on chain" }, 400);
  if (onChainOwner.toLowerCase() !== body.ownerAddress.toLowerCase()) {
    return c.json({ error: "wallet does not own this iNFT on chain" }, 403);
  }
  const authorized = await readIsAuthorized(tokenId, backendAddress);
  if (!authorized) return c.json({ error: "backend not authorized on iNFT" }, 400);

  try {
    await promoteCertifiedDraft(safetyRepository, {
      safetyRunId: body.safetyRunId,
      slug: body.slug,
      ownerAddress: body.ownerAddress,
      personaUri: body.personaURI,
      lorebookUri: body.lorebookURI || null,
    });
  } catch (error) {
    if (error instanceof CertificationError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    throw error;
  }

  await run(`
    INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, lorebook_uri, image_uri, owner_address, visibility, publication_policy, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    body.slug,
    body.name,
    Number(tokenId),
    BOUNCER_REGISTRY,
    body.campaignAddress,
    body.targetChain,
    body.wlSizeCap,
    body.personaURI,
    body.lorebookURI || null,
    body.imageURI || null,
    body.ownerAddress.toLowerCase(),
    publication.visibility,
    publication.publicationPolicy,
    Math.floor(Date.now() / 1000),
  ]);

  return c.json({
    slug: body.slug,
    bouncerTokenId: body.bouncerTokenId,
    bouncerMintTx: body.bouncerMintTx,
    authorizeTx: body.authorizeTx,
    campaignAddress: body.campaignAddress,
    campaignTx: body.campaignTx,
    imageURI: body.imageURI || null,
    personaRoot: body.personaURI.slice(5),
    lorebookRoot: body.lorebookURI ? body.lorebookURI.slice(5) : null,
    visibility: publication.visibility,
  });
});

const campaignWithCountsSql = `
  SELECT c.*,
    (SELECT COUNT(*) FROM applicants WHERE campaign_slug = c.slug AND decision = 'approved') AS approved_count,
    (SELECT COUNT(*) FROM applicants WHERE campaign_slug = c.slug AND decision = 'rejected') AS rejected_count,
    (SELECT COUNT(*) FROM applicants WHERE campaign_slug = c.slug AND decision IS NULL) AS pending_count
  FROM campaigns c
`;

type CampaignPublicationRow = {
  slug: string;
  owner_address: string;
  visibility: "public" | "private";
  publication_policy: "legacy-public" | "certification-required";
  persona_uri: string;
  lorebook_uri: string | null;
};

function publicationSource(row: CampaignPublicationRow): CampaignPublicationSource {
  return {
    slug: row.slug,
    ownerAddress: row.owner_address,
    visibility: row.visibility,
    publicationPolicy: row.publication_policy,
    personaUri: row.persona_uri,
    lorebookUri: row.lorebook_uri,
  };
}

async function withCampaignSafety<T extends CampaignPublicationRow>(row: T, includeContentHash = false) {
  const safety = await deriveCampaignSafety(safetyRepository, publicationSource(row));
  if (includeContentHash && !safety.contentHash) {
    const persona = await fetchText(row.persona_uri);
    const lorebook = row.lorebook_uri ? await fetchText(row.lorebook_uri) : "";
    safety.contentHash = hashBouncerContent(persona, lorebook);
  }
  return { ...row, safety };
}

app.get("/api/campaigns/:slug", async (c) => {
  const slug = c.req.param("slug");
  const row = await get<CampaignPublicationRow & Record<string, unknown>>(`${campaignWithCountsSql} WHERE c.slug = ?`, [slug]);
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(await withCampaignSafety(row, true));
});

app.get("/api/campaigns", async (c) => {
  const owner = c.req.query("owner");
  if (owner) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) return c.json({ error: "invalid owner address" }, 400);
    const rows = await all<CampaignPublicationRow & Record<string, unknown>>(`${campaignWithCountsSql} WHERE c.owner_address = ? ORDER BY c.created_at DESC`, [owner.toLowerCase()]);
    return c.json({ campaigns: await Promise.all(rows.map((row) => withCampaignSafety(row))) });
  }
  // public listing — every bouncer is visible; the apply/chat capability is gated per-card by visibility
  const rows = await all<CampaignPublicationRow & Record<string, unknown>>(`${campaignWithCountsSql} ORDER BY c.created_at DESC`);
  return c.json({ campaigns: await Promise.all(rows.map((row) => withCampaignSafety(row))) });
});

const visibilityBody = z.object({
  visibility: z.enum(["public", "private"]),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  caller: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  nonce: z.number().int(),
});

app.post("/api/campaigns/:slug/visibility", async (c) => {
  const slug = c.req.param("slug");
  const parsed = visibilityBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const { visibility, signature, caller, nonce } = parsed.data;

  const row = await get<CampaignPublicationRow>(
    "SELECT slug, owner_address, visibility, publication_policy, persona_uri, lorebook_uri FROM campaigns WHERE slug = ?",
    [slug],
  );
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.owner_address.toLowerCase() !== caller.toLowerCase()) return c.json({ error: "not owner" }, 403);

  // accept nonces within 10 minutes
  if (Math.abs(Date.now() - nonce) > 10 * 60 * 1000) return c.json({ error: "stale nonce" }, 400);

  const { verifyMessage } = await import("viem");
  const message = `Hanami: set ${slug} visibility to ${visibility} at ${nonce}`;
  const ok = await verifyMessage({ address: caller as `0x${string}`, message, signature: signature as `0x${string}` });
  if (!ok) return c.json({ error: "signature did not verify" }, 401);

  const currentSafety = await deriveCampaignSafety(safetyRepository, publicationSource(row));
  let transition;
  try {
    transition = decideVisibilityChange(publicationSource(row), visibility, currentSafety);
  } catch (error) {
    if (error instanceof PublicationError) {
      return c.json({ error: { code: error.code, message: error.message }, safety: currentSafety }, 409);
    }
    throw error;
  }
  await run("UPDATE campaigns SET visibility = ?, publication_policy = ? WHERE slug = ?", [
    transition.visibility,
    transition.publicationPolicy,
    slug,
  ]);
  const safety = await deriveCampaignSafety(safetyRepository, {
    ...publicationSource(row),
    ...transition,
  });
  return c.json({ slug, visibility: transition.visibility, safety });
});

const turnBody = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  message: z.string().min(1).max(2000),
});

type CampaignRow = { slug: string; campaign_address: string; persona_uri: string; lorebook_uri: string | null; bouncer_token_id: number };
type ApplicantRow = { id: number; decision: string | null };

// Race-safe applicant upsert. Two concurrent requests for the same wallet (double-mount, page
// reload, or a client retry landing while the first is still in-flight on a cold box) can both find
// no row and both INSERT, tripping UNIQUE(campaign_slug, wallet_address) on the loser. ON CONFLICT
// makes the loser a no-op; the row exists either way, so we read it back to get its id + decision.
async function ensureApplicant(slug: string, wallet: string): Promise<ApplicantRow> {
  const w = wallet.toLowerCase();
  await run(`INSERT INTO applicants (campaign_slug, wallet_address, started_at) VALUES (?, ?, ?)
             ON CONFLICT(campaign_slug, wallet_address) DO NOTHING`,
    [slug, w, Math.floor(Date.now() / 1000)]);
  const row = await get<ApplicantRow>(
    "SELECT id, decision FROM applicants WHERE campaign_slug = ? AND wallet_address = ?", [slug, w]);
  if (!row) throw new Error("failed to upsert applicant");
  return row;
}

const beginBody = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

// Bouncer opens the conversation. Idempotent: if the applicant already has a greeting (turn 0),
// we return it verbatim. The applicant record is created lazily on first call.
app.post("/api/campaigns/:slug/begin", async (c) => {
  const slug = c.req.param("slug");
  const parsed = beginBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const { walletAddress } = parsed.data;

  const campaign = await get<CampaignRow>("SELECT * FROM campaigns WHERE slug = ?", [slug]);
  if (!campaign) return c.json({ error: "campaign not found" }, 404);

  const applicant = await ensureApplicant(slug, walletAddress);
  if (applicant.decision) return c.json({ error: "already decided", decision: applicant.decision }, 409);

  const existing = await get<{ content: string }>(
    "SELECT content FROM turns WHERE applicant_id = ? AND turn_index = 0 AND role = 'bouncer'",
    [applicant.id],
  );
  if (existing) return c.json({ reply: existing.content });

  const personaText = await fetchText(campaign.persona_uri);
  const lorebookText = campaign.lorebook_uri ? await fetchText(campaign.lorebook_uri) : "";

  const turn = await bouncerGreeting(personaText, lorebookText);

  // Race-safe: the existence check above and this insert straddle the slow greeting call, so two
  // concurrent /begin calls can both reach here. ON CONFLICT turns the loser into a no-op instead of
  // a UNIQUE(applicant_id, turn_index) 500; we then read back whichever greeting won and return that,
  // so both callers see the same opening line.
  await run(`INSERT INTO turns (applicant_id, turn_index, role, content, router_request_id, provider, tee_verified, created_at)
             VALUES (?, 0, 'bouncer', ?, ?, ?, ?, ?)
             ON CONFLICT(applicant_id, turn_index) DO NOTHING`,
    [applicant.id, turn.reply, turn.trace.request_id, turn.trace.provider, turn.trace.tee_verified ? 1 : 0, Math.floor(Date.now() / 1000)]);
  const stored = await get<{ content: string }>(
    "SELECT content FROM turns WHERE applicant_id = ? AND turn_index = 0 AND role = 'bouncer'",
    [applicant.id],
  );

  return c.json({ reply: stored?.content ?? turn.reply });
});

app.post("/api/campaigns/:slug/turns", async (c) => {
  const slug = c.req.param("slug");
  const parsed = turnBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const { walletAddress, message } = parsed.data;

  const campaign = await get<CampaignRow>("SELECT * FROM campaigns WHERE slug = ?", [slug]);
  if (!campaign) return c.json({ error: "campaign not found" }, 404);

  const applicant = await ensureApplicant(slug, walletAddress);
  if (applicant.decision) return c.json({ error: "already decided", decision: applicant.decision }, 409);

  const nextRow = await get<{ next: number }>(
    "SELECT COALESCE(MAX(turn_index), -1) + 1 AS next FROM turns WHERE applicant_id = ?",
    [applicant.id],
  );
  const userIndex = Number(nextRow?.next ?? 0);

  await run("INSERT INTO turns (applicant_id, turn_index, role, content, created_at) VALUES (?, ?, 'applicant', ?, ?)",
    [applicant.id, userIndex, message, Math.floor(Date.now() / 1000)]);

  const history = await all<{ role: "applicant" | "bouncer"; content: string }>(
    "SELECT role, content FROM turns WHERE applicant_id = ? ORDER BY turn_index ASC",
    [applicant.id],
  );
  const chat: ChatTurn[] = history.map((t) => ({
    role: t.role === "applicant" ? "user" : "assistant",
    content: t.content,
  }));

  const personaText = await fetchText(campaign.persona_uri);
  const lorebookText = campaign.lorebook_uri ? await fetchText(campaign.lorebook_uri) : "";

  const turn = await bouncerTurn({ persona: personaText, lorebook: lorebookText, history: chat });

  const bouncerIndex = userIndex + 1;
  await run(`INSERT INTO turns (applicant_id, turn_index, role, content, router_request_id, provider, tee_verified, created_at)
             VALUES (?, ?, 'bouncer', ?, ?, ?, ?, ?)`,
    [applicant.id, bouncerIndex, turn.reply, turn.trace.request_id, turn.trace.provider, turn.trace.tee_verified ? 1 : 0, Math.floor(Date.now() / 1000)]);

  if (!turn.decision) return c.json({ reply: turn.reply, decision: null });

  const reasoningUp = await uploadText(turn.decision.reasoning || turn.reply);

  // Pin the full conversation transcript to 0G Storage so the decision record is auditable end to
  // end (not just the reasoning hash). The complete ordered turn log — including the final bouncer
  // reply just inserted — is the canonical artifact; its rootHash is stored alongside the decision.
  const fullTurns = await all(
    "SELECT turn_index, role, content, router_request_id, provider, tee_verified, created_at FROM turns WHERE applicant_id = ? ORDER BY turn_index ASC",
    [applicant.id],
  );
  const transcriptUp = await uploadText(JSON.stringify({
    campaign: slug,
    applicant: walletAddress.toLowerCase(),
    decision: turn.decision.kind === "approve" ? "approved" : "rejected",
    turns: fullTurns,
  }));

  const recorded = await recordDecision(
    campaign.campaign_address as `0x${string}`,
    walletAddress as `0x${string}`,
    turn.decision.kind === "approve",
    turn.decision.reasoning || turn.reply,
    turn.attestation,
  );

  await run(`UPDATE applicants SET decision = ?, decision_tx = ?, reasoning_uri = ?, transcript_uri = ?, attestation_hash = ?, attestation_json = ?, finished_at = ?
             WHERE id = ?`,
    [
      turn.decision.kind === "approve" ? "approved" : "rejected",
      recorded.txHash,
      `0g://${reasoningUp.rootHash}`,
      `0g://${transcriptUp.rootHash}`,
      recorded.attestationHash,
      JSON.stringify(turn.attestation),
      Math.floor(Date.now() / 1000),
      applicant.id,
    ]);

  // Approvals accrue verifiable reputation to the bouncer iNFT on-chain (incrementRep is executor-
  // gated; the backend was authorized at mint). Best-effort: the decision is already recorded, so a
  // rep-bump failure must not fail the applicant's response. We mirror the new score for fast reads.
  let repScore: number | undefined;
  if (turn.decision.kind === "approve") {
    try {
      const bumped = await incrementRep(BigInt(campaign.bouncer_token_id));
      repScore = Number(bumped.newScore);
      await run("UPDATE campaigns SET rep_score = ? WHERE slug = ?", [repScore, slug]);
    } catch (err) {
      console.error("incrementRep failed (decision already recorded):", (err as Error).message);
    }
  }

  return c.json({
    reply: turn.reply,
    decision: turn.decision.kind,
    decisionTx: recorded.txHash,
    attestationHash: recorded.attestationHash,
    reasoningRoot: reasoningUp.rootHash,
    transcriptRoot: transcriptUp.rootHash,
    repScore,
  });
});

app.get("/api/campaigns/:slug/export", async (c) => {
  const slug = c.req.param("slug");
  const campaign = await get<{ slug: string; merkle_root: string | null; finalized_at: number | null }>(
    "SELECT slug, merkle_root, finalized_at FROM campaigns WHERE slug = ?", [slug]);
  if (!campaign) return c.json({ error: "not found" }, 404);

  const approved = (await all<{ wallet_address: string }>(
    "SELECT wallet_address FROM applicants WHERE campaign_slug = ? AND decision = 'approved' ORDER BY id ASC", [slug]))
    .map((r) => r.wallet_address as `0x${string}`);
  const exported = buildExport(approved);
  return c.json({
    slug,
    finalized: campaign.finalized_at !== null,
    onChainRoot: campaign.merkle_root,
    ...exported,
  });
});

const finalizeReq = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  caller: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  nonce: z.number().int(),
});

app.post("/api/campaigns/:slug/finalize", async (c) => {
  const slug = c.req.param("slug");
  const parsed = finalizeReq.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const { signature, caller, nonce } = parsed.data;

  const row = await get<{ owner_address: string; campaign_address: string; finalized_at: number | null }>(
    "SELECT owner_address, campaign_address, finalized_at FROM campaigns WHERE slug = ?", [slug]);
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.finalized_at !== null) return c.json({ error: "already finalized" }, 409);
  if (row.owner_address.toLowerCase() !== caller.toLowerCase()) return c.json({ error: "not owner" }, 403);
  if (Math.abs(Date.now() - nonce) > 10 * 60 * 1000) return c.json({ error: "stale nonce" }, 400);

  const { verifyMessage } = await import("viem");
  const message = `Hanami: finalize ${slug} at ${nonce}`;
  const ok = await verifyMessage({ address: caller as `0x${string}`, message, signature: signature as `0x${string}` });
  if (!ok) return c.json({ error: "signature did not verify" }, 401);

  const approved = (await all<{ wallet_address: string }>(
    "SELECT wallet_address FROM applicants WHERE campaign_slug = ? AND decision = 'approved' ORDER BY id ASC", [slug]))
    .map((r) => r.wallet_address as `0x${string}`);
  if (approved.length === 0) return c.json({ error: "no approved applicants yet" }, 400);

  const { root } = buildExport(approved);
  const txHash = await finalizeMerkleRoot(row.campaign_address as `0x${string}`, root);

  await run("UPDATE campaigns SET merkle_root = ?, finalized_at = ? WHERE slug = ?",
    [root, Math.floor(Date.now() / 1000), slug]);

  return c.json({ slug, root, txHash });
});

app.get("/api/campaigns/:slug/admin", async (c) => {
  const slug = c.req.param("slug");
  const campaign = await get<CampaignPublicationRow & Record<string, unknown>>(
    "SELECT * FROM campaigns WHERE slug = ?", [slug]);
  if (!campaign) return c.json({ error: "not found" }, 404);

  // Private campaigns hold sealed criteria and per-applicant decisions — the project's moat.
  // Gate the full applicant feed behind an owner signature (same nonce-signature pattern as
  // /visibility and /finalize). Public campaigns stay openly inspectable by design. The proof
  // rides in headers, not the query string, so it can't leak through logs/history/Referer.
  if (campaign.visibility === "private") {
    const caller = c.req.header("x-hanami-caller");
    const sig = c.req.header("x-hanami-sig");
    const nonce = Number(c.req.header("x-hanami-nonce"));
    if (!caller || !sig || !Number.isInteger(nonce)) {
      return c.json({ error: "owner signature required for private campaign" }, 401);
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(caller) || !/^0x[a-fA-F0-9]+$/.test(sig)) {
      return c.json({ error: "invalid caller or signature" }, 400);
    }
    if (caller.toLowerCase() !== campaign.owner_address.toLowerCase()) {
      return c.json({ error: "not owner" }, 403);
    }
    if (Math.abs(Date.now() - nonce) > 10 * 60 * 1000) return c.json({ error: "stale nonce" }, 400);
    const { verifyMessage } = await import("viem");
    const message = `Hanami: view ${slug} admin at ${nonce}`;
    const ok = await verifyMessage({ address: caller as `0x${string}`, message, signature: sig as `0x${string}` });
    if (!ok) return c.json({ error: "signature did not verify" }, 401);
  }

  const applicants = await all(`SELECT wallet_address, decision, decision_tx, attestation_hash, finished_at
                                FROM applicants WHERE campaign_slug = ? ORDER BY started_at DESC`, [slug]);
  const counts = await get(`SELECT
    SUM(CASE WHEN decision='approved' THEN 1 ELSE 0 END) AS approved,
    SUM(CASE WHEN decision='rejected' THEN 1 ELSE 0 END) AS rejected,
    SUM(CASE WHEN decision IS NULL THEN 1 ELSE 0 END) AS pending
    FROM applicants WHERE campaign_slug = ?`, [slug]);
  return c.json({ campaign: await withCampaignSafety(campaign), applicants, counts });
});

// TEE attestation receipt for one decision, packaged for the in-UI "Verify on 0G" proof (no wallet).
// Two shapes, matching how the decision was attested (see backend Attestation type):
//   - "tee-signature": the decision inference ran through the Direct broker. Returns the signed text,
//     the provider's signature, and the provider's on-chain teeSignerAddress. A verifier recomputes
//     keccak256(signature) to match the on-chain hash AND recovers the signature to signingAddress —
//     proof the enclave signed, with the Router out of the trust base.
//   - "router": the decision came from the Router. Returns the x_0g_trace so a verifier recomputes
//     keccak256(abi.encode(keccak256(requestId), provider, teeVerified)) and matches it on chain.
// All values are already public on-chain — this just packages them.
app.get("/api/campaigns/:slug/verify/:wallet", async (c) => {
  const slug = c.req.param("slug");
  const wallet = c.req.param("wallet");
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return c.json({ error: "invalid wallet" }, 400);

  const applicant = await get<{ id: number; decision: string | null; decision_tx: string | null; attestation_hash: string | null; attestation_json: string | null }>(
    "SELECT id, decision, decision_tx, attestation_hash, attestation_json FROM applicants WHERE campaign_slug = ? AND wallet_address = ?",
    [slug, wallet.toLowerCase()],
  );
  if (!applicant) return c.json({ error: "no application found" }, 404);
  if (!applicant.decision || !applicant.attestation_hash) return c.json({ error: "no decision yet" }, 409);

  const base = { decision: applicant.decision, decisionTx: applicant.decision_tx, attestationHash: applicant.attestation_hash };
  const att = applicant.attestation_json ? (JSON.parse(applicant.attestation_json) as Attestation) : null;

  if (att?.kind === "tee-signature") {
    return c.json({
      ...base,
      kind: "tee-signature",
      signature: { text: att.text, signature: att.signature, signingAddress: att.signingAddress, provider: att.provider, chatId: att.chatId, model: att.model },
    });
  }

  // Router path (legacy rows have no attestation_json): reconstruct the trace from the final attested
  // bouncer turn — the highest-indexed one carrying a router request id.
  const decisionTurn = await get<{ router_request_id: string; provider: string; tee_verified: number }>(
    `SELECT router_request_id, provider, tee_verified FROM turns
     WHERE applicant_id = ? AND role = 'bouncer' AND router_request_id IS NOT NULL
     ORDER BY turn_index DESC LIMIT 1`,
    [applicant.id],
  );
  if (att?.kind === "router") {
    const { request_id: requestId, provider, tee_verified: teeVerified } = att.trace;
    return c.json({ ...base, kind: "router", trace: { requestId, provider, teeVerified } });
  }
  if (decisionTurn) {
    const trace = { requestId: decisionTurn.router_request_id, provider: decisionTurn.provider, teeVerified: decisionTurn.tee_verified === 1 };
    return c.json({ ...base, kind: "router", trace });
  }
  return c.json({ error: "no attested turn on record" }, 404);
});

// Admin-only: backfill the image cache. Used by the seed-bouncer script when it ran
// locally and generated a portrait whose bytes never reached the deployed backend's disk.
// Auth: shared secret via X-Admin-Secret header. Off unless ADMIN_SECRET is set in env.
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
app.post("/admin/cache-image", async (c) => {
  if (!ADMIN_SECRET || c.req.header("X-Admin-Secret") !== ADMIN_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const body = await c.req.json().catch(() => null) as { rootHash?: string; b64?: string } | null;
  if (!body?.rootHash || !body.b64) return c.json({ error: "rootHash and b64 required" }, 400);
  if (!/^0x[a-fA-F0-9]{64}$/.test(body.rootHash)) return c.json({ error: "invalid root hash" }, 400);
  try {
    writeFileSync(cachePath(body.rootHash), Buffer.from(body.b64, "base64"));
    return c.json({ cached: body.rootHash });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Serves bouncer portraits. The 0G Storage root hash is the canonical content address pinned
// on-chain at mint. We check the local cache first (populated when we minted) so frontends
// render instantly even before 0G Storage finalization completes; on a cache miss we ask the
// indexer to fetch from the network. Either way bytes are content-addressed and immutable.
app.get("/api/image/:root", async (c) => {
  const root = c.req.param("root");
  if (!/^0x[a-fA-F0-9]{64}$/.test(root)) return c.json({ error: "invalid root hash" }, 400);

  const pngHeaders = { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" };

  // 1. ephemeral disk cache (fastest, but wiped on host restart)
  const local = cachePath(root);
  if (existsSync(local)) {
    return new Response(new Uint8Array(readFileSync(local)), { headers: pngHeaders });
  }

  // 2. durable DB copy (Turso survives restarts) — backfills the disk cache on hit
  const stored = await get<{ png_b64: string }>("SELECT png_b64 FROM portraits WHERE root = ?", [root]);
  if (stored?.png_b64) {
    const bytes = Buffer.from(stored.png_b64, "base64");
    try { writeFileSync(local, bytes); } catch { /* best-effort cache fill */ }
    return new Response(new Uint8Array(bytes), { headers: pngHeaders });
  }

  // 3. fall back to the 0G Storage indexer; backfill both caches on success
  try {
    const bytes = await readByRoot(root);
    try { writeFileSync(local, bytes); } catch { /* best-effort cache fill */ }
    try {
      await run("INSERT OR REPLACE INTO portraits (root, png_b64, created_at) VALUES (?, ?, ?)",
        [root, bytes.toString("base64"), Math.floor(Date.now() / 1000)]);
    } catch { /* best-effort durable backfill */ }
    return new Response(new Uint8Array(bytes), { headers: pngHeaders });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

// Persona/lorebook blobs are content-addressed by 0G Storage root hash and immutable, so a given
// root always decodes to the same text — safe to cache for the process lifetime. Without this,
// every bouncer greeting AND every chat turn re-downloaded persona + lorebook from the storage
// indexer, hammering the network and stacking buffers on the 512MB instance. Bounded with simple
// FIFO eviction so a workspace with thousands of campaigns can't grow the cache without limit.
const textCache = new Map<string, string>();
const TEXT_CACHE_MAX = 200;

async function fetchText(uri: string): Promise<string> {
  if (!uri.startsWith("0g://")) return "";
  const root = uri.replace("0g://", "");
  const cached = textCache.get(root);
  if (cached !== undefined) return cached;
  const text = (await readByRoot(root)).toString("utf8");
  if (textCache.size >= TEXT_CACHE_MAX) {
    const oldest = textCache.keys().next().value;
    if (oldest !== undefined) textCache.delete(oldest);
  }
  textCache.set(root, text);
  return text;
}

const safetyRepository = new SafetyRepository(db);
const safetyInference: SafetyInference = async ({ persona, lorebook, history }) => {
  const turn = await bouncerTurn({ persona, lorebook, history });
  return {
    reply: turn.reply,
    decision: turn.decision?.kind ?? null,
    teeVerified: turn.trace.tee_verified === true,
  };
};
const safetyRunner = new SafetyRunner({
  repository: safetyRepository,
  infer: safetyInference,
  uploadReport: async (report) => (await uploadText(report)).rootHash,
});
const activeSafetyRuns = new Set<string>();

function scheduleSafetyExecution(runId: string): void {
  if (activeSafetyRuns.has(runId)) return;
  activeSafetyRuns.add(runId);
  void (async () => {
    try {
      const safetyRun = await safetyRepository.getRun(runId);
      if (!safetyRun) return;
      const persona = await fetchText(safetyRun.personaUri);
      const lorebook = safetyRun.lorebookUri ? await fetchText(safetyRun.lorebookUri) : "";
      await safetyRunner.execute(runId, persona, lorebook);
    } catch {
      await safetyRepository.markInterrupted(
        runId,
        "STORAGE_UNAVAILABLE",
        "Private inputs could not be loaded from 0G. Resume to retry.",
        Math.floor(Date.now() / 1000),
      );
    } finally {
      activeSafetyRuns.delete(runId);
    }
  })();
}

app.route("/api", createSafetyRoutes({
  repository: safetyRepository,
  uploadText: async (text) => (await uploadText(text)).rootHash,
  loadCampaign: async (slug) => {
    const campaign = await get<{
      slug: string;
      owner_address: string;
      persona_uri: string;
      lorebook_uri: string | null;
    }>("SELECT slug, owner_address, persona_uri, lorebook_uri FROM campaigns WHERE slug = ?", [slug]);
    return campaign ? {
      slug: campaign.slug,
      ownerAddress: campaign.owner_address,
      personaUri: campaign.persona_uri,
      lorebookUri: campaign.lorebook_uri,
    } : null;
  },
  readText: fetchText,
  scheduleExecution: scheduleSafetyExecution,
}));

await initDb();
await safetyRepository.interruptStaleRuns(
  Math.floor(Date.now() / 1000),
  Math.floor(Date.now() / 1000) - 120,
);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`hanami backend on :${port}`);
console.log(`  registry: ${BOUNCER_REGISTRY}`);
console.log(`  factory : ${CAMPAIGN_FACTORY}`);
console.log(`  backend : ${backendAddress}`);
