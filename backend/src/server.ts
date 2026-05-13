import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { db } from "./db/index.js";
import { uploadText, readByRoot } from "./og-storage.js";
import { bouncerTurn } from "./bouncer.js";
import { mintBouncer, authorizeBackend, createCampaign, recordDecision, BOUNCER_REGISTRY, CAMPAIGN_FACTORY } from "./og-chain.js";
import type { ChatTurn } from "./og-compute.js";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const app = new Hono();
app.use("*", cors());

const backendAddress = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex).address;

app.get("/health", (c) => c.json({
  ok: true,
  contracts: { BOUNCER_REGISTRY, CAMPAIGN_FACTORY },
  backend: backendAddress,
}));

const createBody = z.object({
  slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  targetChain: z.enum(["ethereum", "base", "arbitrum", "op", "0g"]),
  wlSizeCap: z.number().int().positive().max(100000),
  persona: z.string().min(50),
  lorebook: z.string().default(""),
  ownerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

app.post("/api/campaigns", async (c) => {
  const parsed = createBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);
  const body = parsed.data;

  const exists = db.prepare("SELECT 1 FROM campaigns WHERE slug = ?").get(body.slug);
  if (exists) return c.json({ error: "slug taken" }, 409);

  const personaUp = await uploadText(body.persona);
  const loreUp = body.lorebook ? await uploadText(body.lorebook) : { rootHash: "" };

  const mint = await mintBouncer(`0g://${personaUp.rootHash}`, loreUp.rootHash ? `0g://${loreUp.rootHash}` : "");
  await authorizeBackend(mint.tokenId, backendAddress);
  const camp = await createCampaign(mint.tokenId, BigInt(body.wlSizeCap));

  db.prepare(`
    INSERT INTO campaigns (slug, name, bouncer_token_id, bouncer_address, campaign_address, target_chain, wl_size_cap, persona_uri, lorebook_uri, owner_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    body.slug,
    body.name,
    Number(mint.tokenId),
    BOUNCER_REGISTRY,
    camp.campaign,
    body.targetChain,
    body.wlSizeCap,
    `0g://${personaUp.rootHash}`,
    loreUp.rootHash ? `0g://${loreUp.rootHash}` : null,
    body.ownerAddress.toLowerCase(),
    Math.floor(Date.now() / 1000),
  );

  return c.json({
    slug: body.slug,
    bouncerTokenId: mint.tokenId.toString(),
    bouncerMintTx: mint.txHash,
    campaignAddress: camp.campaign,
    campaignTx: camp.txHash,
    personaRoot: personaUp.rootHash,
    lorebookRoot: loreUp.rootHash || null,
  });
});

app.get("/api/campaigns/:slug", (c) => {
  const slug = c.req.param("slug");
  const row = db.prepare("SELECT * FROM campaigns WHERE slug = ?").get(slug);
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

const turnBody = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  message: z.string().min(1).max(2000),
});

type CampaignRow = { slug: string; campaign_address: string; persona_uri: string; lorebook_uri: string | null };
type ApplicantRow = { id: number; decision: string | null };

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
