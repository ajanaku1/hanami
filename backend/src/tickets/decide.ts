import type { Client } from "@libsql/client";
import type { Address, Hex } from "viem";
import type { Attestation } from "../og-compute.js";
import { decisionPathFor } from "./chain-v2.js";

/// Recording a decision, for both contract versions.
///
/// The order matters. The chain call happens first and is the point of no return: once
/// DecisionRecordedV2 is mined the decision exists whatever happens next. So a failure to read the
/// minted ticket back is reported as a ticket still to be recovered, never as a failed decision —
/// the applicant was approved on chain and must not be told otherwise.

export type AttestationPath = "direct" | "router";

export type TicketBlock = { id: string; expiresAt: number; status: "live" };

export type TicketState =
  /// A ticket was minted and recorded.
  | "issued"
  /// There is no ticket to expect: a rejection, or a V1 campaign.
  | "none"
  /// The decision is on chain but its ticket has not been read back yet. Recoverable.
  | "pending-retry";

export type DecisionReceipt = {
  decision: "approved" | "rejected";
  txHash: Hex;
  attestationHash: Hex;
  attestationPath: AttestationPath;
  nullifier: string | null;
  ticket: TicketBlock | null;
  ticketState: TicketState;
};

export type RoutedCall = {
  campaign: Address;
  contractVersion: number;
  applicant: Address;
  approve: boolean;
  reasoning: string;
  attestation: Attestation;
  nullifierHash: Hex | null;
};

export type DecideDeps = {
  recordRouted: (call: RoutedCall) => Promise<{
    txHash: Hex;
    attestationHash: Hex;
    reasoningHash: Hex;
    ticketId: bigint | null;
  }>;
  /// Reads a wallet's live ticket straight from the chain, for recovering one we failed to keep.
  readTicketId: (campaign: Address, wallet: Address) => Promise<bigint | null>;
};

export type DecisionInput = {
  slug: string;
  applicantId: number;
  wallet: string;
  approve: boolean;
  reasoning: string;
  attestation: Attestation;
  attestationPath: AttestationPath;
};

type CampaignRow = { address: Address; contractVersion: number; ticketExpiry: number | null; closeAt: number | null };

async function campaignOf(db: Client, slug: string): Promise<CampaignRow> {
  const res = await db.execute({
    sql: "SELECT campaign_address, contract_version, ticket_expiry, close_at FROM campaigns WHERE slug = ?",
    args: [slug],
  });
  const row = res.rows[0];
  if (!row) throw new Error(`campaign ${slug} not found`);
  return {
    address: String(row.campaign_address) as Address,
    contractVersion: row.contract_version === null ? 1 : Number(row.contract_version),
    ticketExpiry: row.ticket_expiry === null ? null : Number(row.ticket_expiry),
    closeAt: row.close_at === null ? null : Number(row.close_at),
  };
}

async function nullifierOf(db: Client, slug: string, wallet: string): Promise<string | null> {
  const res = await db.execute({
    sql: "SELECT nullifier FROM proofs WHERE campaign_slug = ? AND wallet_address = ?",
    args: [slug, wallet.toLowerCase()],
  });
  const value = res.rows[0]?.nullifier;
  return value === undefined || value === null ? null : String(value);
}

/// A ticket's expiry is the campaign's, stamped at mint. Falling back to the close date matches
/// what CampaignFactoryV2 does when no explicit expiry was set.
function expiryOf(campaign: CampaignRow): number {
  return campaign.ticketExpiry ?? campaign.closeAt ?? 0;
}

export async function recordApplicantDecision(
  db: Client,
  deps: DecideDeps,
  input: DecisionInput,
): Promise<DecisionReceipt> {
  const campaign = await campaignOf(db, input.slug);
  const path = decisionPathFor(campaign.contractVersion);

  // V1 campaigns have no Door, so they have no nullifier to require.
  const nullifier = path.version === 2 ? await nullifierOf(db, input.slug, input.wallet) : null;
  if (path.version === 2 && !nullifier) {
    throw new Error("cannot decide: this wallet has no verified door for this campaign");
  }

  const recorded = await deps.recordRouted({
    campaign: campaign.address,
    contractVersion: campaign.contractVersion,
    applicant: input.wallet as Address,
    approve: input.approve,
    reasoning: input.reasoning,
    attestation: input.attestation,
    nullifierHash: nullifier as Hex | null,
  });

  const decision = input.approve ? "approved" : "rejected";
  const ticket: TicketBlock | null =
    recorded.ticketId === null
      ? null
      : { id: recorded.ticketId.toString(), expiresAt: expiryOf(campaign), status: "live" };

  // An approval on a V2 campaign is the only case where a missing ticket is a problem.
  const ticketState: TicketState =
    ticket !== null ? "issued" : path.mintsTicket && input.approve ? "pending-retry" : "none";

  await db.execute({
    sql:
      "UPDATE applicants SET decision = ?, decision_tx = ?, attestation_hash = ?, attestation_path = ?, nullifier = ?, ticket_id = ? WHERE id = ?",
    args: [
      decision,
      recorded.txHash,
      recorded.attestationHash,
      input.attestationPath,
      nullifier,
      recorded.ticketId === null ? null : Number(recorded.ticketId),
      input.applicantId,
    ],
  });

  return {
    decision,
    txHash: recorded.txHash,
    attestationHash: recorded.attestationHash,
    attestationPath: input.attestationPath,
    nullifier,
    ticket,
    ticketState,
  };
}

/// Recovers a ticket the chain minted but we failed to keep. Reads the wallet's live ticket back
/// and records it. Never mints, and never invents one for an applicant who was not approved.
export async function retryTicket(
  db: Client,
  deps: DecideDeps,
  slug: string,
  wallet: string,
): Promise<{ ticket: TicketBlock | null; ticketState: TicketState }> {
  const campaign = await campaignOf(db, slug);

  const res = await db.execute({
    sql: "SELECT id, decision FROM applicants WHERE campaign_slug = ? AND wallet_address = ?",
    args: [slug, wallet.toLowerCase()],
  });
  const row = res.rows[0];
  if (!row) throw new Error("no applicant for that wallet");
  if (String(row.decision) !== "approved") throw new Error("that applicant was not approved");

  const ticketId = await deps.readTicketId(campaign.address, wallet as Address);
  if (ticketId === null) return { ticket: null, ticketState: "pending-retry" };

  await db.execute({
    sql: "UPDATE applicants SET ticket_id = ? WHERE id = ?",
    args: [Number(ticketId), Number(row.id)],
  });
  return {
    ticket: { id: ticketId.toString(), expiresAt: expiryOf(campaign), status: "live" },
    ticketState: "issued",
  };
}
