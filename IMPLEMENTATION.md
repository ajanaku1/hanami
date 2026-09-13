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

## 2026-09-12 — CampaignFactoryV2 and Ticket are live on 0G mainnet (T068)

Deployed with `contracts/script/DeployV2.s.sol` after a clean dry run, on the user's explicit
instruction (the script and `CLAUDE.md` both make broadcasting an operator action).

| Contract | Address |
|---|---|
| CampaignFactoryV2 | `0xdb03669FD2EDA044e65333D860952A9d77094b28` |
| Ticket | `0x51Bf4E0376cb62Fc2875f6b200631D1C38F7463B` |

Tx `0x7cbabefbff259e400e21e776c3e6250ff33d951e99da8500ae7bbbbcfaf5774a`, block 44174303, sender
`0x34b0Ba20669f3ec4F1056853780c381e5e35F724`, ~0.0119 OG. Confirmed on chain after the fact:
`factory.ticket()` and `ticket.factory()` point at each other, and `factory.registry()` is the V1
registry, untouched.

**Not verified on Chainscan yet**: `foundry.toml` wants `CHAINSCAN_API_KEY` and `CHAINSCAN_API_URL`
and neither is in the operator environment, so `--verify` was left off rather than failing the
broadcast. Verification is a separate `forge verify-contract` once those exist.

**TicketGate is not deployed**: it takes a campaign address in its constructor, and no V2 campaign
exists yet. The same script deploys it on a second run once `DEMO_CAMPAIGN_V2` is set (T069), which
is why the first `live` check stays red.

**One README wording change was load-bearing**: the `live` check parses the address table with
`[^0-9x]*` between the contract name and the address, so the word "expiring" ended the match at its
own `x` and the Ticket address could not be read. The row now says "time-limited". The predicate is
unchanged — it was the prose that had to be parseable.

## 2026-09-12 — the agent Door was written and tested but never mounted (T060)

**Found** while preparing the deploy: `server.ts` imported `createAgentDoor` and never called it.
An earlier edit inserted the import but its second half — the `app.use` lines — silently failed to
match its anchor, and nothing caught it. `tsc` passes on an unused import, and the route tests mount
the middleware themselves in a test app, so the whole suite stayed green with the feature inert in
production. Every other module from this feature was checked and is wired.

**Fixed**: the agent Door is mounted on `/begin` and `/turns` ahead of the browser guard.
`./verify.sh agent` now asserts the mount itself, not just that the module exists — a test that
builds its own app can never tell you the real one is missing a line.

## 2026-09-12 — nothing new is deployed yet, and that gates the rest of `live`

The deployed backend still answers without `contract_version`, so it predates this feature entirely.
Two things follow. Every live campaign is V1, so no ticket has ever been minted. And a frontend
deploy must not go out ahead of the backend: the new campaign page asks for `/door/context`, which
the old backend does not serve, so the Door would report itself unavailable and no one could apply.

`render.yaml` has `autoDeploy: false` (a redeploy wipes the ephemeral disk), so the backend is a
manual deploy from the Render dashboard — an operator action. The file now declares every key the
new code reads, with real values for the two V2 addresses and `sync: false` for everything secret.

## 2026-09-12 — the demo campaign uses a bouncer we can sign for, not Kenji (T069)

**Plan**: "Create one V2 demo campaign for Kenji on mainnet."

**Found**: Kenji is bouncer `#20`, owned on chain by `0x96Cb8EB2E349e64bA47b1015890A2fe7584c369B`.
`CampaignFactoryV2.createCampaign` reverts with `NotBouncerOwner` unless the caller owns the token,
so only that wallet can create a Kenji campaign. The operator wallet
`0x34b0Ba20669f3ec4F1056853780c381e5e35F724` owns `#17`, `#18`, `#21` and `#22` and is authorized on
them.

**Decision**, with the user on 2026-09-12: use a bouncer the operator owns — `#22` Slow Collectors
Circle is live and certified — and keep Mei-chan/V1 campaigns untouched, which is what the task
actually needs to prove (V1 and V2 coexisting). The demo path in `design.md` does not depend on
which persona runs the V2 campaign.

The ordered deploy is written up in `quickstart.md`, including why the backend must go out before
the frontend.

## 2026-09-12 — the exchanges do not agree on the field naming the wallet (T038, T044)

**Plan** (research decision 3): one `Swap` template, `swaps(where: {from}, first: 500)`, against both
exchanges.

**Found**, with a live gateway key: only Sushiswap publishes `from`. Uniswap v3's `Swap` has no such
field — its wallet is `account` — and the gateway rejects the query outright rather than returning
nothing. Introspection confirms it: `uniswap-v3.Swap` is `id, hash, nonce, logIndex, …, account,
pool, …`. The subgraph at that id is Uniswap's own schema, not the Messari standardized one the
research assumed. The old query also *selected* `from`, which would fail on Uniswap even with the
right filter.

**Changed**: `LedgerSource` carries a `walletField`, and the template substitutes it — still one
template, now with one substitution. Only `timestamp` is selected, since the wallet is already the
filter and the field naming it is not present on every schema. The unit test was rewritten to assert
each exchange is asked by the field it declares, rather than asserting the literal `from:` it had
encoded from the research.

**Measured against the live gateway**, wallet `0xd8dA6BF2…6045`:

| | before | after |
|---|---|---|
| whole read | 12,005 ms (the entire budget) | 912 ms |
| swaps counted | 0 | 150 |
| sources answering | 3 of 7 | 5 of 7 |

A fresh wallet (`0x34b0Ba20…F724`) reads `empty` in 1,441 ms, which is SC-005's other half.

## 2026-09-12 — two of the seven subgraphs have no indexer allocations

`opensea-v1` and `opensea-v2` answer `subgraph not found: no allocations` — nobody is serving them on
the decentralized network, so they cannot be queried at any price. The five that work are `seaport`,
`x2y2`, `looksrare` (marketplaces) and `uniswap-v3`, `sushiswap` (exchanges), which still satisfies
FR-010's "at least two NFT marketplaces and at least one exchange".

They are left in the source list rather than deleted: they are real published ids, the brief already
reports each source's outcome honestly, and Seaport is the settlement layer most OpenSea volume flows
through anyway. The README no longer claims seven readable sources — it says seven, five of which
currently carry allocations.

## 2026-09-12 — the V2 demo campaign is live, and one deploy was wasted getting there (T069)

**Built**: `slow-collectors-v2`, campaign `0xe80b1263Ebc884A0b79b18c1C8C79D9f4012a138`, created by
bouncer #22 on the V2 factory while that bouncer's original V1 campaign keeps running untouched.
Certified under its own Bouncer Safety Report (`6e9fc59d…`, passed) reusing the V1 campaign's exact
persona and lorebook, read back from 0G Storage — new text could have failed the gate and wasted the
run. Indexed with `contract_version = 2`, `required_credential = orb`, and `ticket_expiry` equal to
`close_at` because it was created with `ticketExpiry_ = 0`, which is the same default the settings
route applies. `TicketGate` `0x50E627F096853F5bA97Ed58685CeD9927b029F3a` gates it.

**Mistake, recorded because the chain records it anyway**: the second run of `DeployV2.s.sol`,
intended only to add the gate, deployed a *second* `CampaignFactoryV2`
(`0xCCE9bD09e73999AF1B01640141B47DB6BeeE8f31`) and a second `Ticket`
(`0x8f920e3FCBF20d94Cc7240339672E9Eb1637D5d6`). The script deployed the factory unconditionally and
that was not noticed before broadcasting. Both are orphans — no campaign was ever created against
them, `isMinter` is false for the demo campaign on the orphan Ticket, and the canonical pair in the
README is untouched. Cost was about 0.012 OG.

**Fixed so it cannot repeat**: the script now adopts an address in `CAMPAIGN_FACTORY_V2` as-is and
only deploys a factory when that is unset. Redeploying it on a later run would orphan every campaign
the first factory created, since a campaign can only mint on the Ticket its own factory owns.
Confirmed by dry run: with the env set, the factory and ticket resolve to the deployed pair and only
the gate is new.

## 2026-09-13 — the demo video, and the two rules it changed (T072)

**Built**: `video/`, a Remotion project rendering `out/demo.mp4` (1920×1080, 2:02) and
`out/social.mp4` (1080×1920, 11s), narrated with Microsoft Edge TTS.

**Two deliberate departures, both recorded rather than quietly taken.**

*Narration is synthesised.* `prompt.md` and the release checklist said "human voiceover; no TTS".
The user overrode that on 2026-09-13 under deadline. `docs/ai-usage.md`, `verify.sh` and
`prompt.md` were all updated to say so, because `docs/ai-usage.md` had asserted the opposite and a
submitted document must not contradict the artifact it describes. The script is written by hand and
passed through the `humanizer` skill; only the voice is machine-made.

*The Door is not staged.* The video does not show an applicant passing the Door, because passing it
needs a real World proof from a phone and nobody was available to give one. Faking it was refused:
the World prize case rests on the Door being load-bearing, and a video showing an applicant walking
through a disabled Door is fabricated evidence handed to judges. The Door beat instead shows the
deployed backend answering `403 door required` to an unverified wallet — a stronger claim, and true.

**Every value on screen is a captured artifact**, stored in `video/public/assets/`: the live 403,
the `cast call` reads showing `factory.ticket()` and `ticket.factory()` pointing at each other with
`isMinter` true for the demo campaign, and a ledger read returning 150 swaps across five answering
sources. The interview beat is drawn as an explanation of the enclave boundary and never dressed as
a product screenshot, per the skill's evidence-safety rule.

**Three defects were found by looking at rendered frames rather than trusting the code**: the brief
promised a holding figure the narration mentions but did not display it (the live value was null, so
it now renders as an em dash labelled "no matched buy→sell pairs"); the Receipt scene sat half empty
for three seconds waiting for its terminal; and both the Brief grid and the Evidence list reflowed
as staggered children entered, drifting the headings upward.
