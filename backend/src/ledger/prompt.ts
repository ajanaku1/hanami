/// Renders a ledger brief into the bouncer's system message.
///
/// Two rules govern the shape. The block is fenced and labelled so the model can never read it as
/// the applicant talking, and it says in its own text that it is evidence and not a verdict — the
/// figures describe a wallet's past, and the interview still decides (FR-011). When there is no
/// brief, the block says so rather than disappearing, so a silent gateway is never mistaken for a
/// clean history.

import type { LedgerBrief } from "./brief.js";

const FRAME = [
  "The block below is on-chain trading history read from public subgraphs. It is evidence, not a verdict.",
  "Do not decide from it alone and never quote it at the applicant; ask about what it raises and judge the answers.",
].join(" ");

export function renderEvidence(brief: LedgerBrief | null | undefined): string {
  const lines = ["```ledger-evidence", FRAME, ""];

  if (!brief || brief.status === "unavailable") {
    lines.push("no ledger evidence: the history could not be read this time. Judge the conversation on its own.");
    lines.push("```");
    return lines.join("\n");
  }

  if (brief.status === "empty") {
    lines.push("no trading history: this wallet has no trades or swaps on the sources read.");
    lines.push("A new wallet is not by itself a reason to refuse.");
    lines.push(`sources_read: ${describeSources(brief)}`);
    lines.push("```");
    return lines.join("\n");
  }

  lines.push(`flips_within_7d: ${brief.flipsWithin7d}`);
  lines.push(`sales_back_to_same_counterparty: ${brief.sameCounterpartySales}`);
  lines.push(`median_holding_days: ${brief.medianHoldingDays ?? "unknown"}`);
  lines.push(`swap_count: ${brief.swapCount}`);
  lines.push(`sources_read: ${describeSources(brief)}`);
  if (brief.truncated) {
    lines.push("note: a source answered at its page limit, so older activity is not included.");
  }
  lines.push("```");
  return lines.join("\n");
}

function describeSources(brief: LedgerBrief): string {
  return brief.sourcesRead
    .map((source) => (source.ok ? `${source.name} (${source.count})` : `${source.name} (unavailable)`))
    .join(", ");
}

/// The one-line summary shown on the receipt and in the Roster.
export function summarizeBrief(brief: LedgerBrief | null | undefined): string {
  if (!brief || brief.status === "unavailable") return "Ledger unavailable";
  if (brief.status === "empty") return "No trading history";
  const held = brief.medianHoldingDays === null ? "no matched holds" : `${brief.medianHoldingDays}d median hold`;
  const sources = brief.sourcesRead.filter((source) => source.ok).length;
  return `${brief.flipsWithin7d} flips <7d, ${brief.sameCounterpartySales} same-counterparty, ${held}, ${brief.swapCount} swaps (${sources} sources)`;
}
