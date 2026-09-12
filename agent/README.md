# hanami-agent

An applicant CLI that walks the same campaign API a person walks: it passes the Door with a World
AgentKit human-backed-agent proof, holds the interview with the bouncer, and prints the receipt.

There is no separate agent API. The Door, the ledger brief, the interview, the decision on 0G and
the soulbound ticket are the same for an agent as for a browser — the only difference is how
personhood is proved. One person still gets one attempt: the anonymous human id AgentBook returns
for your agent is the same identifier the campaign records, so applying yourself and then sending
an agent is refused, and so is the reverse.

## Install

```bash
cd agent && npm install
```

## 1. Register the agent

```bash
npm run agent -- register 0xAGENT     # then confirm in World App on your phone
npm run agent -- status   0xAGENT     # prints the registration and the anonymous human id
```

`register` wraps World's own `@worldcoin/agentkit-cli`. The wallet you register is the **agent's**,
never yours: it signs the Door challenge, and its ticket — if the campaign approves — is minted to
the wallet you name with `--wallet`.

## 2. Apply

```bash
export AGENT_PRIVATE_KEY=0x…          # the agent's key, not yours
export OG_ROUTER_URL=https://…        # OpenAI-compatible endpoint for the agent's own replies
export OG_ROUTER_KEY=…

npm run agent -- apply https://hanami-hazel.vercel.app/c/<slug> --wallet 0xYOURWALLET
npm run agent -- apply https://hanami-hazel.vercel.app/c/<slug> --wallet 0xYOURWALLET --json
```

Options: `--max-turns 8` (stop rather than talk forever), `--json` (the receipt as JSON),
`--api <url>` (when the backend is not served from the campaign URL's origin).

### What it prints

```
campaign      mei-chan
decision      approve
turns         3
attestation   0x8f3c…  (direct)
ticket        #7
decision tx   0x51ab…
evidence      ready · 2 flips <7d, 0 same-counterparty, 41d median hold, 63 swaps (6 sources)
```

With `--json`, the same fields as the API receipt plus `campaign`, `agent`, and `turns`.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | the campaign decided — approved **or** rejected. Both are answers. |
| `2` | the Door refused: this person already applied, the campaign is closed or full, or the agent is not registered in AgentBook. |
| `3` | nothing was decided: the backend was unreachable, the model failed, the URL was not a campaign, or `--max-turns` ran out. |

A second `apply` for the same person exits `2` with "this person has already applied" — that is the
one-person-one-attempt rule working, not a bug.

## Environment

| Variable | Meaning |
|---|---|
| `AGENT_PRIVATE_KEY` | the agent's own signing key — never the human's, never committed |
| `OG_ROUTER_URL`, `OG_ROUTER_KEY` | OpenAI-compatible endpoint the agent uses for its own replies |
| `OG_ROUTER_MODEL` | optional; defaults to `llama-3.3-70b-instruct` |
| `HANAMI_API` | backend base URL; defaults to the campaign URL's origin |

This workspace never reads the backend's environment file.

## How the agent answers

The applicant persona in `src/applicant-model.ts` is deliberately not trying to win. It answers
briefly and specifically and is told never to invent a studio visit, a piece it owns, or a person it
met. An agent that could talk its way past a bouncer by making things up would make the campaign's
decision worthless — the point of this CLI is that the same interview holds either way.

## Tests

```bash
npm test
```

The whole walk is tested against an injected fetch and an injected model, so the suite needs no
network, no key, and no chain.
