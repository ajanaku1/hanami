<!--
Sync Impact Report
- Version change: 1.0.0 -> 2.0.0 (MAJOR: a governing constraint section was replaced and
  Principle IV lost its no-redeploy clause)
- Amended 2026-09-06 with explicit user approval for the ETHOnline 2026 Continuity entry
  (approved design: design.md; evidence: loop/memory/ethonline-2026-ideation-v2-report.md)
- Modified principles: IV Backward-Compatible, Additive Delivery (contract upgrades allowed
  when additive and deployed beside, not over, existing contracts)
- Replaced sections: "Wave 3 Constraints" -> "ETHOnline 2026 Continuity Constraints"
- Unchanged principles: I, II, III, V
- Rationale: the approved design requires an upgraded Campaign contract with on-chain tickets,
  a new demo video, and a seven-day window; v1.0.0 forbade all three for the Wave 3 build only.
- Prior history: template -> 1.0.0 (2026-08-20) added principles I–V and the Wave 3 sections.
-->
# Hanami Constitution

## Core Principles

### I. Truthful, Reproducible Evidence

Every product claim MUST be supported by a reproducible check, deployed evidence, or a clearly
identified design constraint. Event documentation MUST distinguish new in-window work from
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

Existing deployed contracts MUST NOT be modified in place. New contract versions MUST be deployed
beside them, and every existing public campaign, bouncer, and decision record MUST remain readable
and operable through the product after the new version ships. Stored-data changes MUST be
additive and safe for existing rows, and new publish restrictions MUST preserve the explicitly
approved grandfathering rule. Successful steps in multi-step wallet flows MUST remain resumable
and MUST NOT be repeated after a later-step failure.

### V. Accessible and Recoverable Experience

Every primary journey MUST work at mobile and desktop widths with keyboard-visible focus,
programmatic control labels, non-color status text, touch-safe targets, and reduced-motion support.
Every asynchronous mutation MUST expose active, success, failure, and recovery behavior. Technical
interruptions MUST remain distinct from product verdict failures so owners always know the next
safe action.

## ETHOnline 2026 Continuity Constraints

- The feature MUST be complete and submitted before Sunday 2026-09-13 12:00 pm EDT; the delivery
  window is the seven days from 2026-09-06, with the cut order in `design.md` binding when the
  schedule slips (Direct broker, then agent CLI to API-only, then the DEX half of the brief).
- Only work committed during the event window is judged; documentation MUST separate pre-existing
  Hanami capabilities from in-window work with commit ranges, and commits MUST land daily.
- The Campaign contract MAY be upgraded only additively: a new factory and campaign version
  deployed beside the existing ones on 0G mainnet, with soulbound expiring tickets, the proof-of-
  human nullifier, and the ticket identifier recorded on chain. Existing campaigns stay readable.
- Every applicant interview MUST be preceded by a verified World proof-of-human (Selfie Check,
  or Orb/Device when Selfie Check is unavailable) or a verified AgentKit human-backed-agent proof;
  one human MUST get at most one attempt per campaign.
- The ledger brief MUST be read live from The Graph standardized subgraphs at interview time and
  presented as evidence, never as an automatic verdict; an unavailable brief MUST NOT block the
  interview.
- ENS integration, Merkle export changes, new personas, portrait or safety-report changes, and a
  public ticket page are out of scope.
- A new demo video of 2 to 4 minutes at 720p or better, a World feedback document, and documented
  AI-tool usage are required deliverables.
- The eight-scenario safety report MUST continue to use 0G Compute with TEE verification and
  persist its safe summary to 0G Storage.
- The existing Japanese gallery identity and Wave 3 production conventions MUST be preserved.
- Private prompts, reasoning, ledger data beyond the applicant's own brief, and proof material
  MUST remain excluded from public or other-applicant-facing surfaces.

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

This constitution governs Hanami planning and delivery for the ETHOnline 2026 Continuity entry. Conflicting specifications, plans,
tasks, or implementation choices MUST be changed to comply; the constitution MUST NOT be silently
weakened. Amendments require explicit user approval, a documented rationale, an updated Sync Impact
Report, and a semantic-version change. Every pre-implementation analysis and final review MUST
check compliance with all MUST statements.

**Version**: 2.0.0 | **Ratified**: 2026-08-20 | **Last Amended**: 2026-09-06
