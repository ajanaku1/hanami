import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { db } from "./db/index.js";
import { uploadText, uploadBlob, readByRoot } from "./og-storage.js";
import { generatePortrait } from "./og-image.js";
import { bouncerTurn, bouncerGreeting } from "./bouncer.js";
import { recordDecision, finalizeMerkleRoot, readBouncerOwner, readIsAuthorized, BOUNCER_REGISTRY, CAMPAIGN_FACTORY } from "./og-chain.js";
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

  const exists = db.prepare("SELECT 1 FROM campaigns WHERE slug = ?").get(body.slug);
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

  const exists = db.prepare("SELECT 1 FROM campaigns WHERE slug = ?").get(body.slug);
  if (exists) return c.json({ error: "slug taken" }, 409);

  const tokenId = BigInt(body.bouncerTokenId);
  const onChainOwner = await readBouncerOwner(tokenId);
  if (!onChainOwner) return c.json({ error: "bouncer iNFT not found on chain" }, 400);
  if (onChainOwner.toLowerCase() !== body.ownerAddress.toLowerCase()) {
    return c.json({ error: "wallet does not own this iNFT on chain" }, 403);
  }
  const authorized = await readIsAuthorized(tokenId, backendAddress);
  if (!authorized) return c.json({ error: "backend not authorized on iNFT" }, 400);

  db.prepare(`
    INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, lorebook_uri, image_uri, owner_address, visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
  );

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

app.get("/api/campaigns/:slug", (c) => {
  const slug = c.req.param("slug");
  const row = db.prepare(`${campaignWithCountsSql} WHERE c.slug = ?`).get(slug);
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

app.get("/api/campaigns", (c) => {
  const owner = c.req.query("owner");
  if (owner) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) return c.json({ error: "invalid owner address" }, 400);
    const rows = db.prepare(`${campaignWithCountsSql} WHERE c.owner_address = ? ORDER BY c.created_at DESC`).all(owner.toLowerCase());
    return c.json({ campaigns: rows });
  }
  // public listing — every bouncer is visible; the apply/chat capability is gated per-card by visibility
  const rows = db.prepare(`${campaignWithCountsSql} ORDER BY c.created_at DESC`).all();
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

  const row = db.prepare("SELECT owner_address FROM campaigns WHERE slug = ?").get(slug) as { owner_address: string } | undefined;
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.owner_address.toLowerCase() !== caller.toLowerCase()) return c.json({ error: "not owner" }, 403);

  // accept nonces within 10 minutes
  if (Math.abs(Date.now() - nonce) > 10 * 60 * 1000) return c.json({ error: "stale nonce" }, 400);

  const { verifyMessage } = await import("viem");
  const message = `Hanami: set ${slug} visibility to ${visibility} at ${nonce}`;
  const ok = await verifyMessage({ address: caller as `0x${string}`, message, signature: signature as `0x${string}` });
  if (!ok) return c.json({ error: "signature did not verify" }, 401);

  db.prepare("UPDATE campaigns SET visibility = ? WHERE slug = ?").run(visibility, slug);
  return c.json({ slug, visibility });
});

const turnBody = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  message: z.string().min(1).max(2000),
});

type CampaignRow = { slug: string; campaign_address: string; persona_uri: string; lorebook_uri: string | null };
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

  const campaign = db.prepare("SELECT * FROM campaigns WHERE slug = ?").get(slug) as CampaignRow | undefined;
  if (!campaign) return c.json({ error: "campaign not found" }, 404);

  let applicant = db.prepare("SELECT id, decision FROM applicants WHERE campaign_slug = ? AND wallet_address = ?")
    .get(slug, walletAddress.toLowerCase()) as ApplicantRow | undefined;

  if (applicant?.decision) return c.json({ error: "already decided", decision: applicant.decision }, 409);

  if (!applicant) {
    const info = db.prepare("INSERT INTO applicants (campaign_slug, wallet_address, started_at) VALUES (?, ?, ?)")
      .run(slug, walletAddress.toLowerCase(), Math.floor(Date.now() / 1000));
    applicant = { id: Number(info.lastInsertRowid), decision: null };
  }

  const existing = db.prepare("SELECT content FROM turns WHERE applicant_id = ? AND turn_index = 0 AND role = 'bouncer'")
    .get(applicant.id) as { content: string } | undefined;
  if (existing) return c.json({ reply: existing.content });

  const personaText = await fetchText(campaign.persona_uri);
  const lorebookText = campaign.lorebook_uri ? await fetchText(campaign.lorebook_uri) : "";

  const turn = await bouncerGreeting(personaText, lorebookText);

  db.prepare(`INSERT INTO turns (applicant_id, turn_index, role, content, router_request_id, provider, tee_verified, created_at)
              VALUES (?, 0, 'bouncer', ?, ?, ?, 1, ?)`)
    .run(applicant.id, turn.reply, turn.trace.request_id, turn.trace.provider, Math.floor(Date.now() / 1000));

  return c.json({ reply: turn.reply });
});

app.post("/api/campaigns/:slug/turns", async (c) => {
  const slug = c.req.param("slug");
  const parsed = turnBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const { walletAddress, message } = parsed.data;

  const campaign = db.prepare("SELECT * FROM campaigns WHERE slug = ?").get(slug) as CampaignRow | undefined;
  if (!campaign) return c.json({ error: "campaign not found" }, 404);

  let applicant = db.prepare("SELECT id, decision FROM applicants WHERE campaign_slug = ? AND wallet_address = ?")
    .get(slug, walletAddress.toLowerCase()) as ApplicantRow | undefined;

  if (applicant?.decision) return c.json({ error: "already decided", decision: applicant.decision }, 409);

  if (!applicant) {
    const info = db.prepare("INSERT INTO applicants (campaign_slug, wallet_address, started_at) VALUES (?, ?, ?)")
      .run(slug, walletAddress.toLowerCase(), Math.floor(Date.now() / 1000));
    applicant = { id: Number(info.lastInsertRowid), decision: null };
  }

  const turnIndex = Number(db.prepare("SELECT COALESCE(MAX(turn_index), -1) + 1 AS next FROM turns WHERE applicant_id = ?")
    .get(applicant.id) as { next: number }).valueOf() as unknown as number;
  const userIndex = (db.prepare("SELECT COALESCE(MAX(turn_index), -1) + 1 AS next FROM turns WHERE applicant_id = ?")
    .get(applicant.id) as { next: number }).next;

  db.prepare("INSERT INTO turns (applicant_id, turn_index, role, content, created_at) VALUES (?, ?, 'applicant', ?, ?)")
    .run(applicant.id, userIndex, message, Math.floor(Date.now() / 1000));

  const history = db.prepare("SELECT role, content FROM turns WHERE applicant_id = ? ORDER BY turn_index ASC")
    .all(applicant.id) as { role: "applicant" | "bouncer"; content: string }[];
  const chat: ChatTurn[] = history.map((t) => ({
    role: t.role === "applicant" ? "user" : "assistant",
    content: t.content,
  }));

  const personaText = await fetchText(campaign.persona_uri);
  const lorebookText = campaign.lorebook_uri ? await fetchText(campaign.lorebook_uri) : "";

  const turn = await bouncerTurn({ persona: personaText, lorebook: lorebookText, history: chat });

  const bouncerIndex = userIndex + 1;
  db.prepare(`INSERT INTO turns (applicant_id, turn_index, role, content, router_request_id, provider, tee_verified, created_at)
              VALUES (?, ?, 'bouncer', ?, ?, ?, 1, ?)`)
    .run(applicant.id, bouncerIndex, turn.reply, turn.trace.request_id, turn.trace.provider, Math.floor(Date.now() / 1000));

  if (!turn.decision) return c.json({ reply: turn.reply, decision: null });

  const reasoningUp = await uploadText(turn.decision.reasoning || turn.reply);
  const recorded = await recordDecision(
    campaign.campaign_address as `0x${string}`,
    walletAddress as `0x${string}`,
    turn.decision.kind === "approve",
    turn.decision.reasoning || turn.reply,
    turn.trace,
  );

  db.prepare(`UPDATE applicants SET decision = ?, decision_tx = ?, reasoning_uri = ?, attestation_hash = ?, finished_at = ?
              WHERE id = ?`)
    .run(
      turn.decision.kind === "approve" ? "approved" : "rejected",
      recorded.txHash,
      `0g://${reasoningUp.rootHash}`,
      recorded.attestationHash,
      Math.floor(Date.now() / 1000),
      applicant.id,
    );

  return c.json({
    reply: turn.reply,
    decision: turn.decision.kind,
    decisionTx: recorded.txHash,
    attestationHash: recorded.attestationHash,
    reasoningRoot: reasoningUp.rootHash,
  });
});

app.get("/api/campaigns/:slug/export", (c) => {
  const slug = c.req.param("slug");
  const campaign = db.prepare("SELECT slug, merkle_root, finalized_at FROM campaigns WHERE slug = ?").get(slug) as { slug: string; merkle_root: string | null; finalized_at: number | null } | undefined;
  if (!campaign) return c.json({ error: "not found" }, 404);

  const approved = (db.prepare("SELECT wallet_address FROM applicants WHERE campaign_slug = ? AND decision = 'approved' ORDER BY id ASC").all(slug) as Array<{ wallet_address: string }>)
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

  const row = db.prepare("SELECT owner_address, campaign_address, finalized_at FROM campaigns WHERE slug = ?")
    .get(slug) as { owner_address: string; campaign_address: string; finalized_at: number | null } | undefined;
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.finalized_at !== null) return c.json({ error: "already finalized" }, 409);
  if (row.owner_address.toLowerCase() !== caller.toLowerCase()) return c.json({ error: "not owner" }, 403);
  if (Math.abs(Date.now() - nonce) > 10 * 60 * 1000) return c.json({ error: "stale nonce" }, 400);

  const { verifyMessage } = await import("viem");
  const message = `Hanami: finalize ${slug} at ${nonce}`;
  const ok = await verifyMessage({ address: caller as `0x${string}`, message, signature: signature as `0x${string}` });
  if (!ok) return c.json({ error: "signature did not verify" }, 401);

  const approved = (db.prepare("SELECT wallet_address FROM applicants WHERE campaign_slug = ? AND decision = 'approved' ORDER BY id ASC").all(slug) as Array<{ wallet_address: string }>)
    .map((r) => r.wallet_address as `0x${string}`);
  if (approved.length === 0) return c.json({ error: "no approved applicants yet" }, 400);

  const { root } = buildExport(approved);
  const txHash = await finalizeMerkleRoot(row.campaign_address as `0x${string}`, root);

  db.prepare("UPDATE campaigns SET merkle_root = ?, finalized_at = ? WHERE slug = ?")
    .run(root, Math.floor(Date.now() / 1000), slug);

  return c.json({ slug, root, txHash });
});

app.get("/api/campaigns/:slug/admin", (c) => {
  const slug = c.req.param("slug");
  const campaign = db.prepare("SELECT * FROM campaigns WHERE slug = ?").get(slug);
  if (!campaign) return c.json({ error: "not found" }, 404);
  const applicants = db.prepare(`SELECT wallet_address, decision, decision_tx, attestation_hash, finished_at
                                 FROM applicants WHERE campaign_slug = ? ORDER BY started_at DESC`).all(slug);
  const counts = db.prepare(`SELECT
    SUM(CASE WHEN decision='approved' THEN 1 ELSE 0 END) AS approved,
    SUM(CASE WHEN decision='rejected' THEN 1 ELSE 0 END) AS rejected,
    SUM(CASE WHEN decision IS NULL THEN 1 ELSE 0 END) AS pending
    FROM applicants WHERE campaign_slug = ?`).get(slug);
  return c.json({ campaign, applicants, counts });
});

// Serves bouncer portraits. The 0G Storage root hash is the canonical content address pinned
// on-chain at mint. We check the local cache first (populated when we minted) so frontends
// render instantly even before 0G Storage finalization completes; on a cache miss we ask the
// indexer to fetch from the network. Either way bytes are content-addressed and immutable.
app.get("/api/image/:root", async (c) => {
  const root = c.req.param("root");
  if (!/^0x[a-fA-F0-9]{64}$/.test(root)) return c.json({ error: "invalid root hash" }, 400);

  const local = cachePath(root);
  if (existsSync(local)) {
    const bytes = readFileSync(local);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }
  try {
    const bytes = await readByRoot(root);
    try { writeFileSync(local, bytes); } catch { /* best-effort cache fill */ }
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

async function fetchText(uri: string): Promise<string> {
  if (!uri.startsWith("0g://")) return "";
  const root = uri.replace("0g://", "");
  return (await readByRoot(root)).toString("utf8");
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`hanami backend on :${port}`);
console.log(`  registry: ${BOUNCER_REGISTRY}`);
console.log(`  factory : ${CAMPAIGN_FACTORY}`);
console.log(`  backend : ${backendAddress}`);
