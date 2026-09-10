import type { Client, InValue } from "@libsql/client";
import type { Credential } from "./world-verify.js";

/// The Door's record. One row per person per campaign, and one row per wallet per campaign — both
/// enforced by UNIQUE constraints in the schema rather than by checking first and inserting after,
/// so two verifications arriving at the same moment cannot both win.

export type ProofMethod = Credential | "agentkit";

export type ProofRow = {
  id: number;
  campaignSlug: string;
  wallet: string;
  nullifier: string;
  method: ProofMethod;
  agentId: string | null;
  verifiedAt: number;
};

export type ProofInput = {
  campaignSlug: string;
  wallet: string;
  nullifier: string;
  method: ProofMethod;
  agentId: string | null;
  verifiedAt: number;
};

export type RecordResult =
  /// This wallet is through the Door. `proof` is the row that governs, which on a repeat
  /// verification is the row that was already there.
  | { state: "verified"; proof: ProofRow }
  /// This person already applied to this campaign from another wallet. `proof` is that earlier
  /// row, so the caller can say so without inventing a reason.
  | { state: "used"; proof: ProofRow };

type Raw = Record<string, unknown>;

function toRow(raw: Raw): ProofRow {
  return {
    id: Number(raw.id),
    campaignSlug: String(raw.campaign_slug),
    wallet: String(raw.wallet_address),
    nullifier: String(raw.nullifier),
    method: String(raw.method) as ProofMethod,
    agentId: raw.agent_id === null || raw.agent_id === undefined ? null : String(raw.agent_id),
    verifiedAt: Number(raw.verified_at),
  };
}

async function first(client: Client, sql: string, args: InValue[]): Promise<ProofRow | null> {
  const res = await client.execute({ sql, args });
  const row = res.rows[0];
  if (!row) return null;
  const raw: Raw = {};
  for (const col of res.columns) raw[col] = row[col as keyof typeof row];
  return toRow(raw);
}

export async function proofFor(client: Client, campaignSlug: string, wallet: string): Promise<ProofRow | null> {
  return first(
    client,
    "SELECT * FROM proofs WHERE campaign_slug = ? AND wallet_address = ?",
    [campaignSlug, wallet.toLowerCase()],
  );
}

export async function proofByNullifier(
  client: Client,
  campaignSlug: string,
  nullifier: string,
): Promise<ProofRow | null> {
  return first(client, "SELECT * FROM proofs WHERE campaign_slug = ? AND nullifier = ?", [campaignSlug, nullifier]);
}

/// Writes the proof and then reads back what actually governs.
///
/// The insert never fails on a conflict, so a race is decided by whichever transaction commits
/// first; every caller then reads the same winning row and is told the same thing about it. A
/// wallet already inside keeps its original proof, which is what stops a second person re-keying a
/// wallet that has already been through the Door.
export async function recordProof(client: Client, input: ProofInput): Promise<RecordResult> {
  const wallet = input.wallet.toLowerCase();

  await client.execute({
    sql:
      "INSERT INTO proofs (campaign_slug, wallet_address, nullifier, method, agent_id, verified_at) " +
      "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
    args: [input.campaignSlug, wallet, input.nullifier, input.method, input.agentId, input.verifiedAt],
  });

  const owner = await proofByNullifier(client, input.campaignSlug, input.nullifier);
  if (owner && owner.wallet !== wallet) return { state: "used", proof: owner };

  const mine = await proofFor(client, input.campaignSlug, wallet);
  if (mine) return { state: "verified", proof: mine };

  // The wallet holds no proof and this nullifier belongs to no one: the insert was lost to a
  // conflict we cannot see, which means the row it conflicted with was deleted underneath us.
  throw new Error("door: the proof could not be recorded");
}
