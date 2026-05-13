import "dotenv/config";

const API_KEY = process.env.OG_ROUTER_API_KEY!;
const BASE = process.env.OG_ROUTER_BASE_URL!;

const res = await fetch(`${BASE}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  },
  body: JSON.stringify({
    model: "qwen/qwen-2.5-7b-instruct",
    messages: [{ role: "user", content: "Say hi in 5 words." }],
    verify_tee: true,
  }),
});

const body = await res.json();
console.log("status:", res.status);
console.log("x_0g_trace:", body.x_0g_trace);
console.log("content:", body.choices?.[0]?.message?.content);
