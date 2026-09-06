# Requirements Quality Checklist: Human Door, Ledger Brief, and Soulbound Tickets

**Purpose**: Unit-test the requirements in spec.md/plan.md for completeness, clarity, consistency, measurability, and coverage before implementation. Audience: PR reviewer. Depth: standard. Focus: Door security and privacy, on-chain tickets, brief-as-evidence, competition deliverables.
**Created**: 2026-09-06
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [data-model.md](../data-model.md)

## Requirement Completeness

- [x] CHK001 Are all Door refusal states enumerated with user-facing wording (no proof, rejected, used, credential unavailable, closed, full)? [Completeness, Spec §US1, Edge Cases]
- [x] CHK002 Is the behaviour defined for a proof that verifies but the interview never starts (wallet disconnect, later resume)? [Completeness, Spec §Edge Cases]
- [x] CHK003 Are requirements defined for what happens when ticket issuance fails after the decision is recorded? [Completeness, Spec §Edge Cases]
- [x] CHK004 Are the four brief figures and the sources list each defined as required output fields? [Completeness, Spec §FR-010]
- [x] CHK005 Are the three attestation outcomes (enclave-signed, fallback path, unverified) each addressed in Verify requirements? [Completeness, Spec §FR-014, FR-015]
- [x] CHK006 Are owner settings for existing campaigns (enable Door, set close, set expiry) specified separately from creation? [Completeness, Spec §FR-004, US5]
- [x] CHK007 Are the competition deliverables (continuity section with commit ranges, World feedback document, AI-usage note, video length) stated as requirements rather than notes? [Completeness, Spec §FR-021, SC-010]

## Requirement Clarity

- [x] CHK008 Is "one human, one attempt" defined in terms of a concrete identifier (nullifier / AgentBook human id) rather than the word "person"? [Clarity, Spec §FR-002, Key Entities]
- [x] CHK009 Is "non-transferable" specified as a hard revert rather than a UI restriction? [Clarity, Data model §Ticket]
- [x] CHK010 Is "live ticket" defined as exists ∧ not revoked ∧ before expiry, with expiry compared against chain time? [Clarity, Data model §Ticket]
- [x] CHK011 Is the brief window quantified (all-time, 500 trades, 500 swaps, truncation note)? [Clarity, Clarifications Q2, FR-010]
- [x] CHK012 Is "within seven days of mint" defined operationally (earliest observed buy as mint proxy)? [Clarity, research §Decision 4]
- [x] CHK013 Is the 30-second journey budget attributed to specific steps and a provider-normal condition? [Clarity, Spec §SC-006, plan §Performance Goals]

## Requirement Consistency

- [x] CHK014 Does the Door-before-interview rule hold for both browser and agent paths without exception text elsewhere? [Consistency, FR-001, FR-003, US6]
- [x] CHK015 Do the spec's "campaign close" semantics match the contract's `closeAt` revert and the Door's "campaign has closed" refusal? [Consistency, Clarifications Q1, Data model §CampaignV2]
- [x] CHK016 Does the Merkle export remain unchanged everywhere it is mentioned (design, spec assumptions, constitution)? [Consistency]
- [x] CHK017 Do the cut-order items (Direct broker, CLI to API-only, DEX half of brief) map to separable requirements so removal does not orphan an FR? [Consistency, design §Scope, plan §Constraints]
- [x] CHK018 Is the constitution v2.0.0 additive-contract rule reflected by the V2-beside-V1 structure and FR-009? [Consistency]

## Acceptance Criteria Quality

- [x] CHK019 Is every SC observable without reading code (counts, refusals, receipts, timings, files)? [Measurability, Spec §SC-001–SC-010]
- [x] CHK020 Does each user story's Independent Test name concrete inputs (fresh wallet, wallet with history, registered agent)? [Measurability]
- [x] CHK021 Are the on-chain assertions (exactly one ticket, event carries three identifiers) stated so a Foundry test can encode them directly? [Measurability, US2]

## Scenario and Edge Case Coverage

- [x] CHK022 Is the cap-reached case ordered relative to the Door (verify first, then refuse) and to ticket issuance? [Coverage, Spec §Edge Cases]
- [x] CHK023 Are concurrent proofs from two wallets for one person resolved to exactly one winner? [Coverage, Spec §Edge Cases, data-model §proofs]
- [x] CHK024 Is late brief data (after budget) explicitly discarded rather than applied mid-interview? [Coverage, Spec §Edge Cases]
- [x] CHK025 Is the failed-revoke transaction path defined (row stays live, retry offered)? [Coverage, Spec §Edge Cases]
- [ ] CHK026 Is the behaviour defined when the AgentBook lookup is unreachable (distinct from "unregistered")? [Gap] → Resolve in tasks: treat as Door technical failure with retry (503), never as "unregistered".

## Non-Functional Requirements

- [x] CHK027 Are privacy boundaries stated for proof payloads, nullifiers, and briefs (what is stored, what is shown to whom)? [Coverage, FR-020, research §Decision 1]
- [x] CHK028 Are accessibility and recoverable-state requirements inherited explicitly for new surfaces? [Coverage, FR-019, constitution V]
- [ ] CHK029 Is rate limiting specified for `/door/verify` and `/brief` comparable to the existing `/begin` limit? [Gap] → Resolve in tasks: reuse the existing `rateLimit` middleware with the same window on both routes.

## Dependencies and Assumptions

- [x] CHK030 Is the Selfie Check feature-flag dependency recorded with its fallback and the campaign default credential? [Dependencies, research §Decision 1]
- [x] CHK031 Are new npm dependencies listed for approval before installation? [Dependencies, loop/memory/STATE.md]
- [x] CHK032 Is the 3 OG Compute ledger funding recorded as an operator prerequisite outside the codebase? [Dependencies, quickstart]

## Notes

- Two gaps (CHK026, CHK029) are carried into tasks.md as explicit tasks rather than spec edits, since both are implementation policy choices with an obvious default.
