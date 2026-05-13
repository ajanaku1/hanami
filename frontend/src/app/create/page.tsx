"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { create, personaPresets } from "@/copy";
import { api, type CreateCampaignResult } from "@/lib/api";
import { PetalsCanvas } from "@/components/PetalsCanvas";
import { BouncerCard } from "@/components/BouncerCard";
import { Seal } from "@/components/Seal";
import { ConnectButton } from "@/components/ConnectButton";
import { VisibilityToggle } from "@/components/VisibilityToggle";

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
  const { address, isConnected } = useAccount();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreateCampaignResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // preview seal seeded by the slug (or persona length as a fallback) so it changes as you type
  const previewSeed = useMemo(() => {
    const src = slug || name || persona.slice(0, 16);
    let h = 5381;
    for (const ch of src) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
    return Math.abs(h) || 3;
  }, [slug, name, persona]);

  async function submit() {
    if (!address) { setErr("connect a wallet first"); return; }
    setBusy(true);
    setErr(null);
    try {
      const r = await api.createCampaign({ slug, name, targetChain, wlSizeCap: wlSize, persona, lorebook, ownerAddress: address });
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const link = typeof window !== "undefined" ? `${window.location.origin}/c/${result.slug}` : `/c/${result.slug}`;
    const tokenId = Number(result.bouncerTokenId);
    return (
      <>
        <PetalsCanvas />
        <Header />
        <main className="relative z-10 max-w-[1240px] mx-auto px-10 py-16 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-16 items-start">
          <div>
            <h1 className="font-serif text-[44px] leading-tight mb-3">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--hanami-sakura)] mr-3 align-middle" />
              {create.success.title}
            </h1>
            <p className="text-[var(--hanami-ink-soft)] mb-10 max-w-[58ch]">{create.success.body}</p>

            <div className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)] p-5 mb-8">
              <div className="text-xs text-[var(--hanami-ink-soft)] mb-1">applicant link</div>
              <div className="font-mono text-sm break-all">{link}</div>
            </div>

            <dl className="text-sm space-y-1.5 font-mono text-xs">
              <Row k="bouncer tokenId" v={result.bouncerTokenId} />
              <Row k="mint tx" v={result.bouncerMintTx} kind="tx" />
              <Row k="campaign" v={result.campaignAddress} kind="address" />
              <Row k="persona on 0G Storage" v={result.personaRoot} />
              {result.lorebookRoot && <Row k="lorebook on 0G Storage" v={result.lorebookRoot} />}
            </dl>

            <div className="mt-10">
              <Link href={`/c/${result.slug}`} className="text-[13px] tracking-[0.08em] uppercase">Open applicant page →</Link>
              <span className="mx-3 text-[var(--hanami-ink-soft)]">·</span>
              <Link href={`/c/${result.slug}/admin`} className="text-[13px] tracking-[0.08em] uppercase">Open admin →</Link>
            </div>
          </div>

          <div>
            <BouncerCard tokenId={tokenId} name={name || `Bouncer №${tokenId}`} subtitle="just minted" sealRoot={result.personaRoot} />
            {address && (
              <div className="mt-6 border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)] p-4">
                <div className="text-[10px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)] mb-2">visibility</div>
                <VisibilityToggle slug={result.slug} ownerAddress={address} current="private" />
                <p className="text-[11px] text-[var(--hanami-ink-soft)] mt-3 leading-relaxed">
                  Private by default. Listing makes the bouncer visible in the public gallery and exposes the apply link.
                </p>
              </div>
            )}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PetalsCanvas />
      <Header />
      <main className="relative z-10 max-w-[1240px] mx-auto px-10 py-12 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-16 items-start">
        <div>
          <h1 className="font-serif text-[44px] leading-tight mb-3">{create.heading}</h1>
          <p className="text-[var(--hanami-ink-soft)] mb-10 max-w-[58ch]">{create.intro}</p>

          <div className="space-y-7">
            <Field label={create.campaignNameLabel}>
              <input className={inputCls} placeholder={create.campaignNamePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            <Field label="Slug (used in the applicant URL)">
              <input className={inputCls} placeholder="sakura-society-2026" value={slug}
                     onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
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

            <Field label="Campaign owner">
              {isConnected && address ? (
                <div className="border border-[var(--hanami-rule)] px-3 py-2 font-mono text-sm">{address}</div>
              ) : (
                <div className="border border-[var(--hanami-rule)] px-3 py-2">
                  <ConnectButton />
                </div>
              )}
            </Field>

            {err && <p className="text-[var(--hanami-stamp)] text-sm font-mono">{err}</p>}

            <button onClick={submit} disabled={busy || !isConnected}
              className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-7 py-3.5 text-[13px] tracking-[0.08em] uppercase hover:bg-[var(--hanami-indigo)] disabled:opacity-40 transition-colors">
              {busy ? create.submitting : isConnected ? create.submit : "Connect to mint"}
            </button>
          </div>
        </div>

        {/* SEAL PREVIEW — changes as you type the slug */}
        <aside className="lg:sticky lg:top-12">
          <div className="bg-[var(--hanami-paper-soft)] border border-[var(--hanami-rule)] p-5">
            <div className="flex justify-between text-[10px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)] mb-4">
              <span>Preview seal</span>
              <span className="font-mono">seed · {previewSeed.toString(16).slice(0, 6)}</span>
            </div>
            <div className="bg-white border border-[var(--hanami-rule)] aspect-square flex items-center justify-center p-4">
              <Seal seed={previewSeed} className="w-[80%] h-[80%]" />
            </div>
            <p className="mt-4 text-xs text-[var(--hanami-ink-soft)] leading-relaxed">
              The seal is generated from the bouncer's tokenId at mint. This is a preview based on the slug.
              The real seal is locked once you mint.
            </p>
          </div>
        </aside>
      </main>
    </>
  );
}

function Header() {
  return (
    <header className="relative z-50 flex justify-between items-start px-10 py-5">
      <div className="flex flex-col items-start">
        <Link href="/" className="flex items-baseline gap-3" style={{ borderBottom: "none" }}>
          <span className="font-serif text-[24px] tracking-wider">Hanami</span>
          <span className="text-[18px] text-[var(--hanami-ink-soft)]">花見</span>
        </Link>
        <Link href="/" className="mt-1 text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] hover:text-[var(--hanami-ink)] transition-colors" style={{ borderBottom: "none" }}>
          ← back
        </Link>
      </div>
      <ConnectButton compact />
    </header>
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

function Row({ k, v, kind }: { k: string; v: string; kind?: "tx" | "address" }) {
  const href = kind ? `https://chainscan-galileo.0g.ai/${kind}/${v}` : null;
  return (
    <div className="grid grid-cols-[200px_1fr] gap-3">
      <dt className="text-[var(--hanami-ink-soft)]">{k}</dt>
      <dd className="break-all">{href ? <a href={href} target="_blank" rel="noopener">{v}</a> : v}</dd>
    </div>
  );
}
