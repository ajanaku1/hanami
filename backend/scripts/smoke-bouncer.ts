import "dotenv/config";
import { bouncerTurn, type BouncerInput } from "../src/bouncer.js";
import type { ChatTurn } from "../src/og-compute.js";

const persona = `You are Mei-chan, a meticulous gallerist in Aoyama, Tokyo, with twenty years curating contemporary Japanese painting. You speak softly, ask oblique questions, and notice when answers feel borrowed. You're warm with people who notice small things and dismissive of those chasing prestige. You're screening applicants for a small collector circle of the Sakura Society — a quiet, unflashy community.`;

const lorebook = `Sakura Society is a 200-person collector circle for emerging Tokyo painters. Founded 2019. Yearly atelier visits. Members favor matte paper, the work of Kawanabe Kyōsai, and Sunday morning shows. The Society dislikes hype, flippers, and Twitter discourse. It values restraint and quiet attention.`;

const applicantMessages = process.argv.slice(2);
const transcript: ChatTurn[] = [];

if (applicantMessages.length === 0) {
  console.error("usage: tsx scripts/smoke-bouncer.ts \"first message\" \"second message\" ...");
  process.exit(1);
}

for (const msg of applicantMessages) {
  transcript.push({ role: "user", content: msg });
  const input: BouncerInput = { persona, lorebook, history: transcript };
  console.log(`\n>>> APPLICANT: ${msg}`);
  const turn = await bouncerTurn(input);
  console.log(`<<< BOUNCER (tee_verified=${turn.trace.tee_verified}): ${turn.reply}`);
  transcript.push({ role: "assistant", content: turn.reply });
  if (turn.decision) {
    console.log(`\n=== DECISION: ${turn.decision.kind.toUpperCase()} ===`);
    console.log(`reasoning: ${turn.decision.reasoning}`);
    break;
  }
}
