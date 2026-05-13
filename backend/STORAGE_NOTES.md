# 0G Storage — resolved (supersedes Day 0 / Day 1 entries)

## What was actually wrong

The npm package I installed first, `@0glabs/0g-ts-sdk@0.3.3`, is the **deprecated** scope. Its companion `@0glabs/0g-serving-broker` literally has a `DEPRECATED — renamed to @0gfoundation/0g-compute-ts-sdk` message in its description. I missed that the storage SDK was migrated under the same scope split.

The current package is **`@0gfoundation/0g-storage-ts-sdk@1.2.9`** (published 2026-05-05, ~7 months after the deprecated 0.3.3). It contains the new submit selector `0xbc8c11f8` that the upgraded Flow contract requires.

## Verified working

`backend/scripts/hello-storage.ts` now performs a full round-trip against Galileo:

- Upload 84 bytes → tx `0x7845ce15f6e69c58a317b66dc12939ae5d4c052a4d8d41483081daad81f879ef`, root `0x5d50cd6f8714079414adae2932f51fdf53d5ad766b3ca4f0ea632e74eab32726`, seq 108481
- Download by root → 4 storage nodes report shard config, 2 selected, file pulled, bytes match exactly.

## Important API changes vs the deprecated SDK

- `MemData`, `Indexer` import path is `@0gfoundation/0g-storage-ts-sdk`, not `@0glabs/0g-ts-sdk`
- `indexer.upload(data, rpc, signer)` returns `[{ txHash, rootHash, txSeq }, err]` — the root is in the tx result, no need to call `data.merkleTree().rootHash()` separately
- `indexer.download(root, filePath, withProof)` writes to a file path now; the in-memory download pattern is no longer the signature

## Impact on Hanami

**Original goal.md claims hold as-stated.** 0G Storage is the canonical store for persona, lorebook, and conversation transcripts. No IPFS fallback needed. The "0G integration depth" judging criterion stays fully intact.

## Day 2.1 revision

Task #20 changes from "IPFS upload helper (Pinata) + og-storage shim" to "0G Storage uploader in og-storage.ts using the @0gfoundation SDK."
