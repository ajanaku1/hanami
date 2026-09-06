# Implementation Plan: Human Door, Ledger Brief, and Soulbound Tickets

**Branch**: `002-human-door-tickets` | **Date**: 2026-09-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-human-door-tickets/spec.md`; approved product design in `design.md`; competition evidence in `loop/memory/ethonline-2026-ideation-v2-report.md`.

## Summary

Put a verified World proof-of-human (Selfie Check, Orb, or Device; or an AgentKit human-backed-agent proof) in front of every bouncer interview, bound to one wallet per campaign; read the applicant's all-time marketplace and DEX history from seven Messari standardized subgraphs into a deterministic ledger brief the bouncer cites as evidence; record each decision on a new additive `CampaignV2` on 0G mainnet that mints a soulbound, expiring, owner-revocable `Ticket` and emits attestation, nullifier, and ticket id together; surface it all in a receipt, a Verify panel with three hashes and the attestation path, and an Admin Roster; ship a runnable agent CLI; switch on the enclave-signed decision path by configuration. Existing V1 campaigns stay readable and unchanged.

## Technical Context

**Language/Version**: TypeScript 5.6+ on Node.js 22 (backend, agent CLI); TypeScript 5 with React 19.2 and Next.js 16.2 (frontend); Solidity 0.8.24 with Foundry and OpenZeppelin v5 (contracts)

**Primary Dependencies**: Hono 4.6, `@hono/node-server`, libSQL client 0.17, viem 2.x, zod 3.23, ethers 6 (existing 0G SDK path), `@0gfoundation/0g-compute-ts-sdk` 0.8, `@0gfoundation/0g-storage-ts-sdk` 1.2.9; **new**: `@worldcoin/idkit` 4.x (frontend), `@worldcoin/agentkit` + `@x402/hono` + `@x402/core` (backend hooks), `@worldcoin/agentkit-cli` (agent, via npx); wagmi 3.6, TanStack Query 5, Tailwind 4 (existing). New dependencies are proposed in `loop/memory/STATE.md` per workspace law and installed only on approval.

**Storage**: Additive libSQL migrations: `campaigns` gains `required_credential`, `close_at`, `ticket_expiry`, `contract_version`; `applicants` gains `brief_json`, `brief_status`, `nullifier`, `proof_method`, `ticket_id`, `attestation_path`, `agent_id`; new table `proofs(campaign_slug, wallet_address, nullifier, method, verified_at)` with two UNIQUE constraints. Brief JSON also travels inside the transcript pinned to 0G Storage. On-chain: `CampaignV2` decision records and `Ticket` state on 0G mainnet.

**Testing**: Node built-in runner via `tsx --test` (backend, agent); Vitest + jsdom + RTL (frontend); Foundry (contracts, new `CampaignV2.t.sol`, `Ticket.t.sol`, `TicketGate.t.sol`, existing suites unchanged); `verify.sh` phases `spec|contracts|door|brief|tickets|agent|ui|release|live`; independent checker for completion.

**Target Platform**: Responsive browser app on Vercel; single Node backend on Render (512 MB); 0G mainnet (chain 16661) for contracts, Storage, Compute; World Developer Portal sandbox app; The Graph decentralized gateway (Ethereum mainnet data); World Chain AgentBook (read-only)

**Project Type**: Existing full-stack web application plus contract workspace plus a new CLI workspace `agent/`

**Performance Goals**: Door + brief + receipt add ≤30 s to the applicant journey when providers respond normally (SC-006); brief read budget 12 s overall, parallel per source; demo walkthrough < 3 min (SC-009)

**Constraints**: Seven-day window ending 2026-09-13 12:00 EDT with binding cut order (Direct broker → CLI to API-only → DEX half of brief); additive-only contracts and schema; no ENS; no private prompt, proof material, or another applicant's brief on public surfaces; one Router credential shared by chat, safety, brief-less agent turns; fail closed on TEE verification as today; daily commits with a continuity section in the README

**Scale/Scope**: Two new contracts + one demo consumer; three new backend modules (`door/`, `ledger/`, `tickets/`) and one route-group change; five frontend surfaces changed (campaign page, admin, create, gallery/mine cards, Verify panel); one new CLI workspace; ~70 tasks

## Constitution Check

*GATE: Passed before research and re-checked after Phase 1 design (constitution v2.0.0).*

- **I. Truthful, reproducible evidence**: Receipt, Verify panel, and README show real mainnet tx hashes, real Graph subgraph IDs read, and the attestation path actually used; continuity section lists commit ranges. PASS.
- **II. Privacy and attestation fail closed**: Proof payloads are verified server-side and only the nullifier is stored; briefs are per-applicant and never shown to others; TEE verification failure remains an interruption. PASS.
- **III. Test-first traceability**: FR/SC IDs retained; tasks will place failing tests before each behavior; `verify.sh` assertions map to SC IDs. PASS.
- **IV. Additive delivery**: `CampaignV2`/`CampaignFactoryV2`/`Ticket`/`TicketGate` deploy beside V1; V1 campaigns keep `contract_version = 1` and the existing code path; schema changes are `ALTER TABLE ADD COLUMN` with defaults plus one new table. PASS.
- **V. Accessible and recoverable experience**: Door, Brief, Roster, and Revoke reuse `AsyncNotice`, `StatusBadge`, `Button`, `Field` with active/success/failure/recovery states, keyboard focus, and non-color status text. PASS.
- **ETHOnline constraints**: Door before every interview; brief live and evidence-only; ENS out; new video, feedback doc, AI-usage doc in release tasks; cut order encoded in tasks. PASS.

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-human-door-tickets/
├── plan.md              # This file
├── research.md          # Phase 0 decisions 1–8
├── data-model.md        # Entities, columns, state machines
├── quickstart.md        # Runnable validation guide
├── contracts/
│   ├── door-tickets-api.openapi.yaml   # New/changed HTTP endpoints
│   ├── CampaignV2.interface.sol        # Solidity interface + events
│   └── agent-cli.md                    # CLI command contract
├── checklists/requirements.md
└── tasks.md             # /speckit.tasks output (not created here)
```

### Source Code (repository root)

```text
contracts/
├── src/
│   ├── BouncerRegistry.sol        # unchanged
│   ├── Campaign.sol               # V1, unchanged
│   ├── CampaignV2.sol             # NEW: CampaignV2 + CampaignFactoryV2
│   ├── Ticket.sol                 # NEW: soulbound expiring ERC-721
│   └── TicketGate.sol             # NEW: demo mint consumer
├── script/DeployV2.s.sol          # NEW: deploy Ticket + FactoryV2 against existing registry
└── test/{CampaignV2,Ticket,TicketGate}.t.sol   # NEW

backend/src/
├── db/schema.sql, db/index.ts     # additive migrations
├── door/
│   ├── world-verify.ts            # v4 verify client (injected fetch)
│   ├── agentkit.ts                # hooks + AgentBook verifier wiring
│   ├── proofs.ts                  # proofs repository (unique nullifier per campaign)
│   └── routes.ts                  # POST /door/verify, GET /door/status
├── ledger/
│   ├── graph-client.ts            # gateway queries, 7 sources, 12 s budget
│   ├── brief.ts                   # pure metric computation
│   └── prompt.ts                  # evidence block rendering
├── tickets/
│   ├── chain-v2.ts                # recordDecisionV2, revokeTicket, hasLiveTicket, event parsing
│   └── roster.ts                  # roster read model (chain + db)
├── bouncer.ts                     # optional `evidence` argument
├── og-chain.ts                    # contract_version routing
└── server.ts                      # Door guard on /begin and /turns; receipt payload; roster + revoke routes

backend/test/                      # door-*.test.ts, ledger-*.test.ts, tickets-*.test.ts, roster.test.ts

frontend/src/
├── app/c/[slug]/page.tsx          # Door → Brief → Interview → Receipt
├── app/c/[slug]/admin/page.tsx    # Roster tab, settings (credential, close, expiry)
├── app/create/page.tsx            # credential, close date-time, ticket expiry fields
├── components/door/{DoorPanel,BriefPanel,Receipt}.tsx
├── components/roster/{RosterTable,RevokeButton}.tsx
├── components/VerifyOn0G.tsx      # three hashes + attestation path
└── components/{MarketCard,BouncerCard}.tsx  # ticket count

frontend/test/                     # door-panel, brief-panel, receipt, roster, verify-three-hash tests

agent/
├── package.json, tsconfig.json
├── src/{cli,apply,register,applicant-model}.ts
├── test/apply.test.ts
└── README.md

docs/                              # feedback-world.md, ai-usage.md, continuity section in README.md
verify.sh                          # new phases
```

**Structure Decision**: Extend the existing web-app layout (backend/, frontend/, contracts/) with three cohesive backend modules and add one new workspace `agent/` for the CLI so backend dependencies stay unchanged for the agent's own model client and signer.

## Complexity Tracking

No constitution violations to justify.

## Phase 1 outputs

- [data-model.md](data-model.md)
- [contracts/door-tickets-api.openapi.yaml](contracts/door-tickets-api.openapi.yaml)
- [contracts/CampaignV2.interface.sol](contracts/CampaignV2.interface.sol)
- [contracts/agent-cli.md](contracts/agent-cli.md)
- [quickstart.md](quickstart.md)

## Traceability (competition evidence → design → requirement → component)

| Evidence (ideation v2 / design) | Design decision | Requirement IDs | Plan component |
|---|---|---|---|
| World Selfie Check brief: abuse prevention, eligibility | Door with credential fallback | FR-001, FR-002, FR-004, SC-001, SC-002 | `backend/door/*`, `DoorPanel` |
| World AgentKit Continuity brief | Agent applies once via AgentKit | FR-003, FR-018, SC-007 | `backend/door/agentkit.ts`, `agent/` |
| The Graph AI Continuity: live standardized data, reasoning | Ledger brief as evidence | FR-010, FR-011, FR-012, SC-005 | `backend/ledger/*`, `BriefPanel` |
| 0G: new on-chain work, all pillars | CampaignV2 + Ticket + event; Direct broker | FR-005–FR-009, FR-014, FR-015, SC-003, SC-004, SC-008 | `contracts/*V2*`, `Ticket.sol`, `backend/tickets/*`, `VerifyOn0G` |
| Owner control and demo path | Roster, settings, ticket counts | FR-016, FR-017, SC-009 | `RosterTable`, admin/create pages |
| ETHGlobal Continuity rules; feedback docs | README continuity, feedback, AI usage | FR-021, SC-010 | `docs/*`, `README.md`, `verify.sh release` |
