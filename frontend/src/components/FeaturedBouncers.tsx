"use client";

import { useEffect, useState } from "react";
import { api, type Campaign } from "@/lib/api";
import { MarketCard } from "./MarketCard";
import { MarketGridSkeleton } from "./Skeleton";

export function FeaturedBouncers() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);

  useEffect(() => {
    api.listAllCampaigns().then((r) => setCampaigns(r.campaigns.slice(0, 3))).catch(() => setCampaigns([]));
  }, []);

  if (campaigns === null) return <MarketGridSkeleton count={3} />;
  if (campaigns.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
      {campaigns.map((c) => <MarketCard key={c.slug} c={c} />)}
    </div>
  );
}
