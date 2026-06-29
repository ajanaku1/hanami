import "dotenv/config";
import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { get, all, run, initDb } from "./db/index.js";
import { uploadText, uploadBlob, readByRoot } from "./og-storage.js";
import { generatePortrait } from "./og-image.js";
import { bouncerTurn, bouncerGreeting } from "./bouncer.js";
import { recordDecision, incrementRep, finalizeMerkleRoot, readBouncerOwner, readIsAuthorized, BOUNCER_REGISTRY, CAMPAIGN_FACTORY } from "./og-chain.js";
import { buildExport } from "./merkle.js";
import type { ChatTurn } from "./og-compute.js";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
});

app.post("/api/campaigns/prepare", async (c) => {
  const parsed = prepareBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const body = parsed.data;

  const exists = await get("SELECT 1 FROM campaigns WHERE slug = ?", [body.slug]);
  if (exists) return c.json({ error: "slug taken" }, 409);

  const personaUp = await uploadText(body.persona);
  const loreUp = body.lorebook ? await uploadText(body.lorebook) : { rootHash: "" };

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
    personaURI: `0g://${personaUp.rootHash}`,
    lorebookURI: loreUp.rootHash ? `0g://${loreUp.rootHash}` : "",
    imageURI: imageRoot ? `0g://${imageRoot}` : "",
    personaRoot: personaUp.rootHash,
    lorebookRoot: loreUp.rootHash || "",
    imageRoot: imageRoot || "",
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
});

app.post("/api/campaigns/index", async (c) => {
  const parsed = indexBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const body = parsed.data;

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

  await run(`
    INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, lorebook_uri, image_uri, owner_address, visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    body.visibility,
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
    visibility: body.visibility,
  });
});

const campaignWithCountsSql = `
  SELECT c.*,
    (SELECT COUNT(*) FROM applicants WHERE campaign_slug = c.slug AND decision = 'approved') AS approved_count,
    (SELECT COUNT(*) FROM applicants WHERE campaign_slug = c.slug AND decision = 'rejected') AS rejected_count,
    (SELECT COUNT(*) FROM applicants WHERE campaign_slug = c.slug AND decision IS NULL) AS pending_count
  FROM campaigns c
`;

app.get("/api/campaigns/:slug", async (c) => {
  const slug = c.req.param("slug");
  const row = await get(`${campaignWithCountsSql} WHERE c.slug = ?`, [slug]);
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

app.get("/api/campaigns", async (c) => {
  const owner = c.req.query("owner");
  if (owner) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) return c.json({ error: "invalid owner address" }, 400);
    const rows = await all(`${campaignWithCountsSql} WHERE c.owner_address = ? ORDER BY c.created_at DESC`, [owner.toLowerCase()]);
    return c.json({ campaigns: rows });
  }
  // public listing — every bouncer is visible; the apply/chat capability is gated per-card by visibility
  const rows = await all(`${campaignWithCountsSql} ORDER BY c.created_at DESC`);
  return c.json({ campaigns: rows });
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

  const row = await get<{ owner_address: string }>("SELECT owner_address FROM campaigns WHERE slug = ?", [slug]);
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.owner_address.toLowerCase() !== caller.toLowerCase()) return c.json({ error: "not owner" }, 403);

  // accept nonces within 10 minutes
  if (Math.abs(Date.now() - nonce) > 10 * 60 * 1000) return c.json({ error: "stale nonce" }, 400);

  const { verifyMessage } = await import("viem");
  const message = `Hanami: set ${slug} visibility to ${visibility} at ${nonce}`;
  const ok = await verifyMessage({ address: caller as `0x${string}`, message, signature: signature as `0x${string}` });
  if (!ok) return c.json({ error: "signature did not verify" }, 401);

  await run("UPDATE campaigns SET visibility = ? WHERE slug = ?", [visibility, slug]);
  return c.json({ slug, visibility });
});

const turnBody = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  message: z.string().min(1).max(2000),
});

type CampaignRow = { slug: string; campaign_address: string; persona_uri: string; lorebook_uri: string | null; bouncer_token_id: number };
type ApplicantRow = { id: number; decision: string | null };

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

  let applicant = await get<ApplicantRow>(
    "SELECT id, decision FROM applicants WHERE campaign_slug = ? AND wallet_address = ?",
    [slug, walletAddress.toLowerCase()],
  );

  if (applicant?.decision) return c.json({ error: "already decided", decision: applicant.decision }, 409);

  if (!applicant) {
    const info = await run("INSERT INTO applicants (campaign_slug, wallet_address, started_at) VALUES (?, ?, ?)",
      [slug, walletAddress.toLowerCase(), Math.floor(Date.now() / 1000)]);
    applicant = { id: Number(info.lastInsertRowid), decision: null };
  }

  const existing = await get<{ content: string }>(
    "SELECT content FROM turns WHERE applicant_id = ? AND turn_index = 0 AND role = 'bouncer'",
    [applicant.id],
  );
  if (existing) return c.json({ reply: existing.content });

  const personaText = await fetchText(campaign.persona_uri);
  const lorebookText = campaign.lorebook_uri ? await fetchText(campaign.lorebook_uri) : "";

  const turn = await bouncerGreeting(personaText, lorebookText);

  await run(`INSERT INTO turns (applicant_id, turn_index, role, content, router_request_id, provider, tee_verified, created_at)
             VALUES (?, 0, 'bouncer', ?, ?, ?, ?, ?)`,
    [applicant.id, turn.reply, turn.trace.request_id, turn.trace.provider, turn.trace.tee_verified ? 1 : 0, Math.floor(Date.now() / 1000)]);

  return c.json({ reply: turn.reply });
});

app.post("/api/campaigns/:slug/turns", async (c) => {
  const slug = c.req.param("slug");
  const parsed = turnBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const { walletAddress, message } = parsed.data;

  const campaign = await get<CampaignRow>("SELECT * FROM campaigns WHERE slug = ?", [slug]);
  if (!campaign) return c.json({ error: "campaign not found" }, 404);

  let applicant = await get<ApplicantRow>(
    "SELECT id, decision FROM applicants WHERE campaign_slug = ? AND wallet_address = ?",
    [slug, walletAddress.toLowerCase()],
  );

  if (applicant?.decision) return c.json({ error: "already decided", decision: applicant.decision }, 409);

  if (!applicant) {
    const info = await run("INSERT INTO applicants (campaign_slug, wallet_address, started_at) VALUES (?, ?, ?)",
      [slug, walletAddress.toLowerCase(), Math.floor(Date.now() / 1000)]);
    applicant = { id: Number(info.lastInsertRowid), decision: null };
  }

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
    turn.trace,
  );

  await run(`UPDATE applicants SET decision = ?, decision_tx = ?, reasoning_uri = ?, transcript_uri = ?, attestation_hash = ?, finished_at = ?
             WHERE id = ?`,
    [
      turn.decision.kind === "approve" ? "approved" : "rejected",
      recorded.txHash,
      `0g://${reasoningUp.rootHash}`,
      `0g://${transcriptUp.rootHash}`,
      recorded.attestationHash,
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
  const campaign = await get<{ owner_address: string; visibility: string }>(
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
  return c.json({ campaign, applicants, counts });
});

// TEE attestation receipt for one decision. Returns the raw x_0g_trace components the on-chain
// attestationHash was derived from, so a verifier can recompute keccak256(abi.encode(
// keccak256(requestId), provider, teeVerified)) themselves and match it against the recorded hash
// (and the decision tx on chainscan). All values are already public on-chain — this just packages
// them for the in-UI "Verify on 0G" proof. No wallet needed.
app.get("/api/campaigns/:slug/verify/:wallet", async (c) => {
  const slug = c.req.param("slug");
  const wallet = c.req.param("wallet");
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return c.json({ error: "invalid wallet" }, 400);

  const applicant = await get<{ id: number; decision: string | null; decision_tx: string | null; attestation_hash: string | null }>(
    "SELECT id, decision, decision_tx, attestation_hash FROM applicants WHERE campaign_slug = ? AND wallet_address = ?",
    [slug, wallet.toLowerCase()],
  );
  if (!applicant) return c.json({ error: "no application found" }, 404);
  if (!applicant.decision || !applicant.attestation_hash) return c.json({ error: "no decision yet" }, 409);

  // The decision was computed from the final bouncer turn's trace — the highest-indexed bouncer
  // turn carrying a router request id.
  const decisionTurn = await get<{ router_request_id: string; provider: string; tee_verified: number }>(
    `SELECT router_request_id, provider, tee_verified FROM turns
     WHERE applicant_id = ? AND role = 'bouncer' AND router_request_id IS NOT NULL
     ORDER BY turn_index DESC LIMIT 1`,
    [applicant.id],
  );
  if (!decisionTurn) return c.json({ error: "no attested turn on record" }, 404);

  return c.json({
    decision: applicant.decision,
    decisionTx: applicant.decision_tx,
    attestationHash: applicant.attestation_hash,
    trace: {
      requestId: decisionTurn.router_request_id,
      provider: decisionTurn.provider,
      teeVerified: decisionTurn.tee_verified === 1,
    },
  });
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

async function fetchText(uri: string): Promise<string> {
  if (!uri.startsWith("0g://")) return "";
  const root = uri.replace("0g://", "");
  return (await readByRoot(root)).toString("utf8");
}

await initDb();

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`hanami backend on :${port}`);
console.log(`  registry: ${BOUNCER_REGISTRY}`);
console.log(`  factory : ${CAMPAIGN_FACTORY}`);
console.log(`  backend : ${backendAddress}`);
