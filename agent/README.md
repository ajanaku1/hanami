# hanami-agent

An applicant CLI that walks the same campaign API a human walks: it passes the Door with a World
AgentKit human-backed-agent proof, holds the interview, and prints the receipt.

Status: scaffold. The commands below are the shipped contract
(`specs/002-human-door-tickets/contracts/agent-cli.md`); they are implemented in Phase 9.

## Install

```bash
cd agent && npm install
```

## Commands

```bash
npm run agent -- register <agentWallet>   # confirm in World App when prompted
npm run agent -- status   <agentWallet>
npm run agent -- apply https://hanami.example/c/<slug> --wallet <recipient> [--max-turns 8] [--json]
```

Exit codes for `apply`: `0` decided (approved or rejected), `2` the Door refused (person already
applied, campaign closed or full, agent not registered), `3` network or provider error.

## Environment

| Variable | Meaning |
|---|---|
| `AGENT_PRIVATE_KEY` | the agent's own signing key — never the human's, never committed |
| `OG_ROUTER_URL`, `OG_ROUTER_KEY` | OpenAI-compatible endpoint the agent uses for its own replies |
| `HANAMI_API` | backend base URL; defaults to the campaign URL's origin |

This workspace never reads the backend's environment file.
