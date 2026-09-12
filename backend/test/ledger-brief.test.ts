import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PAGE_CAP, buildBrief, type SourceRead, type Swap, type Trade } from "../src/ledger/brief.js";

const WALLET = "0x00000000000000000000000000000000000000aa";
const OTHER = "0x00000000000000000000000000000000000000bb";
const THIRD = "0x00000000000000000000000000000000000000cc";
const DAY = 86_400;
const T0 = 1_750_000_000;

function source(name: string, over: Partial<SourceRead> = {}): SourceRead {
  return { name, subgraphId: `sg-${name}`, ok: true, count: 0, ...over };
}

function trade(over: Partial<Trade> = {}): Trade {
  return {
    source: "opensea-v2",
    collection: "0xc0",
    tokenId: "1",
    buyer: OTHER,
    seller: THIRD,
    timestamp: T0,
    ...over,
  };
}

function swap(over: Partial<Swap> = {}): Swap {
  return { source: "uniswap-v3", from: WALLET, timestamp: T0, ...over };
}

/// Every field the spec names is derived here, so the only thing that decides a figure is the
/// trade list — never the order the sources happened to answer in.
describe("buildBrief", () => {
  test("no activity across healthy sources reads as empty, not unavailable", () => {
    const brief = buildBrief({
      wallet: WALLET,
      trades: [],
      swaps: [],
      sourcesRead: [source("opensea-v2"), source("uniswap-v3")],
      readAt: T0,
    });

    assert.equal(brief.status, "empty");
    assert.equal(brief.flipsWithin7d, 0);
    assert.equal(brief.sameCounterpartySales, 0);
    assert.equal(brief.medianHoldingDays, null);
    assert.equal(brief.swapCount, 0);
    assert.equal(brief.truncated, false);
    assert.equal(brief.wallet, WALLET);
    assert.equal(brief.readAt, T0);
  });

  test("every source failing reads as unavailable", () => {
    const brief = buildBrief({
      wallet: WALLET,
      trades: [],
      swaps: [],
      sourcesRead: [source("opensea-v2", { ok: false }), source("x2y2", { ok: false })],
      readAt: T0,
    });

    assert.equal(brief.status, "unavailable");
  });

  test("one healthy source among failures is still a readable brief", () => {
    const brief = buildBrief({
      wallet: WALLET,
      trades: [trade({ buyer: WALLET, timestamp: T0 }), trade({ seller: WALLET, buyer: OTHER, timestamp: T0 + DAY })],
      swaps: [],
      sourcesRead: [source("opensea-v2", { count: 2 }), source("x2y2", { ok: false })],
      readAt: T0,
    });

    assert.equal(brief.status, "ready");
  });

  test("a buy and a sale six days later is a flip; eight days later is not", () => {
    const fast = buildBrief({
      wallet: WALLET,
      trades: [
        trade({ buyer: WALLET, seller: THIRD, timestamp: T0 }),
        trade({ seller: WALLET, buyer: OTHER, timestamp: T0 + 6 * DAY }),
      ],
      swaps: [],
      sourcesRead: [source("opensea-v2", { count: 2 })],
      readAt: T0,
    });
    assert.equal(fast.flipsWithin7d, 1);

    const slow = buildBrief({
      wallet: WALLET,
      trades: [
        trade({ buyer: WALLET, seller: THIRD, timestamp: T0 }),
        trade({ seller: WALLET, buyer: OTHER, timestamp: T0 + 8 * DAY }),
      ],
      swaps: [],
      sourcesRead: [source("opensea-v2", { count: 2 })],
      readAt: T0,
    });
    assert.equal(slow.flipsWithin7d, 0);
  });

  test("a flip is counted per token, and the buy it matches is the earliest unsold one", () => {
    const brief = buildBrief({
      wallet: WALLET,
      trades: [
        trade({ tokenId: "1", buyer: WALLET, timestamp: T0 }),
        trade({ tokenId: "2", buyer: WALLET, timestamp: T0 + DAY }),
        trade({ tokenId: "1", seller: WALLET, buyer: OTHER, timestamp: T0 + 2 * DAY }),
        trade({ tokenId: "2", seller: WALLET, buyer: OTHER, timestamp: T0 + 30 * DAY }),
      ],
      swaps: [],
      sourcesRead: [source("opensea-v2", { count: 4 })],
      readAt: T0,
    });

    assert.equal(brief.flipsWithin7d, 1);
  });

  test("a sale with no observed buy of that token is not a flip", () => {
    const brief = buildBrief({
      wallet: WALLET,
      trades: [trade({ seller: WALLET, buyer: OTHER, timestamp: T0 })],
      swaps: [],
      sourcesRead: [source("opensea-v2", { count: 1 })],
      readAt: T0,
    });

    assert.equal(brief.flipsWithin7d, 0);
    assert.equal(brief.medianHoldingDays, null);
  });

  test("selling a token back to the counterparty it was bought from is counted once", () => {
    const brief = buildBrief({
      wallet: WALLET,
      trades: [
        trade({ tokenId: "1", buyer: WALLET, seller: OTHER, timestamp: T0 }),
        trade({ tokenId: "1", seller: WALLET, buyer: OTHER, timestamp: T0 + DAY }),
        trade({ tokenId: "2", buyer: WALLET, seller: OTHER, timestamp: T0 }),
        trade({ tokenId: "2", seller: WALLET, buyer: THIRD, timestamp: T0 + DAY }),
      ],
      swaps: [],
      sourcesRead: [source("opensea-v2", { count: 4 })],
      readAt: T0,
    });

    assert.equal(brief.sameCounterpartySales, 1);
  });

  test("the same counterparty on a different collection does not count", () => {
    const brief = buildBrief({
      wallet: WALLET,
      trades: [
        trade({ collection: "0xc0", tokenId: "1", buyer: WALLET, seller: OTHER, timestamp: T0 }),
        trade({ collection: "0xc1", tokenId: "1", seller: WALLET, buyer: OTHER, timestamp: T0 + DAY }),
      ],
      swaps: [],
      sourcesRead: [source("opensea-v2", { count: 2 })],
      readAt: T0,
    });

    assert.equal(brief.sameCounterpartySales, 0);
  });

  test("median holding time is the middle of the matched buy-to-sell pairs", () => {
    const brief = buildBrief({
      wallet: WALLET,
      trades: [
        trade({ tokenId: "1", buyer: WALLET, timestamp: T0 }),
        trade({ tokenId: "1", seller: WALLET, buyer: OTHER, timestamp: T0 + 2 * DAY }),
        trade({ tokenId: "2", buyer: WALLET, timestamp: T0 }),
        trade({ tokenId: "2", seller: WALLET, buyer: OTHER, timestamp: T0 + 4 * DAY }),
        trade({ tokenId: "3", buyer: WALLET, timestamp: T0 }),
        trade({ tokenId: "3", seller: WALLET, buyer: OTHER, timestamp: T0 + 12 * DAY }),
      ],
      swaps: [],
      sourcesRead: [source("opensea-v2", { count: 6 })],
      readAt: T0,
    });

    assert.equal(brief.medianHoldingDays, 4);
  });

  test("an even number of pairs averages the two middle holds", () => {
    const brief = buildBrief({
      wallet: WALLET,
      trades: [
        trade({ tokenId: "1", buyer: WALLET, timestamp: T0 }),
        trade({ tokenId: "1", seller: WALLET, buyer: OTHER, timestamp: T0 + DAY }),
        trade({ tokenId: "2", buyer: WALLET, timestamp: T0 }),
        trade({ tokenId: "2", seller: WALLET, buyer: OTHER, timestamp: T0 + 4 * DAY }),
      ],
      swaps: [],
      sourcesRead: [source("opensea-v2", { count: 4 })],
      readAt: T0,
    });

    assert.equal(brief.medianHoldingDays, 2.5);
  });

  test("holding time is unaffected by the order the sources answered in", () => {
    const shuffled = buildBrief({
      wallet: WALLET,
      trades: [
        trade({ source: "x2y2", tokenId: "1", seller: WALLET, buyer: OTHER, timestamp: T0 + 2 * DAY }),
        trade({ source: "looksrare", tokenId: "1", buyer: WALLET, timestamp: T0 }),
      ],
      swaps: [],
      sourcesRead: [source("x2y2", { count: 1 }), source("looksrare", { count: 1 })],
      readAt: T0,
    });

    assert.equal(shuffled.medianHoldingDays, 2);
    assert.equal(shuffled.flipsWithin7d, 1);
  });

  test("swaps are counted and make an otherwise trade-free wallet readable", () => {
    const brief = buildBrief({
      wallet: WALLET,
      trades: [],
      swaps: [swap(), swap({ source: "sushiswap", timestamp: T0 + DAY })],
      sourcesRead: [source("opensea-v2"), source("uniswap-v3", { count: 1 }), source("sushiswap", { count: 1 })],
      readAt: T0,
    });

    assert.equal(brief.status, "ready");
    assert.equal(brief.swapCount, 2);
  });

  test("a source that came back at the cap marks the brief truncated", () => {
    assert.equal(PAGE_CAP, 500);

    const brief = buildBrief({
      wallet: WALLET,
      trades: [trade({ buyer: WALLET })],
      swaps: [],
      sourcesRead: [source("opensea-v2", { count: PAGE_CAP }), source("x2y2", { count: 3 })],
      readAt: T0,
    });

    assert.equal(brief.truncated, true);
  });

  test("sources under the cap leave the brief untruncated and are reported verbatim", () => {
    const sourcesRead = [source("opensea-v2", { count: PAGE_CAP - 1 }), source("x2y2", { ok: false })];
    const brief = buildBrief({
      wallet: WALLET,
      trades: [trade({ buyer: WALLET })],
      swaps: [],
      sourcesRead,
      readAt: T0,
    });

    assert.equal(brief.truncated, false);
    assert.deepEqual(brief.sourcesRead, sourcesRead);
  });

  test("addresses match regardless of case", () => {
    const brief = buildBrief({
      wallet: WALLET.toUpperCase(),
      trades: [
        trade({ tokenId: "1", buyer: WALLET.toUpperCase(), seller: OTHER, timestamp: T0 }),
        trade({ tokenId: "1", seller: WALLET, buyer: OTHER.toUpperCase(), timestamp: T0 + DAY }),
      ],
      swaps: [swap({ from: WALLET.toUpperCase() })],
      sourcesRead: [source("opensea-v2", { count: 2 }), source("uniswap-v3", { count: 1 })],
      readAt: T0,
    });

    assert.equal(brief.flipsWithin7d, 1);
    assert.equal(brief.sameCounterpartySales, 1);
    assert.equal(brief.swapCount, 1);
  });

  test("trades and swaps belonging to another wallet are ignored", () => {
    const brief = buildBrief({
      wallet: WALLET,
      trades: [trade({ buyer: OTHER, seller: THIRD })],
      swaps: [swap({ from: OTHER })],
      sourcesRead: [source("opensea-v2", { count: 1 }), source("uniswap-v3", { count: 1 })],
      readAt: T0,
    });

    assert.equal(brief.status, "empty");
    assert.equal(brief.swapCount, 0);
  });
});
