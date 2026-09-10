"use client";

/// What the applicant walks away with: the decision, the evidence behind it, and the three
/// identifiers anyone can check on 0G.
///
/// The brief is summarised, never republished — it is the applicant's own record, and the receipt
/// is a statement about the decision rather than a copy of the evidence.

export type ReceiptModel = {
  decision: "approved" | "rejected";
  attestationHash: string;
  attestationPath: "direct" | "router";
  nullifier: string | null;
  ticket: { id: string; expiresAt: number; status: string } | null;
  ticketState: "issued" | "none" | "pending-retry";
  brief: { status: "ready" | "empty" | "unavailable"; summary: string; sourcesRead: number };
  txHash: string;
};

const PATH_LABEL: Record<ReceiptModel["attestationPath"], string> = {
  direct: "Enclave signature (direct)",
  router: "Router trace",
};

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function expiryDate(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

export function Receipt({ model }: { model: ReceiptModel }) {
  const approved = model.decision === "approved";

  return (
    <section aria-labelledby="receipt-heading">
      <h2 id="receipt-heading">{approved ? "Approved" : "Not approved"}</h2>

      {model.ticket ? (
        <div>
          <h3>Ticket #{model.ticket.id}</h3>
          <p>Expires {expiryDate(model.ticket.expiresAt)}</p>
          <p>Soulbound · revocable by the owner</p>
        </div>
      ) : null}

      {model.ticketState === "pending-retry" ? (
        <div role="status" className="ui-notice" data-tone="info">
          Your approval is on chain. The ticket is still being recorded — reload in a moment.
        </div>
      ) : null}

      <dl>
        <dt>Attestation</dt>
        <dd>
          <span className="font-mono">{shortHash(model.attestationHash)}</span> · {PATH_LABEL[model.attestationPath]}
        </dd>

        <dt>Proof of human</dt>
        <dd className="font-mono">{model.nullifier ? shortHash(model.nullifier) : "—"}</dd>

        <dt>Decision transaction</dt>
        <dd className="font-mono">{shortHash(model.txHash)}</dd>

        <dt>Evidence read</dt>
        <dd>
          {model.brief.sourcesRead} sources · {model.brief.summary}
        </dd>
      </dl>
    </section>
  );
}
