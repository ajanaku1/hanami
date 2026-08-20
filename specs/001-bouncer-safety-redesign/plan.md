# Implementation Plan: Bouncer Safety Certification and Production Redesign

**Branch**: `001-bouncer-safety-redesign` | **Date**: 2026-08-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-bouncer-safety-redesign/spec.md`

## Summary

Add an owner-authorized, persistent eight-scenario safety runner that evaluates exact bouncer
persona/lorebook content through the existing 0G TEE inference path, checkpoints privacy-safe
results in libSQL, uploads a passing report to 0G Storage, and gates draft preparation/minting or
new publication on the matching certification. Preserve existing contracts and grandfather
already-public campaigns through an additive publication-policy migration. Redesign the frontend
around a shared accessible shell and a proof-led Create -> Safety -> Mint -> Admin journey, with
responsive upgrades across all existing routes.

## Technical Context

**Language/Version**: TypeScript 5.6+ on Node.js 22 for the backend; TypeScript 5 with React 19.2
and Next.js 16.2 for the frontend; Solidity 0.8.24 remains unchanged

**Primary Dependencies**: Hono 4.6, libSQL client 0.17, viem 2.x, zod 3.23, 0G Compute Router,
`@0gfoundation/0g-storage-ts-sdk` 1.2.9, wagmi 3.6, TanStack Query 5, Tailwind CSS 4

**Storage**: Additive Turso/libSQL safety-run and result records; privacy-safe completed report on
0G Storage; existing 0G Storage persona/lorebook roots and existing on-chain campaign data

**Testing**: Node built-in test runner through `tsx --test` for backend unit/integration tests;
Vitest with jsdom and React Testing Library for frontend behavior; existing Foundry suite for
unchanged contract regression; Next build/lint, responsive browser checks, HTTP/live evidence
checks, and the independent completion checker

**Target Platform**: Responsive browser application on Vercel with a single Node.js backend on a
512 MB Render instance and 0G mainnet services

**Project Type**: Existing full-stack web application with frontend, backend, and unchanged smart
contract workspace

**Performance Goals**: Complete or reach an actionable interruption for a normal eight-scenario
run within five minutes; recover a persisted run within ten seconds; preserve responsive interaction
at reference 390x844 and 1280x800 viewports

**Constraints**: Three-day implementation; no new contract or contract deployment; exact-content
certification; no private prompts, full replies, or reasoning in reports/logs; fail closed on TEE
verification; one 0G Router credential shared by chat and safety work; process restarts must not lose
completed scenarios; existing public campaigns must remain public

**Scale/Scope**: Eight fixed scenarios, at most two scenario workers per active run, one globally
paced inference queue per backend process, six current frontend routes plus shared components, and
one new backend sub-route group with additive schema changes

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- **Truthful evidence**: The report contains real TEE states and a real 0G Storage root; docs and
  verification explicitly distinguish new Wave 3 work. PASS.
- **Privacy and fail-closed attestation**: Persisted results exclude prompt/reply content, and any
  unverified response becomes an interruption rather than certification. PASS.
- **Test-first traceability**: Requirements retain FR/SC IDs; tasks place failing tests before each
  implementation slice; quickstart scenarios become verification assertions. PASS.
- **Backward-compatible delivery**: Contracts are untouched, migrations are additive, existing
  public rows receive legacy-public policy, and completed mint steps remain resumable. PASS.
- **Accessible and recoverable experience**: Shared components cover focus, semantics, touch,
  reduced motion, explicit states, and responsive reference widths. PASS.
- **Wave 3 scope**: No excluded subsystem is introduced and the implementation is bounded to the
  approved three-day critical journey. PASS.

## Project Structure

### Documentation (this feature)

```text
specs/001-bouncer-safety-redesign/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── safety-api.openapi.yaml
├── checklists/
│   ├── requirements.md
│   └── release.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── db/
│   │   ├── index.ts
│   │   └── schema.sql
│   ├── safety/
│   │   ├── auth.ts
│   │   ├── content-hash.ts
│   │   ├── report.ts
│   │   ├── repository.ts
│   │   ├── routes.ts
│   │   ├── runner.ts
│   │   ├── scenarios.ts
│   │   └── types.ts
│   ├── bouncer.ts
│   ├── og-compute.ts
│   ├── og-storage.ts
│   └── server.ts
├── test/
│   ├── safety-auth.test.ts
│   ├── safety-content-hash.test.ts
│   ├── safety-report.test.ts
│   ├── safety-runner.test.ts
│   └── safety-routes.test.ts
└── package.json

frontend/
├── src/
│   ├── app/
│   │   ├── c/[slug]/admin/page.tsx
│   │   ├── c/[slug]/page.tsx
│   │   ├── create/page.tsx
│   │   ├── gallery/page.tsx
│   │   ├── mine/page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── safety/SafetyReport.tsx
│   │   ├── ui/AppHeader.tsx
│   │   ├── ui/AsyncNotice.tsx
│   │   ├── ui/Button.tsx
│   │   ├── ui/Field.tsx
│   │   ├── ui/PageShell.tsx
│   │   └── ui/StatusBadge.tsx
│   ├── hooks/useSafetyRun.ts
│   └── lib/
│       ├── api.ts
│       ├── content-hash.ts
│       └── safety.ts
├── test/
│   ├── content-hash.test.ts
│   ├── safety-report.test.tsx
│   └── setup.ts
└── package.json

contracts/
└── test/                    # existing Foundry regression suite only

docs/
├── architecture.excalidraw
└── architecture.png
```

**Structure Decision**: Keep the current three-workspace repository. Isolate new backend behavior
under `backend/src/safety/` and mount it from the existing Hono server so safety orchestration does
not enlarge the already broad route file. Add a small shared frontend UI layer and one focused
safety hook/component; redesign current routes in place. Do not create a shared package or a fourth
workspace inside the three-day boundary.

## Phase 0: Research Decisions

The resolved decisions and rejected alternatives are recorded in [research.md](research.md). No
`NEEDS CLARIFICATION` items remain.

## Phase 1: Design and Contracts

- [data-model.md](data-model.md) defines additive tables, content identity, publication policy, and
  certification/run state transitions.
- [contracts/safety-api.openapi.yaml](contracts/safety-api.openapi.yaml) defines owner-authorized
  start/resume operations, privacy-safe polling, preparation gating, publication errors, and safety
  metadata added to campaign responses.
- [quickstart.md](quickstart.md) defines the runnable red-green, responsive, live-integration, and
  evidence validation path.

## Post-Design Constitution Re-check

All pre-research gates remain PASS. The design introduces no contract changes, no private-content
report fields, no unverified-success state, and no requirement without an identified validation
path. No complexity exception is required.

## Complexity Tracking

No constitution violations or additional project workspaces require justification.
