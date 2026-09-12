"use client";

import type { RosterRow } from "@/lib/api";
import { RevokeButton, type RevokeState } from "./RevokeButton";

/// Who holds a ticket to this campaign, and what state that ticket is in.
///
/// Status comes from the chain, not from this table's memory, so a ticket that lapsed while the
/// page was open reads as expired on the next load. Revoke is offered only where there is
/// something live to revoke.

const STATUS_LABEL: Record<RosterRow["status"], string> = {
  live: "Live",
  expired: "Expired",
  revoked: "Revoked",
};

function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function whenever(unix: number | null): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

export function RosterTable({
  rows,
  onRevoke,
  revoking,
}: {
  rows: RosterRow[];
  onRevoke: (ticketId: string) => void;
  revoking?: { ticketId: string; state: RevokeState; error?: string };
}) {
  if (rows.length === 0) {
    return <p className="text-[var(--hanami-ink-soft)]">No tickets issued yet.</p>;
  }

  return (
    // Seven columns do not fit a phone. The table scrolls inside its own container so the page
    // itself never scrolls sideways at 390px.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
      <thead>
        <tr>
          <th scope="col" className="text-left">Holder</th>
          <th scope="col" className="text-left">Ticket</th>
          <th scope="col" className="text-left">Issued</th>
          <th scope="col" className="text-left">Expires</th>
          <th scope="col" className="text-left">Status</th>
          <th scope="col" className="text-left">Evidence</th>
          <th scope="col" className="text-left">Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.ticketId}>
            <td className="font-mono">
              {shortWallet(row.wallet)}
              {/* Which agent, not just that one applied: an owner running two agents needs to
                  tell them apart, and the full identifier is on the title for copying. */}
              {row.viaAgent ? (
                <span
                  title={row.viaAgent}
                  className="ml-2 text-[11px] uppercase tracking-[0.12em] text-[var(--hanami-ink-soft)]"
                >
                  via agent {shortWallet(row.viaAgent)}
                </span>
              ) : null}
            </td>
            <td>#{row.ticketId}</td>
            <td>{whenever(row.issuedAt)}</td>
            <td>{whenever(row.expiresAt)}</td>
            <td>{STATUS_LABEL[row.status]}</td>
            <td>{row.briefSummary}</td>
            <td>
              {row.status === "live" ? (
                <RevokeButton
                  ticketId={row.ticketId}
                  onRevoke={onRevoke}
                  state={revoking?.ticketId === row.ticketId ? revoking.state : "idle"}
                  error={revoking?.ticketId === row.ticketId ? revoking.error : undefined}
                />
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  );
}
