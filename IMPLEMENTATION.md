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
