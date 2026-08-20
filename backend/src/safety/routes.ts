import { Hono, type Context, type Next } from "hono";
import { z } from "zod";
import { SafetyAuthError, verifySafetyAuthorization } from "./auth.js";
import { hashBouncerContent } from "./content-hash.js";
import type { SafetyRepository } from "./repository.js";
import { SCENARIOS } from "./scenarios.js";
import type { SafetyRunIdentity, SafetyRunView } from "./types.js";

type CampaignSafetySource = {
  slug: string;
  ownerAddress: string;
  personaUri: string;
  lorebookUri: string | null;
};

type SafetyRouteDependencies = {
  repository: SafetyRepository;
  uploadText: (text: string) => Promise<string>;
  loadCampaign: (slug: string) => Promise<CampaignSafetySource | null>;
  readText?: (uri: string) => Promise<string>;
  scheduleExecution: (runId: string) => void;
  nowMs?: () => number;
  nowSeconds?: () => number;
  rateLimit?: { limit: number; windowMs: number };
};

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const authorization = z.object({
  caller: address,
  nonce: z.number().int(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});
const startBody = authorization.and(z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("draft"),
    slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/),
    persona: z.string().min(50),
    lorebook: z.string().default(""),
  }),
  z.object({
    scope: z.literal("campaign"),
    slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/),
  }),
]));

function clientIp(context: Context): string {
  return context.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    || context.req.header("x-real-ip")
    || "unknown";
}

function publicRun(run: SafetyRunView) {
  const stored = new Map(run.results.map((result) => [result.id, result]));
  return {
    id: run.id,
    scope: run.scope,
    slug: run.slug,
    ownerAddress: run.ownerAddress,
    contentHash: run.contentHash,
    status: run.status,
    completedCount: run.completedCount,
    totalCount: SCENARIOS.length,
    reportRoot: run.reportRoot,
    error: run.error,
    scenarios: SCENARIOS.map((scenario) => stored.get(scenario.id) ?? {
      id: scenario.id,
      category: scenario.category,
      expectedDecision: scenario.expectedDecision,
      actualDecision: null,
      teeVerified: null,
      status: "pending",
      turnCount: 0,
      errorCode: null,
    }),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
  };
}

function authError(error: unknown): { status: 400 | 401; body: object } {
  if (error instanceof SafetyAuthError && error.code === "STALE_NONCE") {
    return { status: 400, body: { error: { code: error.code, message: "This signature expired. Sign again." } } };
  }
  return { status: 401, body: { error: { code: "INVALID_SIGNATURE", message: "The owner signature did not verify." } } };
}

export function createSafetyRoutes(dependencies: SafetyRouteDependencies): Hono {
  const app = new Hono();
  const nowMs = dependencies.nowMs ?? Date.now;
  const nowSeconds = dependencies.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const limits = dependencies.rateLimit ?? { limit: 6, windowMs: 10 * 60_000 };
  const hits = new Map<string, number[]>();

  const limit = async (context: Context, next: Next) => {
    const key = clientIp(context);
    const now = nowMs();
    const recent = (hits.get(key) ?? []).filter((value) => now - value < limits.windowMs);
    if (recent.length >= limits.limit) {
      return context.json({ error: { code: "RATE_LIMITED", message: "Too many safety requests. Try again shortly." } }, 429);
    }
    hits.set(key, [...recent, now]);
    await next();
  };
  app.use("/safety-runs", limit);
  app.use("/safety-runs/:runId/resume", limit);

  app.post("/safety-runs", async (context) => {
    const parsed = startBody.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: { code: "INVALID_REQUEST", message: "Check the safety request fields." } }, 400);
    const body = parsed.data;
    let content: { persona: string; lorebook: string; personaUri?: string; lorebookUri?: string | null };
    if (body.scope === "draft") {
      if (await dependencies.loadCampaign(body.slug)) {
        return context.json({ error: { code: "SLUG_CONFLICT", message: "That campaign slug already exists." } }, 409);
      }
      content = { persona: body.persona, lorebook: body.lorebook };
    } else {
      const campaign = await dependencies.loadCampaign(body.slug);
      if (!campaign) return context.json({ error: { code: "NOT_FOUND", message: "Campaign not found." } }, 404);
      if (campaign.ownerAddress.toLowerCase() !== body.caller.toLowerCase()) {
        return context.json({ error: { code: "NOT_OWNER", message: "Only the campaign owner can run this test." } }, 403);
      }
      if (!dependencies.readText) {
        return context.json({ error: { code: "STORAGE_UNAVAILABLE", message: "Campaign intelligence could not be loaded." } }, 503);
      }
      try {
        content = {
          persona: await dependencies.readText(campaign.personaUri),
          lorebook: campaign.lorebookUri ? await dependencies.readText(campaign.lorebookUri) : "",
          personaUri: campaign.personaUri,
          lorebookUri: campaign.lorebookUri,
        };
      } catch {
        return context.json({ error: { code: "STORAGE_UNAVAILABLE", message: "Campaign intelligence could not be loaded." } }, 503);
      }
    }
    const contentHash = hashBouncerContent(content.persona, content.lorebook);
    try {
      await verifySafetyAuthorization({
        scope: body.scope,
        slug: body.slug,
        contentHash,
        caller: body.caller as `0x${string}`,
        nonce: body.nonce,
        signature: body.signature as `0x${string}`,
      }, nowMs());
    } catch (error) {
      const response = authError(error);
      return context.json(response.body, response.status);
    }
    const partial = {
      scope: body.scope,
      slug: body.slug,
      ownerAddress: body.caller,
      contentHash,
    };
    const existing = await dependencies.repository.findExactRun(partial);
    if (existing) return context.json(publicRun(existing), 202);
    try {
      const identity = await createIdentity(dependencies, partial, content);
      const run = await dependencies.repository.createOrGetRun(identity, nowSeconds());
      dependencies.scheduleExecution(run.id);
      return context.json(publicRun(run), 202);
    } catch {
      return context.json({ error: { code: "STORAGE_UNAVAILABLE", message: "Private inputs could not be stored on 0G. Try again." } }, 503);
    }
  });

  app.get("/safety-runs/:runId", async (context) => {
    const run = await dependencies.repository.getRun(context.req.param("runId"));
    return run
      ? context.json(publicRun(run))
      : context.json({ error: { code: "NOT_FOUND", message: "Safety run not found." } }, 404);
  });

  app.post("/safety-runs/:runId/resume", async (context) => {
    const run = await dependencies.repository.getRun(context.req.param("runId"));
    if (!run) return context.json({ error: { code: "NOT_FOUND", message: "Safety run not found." } }, 404);
    const parsed = authorization.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: { code: "INVALID_REQUEST", message: "Check the owner authorization." } }, 400);
    try {
      await verifySafetyAuthorization({
        scope: run.scope,
        slug: run.slug,
        contentHash: run.contentHash as `0x${string}`,
        caller: parsed.data.caller as `0x${string}`,
        nonce: parsed.data.nonce,
        signature: parsed.data.signature as `0x${string}`,
      }, nowMs());
    } catch (error) {
      const response = authError(error);
      return context.json(response.body, response.status);
    }
    if (parsed.data.caller.toLowerCase() !== run.ownerAddress.toLowerCase()) {
      return context.json({ error: { code: "NOT_OWNER", message: "Only the signing owner can resume this run." } }, 403);
    }
    if (run.status === "failed" || run.status === "passed") {
      return context.json({ error: { code: "RUN_COMPLETE", message: "This run cannot be resumed." } }, 409);
    }
    dependencies.scheduleExecution(run.id);
    return context.json(publicRun(run), 202);
  });

  return app;
}

async function createIdentity(
  dependencies: SafetyRouteDependencies,
  partial: Pick<SafetyRunIdentity, "scope" | "slug" | "ownerAddress" | "contentHash">,
  content: { persona: string; lorebook: string; personaUri?: string; lorebookUri?: string | null },
): Promise<SafetyRunIdentity> {
  if (content.personaUri) {
    return { ...partial, personaUri: content.personaUri, lorebookUri: content.lorebookUri ?? null };
  }
  const [personaRoot, lorebookRoot] = await Promise.all([
    dependencies.uploadText(content.persona),
    content.lorebook ? dependencies.uploadText(content.lorebook) : Promise.resolve(null),
  ]);
  return {
    ...partial,
    personaUri: `0g://${personaRoot}`,
    lorebookUri: lorebookRoot ? `0g://${lorebookRoot}` : null,
  };
}
