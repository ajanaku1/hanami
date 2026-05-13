"use client";

import { use, useEffect, useState } from "react";
import { admin } from "@/copy";
import { api, type AdminPayload } from "@/lib/api";

type Params = { slug: string };

export default function AdminPage({ params }: { params: Promise<Params> }) {
  const { slug } = use(params);
  const [data, setData] = useState<AdminPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => api.getAdmin(slug).then(setData).catch((e) => setErr(String(e)));
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [slug]);

  if (err && !data) return <main className="flex-1 px-8 py-24"><p className="mono text-sm text-[var(--hanami-stamp)]">{err}</p></main>;
  if (!data) return <main className="flex-1 px-8 py-24"><p className="text-[var(--hanami-ink-soft)]">…</p></main>;

  const { campaign, applicants, counts } = data;

  return (
    <main className="flex-1 px-8 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif text-[var(--text-3xl)] mb-2">{admin.heading(campaign.name)}</h1>
        <div className="text-xs text-[var(--hanami-ink-soft)] mono mb-12">
          campaign <a target="_blank" rel="noopener" href={`https://chainscan-galileo.0g.ai/address/${campaign.campaign_address}`}>{campaign.campaign_address}</a>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-16">
          <Counter n={counts.approved} label={admin.counters.approved} accent="moss" />
          <Counter n={counts.rejected} label={admin.counters.rejected} accent="stamp" />
          <Counter n={counts.pending} label="in progress" />
        </div>

        <h2 className="font-serif text-[var(--text-xl)] mb-4">{admin.liveFeedHeading}</h2>
        {applicants.length === 0 ? (
          <p className="text-[var(--hanami-ink-soft)] text-sm">{admin.emptyFeed}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--hanami-ink-soft)] border-b border-[var(--hanami-rule)]">
              <tr><th className="text-left py-2 font-normal">wallet</th><th className="text-left font-normal">decision</th><th className="text-left font-normal">tx</th></tr>
            </thead>
            <tbody>
              {applicants.map((a) => (
                <tr key={a.wallet_address} className="border-b border-[var(--hanami-rule)]/60">
                  <td className="py-2.5 mono text-xs">{a.wallet_address.slice(0, 8)}…{a.wallet_address.slice(-6)}</td>
                  <td className={`py-2.5 text-xs ${a.decision === "approved" ? "text-[var(--hanami-moss)]" : a.decision === "rejected" ? "text-[var(--hanami-stamp)]" : "text-[var(--hanami-ink-soft)]"}`}>
                    {a.decision ?? "…"}
                  </td>
                  <td className="py-2.5 mono text-xs">
                    {a.decision_tx ? (
                      <a target="_blank" rel="noopener" href={`https://chainscan-galileo.0g.ai/tx/${a.decision_tx}`}>
                        {a.decision_tx.slice(0, 10)}…
                      </a>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <hr />

        <h2 className="font-serif text-[var(--text-xl)] mb-2">{admin.exportButton}</h2>
        <p className="text-[var(--hanami-ink-soft)] text-sm mb-4 max-w-[58ch]">{admin.exportedBody}</p>
        <button disabled className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-6 py-3 text-sm tracking-wide opacity-50">
          {admin.exportButton} (Day 3)
        </button>
      </div>
    </main>
  );
}

function Counter({ n, label, accent }: { n: number; label: string; accent?: "moss" | "stamp" }) {
  const color = accent === "moss" ? "var(--hanami-moss)" : accent === "stamp" ? "var(--hanami-stamp)" : "var(--hanami-ink)";
  return (
    <div>
      <div className="font-serif text-[48px] leading-none" style={{ color }}>{n}</div>
      <div className="text-xs text-[var(--hanami-ink-soft)] mt-1">{label}</div>
    </div>
  );
}
