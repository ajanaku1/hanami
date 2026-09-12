import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { apply, parseSlug, type ApplyDeps } from "../src/apply.js";

const WALLET = "0x00000000000000000000000000000000000000aa";
const AGENT = "0x00000000000000000000000000000000000000a9";
const CAMPAIGN = "https://hanami.example/c/mei-chan";

type Reply = { status: number; body: unknown };

/// A backend that answers from a script and records what it was asked, so the loop is exercised
/// without a server.
function backend(replies: Reply[]) {
  const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: ApplyDeps["fetchImpl"] = async (url, init) => {
    sent.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    const next = replies.shift() ?? { status: 500, body: { error: "no reply scripted" } };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      async json() { return next.body; },
    };
  };
  return { fetchImpl, sent };
}

function deps(replies: Reply[], over: Partial<ApplyDeps> = {}) {
  const { fetchImpl, sent } = backend(replies);
  const lines: string[] = [];
  return {
    deps: {
      fetchImpl,
      reply: async () => "I have held every piece I bought.",
      log: (line: string) => lines.push(line),
      ...over,
    } as ApplyDeps,
    sent,
    lines,
  };
}

const options = { campaignUrl: CAMPAIGN, wallet: WALLET, agent: AGENT, maxTurns: 8, json: false };

const RECEIPT = {
  reply: "You're in.",
  decision: "approve",
  decisionTx: `0x${"ab".repeat(32)}`,
  attestationHash: `0x${"cd".repeat(32)}`,
  attestationPath: "direct",
  ticket: { id: "7", expiresAt: 1_759_000_000, status: "live" },
  ticketState: "issued",
  brief: { status: "ready", summary: "2 flips", sourcesRead: [{ name: "opensea-v2", ok: true }] },
};

const GREETING = { reply: "Why this project?", brief: { status: "ready" } };
const NO_DECISION = { reply: "Tell me more.", decision: null };

describe("parseSlug", () => {
  test("reads the campaign out of an applicant url", () => {
    assert.equal(parseSlug("https://hanami.example/c/mei-chan"), "mei-chan");
    assert.equal(parseSlug("https://hanami.example/c/mei-chan/"), "mei-chan");
  });

  test("refuses a url that is not a campaign", () => {
    assert.equal(parseSlug("https://hanami.example/gallery"), null);
    assert.equal(parseSlug("not a url"), null);
  });
});

describe("apply", () => {
  test("walks begin then turns until a decision and exits 0", async () => {
    const { deps: d, sent } = deps([
      { status: 200, body: GREETING },
      { status: 200, body: NO_DECISION },
      { status: 200, body: RECEIPT },
    ]);

    const result = await apply(options, d);

    assert.equal(result.code, 0);
    assert.equal(result.receipt?.decision, "approve");
    assert.equal(result.receipt?.turns, 2);
    assert.match(sent[0]?.url ?? "", /\/api\/campaigns\/mei-chan\/begin$/);
    assert.match(sent[1]?.url ?? "", /\/api\/campaigns\/mei-chan\/turns$/);
    assert.equal(sent[0]?.body.walletAddress, WALLET);
  });

  test("a rejection is a decision too, and still exits 0", async () => {
    const { deps: d } = deps([
      { status: 200, body: GREETING },
      { status: 200, body: { ...RECEIPT, decision: "reject", ticket: null, ticketState: "none" } },
    ]);

    const result = await apply(options, d);

    assert.equal(result.code, 0);
    assert.equal(result.receipt?.decision, "reject");
    assert.equal(result.receipt?.ticket, null);
  });

  test("the applicant answers the bouncer's last line, not a fixed script", async () => {
    const seen: string[][] = [];
    const { deps: d, sent } = deps(
      [
        { status: 200, body: GREETING },
        { status: 200, body: NO_DECISION },
        { status: 200, body: RECEIPT },
      ],
      {
        reply: async (history: Array<{ role: string; content: string }>) => {
          seen.push(history.map((turn) => turn.content));
          return `answer ${history.length}`;
        },
      },
    );

    await apply(options, d);

    assert.deepEqual(seen[0], ["Why this project?"]);
    assert.deepEqual(seen[1], ["Why this project?", "answer 1", "Tell me more."]);
    assert.equal(sent[1]?.body.message, "answer 1");
    // The second answer is written against three turns of history, not two.
    assert.equal(sent[2]?.body.message, "answer 3");
  });

  test("a Door refusal exits 2 and says which refusal it was", async () => {
    for (const status of [403, 409, 410]) {
      const { deps: d, lines } = deps([{ status, body: { error: "this person has already applied" } }]);

      const result = await apply(options, d);

      assert.equal(result.code, 2, `status ${status} is a refusal, not a crash`);
      assert.match(lines.join("\n"), /already applied/i);
    }
  });

  test("an unregistered agent exits 2 with the registration message intact", async () => {
    const { deps: d, lines } = deps([
      { status: 403, body: { error: "This agent is not registered in AgentBook. Register it with `npx @worldcoin/agentkit-cli register <agentWallet>`" } },
    ]);

    const result = await apply(options, d);

    assert.equal(result.code, 2);
    assert.match(lines.join("\n"), /agentkit-cli register/);
  });

  test("a backend that is down exits 3, not 2 — nothing was refused", async () => {
    const { deps: d } = deps([{ status: 503, body: { error: "waking up", transient: true } }]);

    assert.equal((await apply(options, d)).code, 3);
  });

  test("a network failure exits 3", async () => {
    const { deps: d } = deps([], { fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });

    assert.equal((await apply(options, d)).code, 3);
  });

  test("a campaign url that is not a campaign exits 3 before any request", async () => {
    const { deps: d, sent } = deps([]);

    const result = await apply({ ...options, campaignUrl: "https://hanami.example/gallery" }, d);

    assert.equal(result.code, 3);
    assert.deepEqual(sent, []);
  });

  test("stops at --max-turns rather than talking forever", async () => {
    const { deps: d, sent } = deps([
      { status: 200, body: GREETING },
      { status: 200, body: NO_DECISION },
      { status: 200, body: NO_DECISION },
    ]);

    const result = await apply({ ...options, maxTurns: 2 }, d);

    assert.equal(sent.length, 3, "one begin and no more than two turns");
    assert.equal(result.code, 3, "no decision was reached, so nothing was decided");
  });

  test("the json receipt carries the campaign, the agent, and the turns it took", async () => {
    const { deps: d, lines } = deps([
      { status: 200, body: GREETING },
      { status: 200, body: RECEIPT },
    ]);

    const result = await apply({ ...options, json: true }, d);

    const printed = JSON.parse(lines.join("\n"));
    assert.equal(printed.campaign, "mei-chan");
    assert.equal(printed.agent, AGENT);
    assert.equal(printed.turns, 1);
    assert.equal(printed.decision, "approve");
    assert.equal(printed.attestationPath, "direct");
    assert.equal(printed.ticket.id, "7");
    assert.deepEqual(printed.brief.sourcesRead, [{ name: "opensea-v2", ok: true }]);
    assert.deepEqual(printed, result.receipt);
  });

  test("the text receipt names the decision, the ticket, and the attestation path", async () => {
    const { deps: d, lines } = deps([
      { status: 200, body: GREETING },
      { status: 200, body: RECEIPT },
    ]);

    await apply(options, d);

    const text = lines.join("\n");
    assert.match(text, /approve/i);
    assert.match(text, /#7/);
    assert.match(text, /direct/i);
  });

  test("declares itself an agent so the Door knows to challenge it", async () => {
    const headers: Array<Record<string, string>> = [];
    const { deps: d } = deps(
      [{ status: 200, body: GREETING }, { status: 200, body: RECEIPT }],
      {
        fetchImpl: async (_url: string, init?: { headers?: Record<string, string>; body?: string }) => {
          headers.push(init?.headers ?? {});
          const body = headers.length === 1 ? GREETING : RECEIPT;
          return { ok: true, status: 200, async json() { return body; } };
        },
      },
    );

    await apply(options, d);

    assert.equal(headers[0]?.["x-hanami-client"], "agent");
  });

  test("uses an explicit api base when the campaign is served from somewhere else", async () => {
    const { deps: d, sent } = deps([{ status: 200, body: GREETING }, { status: 200, body: RECEIPT }]);

    await apply({ ...options, api: "https://api.hanami.example" }, d);

    assert.match(sent[0]?.url ?? "", /^https:\/\/api\.hanami\.example\/api\/campaigns\/mei-chan\/begin$/);
  });

  test("never sends the agent's wallet as the applicant", async () => {
    const { deps: d, sent } = deps([{ status: 200, body: GREETING }, { status: 200, body: RECEIPT }]);

    await apply(options, d);

    for (const request of sent) assert.equal(request.body.walletAddress, WALLET);
  });
});
