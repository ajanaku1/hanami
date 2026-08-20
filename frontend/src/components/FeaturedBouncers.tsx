"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Campaign } from "@/lib/api";
import { MarketCard } from "./MarketCard";
import { MarketGridSkeleton } from "./Skeleton";

// Distinct states so a downed backend is visible instead of silently rendering nothing — an
// unreachable API and a genuinely empty list are very different and shouldn't look identical.
type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; campaigns: Campaign[] };

export function FeaturedBouncers() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    api
      .listAllCampaigns()
      .then((r) => setState({ status: "ready", campaigns: r.campaigns.slice(0, 3) }))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.listAllCampaigns()
      .then((response) => {
        if (!cancelled) setState({ status: "ready", campaigns: response.campaigns.slice(0, 3) });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") return <MarketGridSkeleton count={3} />;
  if (state.status === "error") return <FeaturedBouncersError onRetry={load} />;
  if (state.campaigns.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
      {state.campaigns.map((c) => <MarketCard key={c.slug} c={c} />)}
    </div>
  );
}

function FeaturedBouncersError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border border-[var(--hanami-rule)] bg-[var(--hanami-paper-soft)] px-8 py-12 text-center">
      <p className="font-serif text-[20px] mb-2">Couldn&apos;t reach the backend.</p>
      <p className="text-[14px] text-[var(--hanami-ink-soft)] mb-6 max-w-[42ch] mx-auto">
        The service may be waking up from idle — this can take up to a minute on a cold start.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-[13px] tracking-[0.08em] uppercase border border-[var(--hanami-rule)] px-5 py-2.5 hover:bg-[var(--hanami-rule)]/20 transition-colors"
      >
        Try again →
      </button>
    </div>
  );
}
