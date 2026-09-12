# ETHOnline 2026 — live evidence

Everything here is on 0G mainnet (chain 16661) and checkable without asking us to be trusted.
`./verify.sh live` reads the two marked lines below and checks them against the deployed backend.

Evidence campaign: slow-collectors-v2
Evidence wallet: 0x0000000000000000000000000000000000000000

(The evidence wallet is filled in after the first live decision — it is the applicant whose receipt
the check reads. A zero address means no live decision has been recorded yet.)

## Deployed contracts

| Contract | Address | Transaction |
|---|---|---|
| CampaignFactoryV2 | `0xdb03669FD2EDA044e65333D860952A9d77094b28` | [`0x7cbabefb…5774a`](https://chainscan.0g.ai/tx/0x7cbabefbff259e400e21e776c3e6250ff33d951e99da8500ae7bbbbcfaf5774a) |
| Ticket | `0x51Bf4E0376cb62Fc2875f6b200631D1C38F7463B` | deployed by the factory's constructor |
| TicketGate | `0x50E627F096853F5bA97Ed58685CeD9927b029F3a` | gates the demo campaign below |
| CampaignV2 (demo) | `0xe80b1263ebc884a0b79b18c1c8c79d9f4012a138` | [`0xe8cd80e8…ce529`](https://chainscan.0g.ai/tx/0xe8cd80e898a22912080d71499aa9410bd5cb8c8dc12578a0e7abd313656ce529) |

Confirmed by reading the chain rather than the deploy log:

- `factory.ticket()` → the Ticket address, and `ticket.factory()` → the factory. Minting authority is
  structural: `Ticket.factory` is immutable and only campaigns this factory created become minters.
- `ticket.isMinter(0xe80b1263…a138)` → `true`, set by the factory when it created the campaign.
- `factory.registry()` → `0x764883319e51e46F683aB54D93F26bcBb74A7030`, the V1 registry, untouched.
- `gate.campaign()` → `0xE80b1263Ebc884A0b79b18c1C8C79D9f4012a138`, the demo campaign.
- `campaign.closeAt()` and `campaign.ticketExpiry()` are equal, because the campaign was created with
  `ticketExpiry_ = 0` — the same default the settings route applies when an owner leaves it blank.

## The demo campaign

Bouncer #22 (Slow Collectors Circle), owned by `0x34b0Ba20669f3ec4F1056853780c381e5e35F724`, which
also authorized the backend on the iNFT. It runs a **second, V2** campaign while its original V1
campaign keeps running untouched — which is the coexistence the additive design is for.

Its intelligence is the same text the V1 campaign uses, read back from 0G Storage and re-certified
under the new slug: Bouncer Safety Report `6e9fc59d-09a4-4b6f-b475-cca21df69115`, **passed**, report
root `0xe990f5067b33c0dc5d…`.

## The Door, on the deployed backend

```
GET  /api/campaigns/slow-collectors-v2/door/context   → 200   (RP-signed request context)
GET  /api/campaigns/slow-collectors-v2/door/status    → {"state":"none","requiredCredential":"orb"}
POST /api/campaigns/slow-collectors-v2/begin          → 403   "door required"
```

The 403 is the point: no proof of humanity, no interview, on the real deployment.

## The ledger brief, against the live Graph gateway

Measured through `backend/src/ledger/graph-client.ts` with a Subgraph Studio key:

| Wallet | Result |
|---|---|
| `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` | `ready` in 912 ms — 150 swaps, 6 Seaport trades, 5 of 7 sources answering |
| `0x34b0Ba20669f3ec4F1056853780c381e5e35F724` | `empty` in 1,441 ms — no trading history on the sources read |

`opensea-v1` and `opensea-v2` answer `subgraph not found: no allocations` — nobody indexes them on
the decentralized network. The brief reports them as unavailable rather than hiding them, and the
five that do answer satisfy FR-010's two marketplaces plus one exchange.

## Still to record

- A live decision receipt with its nullifier, ticket id and attestation path. Needs one applicant to
  pass the Door with World ID on a phone, which is the manual release check.
- `TicketGate` accepting a live ticket holder and refusing a revoked one.
- The enclave-signed path, which needs ~3 OG in the Compute ledger.
