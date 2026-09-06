# Agent CLI contract (`agent/`)

Binary name: `hanami-agent` (run as `npx tsx src/cli.ts …` from `agent/`, or `npm run agent -- …`).

## Commands

| Command | Effect | Exit |
|---|---|---|
| `register <agentWallet>` | Wraps `npx @worldcoin/agentkit-cli register <agentWallet>`; prompts the human to confirm in World App | 0 registered / 1 failed |
| `status <agentWallet>` | Prints AgentBook registration and the anonymous human id | 0 / 1 |
| `apply <campaignUrl> --wallet <recipient> [--max-turns 8] [--json]` | Applies to the campaign: AgentKit-authenticated `/begin`, then `/turns` until a decision; prints the receipt | 0 decided (approved or rejected) / 2 door refused (person already applied, campaign closed or full, unregistered agent) / 3 network or provider error |

## Environment
- `AGENT_PRIVATE_KEY` — the agent's signing key (never the human's, never committed)
- `OG_ROUTER_URL`, `OG_ROUTER_KEY` — OpenAI-compatible endpoint for the agent's own replies
- `HANAMI_API` — backend base URL (defaults to the campaign URL's origin)

## Behaviour
1. Parse `<campaignUrl>` → `slug`.
2. `agentkit.fetch(POST /api/campaigns/{slug}/begin, { walletAddress })`: on 402 the client retries with the `agentkit` header; on 403/409/410 print the reason and exit 2.
3. Loop: generate a reply with the fixed "sincere applicant" persona from the greeting and history; `POST /turns`; stop when `decision` is non-null or `--max-turns` reached.
4. Print the receipt (`decision`, `attestationHash`, `attestationPath`, `ticket`, `brief.sourcesRead`) as text or `--json`.

## Output shape (`--json`)
Identical to the API `Receipt` schema in `door-tickets-api.openapi.yaml`, plus `{ agent: <agentWallet>, campaign: <slug>, turns: <n> }`.
