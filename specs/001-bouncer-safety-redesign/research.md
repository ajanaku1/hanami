# Phase 0 Research: Bouncer Safety Certification and Production Redesign

## Decision 1: Persisted asynchronous runner with polling

**Decision**: Start or resume a safety run through a short owner-authorized request, execute it in a
background promise, checkpoint every completed scenario in libSQL, and let the frontend poll a
privacy-safe status resource.

**Rationale**: Eight scenarios can require many TEE calls and exceed a normal HTTP request window.
Scenario checkpoints let refreshes, disconnects, upstream interruptions, and process restarts
recover without repeating completed work.

**Alternatives considered**: A single long POST was rejected because it is fragile on Render and
cannot support refresh recovery. A new workflow/queue service was rejected as unnecessary for one
single-instance backend and the three-day limit.

## Decision 2: Reuse the existing TEE path behind an injected runner boundary

**Decision**: Extract the eight fixed scenarios into typed data and call the existing
`bouncerTurn()` behavior through a small injected inference interface. Treat `tee_verified !== true`
or the existing TEE verification error as an interruption.

**Rationale**: This preserves the mainnet integration already proven by Hanami while making runner
logic deterministic in tests without spending router credit.

**Alternatives considered**: A second model/prompt stack was rejected because it creates divergent
verdict behavior. Calling the HTTP applicant routes was rejected because those routes persist
applicants and on-chain decisions, which a safety simulation must not do.

## Decision 3: Exact content identity through deterministic ABI encoding

**Decision**: Define the certification content hash as the keccak256 digest of ABI-encoded exact
persona and lorebook strings in that order. The frontend and backend compute the same digest with
their existing viem dependency.

**Rationale**: ABI encoding preserves exact whitespace and string boundaries and avoids ambiguous
concatenation. Any text edit yields a different identity and immediate client-side invalidation;
the backend remains authoritative before prepare/mint.

**Alternatives considered**: Slug-only matching was rejected because it would certify edited text.
Trimmed or normalized text was rejected because the approved rule is exact-current-text matching.

## Decision 4: Upload draft intelligence when the safety run starts

**Decision**: For a draft run, upload persona and optional lorebook through the existing 0G Storage
path once, store only their roots and content hash in libSQL, and reuse those certified roots during
the later prepare step. Prepare generates the portrait but does not upload the text again.

**Rationale**: The backend needs durable source content to resume after a restart without putting
plaintext persona/lorebook in libSQL. Reusing roots avoids duplicate storage writes on the passing
path.

**Alternatives considered**: Keeping plaintext in process memory cannot recover from restarts.
Keeping plaintext in libSQL broadens sensitive-data exposure. Uploading only after a pass prevents
durable mid-run recovery.

## Decision 5: Store only a privacy-safe report summary

**Decision**: The 0G report contains version, run identity, scope, slug, owner, content hash,
scenario ID/category/expected/actual/TEE state, timestamps, and overall result. It contains no
persona, lorebook, prompt, full reply, hidden instruction, transcript, or reasoning field.

**Rationale**: Judges can reproduce the gate evidence while the bouncer's private intelligence and
simulated conversations remain excluded.

**Alternatives considered**: Full transcripts were rejected by the approved privacy boundary.
Storing only an aggregate count was rejected because it provides insufficient reproducible
scenario evidence.

## Decision 6: Separate verdict failure from technical interruption

**Decision**: `no-decision`, approve/reject mismatch, and other completed semantic outcomes are
genuine failed scenarios. Network, provider, rate-limit, storage, timeout, and missing/false TEE
verification errors interrupt the run and leave the affected scenario retryable.

**Rationale**: This directly implements the approved strict gate without blaming the persona for
external outages or allowing an unverifiable result to pass.

**Alternatives considered**: Counting every exception as a failed verdict was rejected as
misleading. Retrying forever was rejected because it hides outages and can drain compute credit.

## Decision 7: Globally paced, bounded scenario concurrency

**Decision**: Allow at most two scenario workers for one run while all safety inference starts pass
through one process-wide pacing gate. Allow one active run per owner/slug/content identity and make
duplicate starts idempotent.

**Rationale**: Interleaving two scenario histories can meet the five-minute target without bursting
the shared Router credential. Idempotency prevents double clicks from doubling spend.

**Alternatives considered**: Eight-way parallelism risks throttling and memory pressure. Fully
sequential execution risks exceeding the target. An external distributed rate limiter is outside
the single-instance scope.

## Decision 8: Additive publication policy for grandfathering

**Decision**: Add a campaign publication-policy field. Migration marks existing public rows
`legacy-public` and existing private rows `certification-required`; all new rows are
`certification-required`. Moving a legacy campaign to private permanently changes its policy to
`certification-required`.

**Rationale**: This makes the transition explicit and testable without inferring legacy state from
timestamps or changing deployed contracts.

**Alternatives considered**: Treating every existing row as exempt contradicts the private campaign
rule. Treating every row as required would break public campaigns. A timestamp heuristic is brittle.

## Decision 9: Backend enforcement at both prepare and publication

**Decision**: `prepare` requires a passing draft run ID whose owner, slug, exact content hash, and
stored roots match the request; it reuses those roots. `index` always creates a private campaign.
Visibility changes to public enforce campaign certification unless the row still has active legacy
public allowance.

**Rationale**: UI locking alone is bypassable. Enforcing before the expensive portrait/mint setup
and before publication makes the approved gate real while keeping contracts unchanged.

**Alternatives considered**: Frontend-only enforcement was rejected. Contract gating was rejected
because contract work is explicitly out of scope.

## Decision 10: Small shared UI system, not a new component framework

**Decision**: Build accessible primitives with the existing Tailwind/CSS token stack, preserve the
gallery art direction, and refactor current shells to shared components. Deeply redesign Landing,
Create, Applicant, and Admin; let Gallery and Mine inherit the system plus card improvements.

**Rationale**: The current palette and typography are distinctive. Consistency, responsive layout,
focus, state hierarchy, and trust evidence are the missing production qualities.

**Alternatives considered**: Installing a full UI kit would dilute the identity and add migration
work. A cosmetic palette replacement would not fix the audited interaction problems.

## Decision 11: Test with native backend tooling and focused frontend behavior tests

**Decision**: Use Node's built-in test runner through existing `tsx` for backend services and route
contracts. Add Vitest, jsdom, and React Testing Library only to the frontend for component/hook
behavior. Keep Foundry as an unchanged-contract regression and use browser/live checks for the
deployed story.

**Rationale**: This satisfies test-first work with minimal backend dependency churn and gives the
interactive safety UI a real DOM-level harness.

**Alternatives considered**: Source-only review violates the constitution. A full Playwright suite
is too broad for three days; browser verification remains mandatory but does not require a new E2E
test framework in the repository.

## Decision 12: Existing video, new evidence package

**Decision**: Keep the existing demo video and update README, architecture, screenshots, commit
history narrative, and submission copy to identify the safety report and production redesign as the
Wave 3 delta.

**Rationale**: The user explicitly excluded a replacement video, while the judge explicitly asked
for meaningful within-window development evidence.

**Alternatives considered**: Re-recording the demo consumes the three-day build window without
improving the core scored weakness.
