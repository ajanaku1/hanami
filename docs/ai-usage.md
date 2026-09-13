# AI usage

Hanami uses AI in two distinct ways, and they should not be confused with each other.

## 1. AI in the product

The bouncer is the product. Every applicant interview is an inference run inside a TEE on **0G
Compute**, against a private persona and lorebook the campaign owner wrote and which are never shown
to the applicant. The model produces the conversation and, at the end, a verdict tag that becomes the
decision recorded on 0G Chain.

Three deliberate limits on what the model decides:

- **The ledger brief is evidence, not a verdict.** Wallet history read from The Graph is injected as
  a fenced block that says so in its own text, and the prompt tells the model not to decide from it.
  A brief that is empty or unreadable never blocks an interview and never counts against anyone.
- **The Door is not a model decision.** Personhood is a World ID proof verified server-side, or an
  AgentKit registration read from AgentBook. No inference is involved in who gets in the room.
- **The decision is attested, not asserted.** Each decision carries either the Router's TEE trace or
  the provider's raw enclave signature, and the Verify panel re-derives it in the browser. The claim
  "a TEE decided this" is checkable by anyone without trusting Hanami.

Every bouncer must also pass an eight-scenario Bouncer Safety Report before it can be minted — an
adversarial run against its own private prompt, checking that it does not leak criteria, cannot be
instructed out of character, and does not approve on manipulation.

## 2. AI in building it

This codebase was written with Claude (Anthropic) as a coding assistant, driven by a human, under a
build contract kept in the repository: `Goal.md`, `prompt.md`, `plan.md`, and an executable
`verify.sh` whose predicates are the definition of done. Some things worth stating plainly:

- **Every task was test-first.** The ordered task list in `specs/002-human-door-tickets/tasks.md`
  pairs each implementation task with the failing test that precedes it, and the commit history shows
  the red test and the implementation in the same commit for each pair.
- **Done means a check passed**, not that the assistant believed it was finished. `./verify.sh` has
  the final vote, and its `live` phase checks mainnet contracts, a real decision receipt, and the
  Graph gateway rather than anything self-reported.
- **Deviations are written down.** Where the plan was wrong or a predicate could not pass a correct
  implementation, `IMPLEMENTATION.md` records what was found, what changed, and why — including two
  predicates in `verify.sh` that were themselves wrong, and an authorization bug the assistant found
  and fixed while wiring an unrelated feature.
- **Secrets, keys and deployed addresses were never touched by the assistant.** They are operator
  steps, listed in `specs/002-human-door-tickets/quickstart.md`.
- **The demo video's narration is synthesised** (Microsoft Edge TTS, `en-US-AndrewMultilingualNeural`),
  a deliberate change from this project's original "human voiceover, no TTS" rule, made on
  2026-09-13 under deadline. The script is written by hand; only the voice is synthetic. Everything
  the video *shows* — every address, hash, figure, terminal line and source list — is copied from a
  verified artifact in `video/public/assets/`, captured live against 0G mainnet and The Graph.

Model use during the build was Claude Opus and Sonnet through Claude Code, with a fresh-context agent
verifying the project's done-when at the end rather than the agent that wrote the code.
