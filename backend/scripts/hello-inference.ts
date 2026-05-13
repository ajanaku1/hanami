import "dotenv/config";
import OpenAI from "openai";

const API_KEY = process.env.OG_ROUTER_API_KEY;
if (!API_KEY) throw new Error("OG_ROUTER_API_KEY missing in .env");

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: process.env.OG_ROUTER_BASE_URL ?? "https://router-api-testnet.integratenetwork.work/v1",
});

async function main() {
  console.log("listing available models...");
  const models = await client.models.list();
  const ids = models.data.map((m) => m.id).slice(0, 10);
  console.log("models (first 10):", ids);

  const model = ids[0] ?? "llama-3.3-70b-instruct";
  console.log("using model:", model);

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: "You are Mei-chan, an Aoyama gallerist evaluating applicants for the Sakura Society NFT whitelist. Respond in one sentence in your own voice.",
      },
      { role: "user", content: "Hi, I love anime art and want in." },
    ],
    max_tokens: 100,
  });

  console.log("\n--- response ---");
  console.log(completion.choices[0]?.message?.content);
  console.log("\n--- full response object (look for attestation/verifiable-execution fields) ---");
  console.dir(completion, { depth: 4 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
