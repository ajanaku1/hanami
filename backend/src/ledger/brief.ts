/// The ledger brief: four figures about a wallet's trading history, derived from whatever the
/// marketplace and exchange subgraphs handed back.
///
/// Everything here is pure. No network, no clock, no environment — the same trades always produce
/// the same brief, which is what lets the receipt claim the figures were read rather than guessed.
/// It is evidence for the bouncer, never a verdict: nothing in this module decides anything.

/// The per-source page size the gateway is asked for. A source that answers with exactly this many
/// rows has older activity we did not see, which the brief has to admit to.
export const PAGE_CAP = 500;

const DAY_SECONDS = 86_400;
const FLIP_WINDOW_SECONDS = 7 * DAY_SECONDS;

/// One NFT sale, in the one shape every marketplace subgraph is mapped into.
export type Trade = {
  source: string;
  collection: string;
  tokenId: string;
  buyer: string;
  seller: string;
  timestamp: number;
};

/// One exchange swap. Only the wallet that sent it and when matter to the brief.
export type Swap = { source: string; from: string; timestamp: number };

/// What one subgraph gave us. `ok: false` means that source failed and its rows are missing, which
/// is reported rather than hidden.
export type SourceRead = { name: string; subgraphId: string; ok: boolean; count: number };

export type BriefStatus = "ready" | "empty" | "unavailable";

export type LedgerBrief = {
  wallet: string;
  status: BriefStatus;
  flipsWithin7d: number;
  sameCounterpartySales: number;
  medianHoldingDays: number | null;
  swapCount: number;
  sourcesRead: SourceRead[];
  truncated: boolean;
  readAt: number;
};

export type BriefInput = {
  wallet: string;
  trades: Trade[];
  swaps: Swap[];
  sourcesRead: SourceRead[];
  readAt: number;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const upper = sorted[middle] ?? 0;
  const value = sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
  return Math.round(value * 100) / 100;
}

/// A token the wallet holds and has not sold yet, kept with the counterparty it came from so a
/// later sale can be recognised as going back to the same person.
type OpenPosition = { boughtAt: number; from: string };

export function buildBrief(input: BriefInput): LedgerBrief {
  const wallet = input.wallet;
  const swapCount = input.swaps.filter((swap) => same(swap.from, wallet)).length;

  // One timeline across every source, oldest first: which marketplace reported a trade says
  // nothing about when it happened, and a buy must be seen before the sale it matches.
  const timeline = input.trades
    .filter((trade) => same(trade.buyer, wallet) || same(trade.seller, wallet))
    .sort((a, b) => a.timestamp - b.timestamp);

  // FIFO per token: the sale is matched to the earliest buy still open, which is also how a mint
  // is handled — the first time we see the wallet acquire a token is the start of the hold.
  const open = new Map<string, OpenPosition[]>();
  const holdingDays: number[] = [];
  let flipsWithin7d = 0;
  let sameCounterpartySales = 0;

  for (const trade of timeline) {
    const key = `${trade.collection.toLowerCase()}:${trade.tokenId}`;
    const positions = open.get(key) ?? [];

    if (same(trade.buyer, wallet)) {
      positions.push({ boughtAt: trade.timestamp, from: trade.seller });
      open.set(key, positions);
      continue;
    }

    const bought = positions.shift();
    open.set(key, positions);
    // A sale of something we never saw arrive tells us nothing about how long it was held.
    if (!bought) continue;

    const held = trade.timestamp - bought.boughtAt;
    holdingDays.push(held / DAY_SECONDS);
    if (held <= FLIP_WINDOW_SECONDS) flipsWithin7d += 1;
    if (same(trade.buyer, bought.from)) sameCounterpartySales += 1;
  }

  const anySourceRead = input.sourcesRead.some((source) => source.ok);
  const anyActivity = timeline.length > 0 || swapCount > 0;

  return {
    wallet,
    status: !anySourceRead ? "unavailable" : anyActivity ? "ready" : "empty",
    flipsWithin7d,
    sameCounterpartySales,
    medianHoldingDays: median(holdingDays),
    swapCount,
    sourcesRead: input.sourcesRead,
    truncated: input.sourcesRead.some((source) => source.count >= PAGE_CAP),
    readAt: input.readAt,
  };
}
