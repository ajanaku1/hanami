import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  GRAPH_BUDGET_MS,
  LEDGER_SOURCES,
  gatewayUrl,
  readLedger,
  type GraphFetch,
  type LedgerSource,
} from "../src/ledger/graph-client.js";
import { PAGE_CAP } from "../src/ledger/brief.js";

const WALLET = "0x00000000000000000000000000000000000000aa";
const OTHER = "0x00000000000000000000000000000000000000bb";
const KEY = "test-graph-key";
const T0 = 1_750_000_000;

type Sent = { url: string; body: { query: string; variables: Record<string, unknown> } };

function tradeNode(over: Record<string, unknown> = {}) {
  return {
    collection: { id: "0xc0" },
    tokenId: "1",
    buyer: { id: WALLET },
    seller: { id: OTHER },
    timestamp: String(T0),
    ...over,
  };
}

/// A gateway that answers every source from one canned payload and records what was asked.
function recordingFetch(payload: (source: string) => unknown): GraphFetch & { sent: Sent[] } {
  const sent: Sent[] = [];
  const impl = async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Sent["body"];
    sent.push({ url, body });
    const source = LEDGER_SOURCES.find((s) => url.endsWith(s.subgraphId))?.name ?? "";
    return { ok: true, status: 200, async json() { return { data: payload(source) }; } };
  };
  return Object.assign(impl, { sent });
}

/// Indexing into the source list under strict index checks, without littering every test with a
/// non-null assertion.
function sourceAt(index: number): LedgerSource {
  const source = LEDGER_SOURCES[index];
  assert.ok(source, `no ledger source at ${index}`);
  return source;
}

const emptyMarketplace = { bought: [], sold: [] };
const emptyDex = { swaps: [] };

function emptyPayload(source: string) {
  return LEDGER_SOURCES.find((s) => s.name === source)?.kind === "dex" ? emptyDex : emptyMarketplace;
}

describe("LEDGER_SOURCES", () => {
  test("names seven sources: five marketplaces and two exchanges", () => {
    assert.equal(LEDGER_SOURCES.length, 7);
    assert.equal(LEDGER_SOURCES.filter((s) => s.kind === "marketplace").length, 5);
    assert.equal(LEDGER_SOURCES.filter((s) => s.kind === "dex").length, 2);
    assert.equal(new Set(LEDGER_SOURCES.map((s) => s.subgraphId)).size, 7);
  });

  test("the gateway url carries the subgraph id and never the api key", () => {
    const url = gatewayUrl(sourceAt(0).subgraphId);
    assert.ok(url.startsWith("https://gateway.thegraph.com/api/"));
    assert.ok(url.endsWith(sourceAt(0).subgraphId));
    assert.ok(!url.includes(KEY));
  });
});

describe("readLedger", () => {
  test("reads every source once and reports each of them", async () => {
    const fetchImpl = recordingFetch(emptyPayload);
    const brief = await readLedger({ wallet: WALLET, apiKey: KEY, fetchImpl, readAt: T0 });

    assert.equal(fetchImpl.sent.length, 7);
    assert.deepEqual(
      brief.sourcesRead.map((s) => s.name).sort(),
      LEDGER_SOURCES.map((s) => s.name).sort(),
    );
    assert.ok(brief.sourcesRead.every((s) => s.ok));
    assert.equal(brief.status, "empty");
  });

  test("the api key travels in the authorization header", async () => {
    let headers: Record<string, string> = {};
    const fetchImpl: GraphFetch = async (_url, init) => {
      headers = init.headers as Record<string, string>;
      return { ok: true, status: 200, async json() { return { data: emptyMarketplace }; } };
    };

    await readLedger({ wallet: WALLET, apiKey: KEY, fetchImpl, readAt: T0 });
    assert.equal(headers.authorization ?? headers.Authorization, `Bearer ${KEY}`);
  });

  test("one trade template asks for both sides of the wallet, capped at 500 and newest first", async () => {
    const fetchImpl = recordingFetch(emptyPayload);
    await readLedger({ wallet: WALLET, apiKey: KEY, fetchImpl, readAt: T0 });

    const marketplaceIds = LEDGER_SOURCES.filter((s) => s.kind === "marketplace").map((s) => s.subgraphId);
    const marketplaceQueries = fetchImpl.sent.filter((s) => marketplaceIds.some((id) => s.url.endsWith(id)));
    assert.equal(marketplaceQueries.length, 5);
    assert.equal(new Set(marketplaceQueries.map((q) => q.body.query)).size, 1);

    const body = marketplaceQueries[0]?.body;
    assert.ok(body, "expected a marketplace query");
    assert.match(body.query, /trades\s*\(/);
    assert.match(body.query, /buyer:/);
    assert.match(body.query, /seller:/);
    assert.match(body.query, /orderBy:\s*timestamp/);
    assert.match(body.query, /orderDirection:\s*desc/);
    assert.equal(body.variables.wallet, WALLET.toLowerCase());
    assert.ok(body.query.includes(`first: ${PAGE_CAP}`), "the query must ask for exactly the cap the brief reports against");
  });

  test("one swap template asks the exchanges for the wallet's own swaps", async () => {
    const fetchImpl = recordingFetch(emptyPayload);
    await readLedger({ wallet: WALLET, apiKey: KEY, fetchImpl, readAt: T0 });

    const dexIds = LEDGER_SOURCES.filter((s) => s.kind === "dex").map((s) => s.subgraphId);
    const dexQueries = fetchImpl.sent.filter((s) => dexIds.some((id) => s.url.endsWith(id)));
    assert.equal(dexQueries.length, 2);
    assert.equal(new Set(dexQueries.map((q) => q.body.query)).size, 1);
    const dexBody = dexQueries[0]?.body;
    assert.ok(dexBody, "expected a dex query");
    assert.match(dexBody.query, /swaps\s*\(/);
    assert.match(dexBody.query, /from:/);
    assert.ok(dexBody.query.includes(`first: ${PAGE_CAP}`), "the query must ask for exactly the cap the brief reports against");
  });

  test("the seven sources are read in parallel, not one after another", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl: GraphFetch = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { ok: true, status: 200, async json() { return { data: emptyMarketplace }; } };
    };

    await readLedger({ wallet: WALLET, apiKey: KEY, fetchImpl, readAt: T0 });
    assert.equal(peak, 7);
  });

  test("trades and swaps from different sources are merged into one brief", async () => {
    const fetchImpl = recordingFetch((source) => {
      if (source === "opensea-v2") {
        return {
          bought: [tradeNode({ tokenId: "7", timestamp: String(T0) })],
          sold: [tradeNode({ tokenId: "7", buyer: { id: OTHER }, seller: { id: WALLET }, timestamp: String(T0 + 86_400) })],
        };
      }
      if (source === "uniswap-v3") return { swaps: [{ timestamp: String(T0) }, { timestamp: String(T0 + 60) }] };
      return emptyPayload(source);
    });

    const brief = await readLedger({ wallet: WALLET, apiKey: KEY, fetchImpl, readAt: T0 });

    assert.equal(brief.status, "ready");
    assert.equal(brief.flipsWithin7d, 1);
    assert.equal(brief.sameCounterpartySales, 1);
    assert.equal(brief.swapCount, 2);
    assert.equal(brief.sourcesRead.find((s) => s.name === "opensea-v2")?.count, 2);
    assert.equal(brief.sourcesRead.find((s) => s.name === "uniswap-v3")?.count, 2);
  });

  test("one source failing is recorded against that source and does not sink the brief", async () => {
    const broken = sourceAt(0);
    const fetchImpl: GraphFetch = async (url) => {
      if (url.endsWith(broken.subgraphId)) throw new Error("gateway refused");
      return { ok: true, status: 200, async json() { return { data: emptyPayload("uniswap-v3") }; } };
    };

    const brief = await readLedger({ wallet: WALLET, apiKey: KEY, fetchImpl, readAt: T0 });

    assert.equal(brief.sourcesRead.find((s) => s.name === broken.name)?.ok, false);
    assert.equal(brief.sourcesRead.filter((s) => s.ok).length, 6);
    assert.notEqual(brief.status, "unavailable");
  });

  test("a GraphQL error body counts as that source failing", async () => {
    const fetchImpl: GraphFetch = async () => ({
      ok: true,
      status: 200,
      async json() { return { errors: [{ message: "bad indexer" }] }; },
    });

    const brief = await readLedger({ wallet: WALLET, apiKey: KEY, fetchImpl, readAt: T0 });
    assert.equal(brief.status, "unavailable");
    assert.ok(brief.sourcesRead.every((s) => !s.ok));
  });

  test("every source failing is unavailable, never an empty history", async () => {
    const fetchImpl: GraphFetch = async () => ({ ok: false, status: 503, async json() { return {}; } });

    const brief = await readLedger({ wallet: WALLET, apiKey: KEY, fetchImpl, readAt: T0 });

    assert.equal(brief.status, "unavailable");
    assert.equal(brief.sourcesRead.length, 7);
    assert.ok(brief.sourcesRead.every((s) => !s.ok));
  });

  test("a source slower than the budget is dropped, and its late answer is discarded", async () => {
    const slow = sourceAt(0);
    let lateSettled = false;
    const fetchImpl: GraphFetch = async (url) => {
      if (url.endsWith(slow.subgraphId)) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        lateSettled = true;
        return {
          ok: true,
          status: 200,
          async json() { return { data: { bought: [tradeNode()], sold: [] } }; },
        };
      }
      return { ok: true, status: 200, async json() { return { data: emptyPayload("uniswap-v3") }; } };
    };

    const started = Date.now();
    const brief = await readLedger({ wallet: WALLET, apiKey: KEY, fetchImpl, budgetMs: 20, readAt: T0 });
    const elapsed = Date.now() - started;

    assert.ok(elapsed < 60, `readLedger waited ${elapsed}ms, past its budget`);
    assert.equal(brief.sourcesRead.find((s) => s.name === slow.name)?.ok, false);
    assert.equal(brief.sourcesRead.find((s) => s.name === slow.name)?.count, 0);

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(lateSettled, "the slow source did settle; the brief simply did not wait for it");
    assert.equal(brief.status, "empty");
  });

  test("the default budget is the twelve seconds the plan allows", () => {
    assert.equal(GRAPH_BUDGET_MS, 12_000);
  });

  test("a source answering at the cap marks the brief truncated", async () => {
    const fetchImpl = recordingFetch((source) =>
      source === "opensea-v2"
        ? { bought: Array.from({ length: PAGE_CAP }, (_, i) => tradeNode({ tokenId: String(i) })), sold: [] }
        : emptyPayload(source),
    );

    const brief = await readLedger({ wallet: WALLET, apiKey: KEY, fetchImpl, readAt: T0 });
    assert.equal(brief.truncated, true);
  });

  test("no api key means no query is sent and the brief is unavailable", async () => {
    const fetchImpl = recordingFetch(emptyPayload);
    const brief = await readLedger({ wallet: WALLET, apiKey: "", fetchImpl, readAt: T0 });

    assert.equal(fetchImpl.sent.length, 0);
    assert.equal(brief.status, "unavailable");
  });
});
