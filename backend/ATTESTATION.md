# Attestation decision (Task #7)

## What the Router gives us

Sending `verify_tee: true` on any `/chat/completions` request triggers the Router to fetch the provider's TEE signature, look up the signer on-chain, and verify the signature before returning the response. The result lands in `x_0g_trace`:

```json
"x_0g_trace": {
  "request_id": "1be23333-7385-4def-9c6e-41957a8797b2",
  "provider": "0xa48f01287233509FD694a22Bf840225062E67836",
  "billing": { ... },
  "tee_verified": true
}
```

Confirmed working against `https://router-api-testnet.integratenetwork.work/v1` with `qwen/qwen-2.5-7b-instruct`.

## Decision

**Use Router-attested verification, not raw signatures.** For Hanami MVP, this is the right tradeoff:

- One extra request field, one extra response field — zero new SDK surface.
- `tee_verified: true` is a real check by the Router, not a placeholder.
- Independent signature verification via `@0gfoundation/0g-compute-ts-sdk` is a v2 hardening, not an MVP blocker.

## On-chain shape

`Campaign.recordDecision(applicant, approved, reasoningHash, attestationHash)` stores a 32-byte `attestationHash`. We compute:

```ts
attestationHash = keccak256(abi.encode(
  bytes32(request_id_as_hex_or_uuid_bytes),
  address(provider),
  bool(tee_verified)
));
```

This is a compact, replayable fingerprint binding the on-chain decision to a specific Router-verified TEE inference. Anyone can re-fetch the trace via the Router's audit endpoints (request_id is the lookup key) and recompute the hash to verify the on-chain record matches.

## Hard rule for the bouncer backend

If `tee_verified !== true` on any inference call during a campaign:

1. **Do not** commit `recordDecision` for that applicant turn.
2. Surface the failure to the admin dashboard.
3. Either retry against another provider (the Router can re-route) or fail the conversation.

In other words: an untrusted response is treated the same as a network failure — never silently downgraded to "approve anyway."

## What this means for the contracts

`attestationHash` stays `bytes32`. No interface change vs goal.md. The semantics behind the bytes32 are documented here, not in the contract — keeps the on-chain surface minimal.

## What this means for the frontend

The applicant receipt card displays:

> Decision attested by TEE — provider `0xa48f...7836` — [view on Chainscan]

The Chainscan link goes to the `recordDecision` tx where `attestationHash` is one of the parameters.
