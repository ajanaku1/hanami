"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { zeroG } from "@/lib/wagmi";
import type { Address, Hex } from "viem";
import { create, personaPresets } from "@/copy";
import { api, type CreateCampaignResult, type PrepareCampaignResult } from "@/lib/api";
import { PetalsCanvas } from "@/components/PetalsCanvas";
import { BouncerCard } from "@/components/BouncerCard";
import { Seal } from "@/components/Seal";
import { ConnectButton } from "@/components/ConnectButton";
import { VisibilityToggle } from "@/components/VisibilityToggle";
import { ShareBar } from "@/components/ShareBar";
import {
  registryAbi,
  factoryAbi,
  ZERO_BYTES32,
  EMPTY_BYTES,
  tokenIdFromMintLogs,
  campaignAddressFromLogs,
} from "@/lib/contracts";

const CHAINS = [
  { value: "ethereum", label: "Ethereum" },
  { value: "base", label: "Base" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "op", label: "Optimism" },
  { value: "0g", label: "0G" },
] as const;

// Four-stage mint flow. The user signs three on-chain txs (mint, authorize, create campaign)
// after the backend has uploaded the persona/lorebook/portrait. Stages let the UI show progress
// and let us retry from the current step without redoing successful work.
type Stage = "prepare" | "mint" | "authorize" | "campaign" | "index" | "done";
type StageStatus = "pending" | "active" | "done" | "failed";

const STAGE_LABELS: Record<Stage, string> = {
  prepare: "Uploading persona + generating portrait",
  mint: "Mint your bouncer iNFT (signature 1/3)",
  authorize: "Authorize the AI bouncer (signature 2/3)",
  campaign: "Deploy your campaign (signature 3/3)",
  index: "Finalizing",
  done: "Done",
};

const STAGES: Stage[] = ["prepare", "mint", "authorize", "campaign", "index"];

type FlowState = {
  stage: Stage;
  status: StageStatus;
  prepared: PrepareCampaignResult | null;
  tokenId: bigint | null;
  mintTx: Hex | null;
  authorizeTx: Hex | null;
  campaignAddress: Address | null;
  campaignTx: Hex | null;
};

const initialFlow: FlowState = {
  stage: "prepare",
  status: "pending",
  prepared: null,
  tokenId: null,
  mintTx: null,
  authorizeTx: null,
  campaignAddress: null,
  campaignTx: null,
};

export default function CreatePage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [targetChain, setTargetChain] = useState<typeof CHAINS[number]["value"]>("base");
  const [wlSize, setWlSize] = useState(100);
  const [persona, setPersona] = useState("");
  const [lorebook, setLorebook] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: zeroG.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [result, setResult] = useState<CreateCampaignResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowState>(initialFlow);
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const busy = flow.status === "active";

  // preview seal seeded by the slug (or persona length as a fallback) so it changes as you type
  const previewSeed = useMemo(() => {
    const src = slug || name || persona.slice(0, 16);
    let h = 5381;
    for (const ch of src) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
    return Math.abs(h) || 3;
  }, [slug, name, persona]);

  async function runPrepare(): Promise<PrepareCampaignResult> {
    if (flowRef.current.prepared) return flowRef.current.prepared;
    const prep = await api.prepareCampaign({ slug, persona, lorebook, ownerAddress: address! });
    setFlow((f) => ({ ...f, prepared: prep }));
    return prep;
  }

  async function runMint(prep: PrepareCampaignResult): Promise<bigint> {
    if (flowRef.current.tokenId) return flowRef.current.tokenId;
    const hash = await writeContractAsync({
      chainId: zeroG.id,
      address: prep.registryAddress as Address,
      abi: registryAbi,
      functionName: "mintBouncer",
      args: [prep.personaURI, prep.lorebookURI, prep.imageURI, ZERO_BYTES32],
    });
    setFlow((f) => ({ ...f, mintTx: hash }));
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    const tokenId = tokenIdFromMintLogs(receipt.logs);
    setFlow((f) => ({ ...f, tokenId }));
    return tokenId;
  }

  async function runAuthorize(prep: PrepareCampaignResult, tokenId: bigint): Promise<void> {
    if (flowRef.current.authorizeTx) return;
    const hash = await writeContractAsync({
      chainId: zeroG.id,
      address: prep.registryAddress as Address,
      abi: registryAbi,
      functionName: "authorizeUsage",
      args: [tokenId, prep.backendAddress as Address, EMPTY_BYTES],
    });
    setFlow((f) => ({ ...f, authorizeTx: hash }));
    await publicClient!.waitForTransactionReceipt({ hash });
  }

  async function runCreateCampaign(prep: PrepareCampaignResult, tokenId: bigint): Promise<Address> {
    if (flowRef.current.campaignAddress) return flowRef.current.campaignAddress;
    const hash = await writeContractAsync({
      chainId: zeroG.id,
      address: prep.factoryAddress as Address,
      abi: factoryAbi,
      functionName: "createCampaign",
      args: [tokenId, BigInt(wlSize)],
    });
    setFlow((f) => ({ ...f, campaignTx: hash }));
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    const campaignAddress = campaignAddressFromLogs(receipt.logs);
    setFlow((f) => ({ ...f, campaignAddress }));
    return campaignAddress;
  }

  async function submit() {
    if (!address) { setErr("connect a wallet first"); return; }
    if (!publicClient) { setErr("rpc not ready — wait a moment and try again"); return; }
    setErr(null);
    try {
      // Mint must happen on 0G mainnet. We call switchChain unconditionally — it's a no-op if
      // the wallet is already there, and a single user-facing prompt if it isn't. Relying on
      // useChainId() to gate this was unreliable: when MetaMask sits on a chain not in our
      // wagmi config (e.g. Sepolia), useChainId reports the config default and the check passes
      // even though the wallet is somewhere else. Forcing the switch closes that gap.
      try { await switchChainAsync({ chainId: zeroG.id }); }
      catch { throw new Error("Switch your wallet to 0G mainnet (chain 16661) and try again."); }
      setFlow((f) => ({ ...f, stage: "prepare", status: "active" }));
      const prep = await runPrepare();

      setFlow((f) => ({ ...f, stage: "mint", status: "active" }));
      const tokenId = await runMint(prep);

      setFlow((f) => ({ ...f, stage: "authorize", status: "active" }));
      await runAuthorize(prep, tokenId);

      setFlow((f) => ({ ...f, stage: "campaign", status: "active" }));
      const campaignAddress = await runCreateCampaign(prep, tokenId);

      setFlow((f) => ({ ...f, stage: "index", status: "active" }));
      const indexed = await api.indexCampaign({
        slug,
        name,
        targetChain,
        wlSizeCap: wlSize,
        ownerAddress: address,
        visibility,
        personaURI: prep.personaURI,
        lorebookURI: prep.lorebookURI,
        imageURI: prep.imageURI,
        bouncerTokenId: tokenId.toString(),
        bouncerMintTx: flowRef.current.mintTx!,
        authorizeTx: flowRef.current.authorizeTx!,
        campaignAddress,
        campaignTx: flowRef.current.campaignTx!,
      });
      setResult(indexed);
      setFlow((f) => ({ ...f, stage: "done", status: "done" }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setFlow((f) => ({ ...f, status: "failed" }));
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
              <ShareBar
                path={`/c/${result.slug}`}
                shareText={`Apply to ${name || `Bouncer №${tokenId}`} — an AI bouncer on 0G`}
                label="applicant link"
              />
            </div>
            <div className="mt-6">
              <Link href="/" className="text-[13px] tracking-[0.08em] uppercase">← Back to home</Link>
              <span className="mx-3 text-[var(--hanami-ink-soft)]">·</span>
              <Link href={`/c/${result.slug}/admin`} className="text-[13px] tracking-[0.08em] uppercase">Open admin →</Link>
            </div>
          </div>

          <div>
            <BouncerCard tokenId={tokenId} name={name || `Bouncer №${tokenId}`} subtitle="just minted" sealRoot={result.personaRoot} imageUri={result.imageURI ?? null} />
            {address && (
              <div className="mt-6 border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)] p-4">
                <div className="text-[10px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)] mb-2">visibility</div>
                <VisibilityToggle slug={result.slug} ownerAddress={address} current={result.visibility ?? visibility} />
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

            <Field label="Visibility" help="Public bouncers appear on /gallery and accept any wallet. Private bouncers only let the owner in until you flip the switch — you can change this any time on the admin page.">
              <div className="flex border border-[var(--hanami-rule)]">
                {(["private", "public"] as const).map((v) => {
                  const active = visibility === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVisibility(v)}
                      className={`flex-1 px-4 py-2.5 text-[12px] tracking-[0.12em] uppercase transition-colors ${
                        active
                          ? "bg-[var(--hanami-ink)] text-[var(--hanami-paper)]"
                          : "hover:bg-[var(--hanami-paper-soft)]"
                      }`}
                    >
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle ${
                          v === "public" ? "bg-[var(--hanami-moss)]" : "bg-[var(--hanami-stamp)]"
                        }`}
                      />
                      {v}
                    </button>
                  );
                })}
              </div>
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

            {(busy || flow.status === "failed") && (
              <StageProgress flow={flow} />
            )}

            {err && <p className="text-[var(--hanami-stamp)] text-sm font-mono">{err}</p>}

            <button onClick={submit} disabled={busy || !isConnected}
              className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-7 py-3.5 text-[13px] tracking-[0.08em] uppercase hover:bg-[var(--hanami-indigo)] disabled:opacity-40 transition-colors">
              {busy
                ? "Working — check your wallet"
                : flow.status === "failed"
                ? "Retry from where it failed"
                : isConnected
                ? create.submit
                : "Connect to mint"}
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
        <Link href="/" className="flex items-center gap-2.5" style={{ borderBottom: "none" }}>
          <Logo size={28} />
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

function stageStatus(stage: Stage, flow: FlowState): StageStatus {
  const here = STAGES.indexOf(flow.stage);
  const me = STAGES.indexOf(stage);
  if (me < here) return "done";
  if (me > here) return "pending";
  return flow.status;
}

function StageProgress({ flow }: { flow: FlowState }) {
  return (
    <div className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)] p-4 space-y-2">
      <div className="text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] mb-1">
        mint progress
      </div>
      {STAGES.map((stage) => {
        const status = stageStatus(stage, flow);
        const dot = status === "done"
          ? "bg-[var(--hanami-moss)]"
          : status === "active"
          ? "bg-[var(--hanami-sakura)] animate-pulse"
          : status === "failed"
          ? "bg-[var(--hanami-stamp)]"
          : "bg-[var(--hanami-rule)]";
        const text = status === "pending"
          ? "text-[var(--hanami-ink-soft)]"
          : status === "failed"
          ? "text-[var(--hanami-stamp)]"
          : "text-[var(--hanami-ink)]";
        return (
          <div key={stage} className="flex items-center gap-3 text-[13px]">
            <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
            <span className={text}>{STAGE_LABELS[stage]}</span>
          </div>
        );
      })}
    </div>
  );
}

function Row({ k, v, kind }: { k: string; v: string; kind?: "tx" | "address" }) {
  const href = kind ? `https://chainscan.0g.ai/${kind}/${v}` : null;
  return (
    <div className="grid grid-cols-[200px_1fr] gap-3">
      <dt className="text-[var(--hanami-ink-soft)]">{k}</dt>
      <dd className="break-all">{href ? <a href={href} target="_blank" rel="noopener">{v}</a> : v}</dd>
    </div>
  );
}
