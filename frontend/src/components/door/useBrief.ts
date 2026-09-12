"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { BriefView } from "./BriefPanel";

/// Reads the applicant's own ledger brief once the Door is open.
///
/// The read is the server's job and can take up to twelve seconds, so the panel shows that it is
/// reading rather than nothing. A failure here is never surfaced as an error: the brief is
/// evidence, and an interview goes ahead without it (FR-011).

const UNAVAILABLE: BriefView = {
  status: "unavailable",
  flipsWithin7d: 0,
  sameCounterpartySales: 0,
  medianHoldingDays: null,
  swapCount: 0,
  sourcesRead: [],
  truncated: false,
};

export function useBrief(slug: string, wallet: string | null, ready: boolean) {
  // The answer is kept with the wallet it belongs to, so a wallet change reads as "still reading"
  // without an effect having to reset anything.
  const [answer, setAnswer] = useState<{ key: string; brief: BriefView } | null>(null);
  const key = `${slug}:${wallet ?? ""}`;

  useEffect(() => {
    if (!ready || !wallet) return;
    let live = true;
    api
      .getBrief(slug, wallet)
      .then((brief) => {
        if (live) setAnswer({ key: `${slug}:${wallet}`, brief });
      })
      .catch(() => {
        if (live) setAnswer({ key: `${slug}:${wallet}`, brief: UNAVAILABLE });
      });
    return () => {
      live = false;
    };
  }, [slug, wallet, ready]);

  const current = answer?.key === key ? answer.brief : null;
  return { brief: current, loading: ready && wallet !== null && current === null };
}
