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
