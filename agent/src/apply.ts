/// `hanami-agent apply` — walks the same campaign API a human walks.
///
/// The agent passes the Door with an AgentKit signature, holds the interview, and prints the
/// receipt. Everything it needs from the outside — the fetch that signs, the model that answers,
/// where output goes — is injected, so the whole walk is testable without a backend, a chain, or
/// an inference provider.
///
/// Exit codes are the contract (`specs/002-human-door-tickets/contracts/agent-cli.md`): 0 the
/// campaign decided, 2 the Door refused, 3 we could not get an answer. A refusal is a result; a
/// failure is not.

export type ChatTurn = { role: "assistant" | "user"; content: string };

type HttpResponse = { ok: boolean; status: number; json(): Promise<unknown> };

export type ApplyDeps = {
  fetchImpl: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<HttpResponse>;
  /// Answers the bouncer, given everything said so far.
  reply: (history: ChatTurn[]) => Promise<string>;
  log: (line: string) => void;
};

export type ApplyOptions = {
  campaignUrl: string;
  wallet: string;
  agent: string;
  maxTurns: number;
  json: boolean;
  /// Where the API lives, when it is not the campaign url's own origin.
  api?: string;
};

export type Receipt = {
  campaign: string;
  agent: string;
  turns: number;
  decision: string;
  decisionTx: string | null;
  attestationHash: string | null;
  attestationPath: string | null;
  ticket: { id: string; expiresAt: number; status: string } | null;
  ticketState: string | null;
  brief: { status: string; summary: string; sourcesRead: unknown[] } | null;
};

export type ApplyResult = { code: 0 | 2 | 3; receipt?: Receipt };

/// The applicant url is `…/c/<slug>`; anything else is not a campaign.
export function parseSlug(campaignUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(campaignUrl);
  } catch {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "c") return null;
  return parts[1] ?? null;
}

type TurnBody = {
  reply?: string;
  decision?: string | null;
  decisionTx?: string;
  attestationHash?: string;
  attestationPath?: string;
  ticket?: Receipt["ticket"];
  ticketState?: string;
  brief?: Receipt["brief"];
  error?: string;
};

/// The Door's refusals. Each is an answer — this person already applied, the campaign is shut, the
/// agent is not registered — so the CLI reports it and stops rather than retrying.
const REFUSALS = new Set([401, 403, 409, 410, 412]);

async function post(
  deps: ApplyDeps,
  url: string,
  body: Record<string, unknown>,
): Promise<{ kind: "ok"; body: TurnBody } | { kind: "refused"; message: string } | { kind: "failed"; message: string }> {
  let response: HttpResponse;
  try {
    response = await deps.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hanami-client": "agent" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { kind: "failed", message: (err as Error).message };
  }

  let payload: TurnBody;
  try {
    payload = (await response.json()) as TurnBody;
  } catch {
    payload = {};
  }

  if (response.ok) return { kind: "ok", body: payload };
  const message = payload.error ?? `the backend answered ${response.status}`;
  return REFUSALS.has(response.status) ? { kind: "refused", message } : { kind: "failed", message };
}

function render(receipt: Receipt): string {
  const lines = [
    `campaign      ${receipt.campaign}`,
    `decision      ${receipt.decision}`,
    `turns         ${receipt.turns}`,
    `attestation   ${receipt.attestationHash ?? "—"} (${receipt.attestationPath ?? "unknown"})`,
    `ticket        ${receipt.ticket ? `#${receipt.ticket.id}` : "none"}`,
    `decision tx   ${receipt.decisionTx ?? "—"}`,
  ];
  if (receipt.brief) lines.push(`evidence      ${receipt.brief.status} · ${receipt.brief.summary}`);
  return lines.join("\n");
}

export async function apply(options: ApplyOptions, deps: ApplyDeps): Promise<ApplyResult> {
  const slug = parseSlug(options.campaignUrl);
  if (!slug) {
    deps.log(`not a campaign url: ${options.campaignUrl}`);
    return { code: 3 };
  }

  const base = (options.api ?? new URL(options.campaignUrl).origin).replace(/\/$/, "");
  const endpoint = (name: string) => `${base}/api/campaigns/${slug}/${name}`;

  const opened = await post(deps, endpoint("begin"), { walletAddress: options.wallet });
  if (opened.kind === "refused") {
    deps.log(opened.message);
    return { code: 2 };
  }
  if (opened.kind === "failed") {
    deps.log(`could not reach the campaign: ${opened.message}`);
    return { code: 3 };
  }

  const history: ChatTurn[] = [];
  if (opened.body.reply) history.push({ role: "assistant", content: opened.body.reply });

  for (let turn = 1; turn <= options.maxTurns; turn += 1) {
    const message = await deps.reply(history);
    history.push({ role: "user", content: message });

    const answered = await post(deps, endpoint("turns"), { walletAddress: options.wallet, message });
    if (answered.kind === "refused") {
      deps.log(answered.message);
      return { code: 2 };
    }
    if (answered.kind === "failed") {
      deps.log(`the interview stopped: ${answered.message}`);
      return { code: 3 };
    }

    if (answered.body.reply) history.push({ role: "assistant", content: answered.body.reply });
    if (!answered.body.decision) continue;

    const receipt: Receipt = {
      campaign: slug,
      agent: options.agent,
      turns: turn,
      decision: answered.body.decision,
      decisionTx: answered.body.decisionTx ?? null,
      attestationHash: answered.body.attestationHash ?? null,
      attestationPath: answered.body.attestationPath ?? null,
      ticket: answered.body.ticket ?? null,
      ticketState: answered.body.ticketState ?? null,
      brief: answered.body.brief ?? null,
    };

    deps.log(options.json ? JSON.stringify(receipt, null, 2) : render(receipt));
    return { code: 0, receipt };
  }

  // The bouncer forces a verdict well inside its own turn limit, so running out here means the
  // interview never finished — nothing was decided, and nothing was refused either.
  deps.log(`no decision after ${options.maxTurns} turns`);
  return { code: 3 };
}
