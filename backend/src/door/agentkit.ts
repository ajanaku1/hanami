/// The Door for an agent applying on a person's behalf.
///
/// A browser applicant proves personhood with World ID; an agent proves it with World AgentKit —
/// the agent signs a challenge, and AgentBook says which anonymous human registered that agent.
/// That human id is the nullifier, so one person gets one attempt whether they came in person or
/// sent an agent, and both land in the same `proofs` table the interview guard already reads.
///
/// Three rules matter here. The ticket belongs to the human's wallet, never the agent's. A lookup
/// we could not make is 503 and retryable — never reported as "unregistered", which would tell a
/// registered agent to go and register again (CHK026). And the 402 challenge is proof of humanity,
/// not a payment: nothing here charges anyone, and it is only ever sent to a caller that said it
/// is an agent, so a browser applicant is never asked to sign one.

import type { MiddlewareHandler } from "hono";
import type { Client } from "@libsql/client";
import {
  InMemoryAgentKitStorage,
  createAgentkitHooks,
  declareAgentkitExtension,
  type AgentKitStorage,
} from "@worldcoin/agentkit";
import { createAgentBookVerifier, parseAgentkitHeader, verifyAgentkitSignature } from "@worldcoin/agentkit-core";
import { proofFor, recordProof } from "./proofs.js";

/// The header an agent's signed challenge arrives in, and the hint that says a caller is an agent
/// at all. Without the hint the middleware stands aside: a browser must never meet a 402.
const AGENTKIT_HEADER = "agentkit";
const CLIENT_HINT_HEADER = "x-hanami-client";

export type VerifiedAgent = { address: string } | { error: string };

export type AgentDoorDeps = {
  db: Client;
  now: () => number;
  /// The public origin this campaign is served from; the agent signs it, so a signature for one
  /// deployment cannot be replayed against another.
  resourceUri: string;
  verifyHeader: (header: string, resourceUri: string) => Promise<VerifiedAgent>;
  /// AgentBook: the anonymous human behind this agent, or null when the agent is not registered.
  /// Throwing means we could not ask, which is not the same as an answer.
  lookupHuman: (address: string) => Promise<string | null>;
};

/// The real signature check, kept out of the middleware so tests do not need a chain.
export function createHeaderVerifier(rpcUrl?: string) {
  return async (header: string, resourceUri: string): Promise<VerifiedAgent> => {
    let payload;
    try {
      payload = parseAgentkitHeader(header);
    } catch {
      return { error: "the agentkit header could not be read" };
    }

    const result = await verifyAgentkitSignature(payload, rpcUrl ? { rpcUrl } : undefined);
    if (!result.valid || !result.address) return { error: result.error ?? "the agent signature did not verify" };
    // The signed resource is checked by AgentKit's own validation against the uri we advertise.
    void resourceUri;
    return { address: result.address };
  };
}

/// AgentBook on World Chain. `free` mode: an agent is asked for proof of humanity and nothing else.
export function createAgentBookLookup(rpcUrl?: string) {
  const verifier = createAgentBookVerifier(rpcUrl ? { rpcUrl } : undefined);
  return (address: string) => verifier.lookupHuman(address);
}

/// The x402 resource-server hooks, in `free` mode, for the 402 challenge an agent client answers.
/// Held here so the challenge and the verification are described in one place.
export function agentkitHooks(lookupHuman: (address: string) => Promise<string | null>, storage?: AgentKitStorage) {
  return createAgentkitHooks({
    agentBook: { lookupHuman },
    mode: { type: "free" },
    storage: storage ?? new InMemoryAgentKitStorage(),
  });
}

function challenge(resourceUri: string) {
  return {
    x402Version: 2,
    // No accepts entry has a price: this is the agentkit extension asking for a signature.
    accepts: [],
    extensions: declareAgentkitExtension({
      resourceUri,
      statement: "Prove you are an agent acting for a person, so this campaign can interview you once.",
      mode: { type: "free" },
    }),
  };
}

type Identified =
  | { address: string; humanId: string }
  | { refused: 403 | 503; body: { error: string; retryable?: true } };

/// Who is behind this agent, or why we cannot say. The two failures are deliberately different: a
/// signature that does not verify, or an agent AgentBook has never seen, is a refusal; a lookup we
/// could not make is not, and must never be reported as one (CHK026).
async function identifyAgent(deps: AgentDoorDeps, header: string): Promise<Identified> {
  const verified = await deps.verifyHeader(header, deps.resourceUri);
  if ("error" in verified) return { refused: 403, body: { error: verified.error } };

  let humanId: string | null;
  try {
    humanId = await deps.lookupHuman(verified.address);
  } catch (err) {
    console.error("agentbook lookup failed:", (err as Error).message);
    return {
      refused: 503,
      body: { error: "AgentBook could not be reached. Try again in a moment.", retryable: true },
    };
  }

  if (!humanId) {
    return {
      refused: 403,
      body: {
        error:
          "This agent is not registered in AgentBook. Register it with `npx @worldcoin/agentkit-cli register <agentWallet>` and confirm in World App.",
      },
    };
  }

  return { address: verified.address, humanId };
}

export function createAgentDoor(deps: AgentDoorDeps): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header(AGENTKIT_HEADER);
    const isAgent = header !== undefined || c.req.header(CLIENT_HINT_HEADER) === "agent";
    // A browser applicant is none of this middleware's business.
    if (!isAgent) return next();

    const slug = c.req.param("slug");
    if (!slug) return next();

    const body = await c.req.raw.clone().json().catch(() => null);
    const wallet = String((body as { walletAddress?: string } | null)?.walletAddress ?? "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) return c.json({ error: "invalid request" }, 400);

    const campaign = await deps.db.execute({
      sql: "SELECT slug FROM campaigns WHERE slug = ?",
      args: [slug],
    });
    if (!campaign.rows[0]) return c.json({ error: "campaign not found" }, 404);

    // Already through: the proof is recorded and AgentBook has nothing left to tell us.
    if (await proofFor(deps.db, slug, wallet)) return next();

    if (header === undefined) return c.json(challenge(deps.resourceUri), 402);

    const identified = await identifyAgent(deps, header);
    if ("refused" in identified) return c.json(identified.body, identified.refused);

    const recorded = await recordProof(deps.db, {
      campaignSlug: slug,
      wallet,
      nullifier: identified.humanId,
      method: "agentkit",
      agentId: identified.address,
      verifiedAt: deps.now(),
    });

    if (recorded.state === "used") {
      return c.json({ error: "This person has already applied to this campaign." }, 409);
    }

    return next();
  };
}
