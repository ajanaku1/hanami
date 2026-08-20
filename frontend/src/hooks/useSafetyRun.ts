"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const storageKey = useMemo(
    () => options.ownerAddress
      ? `hanami:safety:v1:${options.scope}:${options.slug}:${options.ownerAddress.toLowerCase()}:${exactHash}`
      : null,
    [exactHash, options.ownerAddress, options.scope, options.slug],
  );

  const update = useCallback((next: SafetyRun): void => {
    setRun(next);
    setPhase(next.status);
    setError(next.error?.message ?? null);
    if (storageKey) window.localStorage.setItem(storageKey, next.id);
  }, [storageKey]);

  const currentRun = run?.contentHash === exactHash ? run : null;
  const currentPhase = run && !currentRun ? "idle" : phase;
  const currentError = run && !currentRun ? null : error;

  useEffect(() => {
    if (!storageKey) return;
    const savedRunId = window.localStorage.getItem(storageKey);
    if (!savedRunId) return;
    let cancelled = false;
    client.get(savedRunId)
      .then((restored) => {
        if (cancelled) return;
        const matches = restored.scope === options.scope
          && restored.slug === options.slug
          && restored.contentHash === exactHash
          && restored.ownerAddress.toLowerCase() === options.ownerAddress?.toLowerCase();
        if (matches) update(restored);
        else {
          window.localStorage.removeItem(storageKey);
          setPhase("idle");
        }
      })
      .catch((caught) => {
        if (!cancelled) fail(caught);
      });
    return () => {
      cancelled = true;
    };
  }, [client, exactHash, options.ownerAddress, options.scope, options.slug, storageKey, update]);

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
  }, [client, currentRun, pollIntervalMs, update]);

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
