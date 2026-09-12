# Tasks: Human Door, Ledger Brief, and Soulbound Tickets

**Input**: Design documents from `specs/002-human-door-tickets/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md; constitution v2.0.0 (test-first is non-negotiable, so every behavior task is preceded by a failing test task)

**Organization**: Grouped by user story so each story is independently testable. Window: seven days to Sun 2026-09-13 12:00 EDT. Cut order if slipping: Phase 8 (Direct broker) → Phase 9 reduced to T075–T078 only → T044/T045 DEX half of the brief.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Web app: `backend/src/`, `backend/test/`, `frontend/src/`, `frontend/test/`, `contracts/src/`, `contracts/test/`; new CLI workspace `agent/`; docs in `docs/` and `README.md`.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Confirm dependency approval recorded in `loop/memory/STATE.md` (feature 002 block) and, once approved, add `@worldcoin/idkit` to `frontend/package.json`, `@worldcoin/agentkit` `@x402/hono` `@x402/core` to `backend/package.json`; do not install before approval
- [x] T002 [P] Add new env keys to `backend/.env.example` and `frontend/.env.example` (`WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_ACTION`, `GRAPH_API_KEY`, `OG_DIRECT_ENABLED`, `OG_DIRECT_PROVIDER`, `CAMPAIGN_FACTORY_V2`, `TICKET_ADDRESS`, `TICKET_GATE_ADDRESS`, `NEXT_PUBLIC_WORLD_APP_ID`); never touch `.env`
- [x] T003 [P] Scaffold `agent/` workspace: `agent/package.json` (tsx, typescript, viem, openai, @worldcoin/agentkit), `agent/tsconfig.json`, `agent/src/cli.ts` stub, `agent/README.md` stub
- [x] T004 [P] Add `verify.sh` phases `contracts|door|brief|tickets|agent|ui|release|live` as failing placeholders so the predicate exists before the work (update header comment from Wave 3 to ETHOnline 2026)

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T005 Write failing schema test `backend/test/door-schema.test.ts` asserting new columns on `campaigns`/`applicants` and the `proofs` table with both UNIQUE constraints (data-model.md)
- [x] T006 Add additive migrations in `backend/src/db/schema.sql` and `backend/src/db/index.ts` (`required_credential`, `close_at`, `ticket_expiry`, `contract_version`; applicant `nullifier`, `proof_method`, `agent_id`, `brief_json`, `brief_status`, `ticket_id`, `attestation_path`; `proofs` table) until T005 passes
- [x] T007 [P] Write failing Foundry tests `contracts/test/Ticket.t.sol`: mint by minter only, soulbound transfer revert, `isLive` false after expiry, `revoke` only by minting campaign, `liveTicketOf`
- [x] T008 [P] Write failing Foundry tests `contracts/test/CampaignV2.t.sol`: `recordDecision` mints exactly one ticket on approve and none on reject, `DecisionRecordedV2` carries attestation + nullifier + ticketId, `ZeroNullifier` revert, `CampaignClosed` after `closeAt`, `CapReached`, `revokeTicket` owner-only, `hasLiveTicket` transitions, V1 suite unchanged
- [x] T009 Implement `contracts/src/Ticket.sol` (OZ ERC-721, `_update` revert on transfer, `expiresAt`, `revoked`, minter registry by factory) until T007 passes
- [x] T010 Implement `contracts/src/CampaignV2.sol` (`CampaignV2` + `CampaignFactoryV2` with `BadSchedule` checks) per `contracts/CampaignV2.interface.sol` until T008 passes
- [x] T011 [P] Write failing `contracts/test/TicketGate.t.sol` (accept live holder, refuse none/expired/revoked, `AlreadyMinted`) then implement `contracts/src/TicketGate.sol`
- [x] T012 Add `contracts/script/DeployV2.s.sol` deploying `Ticket`, `CampaignFactoryV2`, `TicketGate` against the existing `BouncerRegistry` address from env; dry-run with `forge script` (no broadcast)
- [x] T013 Write failing test `backend/test/tickets-chain.test.ts` for `backend/src/tickets/chain-v2.ts` (ABI encoding of `recordDecision` V2, parsing `DecisionRecordedV2` to `{ticketId}`, `hasLiveTicket` read, `revokeTicket` prepared tx) with an injected client; then implement
- [x] T014 Route `backend/src/og-chain.ts` `createCampaign`/`recordDecision` by `contract_version` (V1 path untouched); add failing test in `backend/test/tickets-chain.test.ts` that V1 campaigns still call the V1 ABI

**Checkpoint**: schema, contracts, and chain client ready; `forge test` green (16 existing + new)

---

## Phase 3: User Story 1 — The Door (Priority: P1) 🎯 MVP

**Goal**: No interview without a verified proof bound to wallet + campaign; one person, one attempt.

**Independent Test**: `/begin` without proof → 403; `/door/verify` with sandbox proof → verified; same nullifier from another wallet → 409; closed campaign → 410.

- [x] T015 [P] [US1] Write failing tests `backend/test/door-verify.test.ts` for `backend/src/door/world-verify.ts` (forwards unchanged IDKit result to v4 verify URL built from `WORLD_RP_ID`, maps success/failed/unreachable, no proof material logged)
- [x] T016 [P] [US1] Write failing tests `backend/test/door-proofs.test.ts` for `backend/src/door/proofs.ts` (insert ON CONFLICT DO NOTHING; nullifier reuse with different wallet → `used`; same wallet re-verify idempotent; concurrent inserts resolve to one row)
- [x] T017 [P] [US1] Write failing route tests `backend/test/door-routes.test.ts`: `POST /door/verify` 200/409/410/412/422, `GET /door/status`, `/begin` and `/turns` 403 without proof, 410 after `close_at`, cap-full refusal after verification, rate limit reuse (CHK029)
- [x] T018 [US1] Implement `backend/src/door/world-verify.ts` with injected fetch until T015 passes
- [x] T019 [US1] Implement `backend/src/door/proofs.ts` until T016 passes
- [x] T020 [US1] Implement `backend/src/door/routes.ts` and the Door guard in `backend/src/server.ts` for `/begin` and `/turns` (403 `door required`, 410 `campaign closed`, 409 `person already applied`), reusing `rateLimit` on `/door/verify`, until T017 passes
- [x] T021 [P] [US1] Write failing Vitest `frontend/test/door-panel.test.tsx` for `DoorPanel` states (none, pending, verified, rejected+retry, used, unavailable, closed, full) with non-color status text and focus management
- [x] T022 [US1] Implement `frontend/src/components/door/DoorPanel.tsx` using `IDKitRequestWidget` with preset chosen from `requiredCredential` (`selfieCheckLegacy` | `orbLegacy` | `deviceLegacy`), signal = wallet, posting the unchanged result to `/door/verify`, until T021 passes
- [x] T023 [US1] Wire `DoorPanel` before the chat in `frontend/src/app/c/[slug]/page.tsx`; chat box hidden until `door.state === 'verified'`; persist resume on reconnect (edge case)
- [x] T024 [US1] Update `verify.sh` phase `door` (backend door tests + frontend door test files exist and pass)

**Checkpoint**: Door enforced end to end with sandbox proofs

---

## Phase 4: User Story 2 — The Ticket on 0G (Priority: P1)

**Goal**: Approval mints one soulbound expiring ticket; decision record carries attestation + nullifier + ticket; owner can revoke; demo mint honours it; V1 campaigns untouched.

**Independent Test**: approve → one ticket with configured expiry and `DecisionRecordedV2`; TicketGate accepts; revoke → refuses; V1 campaign loads unchanged.

- [x] T025 [P] [US2] Write failing tests `backend/test/tickets-decide.test.ts`: on decision for a V2 campaign the server calls V2 `recordDecision` with the stored nullifier, persists `ticket_id` from the event, returns a `Receipt` with `ticket` on approval and `null` on rejection; ticket-issue failure after chain success surfaces as recoverable (edge case) with a retry endpoint
- [x] T026 [US2] Extend the decision branch in `backend/src/server.ts` (`/turns`) and `backend/src/tickets/chain-v2.ts` until T025 passes; add `POST /api/campaigns/:slug/tickets/retry` (owner-authorized) for the failure case
- [x] T027 [P] [US2] Write failing tests `backend/test/roster.test.ts` for `backend/src/tickets/roster.ts` (rows from db + chain status live/expired/revoked, `viaAgent`, brief summary) and routes `GET /roster`, `POST /tickets/:id/revoke` (prepared tx, owner-only)
- [x] T028 [US2] Implement `backend/src/tickets/roster.ts` and the two routes until T027 passes
- [x] T029 [P] [US2] Write failing Vitest `frontend/test/roster.test.tsx` for `RosterTable` (columns, status badges, "via agent" mark) and `RevokeButton` (idle/confirming/pending/success/failure-with-retry, network named)
- [x] T030 [US2] Implement `frontend/src/components/roster/{RosterTable,RevokeButton}.tsx` and the Roster tab in `frontend/src/app/c/[slug]/admin/page.tsx` until T029 passes; label Export "for mints on chains other than 0G"
- [x] T031 [P] [US2] Write failing Vitest `frontend/test/receipt.test.tsx` for `Receipt` (decision, attestation, nullifier, sources read, ticket block with expiry and "soulbound · revocable by the owner", rejection without ticket)
- [x] T032 [US2] Implement `frontend/src/components/door/Receipt.tsx` and render it at decision in `frontend/src/app/c/[slug]/page.tsx` until T031 passes
- [x] T033 [US2] Add V1 regression test in `backend/test/tickets-decide.test.ts` (campaign with `contract_version = 1` follows the old path and returns the old payload plus `ticket: null`)
- [x] T034 [US2] Update `verify.sh` phases `contracts` and `tickets`

**Checkpoint**: tickets mint, revoke, and gate on a local fork; V1 unchanged

---

## Phase 5: User Story 3 — The Ledger Brief (Priority: P2)

**Goal**: Deterministic brief from seven standardized subgraphs, shown to the applicant, cited by the bouncer, never decisive.

**Independent Test**: wallet with history → `ready` with ≥2 sources; fresh wallet → `empty`; provider down → `unavailable` and interview proceeds.

- [x] T035 [P] [US3] Write failing tests `backend/test/ledger-brief.test.ts` for pure `backend/src/ledger/brief.ts` (flipsWithin7d, sameCounterpartySales, medianHoldingDays, swapCount, truncated flag at 500, empty input → `empty`)
- [x] T036 [P] [US3] Write failing tests `backend/test/ledger-graph.test.ts` for `backend/src/ledger/graph-client.ts` (seven sources, one `Trade` template with buyer/seller, one `Swap` template with `from`, parallel with 12 s budget, per-source failure recorded, all-fail → `unavailable`, late result discarded)
- [x] T037 [US3] Implement `backend/src/ledger/brief.ts` until T035 passes
- [x] T038 [US3] Implement `backend/src/ledger/graph-client.ts` with injected fetch and `GRAPH_API_KEY` gateway URLs until T036 passes
- [x] T039 [P] [US3] Write failing tests `backend/test/ledger-prompt.test.ts` for `backend/src/ledger/prompt.ts` (fenced evidence block with the "evidence, not verdict" instruction; unavailable → "no ledger evidence" line) and for `bouncerTurn` accepting an optional `evidence` argument in `backend/src/bouncer.ts`
- [x] T040 [US3] Implement `backend/src/ledger/prompt.ts` and the `evidence` argument until T039 passes
- [x] T041 [US3] Write failing route tests in `backend/test/door-routes.test.ts`: `/begin` triggers the brief after a verified Door, persists `brief_json`/`brief_status`, `GET /brief?wallet=` returns only the caller's own brief (403 otherwise), brief included in the transcript uploaded to 0G Storage; then implement in `backend/src/server.ts`
- [x] T042 [P] [US3] Write failing Vitest `frontend/test/brief-panel.test.tsx` for `BriefPanel` (reading, ready with four figures + sources, empty, unavailable, truncation note)
- [x] T043 [US3] Implement `frontend/src/components/door/BriefPanel.tsx` and place it between Door and chat in `frontend/src/app/c/[slug]/page.tsx` until T042 passes
- [x] T044 [US3] Add the DEX `Swap` template and `swapCount` to `graph-client.ts`/`brief.ts` tests and implementation (cuttable per cut order)
- [x] T045 [US3] Update `verify.sh` phase `brief`, including a `live` assertion that a Graph query against ≥2 marketplace sources returns within 12 s when `GRAPH_API_KEY` is set

**Checkpoint**: brief live in the interview and on the receipt

---

## Phase 6: User Story 4 — Verify on 0G (Priority: P2)

**Goal**: Three identifiers side by side, in-browser recompute, signer recovery, attestation path shown.

**Independent Test**: open Verify on a V2 decision → three ids match chain; direct-signed decision → recovered signer equals registered signer; router path labelled.

- [x] T046 [P] [US4] Write failing tests `backend/test/verify-payload.test.ts` for `GET /api/campaigns/:slug/verify/:wallet` returning `nullifier`, `ticketId`, `attestationPath`, and the existing attestation bundle
- [x] T047 [US4] Extend the verify route in `backend/src/server.ts` and persist `attestation_path` at decision time until T046 passes
- [x] T048 [P] [US4] Write failing Vitest `frontend/test/verify-three-hash.test.tsx` for `VerifyOn0G` (three hashes, recompute match/mismatch, signer recovery result, path label `direct`/`router`)
- [x] T049 [US4] Extend `frontend/src/components/VerifyOn0G.tsx` until T048 passes

---

## Phase 7: User Story 5 — Owner controls (Priority: P2)

**Goal**: Credential, close date-time, ticket expiry at create and in Admin; ticket counts on cards.

**Independent Test**: create with settings → Door enforces credential, close refuses late applicants, tickets carry expiry; card shows count.

- [ ] T050 [P] [US5] Write failing tests `backend/test/campaign-settings.test.ts` for `POST /api/campaigns/:slug/settings` (owner signed-message auth as existing routes, 422 on past close/expiry, `ticket_expiry` defaults to `close_at`) and for `/api/campaigns/prepare` accepting `requiredCredential`, `closeAt`, `ticketExpiry` and creating V2 campaigns via `CampaignFactoryV2`
- [ ] T051 [US5] Implement settings route and prepare/index changes in `backend/src/server.ts` and `backend/src/og-chain.ts` until T050 passes
- [ ] T052 [P] [US5] Write failing Vitest `frontend/test/create-settings.test.tsx` for the new Create fields (credential radio with one-line explanations, close date-time required, expiry default/override, past-date validation)
- [ ] T053 [US5] Implement the fields in `frontend/src/app/create/page.tsx` (Campaign identity group) until T052 passes; readiness panel lists the V2 factory transaction
- [ ] T054 [US5] Add the settings panel to `frontend/src/app/c/[slug]/admin/page.tsx` for existing campaigns (enable Door, set close, set expiry) with tests appended to `frontend/test/roster.test.tsx`
- [ ] T055 [P] [US5] Add live ticket count to `frontend/src/components/MarketCard.tsx` and `BouncerCard.tsx` with tests appended to `frontend/test/market-card.test.tsx` and `frontend/test/bouncer-card.test.tsx`; expose `liveTicketCount` from `GET /api/campaigns`

---

## Phase 8: Direct broker attestation (Priority: P2, first to cut)

- [ ] T056 Write failing test `backend/test/attestation-path.test.ts` that the decision turn records `attestation_path = 'direct'` when `directEnabled()` and the signed path succeeds, `'router'` on fallback, and that the receipt/verify payload carry it
- [ ] T057 Surface the path from `backend/src/og-compute-direct.ts` / `backend/src/bouncer.ts` into the decision branch until T056 passes (no change to signing logic)
- [ ] T058 Operator step documented in `specs/002-human-door-tickets/quickstart.md`: fund 3 OG ledger, set `OG_DIRECT_ENABLED=true` and `OG_DIRECT_PROVIDER`; add `verify.sh live` assertion that a fresh decision reports `direct`

---

## Phase 9: User Story 6 — Agent applicant (Priority: P3)

**Goal**: A registered human-backed agent applies end to end from the terminal; one attempt per human; "via agent" in Roster.

**Independent Test**: `apply` against a live campaign → receipt + ticket; second run → exit 2.

- [ ] T059 [P] [US6] Write failing tests `backend/test/door-agentkit.test.ts` for `backend/src/door/agentkit.ts` (hooks in `free` mode, `agentkit` header → AgentBook human id stored as nullifier with `method='agentkit'` and `agent_id`; unregistered → 403 with registration message; AgentBook unreachable → 503 retryable, never "unregistered" (CHK026))
- [ ] T060 [US6] Implement `backend/src/door/agentkit.ts` (`createAgentkitHooks`, `createAgentBookVerifier`, `InMemoryAgentKitStorage`, `@x402/hono` wiring) and mount on `/begin` and `/turns` until T059 passes
- [ ] T061 [P] [US6] Write failing tests `agent/test/apply.test.ts` for `agent/src/apply.ts` (begin via injected agentkit fetch, turn loop until decision or `--max-turns`, exit codes 0/2/3, `--json` receipt shape per `contracts/agent-cli.md`)
- [ ] T062 [US6] Implement `agent/src/apply.ts`, `agent/src/applicant-model.ts` (OpenAI-compatible client to the 0G Router with the fixed sincere-applicant persona), `agent/src/register.ts` (wrap `npx @worldcoin/agentkit-cli register/status`), `agent/src/cli.ts` until T061 passes
- [ ] T063 [US6] Write `agent/README.md` (register, env, apply, expected output, exit codes) so a judge can run it
- [ ] T064 [US6] Roster/receipt show `viaAgent` (append tests to `frontend/test/roster.test.tsx`)
- [ ] T065 [US6] Update `verify.sh` phase `agent` (agent tests pass; README has the three commands)

---

## Phase 10: Polish, evidence, release

- [ ] T066 [P] Run `/simplify` and the code-review standards over new code (functions >30 lines, duplication, `any`, prop lists, async error handling); fix findings
- [ ] T067 [P] Accessibility and responsive pass for Door, Brief, Receipt, Roster at 390×844 and 1280×800; append assertions to `frontend/test/ui-foundation.test.tsx`
- [ ] T068 Deploy V2 contracts to 0G mainnet with `contracts/script/DeployV2.s.sol` (operator confirms; deployer key from existing `.env`), verify on Chainscan, set `CAMPAIGN_FACTORY_V2`, `TICKET_ADDRESS`, `TICKET_GATE_ADDRESS` in operator env; record addresses in `README.md`
- [ ] T069 Create one V2 demo campaign for Kenji on mainnet with a short close (for the expired state) and one with the demo window; keep Mei-chan on V1 to prove coexistence
- [ ] T070 [P] Write `docs/feedback-world.md` (Selfie Check/AgentKit docs, portal navigation, sandbox states, what was confusing or broken) and `docs/ai-usage.md`
- [ ] T071 [P] Add README continuity section: pre-existing capabilities vs in-window work with commit ranges, partner tracks (0G, World, The Graph), what each sees; update architecture diagram note
- [ ] T072 Record the demo video (2–4 min, ≥720p, target <3 min) following the design demo path; reference it in README
- [ ] T073 Complete `verify.sh` phases `ui`, `release`, `live`; run `./verify.sh` fully green locally; `live` green against mainnet + Graph + sandbox
- [ ] T074 Independent completion check via `loop/guardrails/verify.sh` on the build done-when (build-prompt reconcile writes it); record the verdict

### Reduced Phase 9 (if the cut order bites)
- [ ] T075 [US6] Keep T059–T060 (API-only AgentKit path) and T064; skip T061–T063
- [ ] T076 [US6] README states the agent path is API-level with a curl example
- [ ] T077 [US6] `verify.sh agent` asserts only the backend AgentKit tests
- [ ] T078 [US6] Feedback doc notes the CLI was descoped and why

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 (T005–T014) blocks everything.
- US1 (Phase 3) is the MVP; US2 (Phase 4) depends on Phase 2 contracts and on US1 for the nullifier at decision time.
- US3 (Phase 5) depends on US1 (brief runs after the Door) and is independent of US2.
- US4 (Phase 6) depends on US2 (ticket id) and Phase 8 for the `direct` label (label only; `router` works without Phase 8).
- US5 (Phase 7) depends on Phase 2; can run parallel to US3/US4.
- Phase 8 is independent; first to cut.
- US6 (Phase 9) depends on US1 (Door abstraction) and US2 (ticket in receipt); reduced form T075–T078.
- Phase 10 last; T068/T069 need operator confirmation (mainnet gas, keys never read by the agent).

### Parallel opportunities
- Phase 2: T007, T008, T011 (Foundry) in parallel with T005/T006 (schema).
- Phase 3: T015, T016, T017, T021 in parallel; then T018–T020, T022–T023.
- Phase 5: T035, T036, T039, T042 in parallel.
- Phase 10: T066, T067, T070, T071 in parallel.

## Implementation Strategy

Day 1: Phases 1–2. Day 2: US1. Day 3: US2. Day 4: US3 + US4. Day 5: US5 + Phase 8. Day 6: US6. Day 7: Phase 10, video, submission by 12:00 EDT. Commit at every checkpoint; each day ends with a pushed commit so the continuity history is real.

## Traceability

| Task range | FR | SC | verify.sh phase |
|---|---|---|---|
| T015–T024 | FR-001, FR-002, FR-004(part), FR-019, FR-020 | SC-001, SC-002 | door |
| T005–T014, T025–T034 | FR-005–FR-009, FR-013, FR-016(part) | SC-003, SC-004, SC-008 | contracts, tickets |
| T035–T045 | FR-010–FR-012 | SC-005, SC-006 | brief |
| T046–T049, T056–T058 | FR-014, FR-015 | — | ui, live |
| T050–T055 | FR-004, FR-016, FR-017 | — | ui |
| T059–T065 | FR-003, FR-018 | SC-007 | agent |
| T066–T074 | FR-021 | SC-009, SC-010 | release, live |
