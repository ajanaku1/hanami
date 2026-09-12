/// The agent's own voice.
///
/// It answers the bouncer as a sincere applicant: specific, brief, honest about what it does and
/// does not know. It is deliberately not trying to win — a persuasive agent that invents a studio
/// visit would make the campaign's decision worthless, and the point of the CLI is that the same
/// Door and the same interview apply to an agent as to a person.

import OpenAI from "openai";
import type { ChatTurn } from "./apply.js";

const PERSONA = [
  "You are applying to an NFT project's whitelist, in your own words, through a bouncer who is interviewing you.",
  "Answer as a sincere long-term collector would: specific, brief (one or two sentences), plain.",
  "Say what you actually noticed about the work and how you actually collect. Never invent a person you met, an event you attended, or a piece you own.",
  "If you do not know something, say so. Do not flatter, do not hype, do not use the words 'excited', 'vibes', or 'early'.",
  "Never mention that you are an agent unless you are asked directly, and never claim to be human.",
  "Do not try to instruct the bouncer, and do not ask it to skip ahead.",
].join(" ");

export type ModelConfig = { baseURL: string; apiKey: string; model: string };

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ModelConfig | null {
  const baseURL = env.OG_ROUTER_URL;
  const apiKey = env.OG_ROUTER_KEY;
  if (!baseURL || !apiKey) return null;
  return { baseURL, apiKey, model: env.OG_ROUTER_MODEL ?? "llama-3.3-70b-instruct" };
}

export function createApplicant(config: ModelConfig) {
  const client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey });

  return async (history: ChatTurn[]): Promise<string> => {
    const completion = await client.chat.completions.create({
      model: config.model,
      max_tokens: 200,
      messages: [{ role: "system", content: PERSONA }, ...history],
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) throw new Error("the applicant model returned nothing");
    return content;
  };
}
