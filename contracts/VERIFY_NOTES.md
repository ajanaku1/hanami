# Galileo verification

Endpoint: `https://chainscan-galileo.0g.ai/open/api`
Chain ID: 16602
API key: not required (use any placeholder)

## Foundry quirk

`forge verify-contract --watch` submits successfully but its **status polling** expects an etherscan-shaped `{result: guid}` response that 0G's open API doesn't return — so the command exits with `Invalid parameter guid` even after the contract is verified.

**Workaround:** drop `--watch` and confirm verification out-of-band:

```bash
curl -s "https://chainscan-galileo.0g.ai/open/api?module=contract&action=getsourcecode&address=$ADDR" | jq '.result[0].SourceCode' | head
```

A populated `SourceCode` field = verified.

## Working command shape

```bash
forge verify-contract <address> <path>:<contract> \
  --verifier etherscan \
  --verifier-url https://chainscan-galileo.0g.ai/open/api \
  --etherscan-api-key placeholder
```

(No `--chain` flag — Foundry doesn't know 16602 and rejects it; the URL alone is enough.)

## Confirmed working

- `Foo` at `0xa62844802e39F51c92675323AA80CCB46885F9eE` — verified on Galileo.
