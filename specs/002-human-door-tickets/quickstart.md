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

## Deploying (operator, and the order matters)

The backend must go out **before** the frontend. The new campaign page asks for
`/api/campaigns/:slug/door/context`, which the old backend does not serve, so a frontend deployed
first reports the Door unavailable and nobody can apply to any campaign, V1 ones included.

**1. Backend — Render dashboard, manual deploy** (`autoDeploy: false`, because a redeploy wipes the
free tier's ephemeral disk; the index DB lives in Turso for exactly this reason). Set these before
deploying — `render.yaml` declares all of them, with `sync: false` on everything secret:

| Key | Value |
|---|---|
| `CAMPAIGN_FACTORY_V2` | `0xdb03669FD2EDA044e65333D860952A9d77094b28` (already in `render.yaml`) |
| `TICKET_ADDRESS` | `0x51Bf4E0376cb62Fc2875f6b200631D1C38F7463B` (already in `render.yaml`) |
| `TICKET_GATE_ADDRESS` | after step 4 |
| `WORLD_APP_ID`, `WORLD_RP_ID` | from the World Developer Portal |
| `WORLD_RP_SIGNING_KEY` | the RP signing key; without it the Door is unavailable by design |
| `GRAPH_API_KEY` | Subgraph Studio; without it the brief is `unavailable` and no interview is blocked |
| `WORLD_CHAIN_RPC_URL` | optional; the default public World Chain RPC is used when unset |
| `PUBLIC_API_URL` | `https://hanami-backend-ugak.onrender.com` (already in `render.yaml`) |

Then confirm the new build is actually live before going further:

```bash
curl -s https://hanami-backend-ugak.onrender.com/api/campaigns | grep -q contract_version && echo "new build"
curl -s -o /dev/null -w "%{http_code}\n" https://hanami-backend-ugak.onrender.com/api/campaigns/sakura-society-v2/door/context   # 200, or 503 if the signing key is unset
```

The first curl is the real test: the old build does not return `contract_version` at all. Allow ~30 s
for the free tier to wake.

**2. Frontend — Vercel.** `NEXT_PUBLIC_WORLD_APP_ID` must be set, then push `main`.

**3. Create the V2 demo campaigns.** Reuse a bouncer the deployer wallet owns and is authorized on
(`#22` Slow Collectors Circle, `#21`, `#18`, `#17`); `#20` Kenji belongs to another wallet and cannot
be used without its owner signing. Two campaigns: one closing in about an hour so the expired ticket
state is demonstrable, one across the demo window.

```bash
cd contracts && set -a && . ../backend/.env && set +a
cast send 0xdb03669FD2EDA044e65333D860952A9d77094b28 \
  "createCampaign(uint256,uint256,uint64,uint64)" 22 50 $(( $(date +%s) + 3600 )) 0 \
  --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$OG_RPC_URL"
```

`ticketExpiry_ = 0` means the expiry follows the close, which is the same default the settings route
applies. Read the campaign address out of the `CampaignCreatedV2` event, then index it through the
normal create flow (a campaign still needs a passing Bouncer Safety Report for its slug — the
certification gate is not bypassed for demo campaigns).

**4. TicketGate.** With a V2 campaign address in hand:

```bash
cd contracts && set -a && . ../backend/.env && set +a
DEMO_CAMPAIGN_V2=<campaign address> forge script script/DeployV2.s.sol --rpc-url zerog --broadcast
```

Record all three addresses in the README table — `./verify.sh live` parses them out of it.

**5. Chainscan verification** needs `CHAINSCAN_API_KEY` and `CHAINSCAN_API_URL` in the environment;
`--verify` was left off the first deploy because neither was set.

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
