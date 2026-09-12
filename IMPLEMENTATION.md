# Implementation log — feature 002 (Human Door, Ledger Brief, Soulbound Tickets)

Deviations from the approved plan, each taken as the conservative option and recorded here rather
than escalated. The spec, plan, and task list in `specs/002-human-door-tickets/` remain the
contract; nothing below changes a requirement or a success criterion.

## 2026-09-10 — CampaignFactoryV2 deploys its own Ticket (T009, T010, T012)

**Plan**: `contracts/script/DeployV2.s.sol` deploys `Ticket`, `CampaignFactoryV2`, and `TicketGate`.

**Built**: the factory deploys `Ticket` in its own constructor, and `DeployV2.s.sol` reads the
address back with `factory.ticket()`.

**Why**: `Ticket` must know its factory (only the factory may register a campaign as a minter) and
the factory must know its ticket (`ICampaignFactoryV2.ticket()`). Deploying them independently
makes that circular, and the two ways out are both worse than this: a one-time `setFactory` setter
leaves a window in which minting authority can be claimed by whoever calls first, and precomputing
the factory address with `vm.computeCreateAddress` makes a mainnet deployment depend on the
deployer's nonce being exactly what the script assumed. Constructing the Ticket inside the factory
makes minting authority structural — `Ticket.factory` is immutable, and the only addresses ever
registered as minters are campaigns that factory created. No interface in
`contracts/CampaignV2.interface.sol` changes.

**Effect on the deploy**: `TICKET_ADDRESS` in the environment is read from the deploy output rather
than chosen by the deployer. `TicketGate` still deploys from the script, but only when
`DEMO_CAMPAIGN_V2` is set, since a gate needs a campaign that does not exist on the first run.

## 2026-09-10 — the Door needs an RP signing key the spec did not list (T018, T020, T022)

**Plan**: the Door's environment is `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_ACTION`, and
`NEXT_PUBLIC_WORLD_APP_ID`.

**Found**: IDKit 4.x will not open a request without an `rp_context` — a fresh nonce, a validity
window, and the RP's ECDSA signature over both. The signature has to be produced server-side from
an RP signing key issued by the World Developer Portal, which no environment key in the plan
covers.

**Built**, with the user's approval on 2026-09-10: `@worldcoin/idkit-server` on the backend and
`GET /api/campaigns/:slug/door/context`, which mints one signed context per request (the nonce is
single-use). `WORLD_RP_SIGNING_KEY` is documented in `backend/.env.example`; the operator sets the
value, and no agent reads or writes `.env`. Without the key the endpoint answers 503 and the panel
says the Door is unavailable, rather than handing the browser a context World would refuse.

**Still open**: until the key is set, no live proof can be issued, so `./verify.sh live` cannot
pass and the World sandbox QR check in the manual release list cannot be done.

## 2026-09-12 — two `brief` predicates did not match a working implementation (T038, T045)

**Plan**: `./verify.sh brief` asserts the graph client names seven subgraph ids
(`[1-9A-HJ-NP-Za-km-z]{46}`) and asks for `first: 500`.

**Found**: neither clause could pass a correct implementation. The Graph's subgraph ids are 44
base58 characters, not 46 — 46 is the length of an IPFS deployment hash (`Qm…`), and all seven ids
settled in `research.md` are 44. Separately, widening the pattern to `{43,46}` made the check fail
a second way: `checksh` hands its command to `sh -c`, the inner double quotes end the outer quoted
string, and the shell brace-expands `{43,46}` into two words, so `test` sees too many arguments.

**Changed**: the id clause now counts distinct `subgraphId:` values, which needs no nested quotes
and no braced range, and still requires seven of them. The cap clause was left alone and the
implementation was written to satisfy it: both query templates write `first: 500` literally rather
than passing a `$first` variable, and a unit test holds that literal equal to `PAGE_CAP`, so the
number the gateway is asked for and the number the brief reports truncation against cannot drift.

Neither predicate was weakened: seven distinct real subgraph ids and a literal page cap are still
required, and `npm test` still gates the phase.

## 2026-09-12 — two all-zero bytes32 literals read as secrets to the release check

**Plan**: `./verify.sh release` refuses any 64-hex literal in `backend/src`, `agent/src`, or
`frontend/src`, on the grounds that a private key should never appear in source.

**Found**: two pre-existing literals matched and neither is a secret — the all-zero bytes32 passed
as an empty content hash to `mintBouncer`, and `ZERO_BYTES32` in the frontend contract helpers.

**Changed**: both now use viem's `zeroHash`. The predicate is untouched and still refuses every
64-hex literal; the code says what it means, and no behaviour changes.

## 2026-09-12 — the roster's signature never matched the one Admin asks for (T054)

**Found**: `useRoster` sent the signature the owner produced to unlock Admin (`Hanami: view <slug>
admin at <nonce>`) to the roster route, which verified `roster <slug>`, and to revoke, which
verified `revoke <id> on <slug>`. Both would have answered 401 against the deployed backend; the
module tests passed because each side signed its own string.

**Changed**: the roster read now authorizes with the message the existing admin route uses, which
is what `door-tickets-api.openapi.yaml` asks for ("signed message auth as existing admin routes"),
so one unlock signature covers reading the owner's screens. Revoke and the new settings save are
writes that name what they change, so each signs its own action at the moment of the action.

## 2026-09-12 — the gallery's live ticket count is an upper bound (T055)

A revocation is the owner's own transaction; the backend prepares it and never learns whether it
landed. So `live_ticket_count` on the campaign list counts tickets issued by a V2 campaign that
have not reached its expiry, and a ticket revoked on chain is still counted there. The Roster reads
every ticket from the chain and is the authority on any single one. Making the gallery authoritative
would mean a chain read per campaign on a public, uncached page.

## 2026-09-12 — the V2 address table is in the README before the addresses exist (T071, T068)

The `release` predicate asks that the V2 contracts be named in the README and their keys in the env
example; the `live` predicate reads the addresses back out of that same table and checks each one
contains code on 0G mainnet. The table is therefore written now, with each address marked *pending
deploy* rather than filled with a placeholder that would read as real. `release` passes because the
contracts and their env keys are recorded; `live` stays red, correctly, until the operator runs
`contracts/script/DeployV2.s.sol` and pastes the three addresses in (T068).
