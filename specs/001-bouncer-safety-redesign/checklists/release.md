# Release Requirements Checklist: Bouncer Safety Certification and Production Redesign

**Purpose**: Validate that safety, privacy, publication, recovery, production UX, and Wave 3 evidence
requirements are complete and unambiguous before task generation
**Created**: 2026-08-20
**Feature**: [spec.md](../spec.md)

**Audience and timing**: PR reviewer and release gate; standard depth with mandatory privacy,
attestation, compatibility, accessibility, and evidence coverage.

## Requirement Completeness

- [x] CHK001 Are all eight scenario categories, expected decisions, visible result fields, and the
  exact pass threshold explicitly defined? [Completeness, Spec §FR-003–FR-005]
- [x] CHK002 Are mint and publication enforcement requirements both specified instead of relying on
  a presentation-only safety badge? [Completeness, Spec §FR-012, §FR-016]
- [x] CHK003 Are the gasless owner authorization and three later on-chain transactions distinguished
  in both the journey and functional requirements? [Completeness, Spec §FR-002, §FR-022–FR-024]
- [x] CHK004 Are all required owner, applicant, visitor, existing-campaign, and new-draft journeys
  represented by independently testable scenarios? [Coverage, Spec §User Scenarios & Testing]
- [x] CHK005 Are the current-route production redesign and its explicitly excluded redesign work
  both bounded? [Completeness, Spec §FR-021–FR-040; Design §Scope]

## Safety and Privacy Clarity

- [x] CHK006 Is exact-content matching defined with a single deterministic identity and without
  ambiguous normalization? [Clarity, Spec §FR-007, §FR-013; Data Model §Content Identity]
- [x] CHK007 Is every forbidden report/log content class enumerated so private prompts, replies, and
  reasoning cannot be interpreted as optional exclusions? [Clarity, Spec §FR-011; Data Model
  §Safety Scenario Result]
- [x] CHK008 Are semantic verdict failures clearly separated from dependency and attestation
  interruptions? [Consistency, Spec §FR-005–FR-006; Research §Decision 6]
- [x] CHK009 Is the all-correct-but-one-unverified boundary explicitly prevented from passing?
  [Edge Case, Spec §Edge Cases, §SC-002]
- [x] CHK010 Is report persistence failure defined as uncertified and recoverable rather than as a
  partial success? [Recovery, Spec §Edge Cases; Data Model §State Transitions]
- [x] CHK011 Are owner-only start, resume, prepare, and publication boundaries consistently defined
  in the requirements and interface contract? [Consistency, Spec §FR-002, §FR-020; Contract
  §startSafetyRun, §resumeSafetyRun]

## Lifecycle and Recovery Coverage

- [x] CHK012 Are duplicate start, active run, interruption, resume, fail, pass, and edit-invalidation
  transitions documented without contradictory terminal states? [Coverage, Data Model §State
  Transitions]
- [x] CHK013 Is the rule that completed scenarios are not repeated after recovery stated in both
  behavior and architecture decisions? [Consistency, Spec §FR-009; Research §Decision 1]
- [x] CHK014 Are stale-process and wallet reconnect recovery expectations measurable? [Acceptance
  Criteria, Spec §SC-004; Data Model §State Transitions]
- [x] CHK015 Are later-step mint retries required to preserve every earlier confirmed transaction?
  [Recovery, Spec §FR-023–FR-024]
- [x] CHK016 Are duplicate and concurrent safety-run requests assigned an explicit idempotency rule?
  [Edge Case, Spec §Edge Cases; Research §Decision 7]

## Backward Compatibility and Publication

- [x] CHK017 Is the migration outcome separately defined for public existing, private existing, and
  newly indexed campaigns? [Completeness, Spec §FR-014–FR-019; Data Model §Campaign Publication
  Policy]
- [x] CHK018 Is the loss of grandfathered publication allowance after moving private irreversible
  and unambiguous? [Clarity, Spec §FR-015; Data Model §Publication]
- [x] CHK019 Is the visible state for an operating but uncertified legacy campaign distinct from a
  certified state? [Consistency, Spec §FR-019; Contract §CampaignSafety]
- [x] CHK020 Is the no-contract-change requirement consistent with backend publication enforcement
  and the immutable existing persona rule? [Consistency, Spec §FR-018; Plan §Summary]

## Production UX and Accessibility

- [x] CHK021 Are reference mobile and desktop viewport outcomes quantified rather than described
  only as “responsive”? [Measurability, Spec §SC-005]
- [x] CHK022 Are keyboard focus, programmatic labeling, non-color state text, touch targets, and
  reduced motion all required for primary controls? [Coverage, Spec §FR-036, §SC-006–SC-007]
- [x] CHK023 Are hover-independent card information and pointer, touch, and keyboard interactions
  specified consistently? [Consistency, Spec §FR-032–FR-033]
- [x] CHK024 Are all asynchronous state classes and adjacent recovery guidance required for safety
  and mint actions? [Completeness, Spec §FR-027, §FR-037]
- [x] CHK025 Is the information required in the first Applicant and Admin viewports enumerated and
  objectively reviewable? [Clarity, Spec §FR-026, §FR-028, §SC-008–SC-009]
- [x] CHK026 Are long content, hashes, addresses, errors, and responsive applicant records covered as
  overflow edge cases? [Edge Case, Spec §Edge Cases, §FR-035]

## Evidence and Acceptance Quality

- [x] CHK027 Are timing, recovery, responsive, keyboard, privacy, and evidence outcomes expressed as
  measurable criteria? [Acceptance Criteria, Spec §SC-001–SC-012]
- [x] CHK028 Are live 0G Compute, Storage, Chain, and ERC-7857 claims assigned distinct evidence
  responsibilities? [Clarity, Spec §FR-038, §SC-010]
- [x] CHK029 Is the Wave 3 delta explicitly separated from pre-existing Hanami work in repository and
  submission requirements? [Traceability, Spec §FR-039, §SC-012]
- [x] CHK030 Is the existing-video constraint documented without omitting the required new app,
  screenshot, architecture, and repository evidence? [Consistency, Spec §FR-040; Research
  §Decision 12]
- [x] CHK031 Does the validation guide cover deterministic tests before the single owner-approved
  live 0G proof and independent checker? [Completeness, Quickstart §2–§8]
- [x] CHK032 Are every constitution MUST and every material success criterion represented by a
  planned validation path? [Traceability, Plan §Constitution Check; Quickstart]

## Notes

- All 32 requirement-quality checks pass at standard release-gate depth.
- No implementation behavior was executed by this checklist; executable validation belongs to
  tasks and the final verification contract.
