import "dotenv/config";

export const OG_ROUTER_BASE = process.env.OG_ROUTER_BASE_URL ?? "https://router-api.0g.ai/v1";
export const OG_ROUTER_KEY = process.env.OG_ROUTER_API_KEY!;
export const OG_ROUTER_MODEL = process.env.OG_ROUTER_MODEL ?? "0GM-1.0-35B-A3B";

export type Trace = {
  request_id: string;
  provider: string;
  tee_verified: boolean;
};

export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

type ChatResponse = {
  choices: Array<{ message: { content: string } }>;
  x_0g_trace: Trace;
};

// Per-attempt deadline. Node's fetch has NO default timeout, so a router that accepts the
// connection but never responds would hang the whole turn forever (frontend stuck "thinking").
// AbortSignal.timeout bounds each attempt; a timed-out attempt is treated as transient and retried.
const ATTEMPT_TIMEOUT_MS = 45_000;

async function fetchWithRetry(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
      // 5xx from the router is a transient outage ("try again in 30 seconds") — retry instead of
      // surfacing it as a hard error. 4xx is a real client error; return it for the caller to throw.
      if (res.status >= 500 && i < attempts - 1) {
        await backoff(i);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      const msg = (e as { message?: string })?.message ?? "";
      const name = (e as { name?: string })?.name ?? "";
      const code = (e as { cause?: { code?: string } })?.cause?.code ?? "";
      // network failures and per-attempt timeouts are transient on this network — retry them all
      const transient = name === "TimeoutError" || name === "AbortError" || msg.includes("fetch failed")
        || /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|UND_ERR/.test(code);
      if (!transient || i === attempts - 1) throw e;
      await backoff(i);
    }
  }
  throw lastErr;
}

function backoff(attempt: number): Promise<void> {
  return new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt))); // 2s, 4s, 8s
}

export async function chat(messages: ChatTurn[]): Promise<{ content: string; trace: Trace }> {
  const res = await fetchWithRetry(`${OG_ROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OG_ROUTER_KEY}` },
    body: JSON.stringify({
      model: OG_ROUTER_MODEL,
      messages,
      verify_tee: true,
      max_tokens: 400,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  if (!res.ok) throw new Error(`router ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as ChatResponse;
  const content = body.choices[0]?.message?.content;
  if (!content) throw new Error("router returned no message content");
  if (!body.x_0g_trace?.tee_verified) {
    throw new Error(`TEE verification failed: ${JSON.stringify(body.x_0g_trace)}`);
  }
  return { content, trace: body.x_0g_trace };
}
