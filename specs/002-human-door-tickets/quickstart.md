# Quickstart: validating feature 002 end to end

## Prerequisites
- Node 22, pnpm/npm, Foundry; existing `backend/.env` with 0G credentials (never edited by the agent; operator adds the new keys below).
- New env (operator): `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_ACTION=hanami-door`, `GRAPH_API_KEY`, `OG_DIRECT_ENABLED=true`, `OG_DIRECT_PROVIDER`, `CAMPAIGN_FACTORY_V2`, `TICKET_ADDRESS`, `TICKET_GATE_ADDRESS`.
- World sandbox app with the `hanami-door` action; Selfie Check flag requested via https://forms.gle/mqbaiwMvX5MzmKdY8 (fallback: `orb`).
- Subgraph Studio API key.
- 3 OG in the Compute ledger for the Direct broker (operator step; `npm run og:ledger:status` reports it).

## Contracts
```bash
cd contracts && forge test                      # existing 16 + new CampaignV2/Ticket/TicketGate suites green
forge script script/DeployV2.s.sol --rpc-url https://evmrpc.0g.ai --broadcast --verify   # operator
```
Expected: `Ticket`, `CampaignFactoryV2`, `TicketGate` addresses printed and verified on Chainscan; V1 addresses unchanged.

## Backend
```bash
cd backend && npm test                          # door-*, ledger-*, tickets-*, roster tests + existing suites
npm run dev
curl -s localhost:8787/health                   # shows contractVersion: 2 support, direct: true|false
```
Validation scenarios (see `contracts/door-tickets-api.openapi.yaml`):
1. `POST /begin` without a proof → 403 `door required`.
2. `POST /door/verify` with a sandbox proof → 200 `verified`; repeat with another wallet, same person → 409.
3. `GET /brief?wallet=…` for a wallet with Ethereum marketplace history → `status: ready`, ≥2 `sourcesRead.ok`.
4. Interview to a decision → response carries `receipt` with `nullifier`, `attestationPath`, and `ticket.id`; `DecisionRecordedV2` visible on Chainscan.
5. `POST /tickets/{id}/revoke` prepared tx, signed by owner → `hasLiveTicket` false; `GET /roster` shows `revoked`.

## Direct broker (operator, enclave-signed decisions)
The decision turn is signed inside the provider's enclave only when the broker is configured and its
ledger is funded; otherwise every path falls back to the Router and says so on the receipt.

```bash
cd backend
npm run og:ledger:status                        # shows the Compute ledger balance
# fund 3 OG to that ledger from the deployer wallet, then set in backend/.env (operator, never the agent):
#   OG_DIRECT_ENABLED=true
#   OG_DIRECT_PROVIDER=0x…      # a provider with a registered teeSignerAddress
npm run dev
```
Then interview one applicant through to a verdict and open Verify on 0G on the receipt. Expected:
path reads `Enclave signature (direct)`, the recovered address equals the provider's on-chain TEE
signer, and `GET /api/campaigns/<slug>/verify/<wallet>` answers `"attestationPath":"direct"` with
`"kind":"tee-signature"`. Record that campaign and wallet in `docs/ethonline-evidence.md` as
`Direct-path campaign:` and `Direct-path wallet:`, which is what `./verify.sh live` reads.

With the ledger unfunded the same walk must still finish: the receipt reads `Router trace (router)`
and nothing else changes. That fallback is the behaviour under test, not a failure.

## Frontend
```bash
cd frontend && npm test && npm run build && npm run dev
```
Walk: Gallery ticket counts → campaign page Door (QR) → Brief panel → interview → Receipt → Verify (three hashes, attestation path, signer recovery) → Admin Roster → Revoke.

## Agent CLI
```bash
cd agent && npm install && npm test
npx tsx src/cli.ts register 0xAGENT               # once, confirm in World App
npx tsx src/cli.ts apply https://hanami-hazel.vercel.app/c/kenji --wallet 0xHUMAN --json
```
Expected: receipt JSON with a decision and, on approval, a ticket id; second run exits 2 with "this person has already applied".

## Release checks
```bash
./verify.sh            # all phases; `./verify.sh live` needs network and the operator env
```
`release` asserts: README continuity section with commit ranges, `docs/feedback-world.md`, `docs/ai-usage.md`, demo video file 2–4 min ≥720p referenced in README.
