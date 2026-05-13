import "dotenv/config";

export const OG_ROUTER_BASE = process.env.OG_ROUTER_BASE_URL ?? "https://router-api-testnet.integratenetwork.work/v1";
export const OG_ROUTER_KEY = process.env.OG_ROUTER_API_KEY!;
export const OG_ROUTER_MODEL = process.env.OG_ROUTER_MODEL ?? "qwen/qwen-2.5-7b-instruct";

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

async function fetchWithRetry(url: string, init: RequestInit, attempts = 5): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fetch(url, init); }
    catch (e) {
      lastErr = e;
      const msg = (e as { message?: string })?.message ?? "";
      const code = (e as { cause?: { code?: string } })?.cause?.code ?? "";
      // any node fetch failure is transient on this testnet — retry them all
      const transient = msg.includes("fetch failed") || /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|UND_ERR/.test(code);
      if (!transient) throw e;
      await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i))); // 2s, 4s, 8s, 16s, 32s
    }
  }
  throw lastErr;
}

export async function chat(messages: ChatTurn[]): Promise<{ content: string; trace: Trace }> {
  const res = await fetchWithRetry(`${OG_ROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OG_ROUTER_KEY}` },
    body: JSON.stringify({ model: OG_ROUTER_MODEL, messages, verify_tee: true, max_tokens: 280 }),
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
