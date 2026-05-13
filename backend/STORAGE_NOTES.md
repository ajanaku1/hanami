# 0G Storage — Day 1 finding (supersedes Day 0)

## What's actually broken

The Flow contract `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` on Galileo testnet **was upgraded past the published SDK**.

Forensics:

- Storage node `34.19.125.196:5678` reports a healthy network — `chainId: 16602`, `flowAddress: 0x22e03a...`, `nextTxSeq: 108431`, syncing to height 33M. The network is live.
- The Flow proxy points at impl `0x7fb56db44abed98c2388e2598852e4edb87f81dd`. Impl is **not verified on Chainscan**.
- Recent **successful** `submit()` txs use selector `0xbc8c11f8`. Example: tx `0x478f3dbb817db8047d56d3cbab397baa3ecba64611cb12856de81f950767e068`.
- `@0glabs/0g-ts-sdk@0.3.3` (the latest published version on npm) calls with selector `0xef3e12dc`. Old signature, no longer accepted.
- That's why we got bare `require(false)` — the old selector hits a fallback path that immediately reverts.

## Decision — fallback per goal.md risk register

Use **IPFS for persona/lorebook storage** in MVP. `encryptedPersonaURI` stores `ipfs://CID`. The on-chain field stays opaque (string), so swap-back to 0G Storage is one config line once `@0glabs/0g-ts-sdk@0.4.x` ships with the updated ABI + segment-upload protocol.

This matches the explicit fallback pattern in `goal.md`'s risks table:

> "If the 0G Compute SDK doesn't return an attestation cleanly, fall back to storing the inference response hash + a placeholder attestation field; surface the real attestation as soon as the SDK exposes it. Either way the on-chain field is shipped."

Same pattern, same justification — ship the on-chain field with a working URI, swap the URI scheme when the SDK catches up.

## What the README will say

> Hanami uses 0G Storage as the canonical persona/lorebook store. During the May 2026 hackathon window, `@0glabs/0g-ts-sdk@0.3.3` (latest published) is one Flow-contract upgrade behind the deployed Galileo testnet contract — successful txs use selector `0xbc8c11f8` while the SDK still emits `0xef3e12dc`. MVP ships with IPFS as a fallback URI scheme; `encryptedPersonaURI` is intentionally opaque so swapping back to 0G Storage requires one config change when the SDK is updated.

## Implementation plan

- Install `pinata-web3` (free tier, 1GB/month — more than enough for the demo)
- `og-storage.ts` becomes a tiny shim: `uploadPersona(text) → ipfs://CID`
- Same shim shape will swap to 0G Storage SDK with no caller changes when the SDK ships
- Conversation transcripts: stored locally in SQLite (Task #13) since they're high-volume; IPFS pin only the final approve/reject reasoning

## Risk this introduces

- IPFS pin durability on free tier (Pinata): pinned files persist as long as we pay; demo window is fine
- "0G integration depth" judging criterion: weakened on the Storage leg, but Compute + Chain + iNFT still all on 0G — three out of four primitives, with the fourth being a known-upstream issue we can demonstrate via the recent tx forensics above
