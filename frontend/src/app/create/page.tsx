"use client";

import { useState } from "react";
import { create, personaPresets } from "@/copy";
import { api, type CreateCampaignResult } from "@/lib/api";

const CHAINS = [
  { value: "ethereum", label: "Ethereum" },
  { value: "base", label: "Base" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "op", label: "Optimism" },
  { value: "0g", label: "0G" },
] as const;

export default function CreatePage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [targetChain, setTargetChain] = useState<typeof CHAINS[number]["value"]>("base");
  const [wlSize, setWlSize] = useState(100);
  const [persona, setPersona] = useState("");
  const [lorebook, setLorebook] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreateCampaignResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.createCampaign({ slug, name, targetChain, wlSizeCap: wlSize, persona, lorebook, ownerAddress });
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const link = `${typeof window !== "undefined" ? window.location.origin : ""}/c/${result.slug}`;
    return (
      <main className="flex-1 px-8 py-24">
        <div className="max-w-2xl mx-auto">
          <h1 className="font-serif text-[var(--text-3xl)] mb-3"><span className="seal" />{create.success.title}</h1>
          <p className="text-[var(--hanami-ink-soft)] mb-10">{create.success.body}</p>

          <div className="border border-[var(--hanami-rule)] p-5 bg-[var(--hanami-paper-soft)] mb-8">
            <div className="text-xs text-[var(--hanami-ink-soft)] mb-1">applicant link</div>
            <div className="mono text-sm break-all">{link}</div>
          </div>

          <dl className="text-sm space-y-2 mono">
            <Row k="bouncer tokenId" v={result.bouncerTokenId} />
            <Row k="mint tx" v={result.bouncerMintTx} explorer />
            <Row k="campaign" v={result.campaignAddress} explorer />
            <Row k="persona on 0G Storage" v={result.personaRoot} />
            {result.lorebookRoot && <Row k="lorebook on 0G Storage" v={result.lorebookRoot} />}
          </dl>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-8 py-16">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-[var(--text-3xl)] mb-3">{create.heading}</h1>
        <p className="text-[var(--hanami-ink-soft)] mb-10 max-w-[58ch]">{create.intro}</p>

        <div className="space-y-7">
          <Field label={create.campaignNameLabel}>
            <input className={inputCls} placeholder={create.campaignNamePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="Slug (used in the applicant URL)">
            <input className={inputCls} placeholder="sakura-society-2026" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
          </Field>

          <Field label={create.targetChainLabel}>
            <select className={inputCls} value={targetChain} onChange={(e) => setTargetChain(e.target.value as typeof targetChain)}>
              {CHAINS.map((ch) => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
            </select>
          </Field>

          <Field label={create.wlSizeLabel} help={create.wlSizeHelp}>
            <input className={inputCls} type="number" min={1} value={wlSize} onChange={(e) => setWlSize(Number(e.target.value))} />
          </Field>

          <Field label={create.personaLabel} help={create.personaHelp}>
            <div className="flex flex-wrap gap-2 mb-2 text-xs">
              {Object.values(personaPresets).map((p) => (
                <button key={p.label} type="button"
                  className="px-3 py-1 border border-[var(--hanami-rule)] hover:border-[var(--hanami-ink-soft)] text-[var(--hanami-ink-soft)]"
                  onClick={() => setPersona(p.seed)}>
                  {p.label}
                </button>
              ))}
            </div>
            <textarea className={`${inputCls} min-h-[180px]`} placeholder={create.personaPlaceholder} value={persona} onChange={(e) => setPersona(e.target.value)} />
          </Field>

          <Field label={create.lorebookLabel} help={create.lorebookHelp}>
            <textarea className={`${inputCls} min-h-[120px]`} value={lorebook} onChange={(e) => setLorebook(e.target.value)} />
          </Field>

          <Field label="Your wallet address (campaign owner)">
            <input className={`${inputCls} mono`} placeholder="0x…" value={ownerAddress} onChange={(e) => setOwnerAddress(e.target.value)} />
          </Field>

          {err && <p className="text-[var(--hanami-stamp)] text-sm mono">{err}</p>}

          <button onClick={submit} disabled={busy}
            className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-6 py-3 text-sm tracking-wide hover:bg-[var(--hanami-indigo)] disabled:opacity-50 transition-colors">
            {busy ? create.submitting : create.submit}
          </button>
        </div>
      </div>
    </main>
  );
}

const inputCls = "w-full bg-transparent border border-[var(--hanami-rule)] px-3 py-2 text-[var(--hanami-ink)] focus:outline-none focus:border-[var(--hanami-ink)] transition-colors";

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm mb-1.5">{label}</label>
      {help && <p className="text-xs text-[var(--hanami-ink-soft)] mb-2 max-w-[58ch]">{help}</p>}
      {children}
    </div>
  );
}

function Row({ k, v, explorer }: { k: string; v: string; explorer?: boolean }) {
  const href = explorer ? `https://chainscan-galileo.0g.ai/${v.startsWith("0x") && v.length === 66 ? "tx" : "address"}/${v}` : null;
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 text-xs">
      <dt className="text-[var(--hanami-ink-soft)]">{k}</dt>
      <dd className="break-all">{href ? <a href={href} target="_blank" rel="noopener">{v}</a> : v}</dd>
    </div>
  );
}
