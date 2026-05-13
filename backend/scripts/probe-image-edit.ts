import "dotenv/config";

const BASE = process.env.OG_ROUTER_BASE_URL!;
const KEY = process.env.OG_ROUTER_API_KEY!;

// First, try the OpenAI-compatible images endpoint
async function tryEndpoint(path: string, body: unknown): Promise<void> {
  console.log(`\n=== POST ${path} ===`);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  console.log("status:", res.status);
  const text = await res.text();
  console.log("response (first 1200 chars):", text.substring(0, 1200));
}

// Attempt 1: OpenAI-style /images/generations
await tryEndpoint("/images/generations", {
  model: "qwen/qwen-image-edit-2511",
  prompt: "A small minimalist portrait of a quiet gallerist with short dark hair and a navy robe, traditional Japanese painting style, soft warm light",
  size: "512x512",
  n: 1,
});

// Attempt 2: /images/edits (might require input image)
await tryEndpoint("/images/edits", {
  model: "qwen/qwen-image-edit-2511",
  prompt: "test prompt",
});
