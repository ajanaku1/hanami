# Hanami Wave 3 submission notes

## Submission copy

The Wave 2 judge was right: Hanami already had its 0G foundation, so this wave needed a product change rather than another documentation pass.

I built a Bouncer Safety Report that sits in front of mint and publication. An owner signs one gasless request for the exact persona and lorebook they are about to use. Hanami runs eight fixed simulations through the existing 0G Compute TEE path, checkpoints each result, and requires all eight expected decisions plus eight verified TEE responses. A wrong decision fails the report. A provider, network, storage, or attestation problem interrupts it and can be resumed without repeating completed checks.

A pass writes a privacy-safe report to 0G Storage and returns its root. The report contains the content hash, scenario names, expected and actual decisions, and TEE state. It does not contain the persona, lorebook, simulated replies, hidden instructions, or reasoning. The backend now refuses to prepare or index a new campaign unless that report matches the exact draft. New campaigns start private. Admin applies the same gate before publication while leaving campaigns that were already public operational and clearly marked as legacy.

I also rebuilt the interface around that flow. Create now explains the gasless safety step before the three on-chain wallet transactions, shows an eight-row report, locks mint until 8/8, and preserves completed mint steps on retry. Landing, Admin, Applicant, Gallery, and Mine now share a responsive product shell, persisted light/dark themes, visible focus states, touch-safe controls, reduced motion, explicit loading/error states, and campaign certification labels.

This is new development from this wave, not a relabeling of the existing demo.

## What changed in this wave

| Wave 3 work | Reproducible evidence |
| --- | --- |
| Exact-content owner authorization and additive safety persistence | `138a0c8`, backend safety tests |
| Eight fixed, TEE-required scenarios with two-worker pacing, checkpoints, and report retry | `138a0c8`, `backend/test/safety-runner.test.ts` |
| Backend-enforced mint and publication gates with legacy-public compatibility | `130905c`, campaign/prepare/visibility tests |
| Eight-row Bouncer Safety Report and owner recovery flow | `130905c`, frontend safety tests |
| Production redesign across all current routes | `130905c`, responsive screenshots and UI audit |
| Refresh recovery plus transaction- and message-scoped retry | `4ec1863`, frontend recovery tests |
| Updated architecture and verification contract | `5922490` through `130905c`, `verify.sh` |

## What predates this wave

The deployed ERC-7857 bouncer contract, CampaignFactory, applicant interview, per-decision TEE attestation, Verify on 0G panel, Merkle export, and current demo video were already part of Hanami. Wave 3 builds a certification and publication layer on top of them. It does not claim those earlier features as new work.

## Product evidence

- Live app: [hanami-hazel.vercel.app](https://hanami-hazel.vercel.app)
- Source: [github.com/ajanaku1/hanami](https://github.com/ajanaku1/hanami)
- Wave 3 feature commit: [`130905c`](https://github.com/ajanaku1/hanami/commit/130905c)
- BouncerRegistry: [`0x764883319e51e46F683aB54D93F26bcBb74A7030`](https://chainscan.0g.ai/address/0x764883319e51e46F683aB54D93F26bcBb74A7030)
- CampaignFactory: [`0xfe6b2417407595Ad4d1F8D4D8c95860881d539d4`](https://chainscan.0g.ai/address/0xfe6b2417407595Ad4d1F8D4D8c95860881d539d4)
- Architecture: [editable source](architecture.excalidraw) and [rendered PNG](architecture.png)

## Production redesign screenshots

| Desktop | Mobile |
| --- | --- |
| [Landing](images/wave3-home-desktop.png) | [Landing](images/wave3-home-mobile.png) |
| [Create and safety gate](images/wave3-create-desktop.png) | [Create and safety gate](images/wave3-create-mobile.png) |

Additional mobile checks: [Gallery](images/wave3-gallery-mobile.png) and [Mine](images/wave3-mine-mobile.png).

Post-deployment fixture checks:

| Applicant | Admin |
| --- | --- |
| [Desktop](images/wave3-applicant-desktop.png) | [Desktop](images/wave3-admin-desktop.png) |
| [390×844 mobile](images/wave3-applicant-mobile.png) | [390×844 mobile](images/wave3-admin-mobile.png) |

Both mobile fixtures measured a 390 px document width at a 390 px viewport. The Admin fixture
rendered nine applicant records without page-level horizontal overflow.

## Existing demo video

The existing demo video remains the submission video because the underlying mint, applicant interview, attestation, Admin, and Merkle flow did not change. The new screenshots above explain the Wave 3 safety gate and production redesign. No replacement video is needed.

## Live safety evidence

Recorded from the deployed app and backend on 2026-08-20:

- Safety run ID: `6f56d744-2fe8-4e87-8497-c8df8c5ca56d`
- Result: 8/8 expected decisions with TEE verification on every scenario
- Duration: 44 seconds
- 0G report root: `0xb4cfb0b28b3f7340a5a1cfab8d6c98521b0ce134fc9fc5878d6ea9fc788f2271`
- Retrieval: 1,672-byte report downloaded from 0G Storage with proof verification enabled
- Privacy scan: no persona, lorebook, complete reply, hidden instruction, reasoning, or transcript

The public [run record](https://hanami-backend-ugak.onrender.com/api/safety-runs/6f56d744-2fe8-4e87-8497-c8df8c5ca56d)
exposes only the reproducible scenario decisions, TEE state, and report root.

Additional production evidence recorded on 2026-08-21:

| Bouncer | ERC-7857 token | Result | 0G report root |
|---|---:|---|---|
| Sakura Society | #17 | [8/8, every TEE true](https://hanami-backend-ugak.onrender.com/api/safety-runs/574de9be-2265-469a-b70d-582a390eee37) | `0x9f2550dcca4e96223323969fed28e19cc9b455edc8c8a19edb0b3e6e679cabf6` |
| Material Memory | #21 | [8/8, every TEE true](https://hanami-backend-ugak.onrender.com/api/safety-runs/92fba213-8cad-4c29-ac4c-f5ae91b6532e) | `0x9e15298a7ab74a3b069cb2761b6332b4217d11b383254e7a77906c69cc9a7972` |
| Slow Collectors Circle | #22 | [8/8, every TEE true](https://hanami-backend-ugak.onrender.com/api/safety-runs/953745fb-bf03-4f0a-9115-284087f6a0be) | `0x71067714829e2d2c602327f0f772f8245d22e3a99d293ae64580bd4aaf123295` |

The two new tokens are owned by the project wallet, authorize the production backend on chain, and have separate deployed Campaign contracts. Both campaigns remain private by default until the owner deliberately publishes them.

## Verification

Run from the repository root:

```bash
./verify.sh release
./verify.sh live
```

The release check covers backend tests/build, frontend tests/lint/build, all existing Foundry tests, unchanged deployed contract sources, and documentation. The live check resolves the deployed safety UI and API, the recorded report root, and both 0G mainnet contract addresses.
