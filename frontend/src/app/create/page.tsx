"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient, useSignMessage, useSwitchChain, useWriteContract } from "wagmi";
import { zeroG } from "@/lib/wagmi";
import type { Address } from "viem";
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
import { useSafetyRun } from "@/hooks/useSafetyRun";
import { SafetyReport } from "@/components/safety/SafetyReport";
import { Button } from "@/components/ui/Button";
import { AsyncNotice } from "@/components/ui/AsyncNotice";
import { AppHeader } from "@/components/ui/AppHeader";
import { Field } from "@/components/ui/Field";
import {
  assertReceiptConfirmed,
  CREATE_STAGES,
  INITIAL_CREATE_FLOW,
  nextIncompleteStage,
  stageStatus,
  type CreateFlowState,
  type CreateStage,
  type CreateStageStatus,
} from "@/lib/create-flow";

const CHAINS = [
  { value: "ethereum", label: "Ethereum" },
  { value: "base", label: "Base" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "op", label: "Optimism" },
  { value: "0g", label: "0G" },
] as const;

const STAGE_LABELS: Record<CreateStage, string> = {
  prepare: "Reusing certified roots + generating portrait",
  mint: "Mint your bouncer iNFT (signature 1/3)",
  authorize: "Authorize the AI bouncer (signature 2/3)",
  campaign: "Deploy your campaign (signature 3/3)",
  index: "Finalizing",
  done: "Done",
};

export default function CreatePage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [targetChain, setTargetChain] = useState<typeof CHAINS[number]["value"]>("base");
  const [wlSize, setWlSize] = useState(100);
  const [persona, setPersona] = useState("");
  const [lorebook, setLorebook] = useState("");
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: zeroG.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const [result, setResult] = useState<CreateCampaignResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flow, setFlow] = useState<CreateFlowState>(INITIAL_CREATE_FLOW);
  const flowRef = useRef(flow);
  const busy = ["active", "wallet", "submitted", "confirmed"].includes(flow.status);
  const safety = useSafetyRun({
    scope: "draft",
    slug,
    persona,
    lorebook,
    ownerAddress: address,
    signMessage: (message) => signMessageAsync({ message }),
  });
  const safetyBusy = safety.phase === "awaiting-signature" || safety.phase === "running";
  const safetyPassed = safety.phase === "passed" && safety.run?.status === "passed";

  // preview seal seeded by the slug (or persona length as a fallback) so it changes as you type
  const previewSeed = useMemo(() => {
    const src = slug || name || persona.slice(0, 16);
    let h = 5381;
    for (const ch of src) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
    return Math.abs(h) || 3;
  }, [slug, name, persona]);

  function updateFlow(update: (current: CreateFlowState) => CreateFlowState): void {
    const next = update(flowRef.current);
    flowRef.current = next;
    setFlow(next);
  }

  async function runPrepare(): Promise<PrepareCampaignResult> {
    if (flowRef.current.prepared) return flowRef.current.prepared;
    if (!safety.run || safety.run.status !== "passed") throw new Error("Pass the Bouncer Safety Report before minting.");
    const prep = await api.prepareCampaign({
      slug,
      persona,
      lorebook,
      ownerAddress: address!,
      safetyRunId: safety.run.id,
    });
    updateFlow((current) => ({ ...current, prepared: prep, status: "done" }));
    return prep;
  }

  async function runMint(prep: PrepareCampaignResult): Promise<bigint> {
    if (flowRef.current.tokenId !== null) return flowRef.current.tokenId;
    const hash = await writeContractAsync({
      chainId: zeroG.id,
      address: prep.registryAddress as Address,
      abi: registryAbi,
      functionName: "mintBouncer",
      args: [prep.personaURI, prep.lorebookURI, prep.imageURI, ZERO_BYTES32],
    });
    updateFlow((current) => ({ ...current, mintTx: hash, status: "submitted" }));
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    assertReceiptConfirmed(receipt.status, "mint");
    const tokenId = tokenIdFromMintLogs(receipt.logs);
    updateFlow((current) => ({ ...current, tokenId, status: "confirmed" }));
    return tokenId;
  }

  async function runAuthorize(prep: PrepareCampaignResult, tokenId: bigint): Promise<void> {
    if (flowRef.current.authorizeConfirmed) return;
    const hash = await writeContractAsync({
      chainId: zeroG.id,
      address: prep.registryAddress as Address,
      abi: registryAbi,
      functionName: "authorizeUsage",
      args: [tokenId, prep.backendAddress as Address, EMPTY_BYTES],
    });
    updateFlow((current) => ({ ...current, authorizeTx: hash, status: "submitted" }));
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    assertReceiptConfirmed(receipt.status, "authorize");
    updateFlow((current) => ({ ...current, authorizeConfirmed: true, status: "confirmed" }));
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
    updateFlow((current) => ({ ...current, campaignTx: hash, status: "submitted" }));
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    assertReceiptConfirmed(receipt.status, "campaign");
    const campaignAddress = campaignAddressFromLogs(receipt.logs);
    updateFlow((current) => ({ ...current, campaignAddress, status: "confirmed" }));
    return campaignAddress;
  }

  async function submit() {
    if (!address) { setErr("connect a wallet first"); return; }
    if (!publicClient) { setErr("rpc not ready — wait a moment and try again"); return; }
    if (!safetyPassed) { setErr("Run and pass the gasless safety test before minting."); return; }
    setErr(null);
    try {
      // Mint must happen on 0G mainnet. We call switchChain unconditionally — it's a no-op if
      // the wallet is already there, and a single user-facing prompt if it isn't. Relying on
      // useChainId() to gate this was unreliable: when MetaMask sits on a chain not in our
      // wagmi config (e.g. Sepolia), useChainId reports the config default and the check passes
      // even though the wallet is somewhere else. Forcing the switch closes that gap.
      try { await switchChainAsync({ chainId: zeroG.id }); }
      catch { throw new Error("Switch your wallet to 0G mainnet (chain 16661) and try again."); }
      const resumeStage = nextIncompleteStage(flowRef.current);
      if (resumeStage !== "prepare") {
        const status = resumeStage === "index" ? "active" : "wallet";
        updateFlow((current) => ({ ...current, stage: resumeStage, status }));
      }
      if (!flowRef.current.prepared) {
        updateFlow((current) => ({ ...current, stage: "prepare", status: "active" }));
      }
      const prep = await runPrepare();

      if (flowRef.current.tokenId === null) {
        updateFlow((current) => ({ ...current, stage: "mint", status: "wallet" }));
      }
      const tokenId = await runMint(prep);

      if (!flowRef.current.authorizeConfirmed) {
        updateFlow((current) => ({ ...current, stage: "authorize", status: "wallet" }));
      }
      await runAuthorize(prep, tokenId);

      if (!flowRef.current.campaignAddress) {
        updateFlow((current) => ({ ...current, stage: "campaign", status: "wallet" }));
      }
      const campaignAddress = await runCreateCampaign(prep, tokenId);

      updateFlow((current) => ({ ...current, stage: "index", status: "active" }));
      const indexed = await api.indexCampaign({
        slug,
        name,
        targetChain,
        wlSizeCap: wlSize,
        ownerAddress: address,
        visibility: "private",
        personaURI: prep.personaURI,
        lorebookURI: prep.lorebookURI,
        imageURI: prep.imageURI,
        bouncerTokenId: tokenId.toString(),
        bouncerMintTx: flowRef.current.mintTx!,
        authorizeTx: flowRef.current.authorizeTx!,
        campaignAddress,
        campaignTx: flowRef.current.campaignTx!,
        safetyRunId: safety.run!.id,
      });
      setResult(indexed);
      updateFlow((current) => ({ ...current, stage: "done", status: "done" }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      updateFlow((current) => ({ ...current, status: "failed" }));
    }
  }

  if (result) {
    const link = typeof window !== "undefined" ? `${window.location.origin}/c/${result.slug}` : `/c/${result.slug}`;
    const tokenId = Number(result.bouncerTokenId);
    return (
      <>
        <PetalsCanvas />
        <Header />
        <main className="relative z-10 max-w-[1240px] mx-auto px-5 sm:px-10 py-12 sm:py-16 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12 lg:gap-16 items-start">
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
                <VisibilityToggle slug={result.slug} ownerAddress={address} current={result.visibility ?? "private"} />
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
      <main className="relative z-10 max-w-[1240px] mx-auto px-5 sm:px-10 py-10 sm:py-12 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-12 lg:gap-16 items-start">
        <div>
          <h1 className="font-serif text-[44px] leading-tight mb-3">{create.heading}</h1>
          <p className="text-[var(--hanami-ink-soft)] mb-10 max-w-[58ch]">{create.intro}</p>

          <div className="space-y-7">
            <Field label={create.campaignNameLabel}>
              <input className={inputCls} placeholder={create.campaignNamePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            <Field label="Slug (used in the applicant URL)">
              <input disabled={safetyBusy} className={inputCls} placeholder="sakura-society-2026" value={slug}
                     onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
            </Field>

            <Field label={create.targetChainLabel}>
              <select className={inputCls} value={targetChain} onChange={(e) => setTargetChain(e.target.value as typeof targetChain)}>
                {CHAINS.map((ch) => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
              </select>
            </Field>

            <Field label={create.wlSizeLabel} hint={create.wlSizeHelp}>
              <input className={inputCls} type="number" min={1} value={wlSize} onChange={(e) => setWlSize(Number(e.target.value))} />
            </Field>

            <section aria-labelledby="publication-heading">
              <h2 id="publication-heading" className="text-sm mb-1.5">Publication</h2>
              <p className="text-xs text-[var(--hanami-ink-soft)] mb-2 max-w-[58ch]">
                Every new campaign begins private. Its certified report travels into Admin, where the owner can publish deliberately.
              </p>
              <div className="ui-notice" data-tone="info">Private by default · publication stays backend-gated</div>
            </section>

            <fieldset className="ui-field">
              <legend className="ui-field__label">{create.personaLabel}</legend>
              <p className="ui-field__hint">{create.personaHelp}</p>
              <div className="flex flex-wrap gap-2 mb-2 text-xs">
                {Object.values(personaPresets).map((p) => (
                  <button key={p.label} type="button" disabled={safetyBusy}
                    className="px-3 py-1 border border-[var(--hanami-rule)] hover:border-[var(--hanami-ink-soft)] text-[var(--hanami-ink-soft)]"
                    onClick={() => setPersona(p.seed)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <textarea aria-label={create.personaLabel} disabled={safetyBusy} className={`${inputCls} min-h-[180px]`} placeholder={create.personaPlaceholder} value={persona} onChange={(e) => setPersona(e.target.value)} />
            </fieldset>

            <Field label={create.lorebookLabel} hint={create.lorebookHelp}>
              <textarea disabled={safetyBusy} className={`${inputCls} min-h-[120px]`} value={lorebook} onChange={(e) => setLorebook(e.target.value)} />
            </Field>

            <section className="border-t border-[var(--hanami-rule)] pt-7">
              <div className="flex flex-wrap items-end justify-between gap-5 mb-5">
                <div>
                  <p className="eyebrow">Readiness gate · gasless</p>
                  <h2 className="font-serif text-[32px]">Test this exact bouncer.</h2>
                  <p className="text-sm text-[var(--hanami-ink-soft)] mt-2 max-w-[58ch]">
                    Your signature authorizes eight fixed simulations. Nothing is sent on-chain and no simulated conversation is published.
                  </p>
                </div>
                {!safetyPassed && (
                  <Button
                    onClick={safety.start}
                    busy={safetyBusy}
                    disabled={!isConnected || persona.length < 50 || slug.length < 3}
                  >
                    {safetyActionLabel(safety.phase)}
                  </Button>
                )}
              </div>
              {safety.error && !safety.run && <AsyncNotice tone="error">{safety.error}</AsyncNotice>}
              {safety.run && <SafetyReport run={safety.run} onRetry={safety.resume} />}
            </section>

            <section aria-labelledby="campaign-owner-heading">
              <h2 id="campaign-owner-heading" className="text-sm mb-1.5">Campaign owner</h2>
              {isConnected && address ? (
                <div className="border border-[var(--hanami-rule)] px-3 py-2 font-mono text-sm">{address}</div>
              ) : (
                <div className="border border-[var(--hanami-rule)] px-3 py-2">
                  <ConnectButton />
                </div>
              )}
            </section>

            {(busy || flow.status === "failed") && (
              <StageProgress flow={flow} />
            )}

            {err && <p className="text-[var(--hanami-stamp)] text-sm font-mono">{err}</p>}

            <button onClick={submit} disabled={busy || !isConnected || !safetyPassed}
              className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-7 py-3.5 text-[13px] tracking-[0.08em] uppercase hover:bg-[var(--hanami-indigo)] disabled:opacity-40 transition-colors">
              {submitLabel({ busy, failed: flow.status === "failed", isConnected, safetyPassed })}
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
            <div className="bg-[var(--hanami-paper-raised)] border border-[var(--hanami-rule)] aspect-square flex items-center justify-center p-4">
              <Seal seed={previewSeed} className="w-[80%] h-[80%]" />
            </div>
            <p className="mt-4 text-xs text-[var(--hanami-ink-soft)] leading-relaxed">
              The seal is generated from the bouncer&apos;s tokenId at mint. This is a preview based on the slug.
              The real seal is locked once you mint.
            </p>
          </div>
        </aside>
      </main>
    </>
  );
}

function Header() {
  return <AppHeader actions={<ConnectButton compact />} />;
}

const inputCls = "w-full bg-transparent border border-[var(--hanami-rule)] px-3 py-2 text-[var(--hanami-ink)] focus:outline-none focus:border-[var(--hanami-ink)] transition-colors";

function safetyActionLabel(phase: ReturnType<typeof useSafetyRun>["phase"]): string {
  if (phase === "awaiting-signature") return "Confirm gasless signature";
  if (phase === "running") return "Testing 8 scenarios";
  return "Run safety test";
}

function submitLabel(state: { busy: boolean; failed: boolean; isConnected: boolean; safetyPassed: boolean }): string {
  if (state.busy) return "Working — check your wallet";
  if (state.failed) return "Retry from where it failed";
  if (!state.isConnected) return "Connect to test";
  return state.safetyPassed ? create.submit : "Pass safety to mint";
}

function StageProgress({ flow }: { flow: CreateFlowState }) {
  return (
    <div className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)] p-4 space-y-2">
      <div className="text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] mb-1">
        mint progress
      </div>
      {CREATE_STAGES.map((stage) => {
        const status = stageStatus(stage, flow);
        const dot = stageDotClass(status);
        const text = stageTextClass(status);
        return (
          <div key={stage} className="grid grid-cols-[8px_1fr] items-start gap-3 text-[13px]">
            <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
            <span className={text}>
              {STAGE_LABELS[stage]}
              <small className="block text-[10px] tracking-[0.08em] uppercase">{stageStatusLabel(status)}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function stageStatusLabel(status: CreateStageStatus): string {
  if (status === "wallet") return "Waiting for wallet";
  if (status === "submitted") return "Submitted · awaiting confirmation";
  if (status === "confirmed") return "Confirmed on 0G";
  if (status === "done") return "Complete";
  if (status === "active") return "In progress";
  if (status === "failed") return "Failed · safe to retry";
  return "Waiting";
}

function stageDotClass(status: CreateStageStatus): string {
  if (status === "done" || status === "confirmed") return "bg-[var(--hanami-moss)]";
  if (status === "active" || status === "wallet" || status === "submitted") {
    return "bg-[var(--hanami-sakura)] animate-pulse";
  }
  if (status === "failed") return "bg-[var(--hanami-stamp)]";
  return "bg-[var(--hanami-rule)]";
}

function stageTextClass(status: CreateStageStatus): string {
  if (status === "pending") return "text-[var(--hanami-ink-soft)]";
  if (status === "failed") return "text-[var(--hanami-stamp)]";
  return "text-[var(--hanami-ink)]";
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
