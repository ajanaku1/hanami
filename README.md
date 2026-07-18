# Hanami · 花見

An AI bouncer for your NFT whitelist. Each bouncer is an ERC-7857 iNFT you own. It interviews each applicant inside a TEE on 0G Compute, signs every decision with a TEE attestation hash on 0G Chain, and exports a Merkle root you can drop into any EVM mint contract.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8-363636?logo=solidity)](https://soliditylang.org/)
[![0G Mainnet](https://img.shields.io/badge/0G-mainnet_16661-EC4899)](https://chainscan.0g.ai/)
[![Tests](https://img.shields.io/badge/foundry_tests-16_passing-brightgreen)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![0G Bridge](https://img.shields.io/badge/0G_Bridge-AKINDO-8B5CF6)](https://akindo.io)

![Hanami architecture: user-signed mint, TEE-attested screening, chain-agnostic Merkle export](docs/architecture.png)

The whole point: projects can't hand-screen 4,400 applicants for 200 spots. Forms get gamed in an afternoon. Captchas get solved by mechanical-turk farms. Hanami runs the first pass (a private conversation with a character your project defines), and the founders only have to review borderline cases.

## Zero Cup 2026

Hanami is a Zero Cup tournament entry, built AI-native on 0G. It cleared the Group Stage and advanced to the **Round of 32**. See [What's new for the Round of 32](#whats-new-for-the-round-of-32) below.

| | |
|---|---|
| **Track** | AI-native on 0G (agent / companion) |
| **0G modules** | Compute (TEE inference + image), Storage (persona, lorebook, portrait, transcripts), Chain (ERC-7857 iNFT + decision log) |
| **Status** | Live on 0G mainnet, chain 16661, both contracts verified |

Most entries lean on a single 0G primitive. Hanami's trust model only works because all three are load-bearing: the bouncer reasons inside a TEE on **0G Compute**, its persona and every transcript are content-addressed on **0G Storage**, and each decision lands on **0G Chain** carrying the attestation hash that proves the inference ran in a sealed enclave. Remove any one and the product stops being verifiable.

## 0G Bridge Buildathon

Hanami is also submitted to the **0G Bridge Buildathon by AKINDO**, a 10-week, 5-Wave program for builders shipping AI × Onchain applications on 0G. It arrived with all three 0G pillars already integrated and live on mainnet (chain 16661), having previously advanced to the **Round of 32** in the Zero Cup 2026 tournament.

| | |
|---|---|
| **Category** | AI Agents / Trust & Safety |
| **0G modules** | Compute (TEE inference + image), Storage (persona, lorebook, portrait, transcripts), Chain (ERC-7857 Agentic ID + decision log) |
| **Status** | Live on 0G mainnet, both contracts verified, existing user base |
| **Previous** | Zero Cup 2026: Top 32 |

### Submission readiness

- **0G mainnet contract addresses:** `BouncerRegistry` at `0x764883319e51e46F683aB54D93F26bcBb74A7030`, `CampaignFactory` at `0xfe6b2417407595Ad4d1F8D4D8c95860881d539d4`. Both verified on [Chainscan](https://chainscan.0g.ai/).
- **Live demo:** [hanami-hazel.vercel.app](https://hanami-hazel.vercel.app). Mint a bouncer, apply as an applicant, run adversarial tests, export a Merkle root.
- **Architecture diagram:** [`docs/architecture.png`](docs/architecture.png) with full data-flow walkthrough below.
- **Demo script:** [`demo/script.md`](demo/script.md). A 3-minute walkthrough covering mint, chat, adversarial, admin, Merkle export.
- **X post template:** [`demo/x-post.md`](demo/x-post.md). Ready with Bridge hashtags and tags.
- **Reproduction:** see [Quick start](#quick-start). Two `npm install && npm run dev` and you're screening applicants locally against 0G mainnet.

## What's new for the Round of 32

The tournament rewards improving between rounds. Since the Group Stage:

- **Verify on 0G**: every decision screen has a one-click check that pulls the inference's `x_0g_trace`, recomputes `keccak256(requestId, provider, tee_verified)` in the browser, and shows it matching the hash on chain byte-for-byte. The attestation claim went from "trust the README" to a 15-second proof anyone can run, no wallet needed.
- **Signed-enclave decision path, wired and ready**: alongside the live Router path, the decision turn can run through the **0G Compute Direct broker**, which returns the provider's raw TEE signature over the response. The on-chain attestation hash becomes `keccak256(signature)`, and the Verify-on-0G panel recovers that signature to the provider's on-chain-registered `teeSignerAddress` in the browser. Cryptographic proof the enclave signed the decision, with the Router out of the trust base. The code is wired end to end and verified against 0G mainnet (provider discovery, signer status, offline recovery) but ships **disabled** (`OG_DIRECT_ENABLED=false`): activating it requires a standing 3 0G deposit in the Compute ledger, which we've chosen not to lock up for now. When enabled it's a drop-in, same `0GM-1.0-35B-A3B` model, transparent fallback to the Router if the ledger is unfunded or a provider is unreachable. See [Direct broker for the decision turn](#direct-broker-for-the-decision-turn-backendsrcog-compute-directts).
- **On-chain reputation, live**: each approval now calls `incrementRep` on the bouncer iNFT, so a bouncer accrues a verifiable track record that travels with the token across every campaign it runs. Previously declared on the contract but inert; now wired end to end.
- **Transcripts pinned to 0G Storage**: the full conversation (not just the reasoning hash) is now content-addressed on Storage at decision time, with its rootHash on the decision record.
- **Privacy gate**: a private campaign's applicant feed (wallets + decisions) now requires an owner signature; aggregate counts stay public.
- **Hardening**: the `tee_verified` flag is persisted per turn, a keepalive keeps the backend warm for judges, and the copy now matches the contract. The iNFT is a tradable ERC-721 whose reputation and history travel with it; the ERC-7857 sealed-key transfer path is a documented v1 limitation.

## Live demo

- **App**: https://hanami-hazel.vercel.app
- **Backend**: https://hanami-backend-ugak.onrender.com/health

## Live on 0G mainnet · chain 16661

| Contract | Address |
|---|---|
| BouncerRegistry (ERC-7857 iNFT) | [`0x764883319e51e46F683aB54D93F26bcBb74A7030`](https://chainscan.0g.ai/address/0x764883319e51e46F683aB54D93F26bcBb74A7030) |
| CampaignFactory | [`0xfe6b2417407595Ad4d1F8D4D8c95860881d539d4`](https://chainscan.0g.ai/address/0xfe6b2417407595Ad4d1F8D4D8c95860881d539d4) |

Both verified on `chainscan.0g.ai`. Each project's bouncer iNFT is minted directly to the project owner's wallet. Hanami never custodies the token.

## Features

- **AI bouncer you own**: each bouncer is an ERC-7857 iNFT minted to the project owner's wallet, not a service account Hanami controls.
- **Persona-driven screening**: the owner writes the voice, taste, and fit criteria. The bouncer holds a 3–6 turn private conversation, then approves or rejects.
- **TEE-attested decisions**: every approve and reject tx carries a `bytes32` attestation hash proving the inference ran inside a sealed enclave.
- **Verify on 0G (in-app)**: any decision screen recomputes `keccak256(requestId, provider, tee_verified)` from the `x_0g_trace` in the browser and shows it matching the on-chain attestation hash byte-for-byte. A 15-second proof anyone can run, no wallet needed. (A stronger signature-recovery path via the Direct broker is wired and ready behind a flag; see [Direct broker for the decision turn](#direct-broker-for-the-decision-turn-backendsrcog-compute-directts).)
- **On-chain receipt**: decision, reasoning hash, and attestation hash are recorded per applicant, inspectable on Chainscan without a wallet. The full conversation transcript is pinned to 0G Storage at decision time.
- **On-chain reputation**: each approval increments the bouncer iNFT's `repScore`, so a verifiable track record accrues to the token and travels with it across campaigns.
- **Chain-agnostic Merkle export**: close a campaign and export a root plus copy-paste Solidity that drops into an existing mint contract on Ethereum, Base, Arbitrum, OP, or 0G.
- **Anti-gaming by design**: criteria stay sealed in storage, one attempt per wallet is enforced at the API and contract layer, prompt-injection attempts are rejected, and expensive endpoints are rate-limited.
- **Privacy gate**: a private campaign's per-applicant feed (wallets + decisions) requires an owner signature; aggregate counts stay public.
- **Owner-revocable delegation**: the backend can sign decisions only because the owner granted it through `authorizeUsage`, and that grant can be revoked anytime.

## Project overview

A project owner:

1. Mints a bouncer iNFT and writes that bouncer's persona (voice, taste, what makes a fit). Adds an optional project context document the bouncer can reference.
2. Shares the applicant URL.

An applicant connects a wallet, the bouncer greets them in character, they talk for 3–6 turns. The bouncer issues approve or reject. Decision + reasoning are written on chain with the TEE attestation hash that proves the inference ran inside a sealed enclave.

At campaign close, the owner exports a Merkle root and copy-paste-ready Solidity. That root drops into the project's existing mint contract on Ethereum, Base, Arbitrum, OP, or 0G itself. Hanami does not require the mint to happen on 0G.

The MVP ships with three demo bouncers (Kenji, Bad Frogs, Sakura Society). Their persona documents and lorebooks live on 0G Storage and their iNFTs live on 0G Chain, all inspectable on Chainscan. AI-generated portraits are pinned to 0G Storage and mirrored in a durable store (see [Portraits](#portrait-durability)) so they keep rendering even if a storage node drops the blob.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React, wagmi v2, MetaMask |
| Backend | Hono, TypeScript, Node 22, Turso/libSQL (read cache + durable portrait store) |
| Contracts | Solidity 0.8, Foundry, ERC-7857 iNFT, OpenZeppelin |
| 0G Compute | Router API (`0GM-1.0-35B-A3B` chat, `z-image` portrait), `verify_tee:true` |
| 0G Storage | `@0gfoundation/0g-storage-ts-sdk`, content-addressed rootHashes |
| 0G Chain | Mainnet chain 16661, verified on `chainscan.0g.ai` |
| Hosting | Vercel (frontend), Render (backend) |

## System architecture

The editable Excalidraw source lives at [`docs/architecture.excalidraw`](docs/architecture.excalidraw). Drop it into [excalidraw.com](https://excalidraw.com) (File > Open) to tweak it. The text version below mirrors the same flow for quick reading inline.

```
            ┌─────────────────────────────┐
            │  /create (Next.js)          │
            │  project owner connects     │
            └──────────────┬──────────────┘
                           │ persona + project context
            ┌──────────────▼──────────────┐
            │  POST /api/campaigns/prepare│  backend uploads to 0G Storage,
            │  (backend, off-chain)       │  generates portrait, returns URIs
            └──────────────┬──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │  0G Compute · 0GM-1.0-35B   │  visual brief from persona text
            │  (TEE-attested chat)        │
            └──────────────┬──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │  0G Compute · z-image       │  portrait PNG
            │  (TEE-attested image)       │
            └──────────────┬──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │  0G Storage                 │  persona, lorebook, portrait
            │  finalityRequired:false     │  → three rootHashes
            └──────────────┬──────────────┘
                           │ owner signs three txs in MetaMask:
                           │
            ┌──────────────▼──────────────┐
            │  BouncerRegistry            │  mintBouncer(personaURI,
            │  ERC-7857 iNFT              │     lorebookURI, imageURI, 0x0)
            └──────────────┬──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │  BouncerRegistry            │  authorizeUsage(tokenId,
            │  delegation                 │     backendAddress, 0x)
            └──────────────┬──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │  CampaignFactory            │  createCampaign(tokenId, cap)
            │  (factory deploys Campaign) │
            └──────────────┬──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │  POST /api/campaigns/index  │  backend verifies on-chain
            │  (DB write only)            │  ownerOf + isAuthorized, then
            │                             │  writes index row for the UI
            └──────────────┬──────────────┘
                           │
                  ─────  applicant arrives  ─────
                           │
            ┌──────────────▼──────────────┐
            │  /c/[slug] chat (Next.js)   │  bouncer greets in character
            └──────────────┬──────────────┘
                           │ per turn
            ┌──────────────▼──────────────┐
            │  0G Compute · 0GM-1.0-35B   │  verify_tee:true
            │  (TEE-attested chat)        │  → x_0g_trace with attestation
            └──────────────┬──────────────┘
                           │ attestationHash =
                           │ keccak256(requestId, provider, tee_verified)
            ┌──────────────▼──────────────┐
            │  Campaign.recordDecision    │  backend (authorized executor)
            │  signs on chain             │  writes each decision tx
            └──────────────┬──────────────┘
                           │ campaign close
            ┌──────────────▼──────────────┐
            │  Merkle root (sortPairs)    │  exports JSON + Solidity snippet
            │  → any EVM mint contract    │
            └─────────────────────────────┘
```

The mint is user-signed. Three signatures from the project owner (mint, authorize, create campaign) put the iNFT in their wallet and make them the owner of the Campaign contract. The backend has no key access to either. It can call `recordDecision` only because the owner explicitly granted it through `authorizeUsage`, and that grant can be revoked at any time.

TEE attestation lands on chain per decision, not just at mint. Every approve and reject tx carries a `bytes32 attestationHash` computed from the Router's `x_0g_trace` (`request_id`, `provider`, `tee_verified`). Anyone watching the contract can prove the inference ran inside a sealed enclave, even without seeing the conversation.

The Merkle root is chain-agnostic. The export bundles a `bytes32` root, per-applicant proofs, and a Solidity verifier snippet. The actual NFT mint can happen on Ethereum, Base, Arbitrum, OP, or 0G itself. We don't care where the project decides to deploy.

## 0G modules used

### 0G Storage (`backend/src/og-storage.ts`)

SDK: `@0gfoundation/0g-storage-ts-sdk@1.2.9`.

What we pin on storage:

- Bouncer persona text (the system prompt the bouncer reasons inside).
- Project context document (what the bouncer knows about the project's art, story, what makes a fit).
- Bouncer portrait PNG (1024×1024, generated by z-image).
- Decision reasoning for every approve/reject (a paragraph in the bouncer's voice).
- Full conversation transcript per applicant.

The persona, lorebook, and portrait roots go on chain at mint (as the iNFT's URIs); the reasoning hash goes on chain per decision. The transcript root is pinned to 0G Storage and recorded in the index DB (`applicants.transcript_uri`), not passed on-chain. 0G Storage is the canonical home; the Turso/libSQL database is a read cache so the admin dashboard renders without round-tripping storage on every load.

We pass `finalityRequired:false` on upload: the default (`true`) polls for network-wide finalization and can hang 10+ minutes on larger blobs (the ~700KB portrait PNG hit this consistently), so we return as soon as a node accepts the file and let finalization happen in the background.

#### Portrait durability

`finalityRequired:false` has a sharp edge: a holding node can drop a blob before it replicates, and the indexer then returns `File not found` for that root. The original demo portraits were lost this way: the only surviving copy lived in Render's `.image-cache/`, which is wiped on every restart. So portraits now have a durable home: each generated PNG is stored base64 in a `portraits` table (Turso survives restarts) keyed by its rootHash. The `/api/image/:root` proxy resolves **disk cache → Turso → 0G indexer**, backfilling caches on every hit, and the frontend `<Portrait>` falls back to a procedural SVG on any load error, so a card never shows a broken image. (The three demo portraits were regenerated after this fix; their displayed root is the durable one and may differ from the now-dead root recorded on-chain at the original mint, since `BouncerRegistry` has no `setImageURI` in v1.)

### 0G Compute Router (`backend/src/og-compute.ts` and `backend/src/og-image.ts`)

Endpoint: `https://router-api.0g.ai/v1`. OpenAI-compatible. All requests use `verify_tee:true` and we reject any reply where `x_0g_trace.tee_verified` is not true.

Two models in use:

- `0GM-1.0-35B-A3B` for the bouncer chat. TEE-attested. Thinking mode is disabled via `chat_template_kwargs: { enable_thinking: false }` because the bouncer doesn't need chain-of-thought. It needs to stay in character and decide.
- `z-image` for the bouncer portrait. TEE-attested. Same TEE provider (`0xE29a…F974`) attests the image generation, so a freshly minted Hanami portrait carries provable TEE provenance. (The three demo portraits were regenerated after a storage-durability fix, so their current bytes are a re-pin whose root differs from the one recorded on-chain at the original mint. See [Portrait durability](#portrait-durability).)

Each chat response comes back with an `x_0g_trace` object. We compute the on-chain attestation hash as `keccak256(abi.encode(requestId, provider, tee_verified))` and pass that as a parameter to `Campaign.recordDecision`. No off-chain trust required; anyone can recompute the hash from the trace and match it against the on-chain log.

#### Direct broker for the decision turn (`backend/src/og-compute-direct.ts`)

The Router verifies the enclave server-side and returns a boolean. That's convenient, but it puts the Router in the trust base. For the **decision turn only** (the inference that emits a verdict and lands on chain), the code can instead route through the 0G Compute **Direct broker** (`@0gfoundation/0g-compute-ts-sdk`). The broker talks to a TEE provider directly and exposes the provider's raw signature over the response, plus the provider's on-chain-registered `teeSignerAddress`. We verify the signature recovers to that signer, set the on-chain attestation hash to `keccak256(signature)`, and store the `{ text, signature, signingAddress }` bundle so the Verify-on-0G panel can re-recover it in the browser. This is strictly stronger than the boolean: cryptographic proof the enclave signed the decision, verifiable offline with `recoverAddress(hashMessage(text), signature)`.

**Status: wired and ready, shipped disabled.** The full path is implemented and verified against 0G mainnet. Provider discovery, TEE signer status, and the offline recovery all check out against the live `0GM-1.0-35B-A3B` provider (`0x4870CbC4…a4E9`, signer `0x0038F716…DB2e8`). It ships **off** (`OG_DIRECT_ENABLED=false`) because a Direct-broker ledger requires a standing minimum deposit of **3 0G**, which we've chosen not to lock up. When enabled, only turns that can carry a verdict (turn 3+) use the broker; earlier turns stay on the fast Router. To turn it on: `npx tsx scripts/direct-broker-setup.ts fund=3` to create the ledger, then set `OG_DIRECT_ENABLED=true` and `OG_DIRECT_PROVIDER`. If it's disabled or a call fails (unfunded ledger, provider down), the deciding turn transparently falls back to the Router path and still produces a wallet-free hash-match proof, so the product never blocks on broker availability.

### 0G Chain (`contracts/src/BouncerRegistry.sol` and `Campaign.sol`)

Chain ID 16661. Two contracts, both verified on `chainscan.0g.ai`:

- `BouncerRegistry`: ERC-7857-compliant iNFT. Each token holds `(encryptedPersonaURI, lorebookURI, imageURI, oracleConditions, repScore)`. Transferable as a standard ERC-721: the token, its `repScore`, and its on-chain decision history all travel with the new owner (everything is keyed by `tokenId`). The ERC-7857 sealed-key `transfer`/`clone` path (which re-encrypts the persona for the new holder) is disabled in v1 and reverts; a plain ERC-721 `transferFrom` is how the token actually moves. Implements `authorizeUsage` so the iNFT owner can delegate write access to one or more executors (the Hanami backend, in the standard flow), and that grant is revocable.

- `CampaignFactory` and `Campaign`: one campaign per whitelist round. `Campaign.recordDecision` requires the caller to be authorized by the bouncer iNFT, enforces one-attempt-per-wallet, respects the WL size cap, and stores `(reasoningHash, attestationHash, status, timestamp)` per applicant. `finalizeMerkleRoot` is owner-only and one-shot.

16 Foundry tests in `contracts/test/`, including a separate `MerkleConsumer.t.sol` that simulates an external EVM mint contract consuming the exported root. Five tests prove approved addresses can mint, rejected addresses revert with `NotApproved`, and double-mint reverts with `AlreadyMinted`. The registry suite proves both transfer paths: the ERC-7857 sealed-key `transfer` reverts (`TransferDisabled`) while standard ERC-721 `transferFrom` works and carries the token's stored data.

## How those modules support the product

The product is "an AI bouncer projects own, that screens applicants in private, with a verifiable receipt." Each module above does one specific job.

### 0G Storage holds the project's moat

A bouncer's persona and project context document are the project's competitive edge. If the criteria leak, the screen is dead within a day. Applicants memorize the right answers, farms script them. We needed a store that's cheap, content-addressed, large enough for multi-page documents, and not a centralized service we operate. 0G Storage gave us all four. The rootHash gets pinned on the iNFT, so the persona doc lives on the same rail as the token that points to it.

### 0G Compute with TEE removes the trust hops

The whole pitch falls apart if the bouncer can be bribed or read. The TEE solves both. The persona text unseals only inside the enclave; no provider operator can read it. The attestation receipt proves to anyone watching the chain that the reply came out of that enclave. We don't have to trust the AI provider, the project owner doesn't have to trust us. The same TEE rail also generates the portrait, so the visual identity of each bouncer carries the same provenance as its decisions.

### 0G Chain holds ownership and the public log

This is where the bouncer iNFT lives and where decisions are recorded. Each screen decision is an indexed event tied to a TEE attestation hash. The Merkle root finalizes on chain too. Other EVMs could have hosted the contracts, but ERC-7857 is native to 0G. `encryptedPersonaURI` is a first-class field, not a metadata workaround. Picking 0G means the iNFT primitive matches what the product needs without us reinventing it.

### Chain-agnostic Merkle export keeps the product useful

Projects rarely want to mint on the same chain they screen on. The Merkle root, the per-applicant proofs, and the Solidity verifier let them deploy the mint contract wherever their audience already is. Hanami sits in front of the existing mint, not in place of it.

## Local deployment

You need: Node 22+, Foundry, a wallet with mainnet OG, and a funded 0G Compute Router account at `pc.0g.ai`. The chat and image endpoints both bill from the Router escrow (separate from the wallet balance shown in the dashboard, with a "Deposit" button on the Router tab).

```bash
# 1. clone + install
git clone <this repo> hanami && cd hanami

# 2. contracts. Already deployed to 0G mainnet. Run tests locally if you want.
cd contracts && forge install && forge test
# 16 tests pass: BouncerRegistry + Campaign + MerkleConsumer
# (if forge-std is missing: git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std)

# 3. backend
cd ../backend && npm install
cp .env.example .env
# fill in DEPLOYER_PRIVATE_KEY (wallet that signs Campaign.recordDecision on
#   behalf of bouncer owners, needs a small mainnet OG balance for gas)
# fill in OG_ROUTER_API_KEY (from pc.0g.ai → Dashboard → API Keys,
#   created while connected with the wallet that funded the Router escrow)
npm run dev   # → :8787

# 4. frontend
cd ../frontend && npm install
npm run dev   # → :3000
```

Open `http://localhost:3000`. The contract addresses, RPC, and indexer endpoints in `backend/.env.example` already point at 0G mainnet. No extra configuration needed.

### Backend smoke scripts

End-to-end checks against the live network. From `backend/`:

```bash
npx tsx scripts/check-balance.ts      # deployer wallet balance on 0G mainnet
npx tsx scripts/hello-inference.ts    # one Router call against 0GM-1.0-35B-A3B
npx tsx scripts/hello-tee.ts          # confirms tee_verified:true in x_0g_trace
npx tsx scripts/hello-storage.ts      # upload + download by rootHash, byte-match
npx tsx scripts/smoke-chain.ts        # full mint flow against the deployed contracts
npx tsx scripts/adversarial.ts        # 8 adversarial scenarios; latest run 6/8
```

## Project structure

```
hanami/
├── frontend/        # Next.js 16 app: /create (owner) + /c/[slug] (applicant chat)
├── backend/         # Hono API: 0G Storage, 0G Compute, chain indexing, Merkle export
│   ├── src/         # og-storage.ts, og-compute.ts, og-image.ts, server.ts
│   └── scripts/     # smoke + adversarial end-to-end checks
├── contracts/       # Foundry: BouncerRegistry (ERC-7857) + CampaignFactory + Campaign
│   └── test/        # 16 tests incl. MerkleConsumer.t.sol
├── docs/            # architecture diagram (Excalidraw source + PNG)
└── demo/            # demo script + assets
```

## Reviewer notes

### Test account

A funded reviewer wallet for the demo is documented in the submission form (separate from this public repo). It holds enough mainnet OG to:

- Mint a bouncer (3 tx signatures: mint, authorize, create campaign; totals about 0.005 OG).
- Apply as an applicant against an existing public bouncer (1 tx for the decision; gas only).
- Finalize a Merkle root.

### Faucet

0G mainnet OG faucet: see official 0G docs at `docs.0g.ai`. Mainnet OG can also be acquired through 0G ecosystem exchanges if the faucet is rate-limited.

### Walking the demo without a wallet

You can read the full state without signing anything:

- `https://chainscan.0g.ai/address/0x764883319e51e46F683aB54D93F26bcBb74A7030`: every bouncer ever minted, with persona/portrait URIs in the constructor calldata.
- `https://chainscan.0g.ai/address/0xfe6b2417407595Ad4d1F8D4D8c95860881d539d4`: every campaign deployed by the factory.
- Each `Campaign.recordDecision` tx on Chainscan shows the `attestationHash` parameter. That is the TEE receipt.

### Known gotchas

- **0G Compute Router API keys are wallet-bound.** A key you generated while connected to wallet A won't see funds you deposited from wallet B. Create the key while connected with the wallet that funds the Router escrow.
- **Storage uploads use `finalityRequired:false`.** Documented in `backend/src/og-storage.ts`. The file is pinned immediately and becomes downloadable through the indexer once the network finalizes, but a holding node can drop it first, after which the indexer returns `File not found`. Portraits are insulated from this by the durable `portraits` store in Turso plus the procedural-SVG fallback (see [Portrait durability](#portrait-durability)); other blobs (persona, lorebook, reasoning) are small text and finalize reliably.
- **Chain ID enforcement.** The mint flow calls `switchChainAsync({ chainId: 16661 })` unconditionally before any signing prompt. If your wallet sits on Sepolia, Ethereum mainnet, or anywhere else, MetaMask will pop a "switch to 0G" prompt first. This is intentional. wagmi v2's `useChainId()` can report stale values when the wallet's actual chain isn't in the config's `chains` array, so we don't trust it for gating.

### Adversarial behavior

These four scenarios are implemented in `backend/scripts/adversarial.ts`:

- Thoughtful, specific applicant → approve. Passes.
- Generic enthusiasm / hype words only → reject. Passes.
- Prompt-injection attempts (`ignore previous instructions`, fake admin tags, scripted insider claims) → reject. Passes after a frame-rule tightening; the bouncer no longer parrots scripted persona language.
- Retry after rejection → blocked at the API layer and at the `Campaign` contract layer.

Last recorded full run: 6/8. Both misses are false-negatives: genuinely thoughtful applicants (`T1`, `T2`) that the bouncer rejected for being understated rather than for any flip/hype/manipulation signal. That is a conservative failure, not a security regression: the gate never let a bad actor through, it just turned away two good ones.

For the Round of 32 we added a frame rule that tells the bouncer not to over-reject sincere, specific-but-quiet applicants (genuine specificity outweighs a low word count), while leaving the auto-reject defenses for hype, flip intent, and manipulation untouched. Re-run `npx tsx scripts/adversarial.ts` against a funded Router to confirm the two thoughtful cases now approve; the four jailbreak/low-effort rejections and the flip-intent edge case are unchanged.

## License

MIT. Built on 0G. Zero Cup 2026 Top 32 · 0G Bridge Buildathon by AKINDO.
