<!--
Sync Impact Report
- Version change: template -> 1.0.0
- Added principles: Truthful Evidence; Privacy and Attestation Fail Closed; Test-First
  Traceability; Backward-Compatible Delivery; Accessible and Recoverable Experience
- Added sections: Wave 3 Constraints; Development Workflow and Quality Gates
- Removed sections: none
- Deferred placeholders: none
-->
# Hanami Constitution

## Core Principles

### I. Truthful, Reproducible Evidence

Every product claim MUST be supported by a reproducible check, deployed evidence, or a clearly
identified design constraint. Wave 3 documentation MUST distinguish new in-window work from
pre-existing Hanami capabilities. Mainnet, TEE, and 0G Storage claims MUST use real references;
mock or local evidence MUST never be presented as live integration evidence.

### II. Privacy and Attestation Fail Closed

Private persona text, lorebook content, complete simulated replies, hidden instructions, and
private reasoning MUST NOT appear in public reports or routine logs. Any decision presented as
safety-certified MUST have a verified TEE response. Missing, false, or malformed attestation data
MUST block certification and surface a recoverable technical failure rather than a passing or
incorrect-decision result.

### III. Test-First Traceability (NON-NEGOTIABLE)

Behavior changes MUST follow red-green-refactor: write the smallest failing test, observe the
expected failure, implement the minimum behavior, then refactor with the suite green. Competition
evidence MUST trace through approved design decisions, specification requirement IDs, plan
components, task IDs, and executable verification assertions. A feature is not complete because
the source looks correct; its required checks MUST pass.

### IV. Backward-Compatible, Additive Delivery

Wave 3 work MUST NOT change or redeploy the existing smart contracts. Existing public campaigns
MUST continue to operate. Stored-data changes MUST be additive and safe for existing rows, and
new publish restrictions MUST preserve the explicitly approved grandfathering rule. Successful
steps in multi-step wallet flows MUST remain resumable and MUST NOT be repeated after a later-step
failure.

### V. Accessible and Recoverable Experience

Every primary journey MUST work at mobile and desktop widths with keyboard-visible focus,
programmatic control labels, non-color status text, touch-safe targets, and reduced-motion support.
Every asynchronous mutation MUST expose active, success, failure, and recovery behavior. Technical
interruptions MUST remain distinct from product verdict failures so owners always know the next
safe action.

## Wave 3 Constraints

- The feature MUST fit the approved three-day delivery boundary.
- No new smart contract, contract upgrade, replacement demo video, marketplace, analytics suite,
  custom scenario builder, or existing-persona editor may enter scope.
- The eight-scenario safety report MUST use 0G Compute with TEE verification and persist its safe
  summary to 0G Storage.
- The production redesign MUST preserve Hanami's existing Japanese gallery identity while giving
  the deepest attention to Create, Safety Test, Mint, Admin, and Publish.
- Private prompts and reasoning MUST remain excluded from public or applicant-facing surfaces.

## Development Workflow and Quality Gates

1. Work MUST follow the approved `design.md` and the Spec Kit sequence: specify, clarify, plan,
   checklist, tasks, analyze, build-contract reconciliation, implementation, and converge.
2. Implementation MUST follow the repository instructions and applicable skills, including
   test-driven development before production changes and simplification after implementation.
3. Backend, frontend, responsive, accessibility, integration, and live-evidence checks MUST be
   proportional to the affected behavior and recorded in the verification contract.
4. Functions longer than 30 lines, repeated logic, TypeScript `any`, large unstructured prop lists,
   and missing async error handling MUST be reviewed before handoff.
5. Completion MUST be confirmed by the independent checker. A degraded checker run, missing
   access, exit status other than zero, or unverified live-chain claim is not a pass.

## Governance

This constitution governs Hanami Wave 3 planning and delivery. Conflicting specifications, plans,
tasks, or implementation choices MUST be changed to comply; the constitution MUST NOT be silently
weakened. Amendments require explicit user approval, a documented rationale, an updated Sync Impact
Report, and a semantic-version change. Every pre-implementation analysis and final review MUST
check compliance with all MUST statements.

**Version**: 1.0.0 | **Ratified**: 2026-08-20 | **Last Amended**: 2026-08-20
