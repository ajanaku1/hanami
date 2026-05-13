# 0G Storage — Day 0 finding

## What works

- `@0glabs/0g-ts-sdk` installs cleanly.
- Galileo Flow contract `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` is reachable via the turbo indexer.
- SDK correctly fetches `pricePerSector` from the market, calculates `storageFee`, and submits with `msg.value = fee`.
- Deployer wallet has gas + storage fee covered (storage fee for 84 bytes ≈ 3.07e10 wei).

## What fails

`Flow.submit()` reverts with bare `require(false)` (no reason string). The SDK call shape, gas, fee, and value all look correct from inspection of `dist/zgstorage.umd.js`.

Two plausible causes — to resolve on Day 1:

1. **Turbo vs Standard mismatch.** The docs list one Flow address but the SDK ships two indexer endpoints (turbo, standard). The turbo indexer may target a different Flow contract than the docs-listed one. Try `https://indexer-storage-testnet-standard.0g.ai`.
2. **Whitelisted submitters.** If the testnet Flow gates `submit()` by an allowlist, the deployer isn't on it. Check via Discord or a Goldsky subgraph.

## Decision

Storage works conceptually — SDK + contract + indexer all reachable. The revert is a config detail, not a fundamental blocker. **Day 1 unblocker task:** swap indexer endpoint, if still reverting, switch to a hash-only "I uploaded this CID" stub for persona/lorebook on the iNFT, with real upload wired Day 2 once the config is right.

## What this means for the iNFT design

`encryptedPersonaURI` on `BouncerRegistry` should be a `string` field that today stores a 0G Storage root hash but is opaque enough to fall back to `ipfs://...` or `data:...` if Day 1 unblocks storage late. No coupling to a specific Storage SDK behavior in the contract.
