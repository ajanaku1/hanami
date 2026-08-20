---

description: "Dependency-ordered Wave 3 implementation tasks"
---

# Tasks: Bouncer Safety Certification and Production Redesign

**Input**: Design documents from `specs/001-bouncer-safety-redesign/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Mandatory. Each behavior slice follows red-green-refactor and records the expected failing
test before implementation.

**Organization**: Tasks are grouped by user story so each story has an independent acceptance path.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run concurrently because it uses different files and has no unfinished dependency
- **[Story]**: Maps to the user stories in `spec.md`
- Every task names its target file or directory

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish test runners and source boundaries before behavior changes.

- [ ] T001 Add the backend Node test command and test-file TypeScript inclusion in `backend/package.json` and `backend/tsconfig.json`
- [ ] T002 [P] Add Vitest, jsdom, React Testing Library, test scripts, and DOM setup in `frontend/package.json`, `frontend/package-lock.json`, `frontend/vitest.config.ts`, and `frontend/test/setup.ts`
- [ ] T003 [P] Create the safety module and test directory boundaries documented in `backend/src/safety/`, `backend/test/`, `frontend/src/components/safety/`, `frontend/src/components/ui/`, and `frontend/test/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build exact-content identity, owner authorization, additive persistence, the fixed suite,
and privacy-safe report structures required by every story.

**CRITICAL**: No user-story implementation begins until these foundations are green.

- [ ] T004 [P] Write failing exact-content hash and safety signature tests for FR-002, FR-007, and FR-013 in `backend/test/safety-content-hash.test.ts` and `backend/test/safety-auth.test.ts`
- [ ] T005 [P] Write failing frontend exact-content parity and edit-invalidation tests for FR-007 and FR-013 in `frontend/test/content-hash.test.ts`
- [ ] T006 Implement deterministic ABI content hashing and ten-minute owner signature validation in `backend/src/safety/content-hash.ts` and `backend/src/safety/auth.ts` until T004 passes
- [ ] T007 [P] Implement browser content hashing and safety state types in `frontend/src/lib/content-hash.ts` and `frontend/src/lib/safety.ts` until T005 passes
- [ ] T008 Write failing additive migration and legacy/private publication-policy tests for FR-014–FR-019 in `backend/test/safety-schema.test.ts`
- [ ] T009 Add `safety_runs`, `safety_scenario_results`, indexes, and `campaigns.publication_policy` with idempotent legacy migration in `backend/src/db/schema.sql` and `backend/src/db/index.ts` until T008 passes
- [ ] T010 [P] Write failing fixed-suite and privacy-safe serialization tests for FR-003–FR-005 and FR-011 in `backend/test/safety-report.test.ts`
- [ ] T011 Implement typed run/result states, the eight fixed scenarios, safe error codes, and report serialization in `backend/src/safety/types.ts`, `backend/src/safety/scenarios.ts`, and `backend/src/safety/report.ts` until T010 passes
- [ ] T012 Write failing repository idempotency, checkpoint, matching-pass, and stale-running recovery tests for FR-007, FR-009, and FR-012 in `backend/test/safety-repository.test.ts`
- [ ] T013 Implement bounded safety-run persistence and derived campaign certification queries in `backend/src/safety/repository.ts` until T012 passes

**Checkpoint**: Content matching, owner proof, schema compatibility, report privacy, and checkpoint
persistence are independently green.

---

## Phase 3: User Story 1 - Certify a Draft Before Minting (Priority: P1) — MVP

**Goal**: Run the strict eight-scenario TEE gate for exact draft content, recover interruptions, store
a passing report on 0G, and make backend-enforced prepare/mint eligibility visible in Create.

**Independent Test**: A deterministic draft can pass, fail, interrupt, resume without repeated
completed work, invalidate after an edit, and reach prepare only with its matching report.

### Tests for User Story 1

- [ ] T014 [US1] Write failing runner tests for strict 8/8, no-decision failure, false/missing TEE interruption, two-worker pacing, checkpoint resume, and report-upload retry in `backend/test/safety-runner.test.ts`
- [ ] T015 [P] [US1] Write failing HTTP contract tests for idempotent draft start, safe polling, owner resume, rate limits, and sanitized errors in `backend/test/safety-routes.test.ts`
- [ ] T016 [P] [US1] Write failing prepare/index enforcement tests for mismatched owner, slug, content, run status, root reuse, and forced-private creation in `backend/test/safety-prepare.test.ts`
- [ ] T017 [P] [US1] Write failing hook tests for awaiting-signature, polling, pass, fail, interruption, resume, and exact-edit invalidation in `frontend/test/use-safety-run.test.tsx`
- [ ] T018 [P] [US1] Write failing accessible panel tests for all eight rows, text-plus-color status, root evidence, failure disclosure boundary, and retry controls in `frontend/test/safety-report.test.tsx`

### Implementation for User Story 1

- [ ] T019 [US1] Implement injected TEE inference, process-wide pacing, two-worker orchestration, checkpoint resume, interruption classification, and passing report upload in `backend/src/safety/runner.ts` until T014 passes
- [ ] T020 [US1] Implement and mount start/get/resume routes with owner proof and rate limits in `backend/src/safety/routes.ts` and `backend/src/server.ts` until T015 passes
- [ ] T021 [US1] Gate prepare on a matching passing run, reuse certified text roots, generate only the portrait, and force new campaign indexing private in `backend/src/server.ts` until T016 passes
- [ ] T022 [US1] Add typed safety start/get/resume and certified-prepare client contracts in `frontend/src/lib/api.ts`, then implement polling/recovery in `frontend/src/hooks/useSafetyRun.ts` until T017 passes
- [ ] T023 [US1] Implement the accessible eight-row status matrix, report root, failure summary, and interruption recovery UI in `frontend/src/components/safety/SafetyReport.tsx` until T018 passes
- [ ] T024 [US1] Integrate gasless owner signing, read-only active inputs, exact-edit invalidation, and mint locking into `frontend/src/app/create/page.tsx`
- [ ] T025 [US1] Run the complete deterministic US1 acceptance slice and privacy-string scan through `backend/test/` and `frontend/test/`, recording red-green evidence in `specs/001-bouncer-safety-redesign/quickstart.md`

**Checkpoint**: The new Wave 3 safety gate works independently before any broad visual polish.

---

## Phase 4: User Story 2 - Control Publication from Admin (Priority: P1)

**Goal**: Enforce and explain certification for existing campaigns while preserving legacy-public
operation and owner-only controls.

**Independent Test**: Seed public legacy and private existing campaigns, exercise owner/non-owner
tests and visibility changes, and confirm the irreversible private transition plus certified publish.

### Tests for User Story 2

- [ ] T026 [US2] Write failing campaign-scope start and immutable-root matching tests in `backend/test/safety-campaign.test.ts`
- [ ] T027 [P] [US2] Write failing visibility enforcement tests for legacy-public preservation, private transition, `CERTIFICATION_REQUIRED`, owner checks, and certified publication in `backend/test/safety-visibility.test.ts`
- [ ] T028 [P] [US2] Write failing Admin certification panel and guarded visibility tests in `frontend/test/admin-safety.test.tsx`

### Implementation for User Story 2

- [ ] T029 [US2] Add campaign-scope source loading and matching certification behavior to `backend/src/safety/routes.ts` and `backend/src/safety/repository.ts` until T026 passes
- [ ] T030 [US2] Enforce publication policy and return derived safety metadata from campaign list/detail/admin/visibility routes in `backend/src/server.ts` until T027 passes
- [ ] T031 [US2] Extend campaign and admin safety contracts in `frontend/src/lib/api.ts` and render certified, legacy, required, running, failed, and interrupted states in `frontend/src/app/c/[slug]/admin/page.tsx`
- [ ] T032 [US2] Make `frontend/src/components/VisibilityToggle.tsx` explain blocked publication, preserve owner signing, and handle the irreversible legacy-to-private transition until T028 passes
- [ ] T033 [US2] Run the seeded public/private/certified publication matrix described in `specs/001-bouncer-safety-redesign/quickstart.md`

**Checkpoint**: Existing public campaigns remain usable, private campaigns fail closed, and Admin
clearly exposes the next action.

---

## Phase 5: User Story 3 - Complete a Clear Production Creator Flow (Priority: P2)

**Goal**: Deliver the production visual foundation and a clear proof-led owner journey from Landing
through grouped Create, safety, three transactions, success, and Admin.

**Independent Test**: Complete the full creator journey at both reference viewports with keyboard,
transaction failure/retry, and every defined async state.

### Tests for User Story 3

- [ ] T034 [P] [US3] Write failing semantics and focus tests for buttons, fields, badges, notices, and navigation in `frontend/test/ui-foundation.test.tsx`
- [ ] T035 [P] [US3] Write failing three-step mint progression tests for completed-step preservation, failure, retry, and success evidence in `frontend/test/create-flow.test.tsx`

### Implementation for User Story 3

- [ ] T036 [US3] Implement production tokens, visible focus, hover-capable rules, touch targets, reduced motion, and responsive typography in `frontend/src/app/globals.css` until T034 passes
- [ ] T037 [US3] Implement shared accessible primitives in `frontend/src/components/ui/Button.tsx`, `frontend/src/components/ui/Field.tsx`, `frontend/src/components/ui/StatusBadge.tsx`, and `frontend/src/components/ui/AsyncNotice.tsx`
- [ ] T038 [US3] Implement the responsive wordmark/navigation and consistent page boundaries in `frontend/src/components/ui/AppHeader.tsx` and `frontend/src/components/ui/PageShell.tsx`
- [ ] T039 [US3] Redesign the proof-led hero, 0G trust evidence, primary journeys, workflow, featured cards, and footer in `frontend/src/app/page.tsx`
- [ ] T040 [US3] Regroup campaign identity, private intelligence, readiness, sticky preview, and test/mint explanation in `frontend/src/app/create/page.tsx`
- [ ] T041 [US3] Refine the mint state model and render wallet/submitted/confirmed/failure/retry states without repeating completed steps in `frontend/src/app/create/page.tsx` until T035 passes
- [ ] T042 [US3] Redesign the campaign-ready success view with applicant link, bouncer, transactions, storage evidence, private state, sharing, and Admin route in `frontend/src/app/create/page.tsx`
- [ ] T043 [US3] Replace repeated creator-route headers and field patterns with the shared components in `frontend/src/app/create/page.tsx` and `frontend/src/app/c/[slug]/admin/page.tsx`
- [ ] T044 [US3] Validate the full creator story at 390x844 and 1280x800 with keyboard and reduced motion as defined in `specs/001-bouncer-safety-redesign/quickstart.md`

**Checkpoint**: The critical product journey is production-level and independently demonstrable.

---

## Phase 6: User Story 4 - Understand and Complete a Trusted Interview (Priority: P2)

**Goal**: Make interview expectations, privacy, TEE/certification trust, turn progress, recovery, and
the final verifiable outcome clear to applicants.

**Independent Test**: Complete a three-to-six-turn fixture interview from pre-connect to verdict at
both reference viewports, including a transient error and keyboard-only message entry.

### Tests for User Story 4

- [ ] T045 [US4] Write failing pre-connect, progress, retry, certification, and final-verdict accessibility tests in `frontend/test/applicant-flow.test.tsx`

### Implementation for User Story 4

- [ ] T046 [US4] Redesign pre-connect trust evidence and responsive campaign identity in `frontend/src/app/c/[slug]/page.tsx` until the pre-connect portion of T045 passes
- [ ] T047 [US4] Add turn progress, connected wallet, private/TEE indicator, actionable retry, and accessible message state to `frontend/src/app/c/[slug]/page.tsx`
- [ ] T048 [US4] Redesign approval/rejection outcomes with available attestation and transaction verification paths in `frontend/src/app/c/[slug]/page.tsx` until T045 passes
- [ ] T049 [US4] Validate the complete applicant fixture story and confirm no private reasoning reaches the applicant DOM using `frontend/test/applicant-flow.test.tsx`

**Checkpoint**: Applicants understand and can complete the trusted screening journey independently.

---

## Phase 7: User Story 5 - Browse and Operate Hanami Responsively (Priority: P3)

**Goal**: Apply the production system to Gallery, Mine, cards, and responsive Admin records so the
whole app works with touch, pointer, or keyboard without hover-only essentials.

**Independent Test**: Navigate every current route at both reference widths and inspect loading,
empty, populated, keyboard, touch-equivalent, long-content, and reduced-motion states.

### Tests for User Story 5

- [ ] T050 [P] [US5] Write failing pointer/touch/keyboard flip and 300 ms motion tests in `frontend/test/bouncer-card.test.tsx`
- [ ] T051 [P] [US5] Write failing no-hover campaign-fact and primary-action tests in `frontend/test/market-card.test.tsx`

### Implementation for User Story 5

- [ ] T052 [US5] Make card flips semantic, keyboard/touch operable, reduced-motion aware, and at most 300 ms in `frontend/src/components/BouncerCard.tsx` until T050 passes
- [ ] T053 [US5] Expose status, certification, owner, capacity, destination chain, and action without hover in `frontend/src/components/MarketCard.tsx` until T051 passes
- [ ] T054 [US5] Apply the shared page shell, production cards, and explicit loading/empty/error states to `frontend/src/app/gallery/page.tsx` and `frontend/src/app/mine/page.tsx`
- [ ] T055 [US5] Replace small-screen Admin table overflow with responsive applicant records in `frontend/src/app/c/[slug]/admin/page.tsx`
- [ ] T056 [US5] Replace remaining repeated route headers and fix mobile wordmark/navigation behavior in `frontend/src/app/c/[slug]/page.tsx`, `frontend/src/app/gallery/page.tsx`, and `frontend/src/app/mine/page.tsx`
- [ ] T057 [US5] Run the all-route responsive, keyboard, long-content, hover audit, and UI Revamp audit against `frontend/src/`

**Checkpoint**: All current routes meet the shared production and accessibility acceptance outcomes.

---

## Phase 8: Polish and Cross-Cutting Release Gates

**Purpose**: Prove privacy, compatibility, live integration, documentation, and submission evidence
after all user stories are complete.

- [ ] T058 Run backend tests/build, frontend tests/lint/build, and all 16 existing Foundry tests; record exact commands and outcomes in `specs/001-bouncer-safety-redesign/quickstart.md`
- [ ] T059 Run the mandated code review for over-30-line functions, duplicated logic, TypeScript `any`, prop grouping, and async error handling across `backend/src/` and `frontend/src/`
- [ ] T060 Run the `simplify` skill on all modified implementation files and re-run the complete green test/build matrix
- [ ] T061 [P] Update Wave 3 feature separation, architecture, safety report, reproducibility, setup, and evidence in `README.md`, `docs/architecture.excalidraw`, and `docs/architecture.png`
- [ ] T062 [P] Create production desktop/mobile screenshots and Wave 3 submission notes in `docs/images/` and `docs/wave3-submission.md` while retaining the existing demo video
- [ ] T063 Add requirement-to-task-to-assertion checks for FR-001–FR-040 and SC-001–SC-012 in `verify.sh` and `done-when.md`
- [ ] T064 Run one owner-approved real 0G safety proof, retrieve its report root, scan it for forbidden content, and record non-secret evidence in `docs/wave3-submission.md`
- [ ] T065 Deploy the verified frontend/backend changes and run the complete browser -> API -> 0G Storage/mainnet evidence flow from `specs/001-bouncer-safety-redesign/quickstart.md`
- [ ] T066 Run `/Users/mac/Vibecoding/loop/guardrails/claude-check.sh done-when.md --dir /Users/mac/Vibecoding/hanami` with required network and writable Claude state; accept only exit 0 with no degraded-access findings

---

## Dependencies and Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks every user story.
- **US1 (Phase 3)**: Starts after Foundational and is the technical MVP.
- **US2 (Phase 4)**: Starts after Foundational; integrates the same runner with immutable campaigns.
- **US3 (Phase 5)**: Shared primitives, shell, and Landing can start after Foundation; Create-specific
  tasks wait for the US1 UI contract so Create is not redesigned twice.
- **US4 (Phase 6)**: Starts after shared UI primitives from US3.
- **US5 (Phase 7)**: Starts after shared UI primitives; incorporates final Admin responsive treatment.
- **Release Gates (Phase 8)**: Depend on all selected stories and no unfinished red test.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 safety MVP -> US3 Create production flow -> US4 applicant trust
                    \-> US2 publication enforcement -----------\
                     \-> US3 shared shell + Landing -------------> US5 app-wide production pass
All stories -> release gates -> live proof -> deployment verification -> independent checker
```

### Parallel Opportunities

- T001, T002, and T003 use separate setup surfaces.
- T004/T005, T008, and T010 use separate backend/frontend test files before their implementations.
- US1 runner, HTTP contract, prepare contract, hook, and panel failing tests can be authored in
  parallel before the implementation sequence.
- US2 backend visibility tests and frontend Admin tests use separate workspaces.
- US3 shared semantics and mint-state tests use separate files.
- US5 card test pairs are independent.
- Documentation/screenshot work can proceed after behavior is stable while the final verification
  contract is being assembled.

## Parallel Example: User Story 1

```text
T014: backend/test/safety-runner.test.ts
T015: backend/test/safety-routes.test.ts
T016: backend/test/safety-prepare.test.ts
T017: frontend/test/use-safety-run.test.tsx
T018: frontend/test/safety-report.test.tsx
```

Each test must be observed failing for the intended missing behavior before T019–T024 begin.

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational phases.
2. Complete US1 through T025.
3. Stop and demonstrate exact-content 8/8 safety gating with deterministic fixtures.
4. Continue only with the MVP green.

### Three-Day Delivery

- **Day 1**: T001–T013 plus US3 foundation tasks T034, T036–T039 where they do not conflict.
- **Day 2**: T014–T033, completing the safety runner, Create integration, and Admin enforcement.
- **Day 3**: T040–T066, route polish, full test matrix, simplify, docs, live proof, deployment, and
  independent verification.

### Commit Strategy

Commit after each green logical slice: specification foundation; safety model/tests; runner/API;
Create gate; Admin enforcement; design foundation; applicant/discovery polish; verification/docs.
Each commit message must make the Wave 3 delta and its test evidence clear.

## Notes

- `[P]` means files and dependencies are independent, not permission to skip ordering or tests.
- No live 0G compute is used while a deterministic test remains red.
- No smart contract source changes are expected; any contract diff stops implementation for review.
- `speckit.converge` runs after implementation and may append only evidence-backed remaining tasks.

## Phase 9: Convergence

- [x] T067 Restore a known exact-content run from persisted browser identity on refresh or wallet reconnect without repeating completed work per FR-009, SC-004, and US1/AC5
- [x] T068 Show the actual decision for every completed passing or failing scenario while preserving the report disclosure boundary per FR-004 and FR-011
- [x] T069 Add explicit wallet, submitted, confirmed, failure, and retry evidence for each mint transaction plus `frontend/test/create-flow.test.ts` coverage per FR-023, FR-024, FR-027, and US3/AC2-3
- [x] T070 Replace full-page applicant recovery with action-scoped retry and add `frontend/test/applicant-flow.test.ts` coverage for pre-connect trust, progress, retry, and verdict evidence per FR-027-FR-030 and US4/AC1-3
- [x] T071 Run current post-redesign Admin and Applicant fixtures at 390x844 and 1280x800 with keyboard, long content, and overflow assertions per SC-005, SC-006, SC-008, and SC-009
- [ ] T072 Complete the owner-approved deployed safety run, five-minute timing, report retrieval/privacy scan, and browser-to-API-to-0G evidence record per SC-003, SC-010, SC-011, and Constitution I-II (partial)
