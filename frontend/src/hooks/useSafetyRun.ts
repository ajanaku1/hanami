"use client";

import { useEffect, useMemo, useState } from "react";
import { safetyClient as defaultClient } from "@/lib/api";
import { hashBouncerContent } from "@/lib/content-hash";
import {
  buildSafetyAuthorizationMessage,
  type SafetyClient,
  type SafetyRun,
  type SafetyScope,
} from "@/lib/safety";

type SafetyPhase = "idle" | "awaiting-signature" | "running" | "passed" | "failed" | "interrupted" | "error";

type UseSafetyRunOptions = {
  scope: SafetyScope;
  slug: string;
  persona: string;
  lorebook: string;
  ownerAddress?: string;
  contentHash?: string;
  signMessage: (message: string) => Promise<string>;
  client?: SafetyClient;
  pollIntervalMs?: number;
};

export function useSafetyRun(options: UseSafetyRunOptions) {
  const client = options.client ?? defaultClient;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const exactHash = useMemo(
    () => options.contentHash ?? hashBouncerContent(options.persona, options.lorebook),
    [options.contentHash, options.lorebook, options.persona],
  );
  const [run, setRun] = useState<SafetyRun | null>(null);
  const [phase, setPhase] = useState<SafetyPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const currentRun = run?.contentHash === exactHash ? run : null;
  const currentPhase = run && !currentRun ? "idle" : phase;
  const currentError = run && !currentRun ? null : error;

  useEffect(() => {
    if (!currentRun || currentRun.status !== "running") return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const next = await client.get(currentRun.id);
        if (!cancelled) update(next);
      } catch (caught) {
        if (!cancelled) fail(caught);
      }
    }, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [client, currentRun, pollIntervalMs]);

  function update(next: SafetyRun): void {
    setRun(next);
    setPhase(next.status);
    setError(next.error?.message ?? null);
  }

  function fail(caught: unknown): void {
    setPhase("error");
    setError(caught instanceof Error ? caught.message : "The safety request failed.");
  }

  async function authorize(contentHash: string) {
    if (!options.ownerAddress) throw new Error("Connect the owner wallet first.");
    const nonce = Date.now();
    const message = buildSafetyAuthorizationMessage({
      scope: options.scope,
      slug: options.slug,
      contentHash,
      nonce,
    });
    return {
      caller: options.ownerAddress,
      nonce,
      signature: await options.signMessage(message),
    };
  }

  async function start(): Promise<void> {
    setPhase("awaiting-signature");
    setError(null);
    try {
      const auth = await authorize(exactHash);
      const next = await client.start({
        scope: options.scope,
        slug: options.slug,
        ...(options.scope === "draft" ? { persona: options.persona, lorebook: options.lorebook } : {}),
        ...auth,
      });
      update(next);
    } catch (caught) {
      fail(caught);
    }
  }

  async function resume(): Promise<void> {
    if (!run) return;
    setPhase("awaiting-signature");
    setError(null);
    try {
      const auth = await authorize(run.contentHash);
      update(await client.resume(run.id, auth));
    } catch (caught) {
      fail(caught);
    }
  }

  return { run: currentRun, phase: currentPhase, error: currentError, contentHash: exactHash, start, resume };
}
