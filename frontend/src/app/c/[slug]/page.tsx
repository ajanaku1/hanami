"use client";

import { use, useEffect, useRef, useState } from "react";
import { applicant } from "@/copy";
import { api, type Campaign, type TurnResult } from "@/lib/api";

type Params = { slug: string };
type Msg = { role: "applicant" | "bouncer"; content: string };

export default function ApplicantPage({ params }: { params: Promise<Params> }) {
  const { slug } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [wallet, setWallet] = useState("");
  const [started, setStarted] = useState(false);
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<TurnResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getCampaign(slug).then(setCampaign).catch((e) => setErr(String(e)));
  }, [slug]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history.length]);

  async function send() {
    if (!input.trim() || busy) return;
    const msg = input.trim();
    setInput("");
    setHistory((h) => [...h, { role: "applicant", content: msg }]);
    setBusy(true);
    setErr(null);
    try {
      const r = await api.sendTurn(slug, wallet, msg);
      setHistory((h) => [...h, { role: "bouncer", content: r.reply }]);
      if (r.decision) setDecision(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (err && !campaign) return <Centered><p className="mono text-sm">{err}</p></Centered>;
  if (!campaign) return <Centered><p className="text-[var(--hanami-ink-soft)]">…</p></Centered>;

  if (!started) {
    return (
      <Centered>
        <h1 className="font-serif text-[var(--text-2xl)] mb-2">{applicant.preConnect.heading(campaign.name)}</h1>
        <p className="text-[var(--hanami-ink-soft)] mb-8 max-w-[44ch]">{applicant.preConnect.body}</p>
        <input className="w-full max-w-md bg-transparent border border-[var(--hanami-rule)] px-3 py-2 mono mb-3 focus:outline-none focus:border-[var(--hanami-ink)]"
          placeholder="0x… your wallet address"
          value={wallet} onChange={(e) => setWallet(e.target.value)} />
        <button
          disabled={!/^0x[a-fA-F0-9]{40}$/.test(wallet)}
          onClick={() => setStarted(true)}
          className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-6 py-3 text-sm tracking-wide hover:bg-[var(--hanami-indigo)] disabled:opacity-40 transition-colors">
          Begin
        </button>
      </Centered>
    );
  }

  if (decision) {
    const approved = decision.decision === "approve";
    const copy = approved ? applicant.decision.approved : applicant.decision.rejected;
    return (
      <Centered>
        <h1 className={`font-serif text-[var(--text-3xl)] mb-4 ${approved ? "text-[var(--hanami-moss)]" : "text-[var(--hanami-stamp)]"}`}>
          {copy.title}
        </h1>
        <p className="text-[var(--hanami-ink-soft)] mb-10 max-w-[44ch]">{copy.body}</p>
        {approved && decision.decisionTx && (
          <div className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)] p-5 max-w-md w-full text-left">
            <div className="text-xs text-[var(--hanami-ink-soft)] mb-1">{applicant.decision.approved.receiptLabel}</div>
            <div className="mono text-xs break-all mb-3">{decision.attestationHash}</div>
            <a className="text-xs" target="_blank" rel="noopener" href={`https://chainscan-galileo.0g.ai/tx/${decision.decisionTx}`}>
              {applicant.decision.approved.viewChain} →
            </a>
          </div>
        )}
      </Centered>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center px-6 py-12">
      <div className="w-full max-w-xl flex flex-col h-[78vh]">
        <header className="mb-4 pb-3 border-b border-[var(--hanami-rule)]">
          <div className="font-serif text-[var(--text-lg)]">{campaign.name}</div>
          <div className="text-xs text-[var(--hanami-ink-soft)] mono">{wallet.slice(0, 8)}…{wallet.slice(-6)}</div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-5 pr-2">
          {history.map((m, i) => (
            <div key={i} className={m.role === "bouncer" ? "" : "ml-12"}>
              <div className="text-xs text-[var(--hanami-ink-soft)] mb-1">
                {m.role === "bouncer" ? <span className="seal" /> : null}
                {m.role}
              </div>
              <div className="text-[var(--hanami-ink)] leading-relaxed">{m.content}</div>
            </div>
          ))}
          {busy && <div className="text-[var(--hanami-ink-soft)]">{applicant.chat.waiting}</div>}
          {err && <div className="text-sm text-[var(--hanami-stamp)] mono">{err}</div>}
        </div>

        <div className="mt-4 pt-3 border-t border-[var(--hanami-rule)] flex gap-2">
          <input
            className="flex-1 bg-transparent border border-[var(--hanami-rule)] px-3 py-2 focus:outline-none focus:border-[var(--hanami-ink)]"
            placeholder={applicant.chat.placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={busy}
          />
          <button onClick={send} disabled={busy || !input.trim()}
            className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-4 text-sm disabled:opacity-40">
            {applicant.chat.send}
          </button>
        </div>
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      {children}
    </main>
  );
}
