# Phase 0 Research: Human Door, Ledger Brief, and Soulbound Tickets

All decisions below resolve the Technical Context unknowns in `plan.md`. Competition evidence is
inherited from `loop/memory/ethonline-2026-ideation-v2-report.md` and the approved `design.md`; it
is carried, not re-derived.

## Decision 1: World proof verified server-side through the v4 verify endpoint, credential chosen per campaign

**Decision**: Use `@worldcoin/idkit` (4.x) `IDKitRequestWidget` on the campaign page with one of
three presets selected from the campaign's `required_credential` column: `selfieCheckLegacy()`,
`orbLegacy()`, or `deviceLegacy()`. The backend forwards the unchanged IDKit result to
`POST https://developer.world.org/api/v4/verify/{rp_id}` and, on success, stores the nullifier
keyed by campaign in a new `proofs` table with `UNIQUE(campaign_slug, nullifier)` and
`UNIQUE(campaign_slug, wallet_address)`. Signal = the lowercase wallet address so a proof is bound
to one wallet.

**Rationale**: The docs state legacy 3.0 proofs (which Selfie Check uses today) verify through the
same v4 endpoint with no field remapping, so one verify path serves all three credentials. The
nullifier uniqueness rule is the one-human-one-attempt mechanic (FR-002) and is enforced by the
database, not the application, so races resolve to exactly one winner (edge case in spec).

**Alternatives considered**: On-chain proof verification was rejected: it needs a World ID router
on 0G that does not exist and would put personal proof material on chain. Client-only verification
was rejected because it is trivially bypassed at the API.

**Open dependency**: Selfie Check requires an access request (feature flag) from World. The
campaign default credential is `orb` until the flag is granted; switching a campaign to
`selfie` is a settings change (FR-004).

## Decision 2: AgentKit hooks on the same `/begin` and `/turns` routes, `free` mode, nullifier = AgentBook human id

**Decision**: Mount `@worldcoin/agentkit` server hooks (`createAgentkitHooks` with
`createAgentBookVerifier()` against World Chain `eip155:480` and `InMemoryAgentKitStorage`) on the
applicant routes through `@x402/hono` in `{ type: 'free' }` mode: a valid `agentkit` header resolves
the registering human's anonymous identifier, which is stored in `proofs` as the nullifier with
`method = 'agentkit'`. No payment is ever charged; the 402 challenge exists only to carry the
AgentKit extension.

**Rationale**: The Door is one abstraction (a proof bound to wallet + campaign); AgentKit is a second
issuer of that proof. Reusing the routes keeps the agent CLI honest: it talks to the exact API the
browser talks to. The human identifier from AgentBook is unique per human, so the one-attempt rule
holds across browser and agent paths.

**Alternatives considered**: A separate `/agent/*` route family was rejected as duplicated logic
and a weaker story. Charging x402 for agent applications was rejected: payments are out of scope
and would need a facilitator.

## Decision 3: Ledger brief from five Messari NFT-marketplace subgraphs and two DEX subgraphs, one query template each

**Decision**: Query the decentralized gateway with a Subgraph Studio API key (env
`GRAPH_API_KEY`) for the connected wallet across OpenSea v1
(`GSjXo5Vd1EPaMGRJBYe6HoBKv7WSq3miCrRRZJbTCHkT`), OpenSea v2
(`ECtdoov16DUmk5qbhFx4PVVN7vidiNDwzFNsui6FoHEo`), Seaport
(`2GmLsgYGWoFoouZzKjp8biYDkfmeLTkEY3VDQyZqSJHA`), X2Y2
(`3cMswgcjkpLmuF99ViQRZfCPRyCsnimqQsR9z6mY5e2i`), LooksRare
(`FsT2DES8UdhfDkXCtE56h5WCDrrSXrtJiSMgNWvSdyYL`), Uniswap v3
(`4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6`), and Sushiswap
(`77jZ9KWeyi3CJ96zkkj5s1CojKPHt6XJKjLFzsDCd8Fd`). One `Trade` query template
(`trades(where:{buyer|seller}, orderBy: timestamp, orderDirection: desc, first: 500)`) runs against
all five marketplaces; one `Swap` template (`swaps(where:{from}, first: 500)`) runs against both
DEXes. Requests run in parallel with a 12 s overall budget; per-source failures are recorded as
"unavailable" for that source, and the brief is `unavailable` only when every source fails.

**Rationale**: The shared schema is exactly what The Graph's brief rewards ("one query pattern
spanning many protocols"), and it keeps the code to two templates. The 500 cap per source follows
clarification Q2 and bounds latency under the 30 s budget (SC-006).

**Alternatives considered**: The Subgraph MCP was rejected for the runtime path (it is a
developer tool, not a server dependency); the x402 gateway was rejected because it adds a Base
wallet and USDC funding to a backend that already holds one hot key. Either can be mentioned in
the README as alternative access.

## Decision 4: Brief metrics computed deterministically, injected as a fenced "ledger evidence" block

**Decision**: Compute in a pure module `backend/src/ledger/brief.ts`: `flipsWithin7d` (a sale by
the wallet whose (collection, tokenId) it bought or minted within 7 days earlier; mint detection
uses the earliest observed buy), `sameCounterpartySales` (seller == wallet and buyer previously sold
that (collection, tokenId) to the wallet), `medianHoldingDays` over matched buy→sell pairs,
`swapCount`, `sourcesRead`, `truncated`. The brief is rendered into the system prompt as a fenced
block with an instruction that it is evidence, not a verdict (FR-011), and stored as JSON in
`applicants.brief_json` and inside the transcript uploaded to 0G Storage.

**Rationale**: Pure functions are unit-testable without network; the four figures in the spec map
one-to-one to fields. Prompt injection keeps `bouncerTurn()` unchanged apart from an optional
`evidence` argument.

**Alternatives considered**: Letting the model query The Graph itself (tool use) was rejected: the
0G Router path has no tool calling and it would make the brief non-deterministic.

## Decision 5: `CampaignV2` beside `Campaign`, `Ticket` as a soulbound ERC-721 owned by the campaign

**Decision**: Add `contracts/src/CampaignV2.sol` (`CampaignV2` + `CampaignFactoryV2`) and
`contracts/src/Ticket.sol`. `CampaignV2` keeps the V1 surface (`recordDecision` signature extended,
`finalizeMerkleRoot`, counters) and adds `closeAt`, `ticketExpiry`, `recordDecision(applicant,
approve, reasoningHash, attestationHash, nullifierHash)` which mints a Ticket on approval and emits
`DecisionRecordedV2(applicant, approved, reasoningHash, attestationHash, nullifierHash, ticketId)`,
plus `revokeTicket(tokenId)` (owner only) and `hasLiveTicket(address) view`. `Ticket` is one ERC-721
per factory, minter = campaigns created by that factory, `_update` reverts on transfer
(soulbound), stores `expiresAt` and `revoked`. `TicketGate.sol` is a demo mint that requires
`campaign.hasLiveTicket(msg.sender)`. Deploy with a new `DeployV2.s.sol` against the existing
`BouncerRegistry`; V1 factory and campaigns stay untouched (constitution IV).

**Rationale**: Additive deployment satisfies the amended constitution; one Ticket contract per
factory keeps `hasLiveTicket` a single call for external mints. Putting the nullifier hash on chain
gives 0G judges a visible new record without personal data (a nullifier is unlinkable).

**Alternatives considered**: Upgradeable proxies were rejected (no proxy today, adds risk in a
week). Per-campaign Ticket contracts were rejected (gas and address sprawl).

## Decision 6: Direct broker enabled by configuration; attestation path recorded per decision

**Decision**: Set `OG_DIRECT_ENABLED=true` and `OG_DIRECT_PROVIDER` after funding the Compute
ledger with 3 OG from the deployer wallet (an operator step, documented in quickstart). Persist
`attestation_path` (`direct` | `router`) on the applicant row and return it in the receipt and
Verify payload (FR-014, FR-015). No code change to `og-compute-direct.ts` beyond surfacing the path.

**Rationale**: The path is already wired and mainnet-verified; the feature work is to make which
path ran visible and testable.

**Alternatives considered**: Forcing direct-only was rejected: fallback to the Router is the
documented safety net and keeps demos alive if a provider is unreachable.

## Decision 7: Agent CLI as a separate workspace `agent/` using the OpenAI-compatible 0G Router for its own turns

**Decision**: `agent/` is a small TypeScript CLI (`tsx`), commands `register` (wraps
`npx @worldcoin/agentkit-cli register`), `status`, and `apply <campaign-url> --wallet <addr>`. It
uses `createAgentkitClient` with a local agent key (env `AGENT_PRIVATE_KEY`, never committed), calls
`/begin` then loops `/turns` until a decision, generating applicant replies with an
OpenAI-compatible client pointed at the 0G Router (same credential the backend uses) and a fixed
"sincere applicant" persona, prints the receipt JSON, and exits non-zero on a Door refusal.

**Rationale**: A separate workspace keeps backend deps clean and lets a judge run it with two
commands. Reusing the Router avoids a new model provider.

**Alternatives considered**: Embedding the CLI in `backend/scripts` was rejected: it would need
backend env and blur the "external applicant" story.

## Decision 8: Testing strategy

**Decision**: Backend: Node test runner (`tsx --test`) with injected fetchers for World verify,
AgentBook, and Graph; pure-function tests for the brief; route tests for Door refusal, duplicate
nullifier, closed campaign, brief unavailable. Contracts: Foundry tests for CampaignV2/Ticket/
TicketGate (mint, no-mint on reject, soulbound revert, expiry, revoke, gate accept/reject, event
fields) plus the existing suites. Frontend: Vitest + RTL for Door states, Brief panel states,
receipt fields, Roster rows and Revoke states, Verify three-hash panel. Live: `verify.sh live`
checks a mainnet decision event carries a ticket id and a Graph query returns from ≥2 sources.

**Rationale**: Mirrors the Wave 3 suite layout and the constitution's test-first rule.
