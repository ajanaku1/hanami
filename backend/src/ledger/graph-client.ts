/// Reads a wallet's history from The Graph's decentralized gateway.
///
/// Seven subgraphs, two query templates. Five NFT marketplaces answer the same `Trade` template and
/// two exchanges answer the same `Swap` template, because they publish the same standardized
/// schema — that shared shape is the whole reason one brief can span seven protocols.
///
/// The read is best-effort by design. Every source is asked at once, the whole read is bounded by
/// one budget, and a source that fails or answers late is recorded as unread instead of failing the
/// application. The brief is `unavailable` only when nothing answered; an interview never waits on
/// the gateway longer than the budget.

import { PAGE_CAP, buildBrief, type LedgerBrief, type SourceRead, type Swap, type Trade } from "./brief.js";

export type SourceKind = "marketplace" | "dex";
export type LedgerSource = { name: string; subgraphId: string; kind: SourceKind };

/// The published subgraph ids read at runtime; they appear verbatim on the receipt.
export const LEDGER_SOURCES: LedgerSource[] = [
  { name: "opensea-v1", subgraphId: "GSjXo5Vd1EPaMGRJBYe6HoBKv7WSq3miCrRRZJbTCHkT", kind: "marketplace" },
  { name: "opensea-v2", subgraphId: "ECtdoov16DUmk5qbhFx4PVVN7vidiNDwzFNsui6FoHEo", kind: "marketplace" },
  { name: "seaport", subgraphId: "2GmLsgYGWoFoouZzKjp8biYDkfmeLTkEY3VDQyZqSJHA", kind: "marketplace" },
  { name: "x2y2", subgraphId: "3cMswgcjkpLmuF99ViQRZfCPRyCsnimqQsR9z6mY5e2i", kind: "marketplace" },
  { name: "looksrare", subgraphId: "FsT2DES8UdhfDkXCtE56h5WCDrrSXrtJiSMgNWvSdyYL", kind: "marketplace" },
  { name: "uniswap-v3", subgraphId: "4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6", kind: "dex" },
  { name: "sushiswap", subgraphId: "77jZ9KWeyi3CJ96zkkj5s1CojKPHt6XJKjLFzsDCd8Fd", kind: "dex" },
];

/// The whole read, not one request. Slower than this and the applicant waits too long (SC-006).
export const GRAPH_BUDGET_MS = 12_000;

const GATEWAY_BASE = "https://gateway.thegraph.com/api/subgraphs/id";

/// The key goes in the Authorization header, never in the path, so a logged url leaks nothing.
export function gatewayUrl(subgraphId: string): string {
  return `${GATEWAY_BASE}/${subgraphId}`;
}

type GraphResponse = { ok: boolean; status: number; json(): Promise<unknown> };
export type GraphFetch = (url: string, init: RequestInit) => Promise<GraphResponse>;

/// Both sides of the wallet in one request: what it bought and what it sold, newest first. The page
/// size is written out rather than passed as a variable so the cap is readable in the query itself;
/// a test holds it equal to PAGE_CAP.
const TRADE_QUERY = `query WalletTrades($wallet: String!) {
  bought: trades(where: { buyer: $wallet }, orderBy: timestamp, orderDirection: desc, first: 500) {
    collection { id }
    tokenId
    buyer
    seller
    timestamp
  }
  sold: trades(where: { seller: $wallet }, orderBy: timestamp, orderDirection: desc, first: 500) {
    collection { id }
    tokenId
    buyer
    seller
    timestamp
  }
}`;

const SWAP_QUERY = `query WalletSwaps($wallet: String!) {
  swaps(where: { from: $wallet }, orderBy: timestamp, orderDirection: desc, first: 500) {
    from
    timestamp
  }
}`;

export type ReadLedgerRequest = {
  wallet: string;
  apiKey: string;
  fetchImpl: GraphFetch;
  readAt: number;
  budgetMs?: number;
  sources?: LedgerSource[];
  log?: (line: string) => void;
};

/// Messari publishes addresses as plain strings, but some deployments expose them as entities.
/// Accept either rather than lose a source to a schema detail.
function addressOf(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return fallback;
}

function secondsOf(value: unknown): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : 0;
}

function toTrades(nodes: unknown, source: string, wallet: string): Trade[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node) => {
    const row = node as Record<string, unknown>;
    return {
      source,
      collection: addressOf(row.collection, ""),
      tokenId: String(row.tokenId ?? ""),
      buyer: addressOf(row.buyer, wallet),
      seller: addressOf(row.seller, wallet),
      timestamp: secondsOf(row.timestamp),
    };
  });
}

function toSwaps(nodes: unknown, source: string, wallet: string): Swap[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node) => {
    const row = node as Record<string, unknown>;
    return { source, from: addressOf(row.from, wallet), timestamp: secondsOf(row.timestamp) };
  });
}

type SourceResult = { read: SourceRead; trades: Trade[]; swaps: Swap[] };

function unread(source: LedgerSource): SourceResult {
  return { read: { name: source.name, subgraphId: source.subgraphId, ok: false, count: 0 }, trades: [], swaps: [] };
}

async function querySource(
  source: LedgerSource,
  request: ReadLedgerRequest,
  wallet: string,
): Promise<SourceResult> {
  const query = source.kind === "dex" ? SWAP_QUERY : TRADE_QUERY;
  let response: GraphResponse;
  try {
    response = await request.fetchImpl(gatewayUrl(source.subgraphId), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${request.apiKey}` },
      body: JSON.stringify({ query, variables: { wallet } }),
    });
  } catch {
    // The error can carry the request, and the request carries the key.
    request.log?.(`ledger: ${source.name} unreachable`);
    return unread(source);
  }

  if (!response.ok) {
    request.log?.(`ledger: ${source.name} answered ${response.status}`);
    return unread(source);
  }

  let payload: { data?: Record<string, unknown>; errors?: unknown[] };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    request.log?.(`ledger: ${source.name} answered with an unreadable body`);
    return unread(source);
  }

  // The gateway returns 200 with an `errors` array when an indexer fails, so status is not enough.
  if (!payload?.data || (Array.isArray(payload.errors) && payload.errors.length > 0)) {
    request.log?.(`ledger: ${source.name} answered with errors`);
    return unread(source);
  }

  const trades =
    source.kind === "marketplace"
      ? [
          ...toTrades(payload.data.bought, source.name, wallet),
          ...toTrades(payload.data.sold, source.name, wallet),
        ]
      : [];
  const swaps = source.kind === "dex" ? toSwaps(payload.data.swaps, source.name, wallet) : [];

  return {
    read: { name: source.name, subgraphId: source.subgraphId, ok: true, count: trades.length + swaps.length },
    trades,
    swaps,
  };
}

export async function readLedger(request: ReadLedgerRequest): Promise<LedgerBrief> {
  const wallet = request.wallet.toLowerCase();
  const sources = request.sources ?? LEDGER_SOURCES;

  if (!request.apiKey) {
    request.log?.("ledger: no gateway key configured; the brief is unavailable");
    return buildBrief({
      wallet: request.wallet,
      trades: [],
      swaps: [],
      sourcesRead: sources.map((source) => unread(source).read),
      readAt: request.readAt,
    });
  }

  // One deadline for the whole read. A source that loses the race keeps running to completion
  // somewhere behind us; its answer is simply never looked at.
  let expire: () => void = () => {};
  const deadline = new Promise<"expired">((resolve) => {
    const timer = setTimeout(() => resolve("expired"), request.budgetMs ?? GRAPH_BUDGET_MS);
    timer.unref?.();
    expire = () => {
      clearTimeout(timer);
      resolve("expired");
    };
  });

  const results = await Promise.all(
    sources.map(async (source) => {
      const answer = await Promise.race([querySource(source, request, wallet), deadline]);
      if (answer === "expired") {
        request.log?.(`ledger: ${source.name} did not answer inside the budget`);
        return unread(source);
      }
      return answer;
    }),
  );
  expire();

  return buildBrief({
    wallet: request.wallet,
    trades: results.flatMap((result) => result.trades),
    swaps: results.flatMap((result) => result.swaps),
    sourcesRead: results.map((result) => result.read),
    readAt: request.readAt,
  });
}
