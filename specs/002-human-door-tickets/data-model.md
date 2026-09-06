# Data Model: Human Door, Ledger Brief, and Soulbound Tickets

## On-chain (0G mainnet, chain 16661)

### CampaignV2 (one per whitelist round, created by CampaignFactoryV2)
| Field | Type | Notes |
|---|---|---|
| registry | address (immutable) | existing BouncerRegistry |
| ticket | address (immutable) | the factory's Ticket contract |
| bouncerTokenId | uint256 (immutable) | iNFT id |
| owner | address (immutable) | bouncer owner at creation |
| wlSizeCap | uint256 (immutable) | unchanged semantics |
| closeAt | uint64 | campaign close; `recordDecision` reverts after it (`CampaignClosed`) |
| ticketExpiry | uint64 | expiry stamped on minted tickets; defaults to closeAt at creation |
| decisions[applicant] | DecisionRecordV2 | status, reasoningHash, attestationHash, nullifierHash, ticketId, timestamp |
| approved[], rejected[] | address[] | unchanged |
| merkleRoot, finalized | bytes32, bool | unchanged (Merkle export retained) |

Validation: `nullifierHash != 0` on every decision; `approve` requires `approved.length < wlSizeCap`; one decision per applicant (`AlreadyDecided`); caller must be authorized on the iNFT (`CallerNotBouncerOperator`).

Events: `DecisionRecordedV2(address indexed applicant, bool approved, bytes32 reasoningHash, bytes32 attestationHash, bytes32 nullifierHash, uint256 ticketId)`; `TicketRevoked(uint256 indexed ticketId, address indexed applicant)`; `CampaignCreatedV2(address indexed campaign, address indexed owner, uint256 indexed bouncerTokenId, uint256 wlSizeCap, uint64 closeAt, uint64 ticketExpiry)`.

### Ticket (one ERC-721 per factory; soulbound)
| Field | Type | Notes |
|---|---|---|
| tokenId | uint256 | sequential |
| ownerOf | address | applicant wallet; transfers revert (`Soulbound`) |
| campaign | address | minting CampaignV2 |
| expiresAt | uint64 | copied from campaign at mint |
| revoked | bool | set by `revoke`, callable only by the minting campaign |

Views: `isLive(tokenId)` = exists && !revoked && block.timestamp < expiresAt; `liveTicketOf(campaign, wallet)` → tokenId or 0. `CampaignV2.hasLiveTicket(wallet)` delegates to Ticket.

State machine: `none → live → (expired | revoked)`; `expired` is derived from time, `revoked` is terminal.

### TicketGate (demo consumer)
`mint()` requires `campaign.hasLiveTicket(msg.sender)` and one mint per wallet; emits `Minted(wallet, ticketId)`.

## Off-chain (libSQL, additive)

### campaigns (new columns)
| Column | Type | Default | Notes |
|---|---|---|---|
| required_credential | TEXT | 'orb' | 'selfie' \| 'orb' \| 'device' |
| close_at | INTEGER | NULL | unix seconds; required for V2 campaigns |
| ticket_expiry | INTEGER | NULL | unix seconds; defaults to close_at |
| contract_version | INTEGER | 1 | 1 = Campaign, 2 = CampaignV2 |

### proofs (new table)
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| campaign_slug | TEXT FK | |
| wallet_address | TEXT | lowercase |
| nullifier | TEXT | World nullifier (hex) or AgentBook human id |
| method | TEXT | 'selfie' \| 'orb' \| 'device' \| 'agentkit' |
| agent_id | TEXT | AgentBook agent address when method = 'agentkit' |
| verified_at | INTEGER | unix seconds |

Constraints: `UNIQUE(campaign_slug, nullifier)` (one human, one attempt); `UNIQUE(campaign_slug, wallet_address)` (one proof per wallet). Insert with `ON CONFLICT DO NOTHING`, then read back; a conflict on nullifier with a different wallet → "this person has already applied".

### applicants (new columns)
| Column | Type | Notes |
|---|---|---|
| nullifier | TEXT | copied from proofs at begin |
| proof_method | TEXT | as above |
| agent_id | TEXT | nullable |
| brief_json | TEXT | serialized LedgerBrief |
| brief_status | TEXT | 'ready' \| 'empty' \| 'unavailable' |
| ticket_id | INTEGER | nullable; from DecisionRecordedV2 |
| attestation_path | TEXT | 'direct' \| 'router' |

## Domain objects (TypeScript)

### LedgerBrief
```
{ wallet, status: 'ready'|'empty'|'unavailable',
  flipsWithin7d: number, sameCounterpartySales: number,
  medianHoldingDays: number|null, swapCount: number,
  sourcesRead: [{ name, subgraphId, ok: boolean, count: number }],
  truncated: boolean, readAt: unix }
```
Derived from `Trade[]` (buyer/seller/collection/tokenId/timestamp) and `Swap[]` (from/timestamp). Pure function; no network.

### Receipt
```
{ decision, attestationHash, attestationPath, nullifier, ticket: { id, expiresAt, status } | null,
  brief: { status, summary, sourcesRead }, txHash }
```

### RosterRow
```
{ wallet, ticketId, issuedAt, expiresAt, status: 'live'|'expired'|'revoked', briefSummary, viaAgent: agent_id|null }
```
Status is read from chain (`isLive`, `revoked`, `expiresAt`), not from the database.

## State transitions (applicant)
`connected → door:pending → door:verified → brief:reading → brief:{ready|empty|unavailable} → interviewing → decided:{approved+ticket|rejected} `
Refusals: `door:rejected` (retry), `door:used` (terminal for this person), `campaign:closed`, `campaign:full`.
