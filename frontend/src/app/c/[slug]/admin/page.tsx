"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { admin } from "@/copy";
import { api, type AdminPayload } from "@/lib/api";
import { PetalsCanvas } from "@/components/PetalsCanvas";
import { BouncerCard } from "@/components/BouncerCard";

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

  if (err && !data) return <Shell><p className="font-mono text-sm text-[var(--hanami-stamp)]">{err}</p></Shell>;
  if (!data) return <Shell><p className="text-[var(--hanami-ink-soft)]">…</p></Shell>;

  const { campaign, applicants, counts } = data;

  return (
    <Shell>
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-12">
        <aside className="lg:sticky lg:top-12 lg:self-start">
          <BouncerCard tokenId={campaign.bouncer_token_id} name={campaign.name.split(" ")[0]} subtitle={`token №${campaign.bouncer_token_id}`} sealRoot={campaign.persona_uri} />
          <dl className="mt-6 text-xs space-y-1.5 font-mono">
            <Row k="campaign" v={campaign.campaign_address} kind="address" />
            <Row k="persona" v={campaign.persona_uri} />
            {campaign.lorebook_uri && <Row k="lorebook" v={campaign.lorebook_uri} />}
            <Row k="cap" v={`${counts.approved} / ${campaign.wl_size_cap}`} />
          </dl>
        </aside>

        <div>
          <h1 className="font-serif text-[40px] leading-tight mb-1">{admin.heading(campaign.name)}</h1>
          <div className="text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] mb-12">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--hanami-sakura)] mr-2 align-middle" />
            live · polling every 4s
          </div>

          <div className="grid grid-cols-3 gap-8 mb-16 border-y border-[var(--hanami-rule)] py-8">
            <Counter n={counts.approved} label={admin.counters.approved} accent="moss" />
            <Counter n={counts.rejected} label={admin.counters.rejected} accent="stamp" />
            <Counter n={counts.pending} label="in progress" />
          </div>

          <h2 className="font-serif text-[24px] mb-4">{admin.liveFeedHeading}</h2>
          {applicants.length === 0 ? (
            <p className="text-[var(--hanami-ink-soft)] text-sm">{admin.emptyFeed}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] border-b border-[var(--hanami-rule)]">
                <tr>
                  <th className="text-left py-2 font-normal">wallet</th>
                  <th className="text-left font-normal">decision</th>
                  <th className="text-left font-normal">tee attestation</th>
                  <th className="text-left font-normal">tx</th>
                </tr>
              </thead>
              <tbody>
                {applicants.map((a) => (
                  <tr key={a.wallet_address} className="border-b border-[var(--hanami-rule)]/60">
                    <td className="py-2.5 font-mono text-[11px]">{a.wallet_address.slice(0, 8)}…{a.wallet_address.slice(-6)}</td>
                    <td className={`py-2.5 text-[12px] tracking-[0.08em] uppercase ${
                      a.decision === "approved" ? "text-[var(--hanami-moss)]"
                      : a.decision === "rejected" ? "text-[var(--hanami-stamp)]"
                      : "text-[var(--hanami-ink-soft)]"
                    }`}>{a.decision ?? "in progress"}</td>
                    <td className="py-2.5 font-mono text-[11px] text-[var(--hanami-ink-soft)]">
                      {a.attestation_hash ? `${a.attestation_hash.slice(0, 12)}…` : "—"}
                    </td>
                    <td className="py-2.5 font-mono text-[11px]">
                      {a.decision_tx
                        ? <a target="_blank" rel="noopener" href={`https://chainscan-galileo.0g.ai/tx/${a.decision_tx}`}>{a.decision_tx.slice(0, 10)}…</a>
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <hr className="my-16 border-[var(--hanami-rule)]" />

          <h2 className="font-serif text-[24px] mb-2">{admin.exportButton}</h2>
          <p className="text-[var(--hanami-ink-soft)] text-sm mb-5 max-w-[58ch]">{admin.exportedBody}</p>
          <button disabled className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-6 py-3 text-sm tracking-[0.08em] uppercase opacity-50 cursor-not-allowed">
            {admin.exportButton} — Day 3
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Counter({ n, label, accent }: { n: number; label: string; accent?: "moss" | "stamp" }) {
  const color = accent === "moss" ? "var(--hanami-moss)" : accent === "stamp" ? "var(--hanami-stamp)" : "var(--hanami-ink)";
  return (
    <div>
      <div className="font-serif text-[56px] leading-none" style={{ color }}>{n}</div>
      <div className="text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] mt-2">{label}</div>
    </div>
  );
}

function Row({ k, v, kind }: { k: string; v: string; kind?: "tx" | "address" }) {
  const display = v.length > 30 ? `${v.slice(0, 14)}…${v.slice(-8)}` : v;
  const href = kind ? `https://chainscan-galileo.0g.ai/${kind}/${v}` : null;
  return (
    <div className="grid grid-cols-[70px_1fr] gap-3">
      <dt className="text-[10px] tracking-[0.14em] uppercase text-[var(--hanami-ink-soft)] self-center">{k}</dt>
      <dd>{href ? <a href={href} target="_blank" rel="noopener" className="text-[11px]">{display}</a> : <span className="text-[11px]">{display}</span>}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PetalsCanvas />
      <header className="relative z-10 flex justify-between items-center px-10 py-5">
        <Link href="/" className="flex items-baseline gap-3" style={{ borderBottom: "none" }}>
          <span className="font-serif text-[24px] tracking-wider">Hanami</span>
          <span className="text-[18px] text-[var(--hanami-ink-soft)]">花見</span>
        </Link>
      </header>
      <main className="relative z-10 max-w-[1240px] mx-auto px-8 py-10">{children}</main>
    </>
  );
}
