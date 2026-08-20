import type { SafetyClient } from "./safety";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8787";

// Hard ceiling so a stalled backend can never leave the UI spinning forever. Generous because a
// decision turn legitimately chains 0G inference + storage uploads + on-chain txs.
const REQUEST_TIMEOUT_MS = 180_000;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    if ((e as Error)?.name === "TimeoutError") {
      throw new Error(`timeout ${path}: the bouncer took too long to respond — please try again`);
    }
    throw e;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

// Ping the backend so it's awake before the first real call. Render's free tier sleeps after
// ~15 min idle and takes 30–60s to wake, so if the greeting is the request that eats the cold
// start it errors on the visitor. Firing /health on page mount lets the box warm in the
// background. Best-effort — never throws, so a warm-up failure stays invisible.
export async function warmBackend(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(60_000) });
    return res.ok;
  } catch {
    return false;
  }
}

// A backend-classified 503 (transient), a timeout, or a raw network failure on the first request
// after idle usually means the box was still waking. call() encodes the status at the start of the
// message, so we can detect those cheaply.
function isTransient(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? "");
  return /^503\b|^timeout |fetch failed|Failed to fetch|NetworkError|ECONNRESET/i.test(m);
}

// Retry-once wrapper for IDEMPOTENT calls only. Safe for /begin — replaying it returns the already
// stored greeting instead of generating a second one. NOT used for /turns, which appends the
// applicant's message before calling the router; a blind retry there would duplicate the turn.
async function callIdempotent<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await call<T>(path, init);
  } catch (e) {
    if (!isTransient(e)) throw e;
    await new Promise((r) => setTimeout(r, 3000)); // brief pause to let a cold box finish waking
    return call<T>(path, init);
  }
}

export type PrepareCampaignBody = {
  slug: string;
  persona: string;
  lorebook: string;
  ownerAddress: string;
  safetyRunId: string;
};

export type PrepareCampaignResult = {
  personaURI: string;
  lorebookURI: string;
  imageURI: string;
  personaRoot: string;
  lorebookRoot: string;
  imageRoot: string;
  safetyReportRoot: string;
  backendAddress: string;
  registryAddress: string;
  factoryAddress: string;
};

export type IndexCampaignBody = {
  slug: string;
  name: string;
  targetChain: "ethereum" | "base" | "arbitrum" | "op" | "0g";
  wlSizeCap: number;
  ownerAddress: string;
  visibility: "public" | "private";
  personaURI: string;
  lorebookURI: string;
  imageURI: string;
  bouncerTokenId: string;
  bouncerMintTx: string;
  authorizeTx: string;
  campaignAddress: string;
  campaignTx: string;
  safetyRunId: string;
};

export type CreateCampaignResult = {
  slug: string;
  bouncerTokenId: string;
  bouncerMintTx: string;
  authorizeTx: string;
  campaignAddress: string;
  campaignTx: string;
  personaRoot: string;
  lorebookRoot: string | null;
  imageURI?: string | null;
  visibility: "public" | "private";
};

export type Campaign = {
  slug: string;
  name: string;
  bouncer_token_id: number;
  bouncer_address: string;
  campaign_address: string;
  target_chain: string;
  wl_size_cap: number;
  persona_uri: string;
  lorebook_uri: string | null;
  image_uri: string | null;
  owner_address: string;
  finalized_at: number | null;
  merkle_root: string | null;
  visibility: "public" | "private";
  rep_score: number;
  created_at: number;
  approved_count: number;
  rejected_count: number;
  pending_count: number;
  publication_policy: "legacy-public" | "certification-required";
  safety: CampaignSafety;
};

export type CampaignSafety = {
  state: "certified" | "legacy" | "required" | "running" | "failed" | "interrupted";
  latestRunId: string | null;
  reportRoot: string | null;
  contentHash: string | null;
  publicationEligible: boolean;
};

export type SetVisibilityBody = {
  visibility: "public" | "private";
  signature: string;
  caller: string;
  nonce: number;
};

export type TurnResult = {
  reply: string;
  decision: "approve" | "reject" | null;
  decisionTx?: string;
  attestationHash?: string;
  reasoningRoot?: string;
  repScore?: number;
};

export type AdminPayload = {
  campaign: Campaign;
  applicants: Array<{
    wallet_address: string;
    decision: "approved" | "rejected" | null;
    decision_tx: string | null;
    attestation_hash: string | null;
    finished_at: number | null;
  }>;
  counts: { approved: number; rejected: number; pending: number };
};

export type MerkleExportResult = {
  slug: string;
  finalized: boolean;
  onChainRoot: string | null;
  root: string;
  leafCount: number;
  leaves: Array<{ address: string; leaf: string; proof: string[] }>;
  solidityHelper: string;
};

export type FinalizeBody = { signature: string; caller: string; nonce: number };

type VerifyBase = {
  decision: "approved" | "rejected";
  decisionTx: string | null;
  attestationHash: string;
};
// "router": recompute keccak of the x_0g_trace. "tee-signature": recompute keccak of the provider's
// signature AND recover it to the provider's on-chain teeSignerAddress (stronger — Router not trusted).
export type VerifyResult =
  | (VerifyBase & { kind?: "router"; trace: { requestId: string; provider: string; teeVerified: boolean } })
  | (VerifyBase & {
      kind: "tee-signature";
      signature: { text: string; signature: string; signingAddress: string; provider: string; chatId: string; model: string };
    });

export const api = {
  prepareCampaign: (body: PrepareCampaignBody) =>
    call<PrepareCampaignResult>("/api/campaigns/prepare", { method: "POST", body: JSON.stringify(body) }),
  indexCampaign: (body: IndexCampaignBody) =>
    call<CreateCampaignResult>("/api/campaigns/index", { method: "POST", body: JSON.stringify(body) }),
  getCampaign: (slug: string) => callIdempotent<Campaign>(`/api/campaigns/${slug}`),
  listCampaignsByOwner: (owner: string) =>
    call<{ campaigns: Campaign[] }>(`/api/campaigns?owner=${owner}`),
  listAllCampaigns: () =>
    call<{ campaigns: Campaign[] }>(`/api/campaigns`),
  setVisibility: (slug: string, body: SetVisibilityBody) =>
    call<{ slug: string; visibility: "public" | "private"; safety: CampaignSafety }>(`/api/campaigns/${slug}/visibility`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  exportMerkle: (slug: string) => call<MerkleExportResult>(`/api/campaigns/${slug}/export`),
  finalizeMerkle: (slug: string, body: FinalizeBody) =>
    call<{ slug: string; root: string; txHash: string }>(`/api/campaigns/${slug}/finalize`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  beginChat: (slug: string, walletAddress: string) =>
    callIdempotent<{ reply: string }>(`/api/campaigns/${slug}/begin`, {
      method: "POST",
      body: JSON.stringify({ walletAddress }),
    }),
  sendTurn: (slug: string, walletAddress: string, message: string) =>
    call<TurnResult>(`/api/campaigns/${slug}/turns`, {
      method: "POST",
      body: JSON.stringify({ walletAddress, message }),
    }),
  verifyDecision: (slug: string, wallet: string) =>
    call<VerifyResult>(`/api/campaigns/${slug}/verify/${wallet}`),
  getAdmin: (slug: string, auth?: AdminAuth) => {
    const headers = auth
      ? { "x-hanami-caller": auth.caller, "x-hanami-nonce": String(auth.nonce), "x-hanami-sig": auth.sig }
      : undefined;
    return call<AdminPayload>(`/api/campaigns/${slug}/admin`, { headers });
  },
};

export const safetyClient: SafetyClient = {
  start: (body) => call("/api/safety-runs", { method: "POST", body: JSON.stringify(body) }),
  get: (runId) => callIdempotent(`/api/safety-runs/${runId}`),
  resume: (runId, body) => call(`/api/safety-runs/${runId}/resume`, {
    method: "POST",
    body: JSON.stringify(body),
  }),
};

// Owner signature for viewing a private campaign's applicant feed. The nonce is a ms timestamp;
// the backend accepts it for 10 minutes, so one signature covers a whole admin session of polls.
// Sent in headers (not the query string) so it can't leak through logs/history/Referer.
export type AdminAuth = { caller: string; nonce: number; sig: string };

// call() throws `${status} ${path}: ${body}`, so the status is at the start of the message.
export function isAuthError(e: unknown): boolean {
  return e instanceof Error && /^(401|403)\b/.test(e.message);
}
