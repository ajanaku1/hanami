"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useAccount } from "wagmi";
import { applicant } from "@/copy";
import { api, warmBackend, type Campaign, type TurnResult } from "@/lib/api";
import { PetalsCanvas } from "@/components/PetalsCanvas";
import { Portrait, pickVariant } from "@/components/Portrait";
import { Seal } from "@/components/Seal";
import { VerifyOn0G } from "@/components/VerifyOn0G";
import { ConnectButton } from "@/components/ConnectButton";
import { friendlyError } from "@/lib/errors";

type Params = { slug: string };
type Msg = { role: "applicant" | "bouncer"; content: string };

export default function ApplicantPage({ params }: { params: Promise<Params> }) {
  const { slug } = use(params);
  const { address, isConnected } = useAccount();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [started, setStarted] = useState(false);
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<TurnResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wallet = address ?? "";

  // Warm the (free-tier) backend the moment the page opens so it wakes in the background instead of
  // the applicant's first message eating a 30–60s cold start. Fire-and-forget; getCampaign below
  // retries transient failures on its own if the box is still coming up.
  useEffect(() => { void warmBackend(); }, []);

  useEffect(() => {
    api.getCampaign(slug).then(setCampaign).catch((e) => setErr(friendlyError(e)));
  }, [slug]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history.length]);

  // Bouncer opens the conversation. Fires once when chat starts and history is still empty.
  const greetingRequested = useRef(false);
  useEffect(() => {
    if (!started || !address || history.length > 0 || greetingRequested.current) return;
    greetingRequested.current = true;
    setBusy(true);
    api.beginChat(slug, address)
      .then((r) => setHistory([{ role: "bouncer", content: r.reply }]))
      .catch((e) => setErr(friendlyError(e)))
      .finally(() => setBusy(false));
  }, [started, address, history.length, slug]);

  async function send() {
    if (!input.trim() || busy || !address) return;
    const msg = input.trim();
    setInput("");
    setHistory((h) => [...h, { role: "applicant", content: msg }]);
    setBusy(true);
    setErr(null);
    try {
      const r = await api.sendTurn(slug, address, msg);
      setHistory((h) => [...h, { role: "bouncer", content: r.reply }]);
      if (r.decision) setDecision(r);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (err && !campaign) return <Shell><p className="text-sm text-[var(--hanami-stamp)]">{err}</p></Shell>;
  if (!campaign) return (
    <Shell>
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-12 items-center max-w-3xl">
        <div className="aspect-[0.72/1] bg-[var(--hanami-paper-soft)] border border-[var(--hanami-rule)] animate-pulse" />
        <div className="space-y-4">
          <div className="h-3 w-32 bg-[var(--hanami-rule)]/40 animate-pulse" />
          <div className="h-10 w-72 bg-[var(--hanami-rule)]/40 animate-pulse" />
          <div className="h-4 w-80 bg-[var(--hanami-rule)]/40 animate-pulse" />
          <div className="h-4 w-64 bg-[var(--hanami-rule)]/40 animate-pulse" />
        </div>
      </div>
    </Shell>
  );

  const tokenId = campaign.bouncer_token_id;
  const variant = pickVariant(tokenId);
  const bouncerName = campaign.name.split(" ")[0] ?? `№${tokenId}`;
  const isOwner = isConnected && address && address.toLowerCase() === campaign.owner_address.toLowerCase();
  const blockedPrivate = campaign.visibility === "private" && !isOwner;

  if (blockedPrivate) {
    return (
      <Shell>
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-12 items-center">
          <div className="aspect-[0.72/1] border border-[var(--hanami-rule)] overflow-hidden bg-[var(--hanami-paper-soft)]">
            <Portrait variant={variant} imageUri={campaign.image_uri} className="w-full h-full" />
          </div>
          <div className="text-left">
            <div className="text-[11px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)] mb-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--hanami-stamp)] mr-2 align-middle" />
              private · invite only
            </div>
            <h1 className="font-serif text-[40px] leading-tight mb-3">{campaign.name}</h1>
            <p className="text-[var(--hanami-ink-soft)] mb-2 max-w-[44ch]">
              This bouncer is private. The owner hasn&apos;t opened it for public applications yet.
            </p>
            <p className="text-[var(--hanami-ink-soft)] text-[13px] max-w-[44ch]">
              If you&apos;ve been invited, the owner will share access directly. Otherwise, browse other bouncers in the gallery.
            </p>
            <div className="mt-8">
              <Link href="/gallery" className="text-[13px] tracking-[0.08em] uppercase">← back to gallery</Link>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  if (!started) {
    return (
      <Shell>
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-12 items-center">
          <div className="aspect-[0.72/1] border border-[var(--hanami-rule)] overflow-hidden bg-[var(--hanami-paper-soft)]">
            <Portrait variant={variant} imageUri={campaign.image_uri} className="w-full h-full" />
          </div>
          <div className="text-left">
            <div className="text-[11px] tracking-[0.18em] uppercase text-[var(--hanami-ink-soft)] mb-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--hanami-sakura)] mr-2 align-middle" />
              token №{tokenId} · {campaign.target_chain}
            </div>
            <h1 className="font-serif text-[40px] leading-tight mb-3">{campaign.name}</h1>
            <p className="text-[var(--hanami-ink-soft)] mb-8 max-w-[44ch]">{applicant.preConnect.body}</p>
            {isConnected && address ? (
              <>
                <div className="text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] mb-2">connected</div>
                <div className="font-mono text-sm mb-5">{address}</div>
                <button
                  onClick={() => setStarted(true)}
                  className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-6 py-3 text-sm tracking-[0.08em] uppercase hover:bg-[var(--hanami-indigo)] transition-colors"
                >
                  Begin
                </button>
                <span className="ml-4"><ConnectButton compact /></span>
              </>
            ) : (
              <ConnectButton />
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (decision) {
    const approved = decision.decision === "approve";
    const copy = approved ? applicant.decision.approved : applicant.decision.rejected;
    return (
      <Shell>
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-12 items-center">
          <div className="aspect-[0.72/1] border border-[var(--hanami-rule)] overflow-hidden bg-white p-4 flex items-center justify-center">
            <Seal seed={tokenId} className="w-[80%] h-[80%]" />
          </div>
          <div>
            <h1 className={`font-serif text-[44px] leading-tight mb-4 ${approved ? "text-[var(--hanami-moss)]" : "text-[var(--hanami-stamp)]"}`}>
              {copy.title}
            </h1>
            <p className="text-[var(--hanami-ink-soft)] mb-8 max-w-[44ch]">{copy.body}</p>
            {decision.decisionTx && wallet && (
              <div className="max-w-md">
                <div className="text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] mb-2">
                  {applicant.decision.approved.receiptLabel}
                </div>
                <VerifyOn0G slug={slug} wallet={wallet} />
              </div>
            )}
            <div className="mt-8 flex gap-6 text-[12px] tracking-[0.12em] uppercase">
              <Link href="/gallery" className="border-b border-[var(--hanami-rule)] hover:border-[var(--hanami-ink)] pb-0.5">
                ← back to gallery
              </Link>
              <Link href="/" className="border-b border-[var(--hanami-rule)] hover:border-[var(--hanami-ink)] pb-0.5 text-[var(--hanami-ink-soft)]">
                home
              </Link>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-10">
        <aside className="hidden lg:block">
          <div className="aspect-[0.72/1] border border-[var(--hanami-rule)] overflow-hidden bg-[var(--hanami-paper-soft)] sticky top-8">
            <Portrait variant={variant} imageUri={campaign.image_uri} className="w-full h-full" />
          </div>
          <div className="mt-3 text-[11px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] text-center">
            №{tokenId} · {bouncerName}
          </div>
        </aside>

        <div className="flex flex-col h-[80vh] max-h-[820px]">
          <header className="pb-3 mb-4 border-b border-[var(--hanami-rule)] flex justify-between items-baseline">
            <div>
              <div className="font-serif text-[20px]">{campaign.name}</div>
              <div className="text-[11px] text-[var(--hanami-ink-soft)] font-mono mt-0.5">
                {wallet.slice(0, 8)}…{wallet.slice(-6)}
              </div>
            </div>
            <div className="text-[10px] tracking-[0.16em] uppercase text-[var(--hanami-ink-soft)] flex items-center">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--hanami-sakura)] mr-2" />
              private · TEE
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-5 pr-2">
            {history.map((m, i) => (
              <Turn key={i} role={m.role} content={m.content} variant={variant} imageUri={campaign.image_uri} />
            ))}
            {busy && (
              <div className="text-[var(--hanami-ink-soft)] flex items-center gap-2 pl-0.5">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--hanami-ink-soft)] animate-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--hanami-ink-soft)] animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--hanami-ink-soft)] animate-pulse" style={{ animationDelay: "300ms" }} />
                </span>
                <span className="text-[11px] tracking-[0.16em] uppercase">bouncer is thinking</span>
              </div>
            )}
            {err && <div className="text-sm text-[var(--hanami-stamp)]">{err}</div>}
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
              className="bg-[var(--hanami-ink)] text-[var(--hanami-paper)] px-5 text-sm tracking-[0.08em] uppercase disabled:opacity-40 transition-colors">
              {applicant.chat.send}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Turn({ role, content, variant, imageUri }: { role: "applicant" | "bouncer"; content: string; variant: ReturnType<typeof pickVariant>; imageUri: string | null }) {
  if (role === "bouncer") {
    return (
      <div className="flex gap-3">
        <div className="lg:hidden w-9 h-9 shrink-0 overflow-hidden border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)]">
          <Portrait variant={variant} imageUri={imageUri} className="w-full h-full" />
        </div>
        <div>
          <div className="text-[11px] tracking-[0.14em] uppercase text-[var(--hanami-ink-soft)] mb-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--hanami-sakura)] mr-2 align-middle" />
            bouncer
          </div>
          <div className="font-serif text-[19px] leading-[1.5] max-w-[60ch]">{content}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="ml-12 pl-4 border-l border-[var(--hanami-rule)]">
      <div className="text-[11px] tracking-[0.14em] uppercase text-[var(--hanami-ink-soft)] mb-1">you</div>
      <div className="text-[15px] leading-[1.55] max-w-[60ch]">{content}</div>
    </div>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <>
      <PetalsCanvas />
      <header className="relative z-10 flex justify-between items-center px-10 py-5">
        <Link href="/" className="flex items-center gap-2.5" style={{ borderBottom: "none" }}>
          <Logo size={28} />
          <span className="font-serif text-[24px] tracking-wider">Hanami</span>
          <span className="text-[18px] text-[var(--hanami-ink-soft)]">花見</span>
        </Link>
      </header>
      <main className={`relative z-10 mx-auto px-8 py-10 ${wide ? "max-w-[1240px]" : "max-w-[960px]"}`}>
        {children}
      </main>
    </>
  );
}
