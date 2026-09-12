/// What "Verify on 0G" is given to check.
///
/// The panel re-derives the attestation in the browser, so this hands back everything that check
/// needs and nothing more: the three identifiers recorded with the decision — the attestation hash,
/// the anonymous nullifier, and the decision transaction — plus the ticket the approval minted and
/// which path attested it. Proof material never appears here; the nullifier is the only thing the
/// Door leaves behind, and it identifies nobody.

import type { Client } from "@libsql/client";
import type { Attestation } from "../og-compute.js";

export type VerifyPayload = { status: 200 | 404 | 409; body: Record<string, unknown> };

type ApplicantRow = {
  id: number;
  decision: string | null;
  decision_tx: string | null;
  attestation_hash: string | null;
  attestation_json: string | null;
  attestation_path: string | null;
  nullifier: string | null;
  ticket_id: number | null;
};

function textOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

async function loadApplicant(db: Client, slug: string, wallet: string): Promise<ApplicantRow | null> {
  const res = await db.execute({
    sql:
      "SELECT id, decision, decision_tx, attestation_hash, attestation_json, attestation_path, nullifier, ticket_id " +
      "FROM applicants WHERE campaign_slug = ? AND wallet_address = ?",
    args: [slug, wallet.toLowerCase()],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    decision: textOrNull(row.decision),
    decision_tx: textOrNull(row.decision_tx),
    attestation_hash: textOrNull(row.attestation_hash),
    attestation_json: textOrNull(row.attestation_json),
    attestation_path: textOrNull(row.attestation_path),
    nullifier: textOrNull(row.nullifier),
    ticket_id: row.ticket_id === null || row.ticket_id === undefined ? null : Number(row.ticket_id),
  };
}

/// Rows decided before the column existed carry no path. An enclave signature is the direct path
/// whatever the row says, and everything else went through the Router.
function pathOf(row: ApplicantRow, attestation: Attestation | null): "direct" | "router" {
  if (row.attestation_path === "direct" || row.attestation_path === "router") return row.attestation_path;
  return attestation?.kind === "tee-signature" ? "direct" : "router";
}

function parseAttestation(raw: string | null): Attestation | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Attestation;
  } catch {
    return null;
  }
}

export async function buildVerifyPayload(db: Client, slug: string, wallet: string): Promise<VerifyPayload> {
  const applicant = await loadApplicant(db, slug, wallet);
  if (!applicant) return { status: 404, body: { error: "no application found" } };
  if (!applicant.decision || !applicant.attestation_hash) return { status: 409, body: { error: "no decision yet" } };

  const attestation = parseAttestation(applicant.attestation_json);
  const base = {
    decision: applicant.decision,
    decisionTx: applicant.decision_tx,
    attestationHash: applicant.attestation_hash,
    attestationPath: pathOf(applicant, attestation),
    nullifier: applicant.nullifier,
    // A string, because a ticket id is an identifier to display and not a number to do sums with.
    ticketId: applicant.ticket_id === null ? null : String(applicant.ticket_id),
  };

  if (attestation?.kind === "tee-signature") {
    return {
      status: 200,
      body: {
        ...base,
        kind: "tee-signature",
        signature: {
          text: attestation.text,
          signature: attestation.signature,
          signingAddress: attestation.signingAddress,
          provider: attestation.provider,
          chatId: attestation.chatId,
          model: attestation.model,
        },
      },
    };
  }

  if (attestation?.kind === "router") {
    const { request_id: requestId, provider, tee_verified: teeVerified } = attestation.trace;
    return { status: 200, body: { ...base, kind: "router", trace: { requestId, provider, teeVerified } } };
  }

  // Legacy rows stored no attestation. The last attested bouncer turn is the decision turn, and its
  // router trace is what the hash on chain was computed from.
  const res = await db.execute({
    sql:
      "SELECT router_request_id, provider, tee_verified FROM turns " +
      "WHERE applicant_id = ? AND role = 'bouncer' AND router_request_id IS NOT NULL " +
      "ORDER BY turn_index DESC LIMIT 1",
    args: [applicant.id],
  });
  const turn = res.rows[0];
  if (!turn) return { status: 404, body: { error: "no attested turn on record" } };

  return {
    status: 200,
    body: {
      ...base,
      kind: "router",
      trace: {
        requestId: String(turn.router_request_id),
        provider: String(turn.provider),
        teeVerified: Number(turn.tee_verified) === 1,
      },
    },
  };
}
