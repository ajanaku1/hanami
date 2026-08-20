# Phase 1 Quickstart: Validation Guide

This guide is the runnable validation path for the approved feature. It is not implementation code.
Run local deterministic checks before any live 0G run so development does not consume unnecessary
compute or storage credit.

## Prerequisites

- Node.js 22 and npm
- Foundry for unchanged-contract regression
- Existing backend environment variables for Turso and 0G services
- Existing frontend backend URL and wallet configuration
- A funded 0G owner wallet for the final live proof only

## 1. Install and compile

```bash
cd backend
npm install
npm run build

cd ../frontend
npm install
npm run build
```

Expected: both TypeScript workspaces compile without errors.

## 2. Run the deterministic test suites

```bash
cd backend
npm test

cd ../frontend
npm test

cd ../contracts
forge test --offline
```

Expected:

- backend tests prove exact content hashing, owner signatures, strict 8/8 gating, interruption
  classification, privacy-safe reports, checkpoint resume, prepare enforcement, and grandfathering;
- frontend tests prove draft recovery, full decision disclosure, transaction-state recovery,
  action-scoped applicant retry, and safety panel semantics;
- all 16 existing contract tests remain green with no contract diff.

Recorded on 2026-08-20: 36 backend tests, 20 frontend tests, and 16 Foundry tests passed.
The frontend lint gate also passed. The production build is repeated in the release verifier with
network access because `next/font` downloads the three pinned Google font families at build time.

## 3. Start the local application

```bash
cd backend
npm run dev
```

In another terminal:

```bash
cd frontend
npm run dev
```

Expected: backend health responds and frontend routes load without console errors.

## 4. Exercise deterministic safety fixtures

Use the test-only injected inference fixture, never a production endpoint flag, to verify:

1. Eight matching and TEE-verified results persist a safe report and enable certified prepare.
2. One wrong decision returns `failed` and keeps prepare locked.
3. One missing or false TEE state returns `interrupted`, never `failed` or `passed`.
4. A technical exception resumes without re-running completed scenario rows.
5. Editing one whitespace character changes the content hash and invalidates the client state.
6. A report serialization scan finds none of the supplied persona, lorebook, messages, replies, or
   reasoning fixture strings.

Expected: each behavior is represented by a failing test before implementation and a passing test
after its smallest implementation slice.

## 5. Verify publication compatibility

With a temporary local libSQL database, seed:

- one public existing campaign;
- one private existing campaign;
- one newly indexed certified campaign.

Run the migration and exercise visibility changes.

Expected:

- the existing public campaign remains public and reports `legacy-public`;
- the existing private campaign reports `required` and public transition returns
  `CERTIFICATION_REQUIRED`;
- changing the legacy campaign to private permanently makes certification required;
- the certified campaign can publish through the existing signed visibility action.

## 6. Verify the responsive product story

Inspect Landing, Create, Gallery, Mine, Applicant, and Admin at 390x844 and 1280x800.

Expected:

- no page-level horizontal scrolling, clipped primary action, or wrapped wordmark;
- every primary control is keyboard reachable with visible focus;
- statuses use text as well as color;
- reduced-motion preference removes decorative and card-flip motion;
- card facts and primary actions remain available without hover;
- Admin applicant records remain readable on mobile;
- Create distinguishes the gasless safety signature from three on-chain transactions;
- Applicant explains length, privacy, TEE/0G, and certification before wallet connection.

## 7. Run one owner-approved live 0G proof

Only after deterministic checks pass, start one real draft safety run from the deployed or local app
using the configured mainnet backend.

Expected:

1. Eight scenarios show real TEE-verified progress.
2. The terminal status is pass, fail, or actionable interruption within five minutes under normal
   dependency availability.
3. A pass exposes a real `0g://` report root.
4. The report downloads through 0G Storage and contains exactly eight safe scenario summaries.
5. The report contains no persona, lorebook, complete simulated reply, hidden instruction, or
   reasoning text.

## 8. Verify deployed evidence

Run the repository verification script and check:

- deployed frontend and backend health;
- 0G Storage report retrieval;
- existing mainnet registry/factory addresses and Chainscan links;
- no smart contract source or deployed address changed;
- README and architecture identify the Wave 3 delta and preserve the existing video.

Finally run the independent checker specified by repository instructions. Exit 0 with no degraded
access is required before completion can be reported.
