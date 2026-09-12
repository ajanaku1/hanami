"use client";

/// The ledger brief, as the applicant sees it.
///
/// It sits between the Door and the interview and shows the applicant exactly what the bouncer was
/// given: four figures read from public marketplace and exchange data, and the sources they came
/// from. Everything the panel says about itself is load-bearing — that this is evidence rather than
/// a decision, that a source failed, that a page cap hid older activity, and that an empty or
/// unreadable ledger is not a refusal. A brief is the applicant's own; no other applicant's brief
/// is ever rendered here.

export type BriefSource = { name: string; subgraphId: string; ok: boolean; count: number };

export type BriefView = {
  status: "ready" | "empty" | "unavailable";
  flipsWithin7d: number;
  sameCounterpartySales: number;
  medianHoldingDays: number | null;
  swapCount: number;
  sourcesRead: BriefSource[];
  truncated: boolean;
};

const LABEL = "text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)]";

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-raised)] p-4">
      <div className="font-serif text-[30px] leading-none">{value}</div>
      <div className={`${LABEL} mt-2 leading-relaxed`}>{label}</div>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="brief-heading" className="border border-[var(--hanami-rule)] p-6 max-w-[62ch]">
      <h2 id="brief-heading" className="font-serif text-[26px] leading-tight">
        Ledger brief
      </h2>
      {children}
    </section>
  );
}

export function BriefPanel({ brief, loading }: { brief: BriefView | null; loading?: boolean }) {
  if (loading) {
    return (
      <Frame>
        <div role="status" className="ui-notice" data-tone="info">
          Reading your on-chain history…
        </div>
      </Frame>
    );
  }

  // Nothing has been asked for yet — before the Door, there is no brief and nothing to explain.
  if (!brief) return null;

  if (brief.status === "unavailable") {
    return (
      <Frame>
        <div role="status" className="ui-notice" data-tone="info">
          Your history could not be read this time. The interview goes ahead, and the bouncer is
          told it has no ledger evidence.
        </div>
      </Frame>
    );
  }

  if (brief.status === "empty") {
    return (
      <Frame>
        <div role="status" className="ui-notice" data-tone="info">
          No trading history on the sources read. A new wallet is not a refusal — the interview goes
          ahead as normal.
        </div>
        <Sources sources={brief.sourcesRead} />
      </Frame>
    );
  }

  const held = brief.medianHoldingDays === null ? "unknown" : String(brief.medianHoldingDays);

  return (
    <Frame>
      <div role="status" className="ui-notice" data-tone="info">
        This is evidence, not a verdict. The bouncer may ask about it; it does not decide anything on
        its own.
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <Figure value={String(brief.flipsWithin7d)} label="sold within 7 days of buying" />
        <Figure value={String(brief.sameCounterpartySales)} label="sold back to the same counterparty" />
        <Figure value={held} label="median days held" />
        <Figure value={String(brief.swapCount)} label="exchange swaps" />
      </div>

      {brief.truncated ? (
        <p className="mt-4 text-[13px] text-[var(--hanami-ink-soft)]">
          A source answered at its page limit, so older activity was not read.
        </p>
      ) : null}

      <Sources sources={brief.sourcesRead} />
    </Frame>
  );
}

function Sources({ sources }: { sources: BriefSource[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-5">
      <div className={LABEL}>Sources read</div>
      <ul className="mt-2 grid gap-1 text-[13px]">
        {sources.map((source) => (
          <li key={source.name} className="flex justify-between gap-4 border-b border-[var(--hanami-rule)] pb-1">
            <span className="font-mono">{source.name}</span>
            <span className="text-[var(--hanami-ink-soft)]">
              {source.ok ? `${source.count} records` : "unavailable"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
