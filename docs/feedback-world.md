# Feedback: building the Door on World ID and AgentKit

Written while building Hanami's Door for ETHOnline 2026 — a World proof-of-human in front of every
bouncer interview, plus an AgentKit path so an agent can apply for a person. Everything below is
something we hit, with the version we hit it on and the workaround we shipped. Nothing here is
second-hand.

Versions: `@worldcoin/idkit` 4.x (browser), `@worldcoin/idkit-server` 1.1.1,
`@worldcoin/agentkit` 0.2.1, `@worldcoin/agentkit-core`, verify endpoint `/api/v4/verify/{rp_id}`.

## What worked without friction

- **One verify endpoint for all three credentials.** Selfie Check, Orb and Device proofs all verify
  through `POST /api/v4/verify/{rp_id}` with no field remapping, including legacy 3.0 proofs when
  `allow_legacy_proofs` is set. Our `credentialOf()` is six lines and that is all the branching the
  server needed.
- **The nullifier is exactly the primitive the product needed.** "One person, one attempt per
  campaign" is a `UNIQUE(campaign_slug, nullifier)` constraint and nothing else. We never store a
  proof, and the only thing that survives a verification is an identifier that names nobody.
- **AgentBook's `lookupHuman` is the right shape.** One call, address in, anonymous human id out,
  `null` when unregistered. It let the agent path reuse the same `proofs` table and the same
  one-person-one-attempt rule as the browser path, with no second code path for decisions.

## 1. `rp_context` is required to open IDKit, and the docs do not lead with it

**What we expected**, from the quickstart: `app_id`, `action`, and a signal are enough to open the
widget.

**What happens**: IDKit 4.x will not open a request without an `rp_context` — a fresh nonce, a
validity window, and the RP's ECDSA signature over both. The signature must be produced server-side
from an RP signing key issued in the Developer Portal. There is no browser-only path.

**Why it cost us a day**: nothing in the failure says "you are missing a signed request context".
The widget simply does not open, and the first place you look is your `app_id`.

**What we shipped**: `@worldcoin/idkit-server`'s `signRequest`, behind
`GET /api/campaigns/:slug/door/context`, minting one signed context per request because the nonce is
single-use. Without the key configured the endpoint answers 503 and the panel says the Door is
unavailable, rather than handing the browser something World will refuse.

**Suggestion**: put the RP signing key in the first code block of the quickstart, next to `app_id`.
It is not an advanced topic; it is the difference between the widget opening and not.

## 2. Selfie Check is flag-gated, and the fallback is the app's problem

Selfie Check has to be requested per app through a form, and until it is granted the preset is
simply not available. That is reasonable, but it means every integration needs a credential fallback
from day one, and the SDK does not offer one — you cannot ask for "Selfie Check, or Orb if that is
what this person has".

**What we shipped**: a strength ordering (`device` 1 < `selfie` 2 < `orb` 3) and a campaign-level
"required credential", so a campaign asking for a device check is satisfied by an Orb but not the
reverse. A `verification_level` weaker than the campaign asked for answers 412 and says which
credential was presented.

**Suggestion**: ship this ordering in the SDK. Every app that offers more than one credential is
writing the same eight lines, and getting the direction wrong is a silent security downgrade.

## 3. AgentKit: "not registered" and "could not ask" must not look the same

`lookupHuman` returns `null` for an agent AgentBook has never seen, and throws when the World Chain
RPC is unreachable. Both are easy to collapse into one "unregistered" branch — and that is a bad
failure, because it tells a correctly registered agent to go and register again, which it cannot
do (only the human can approve, from World App).

**What we shipped**: `null` is 403 with the exact `agentkit-cli register` command; a throw is 503
with `retryable: true` and no mention of registration. Our own checklist item CHK026 exists only to
keep that distinction, and there is a test asserting the 503 body never says "unregistered".

**Suggestion**: have `lookupHuman` return a three-state result (`registered` / `not-registered` /
`unavailable`) rather than `string | null` plus an exception. The type would make the mistake
impossible instead of merely documented.

## 4. The 402 challenge reads as a payment, and for us it is not

AgentKit rides on x402, so the natural way to challenge an agent is a `402 Payment Required` with the
agentkit extension in `free` mode. Nothing is charged, but the status code says otherwise, and any
generic HTTP client, log dashboard or reverse proxy will read it as a paywall.

There is also no signal on the request that says "I am an agent, challenge me". Blanket-challenging
would send a 402 to every browser applicant, so we gate the challenge on a client hint
(`x-hanami-client: agent`) that our CLI sets, and browsers never meet a 402.

**Suggestion**: document the client-hint pattern in the AgentKit guide, or define a header for it.
Every server offering both a human and an agent path has to solve this, and the obvious solutions
(challenge everyone; sniff the user agent) are both wrong.

## 5. Sandbox states are hard to exercise deliberately

Testing the Door's refusals — an already-used nullifier, a credential weaker than required, the
verifier being unreachable — meant simulating them at our own boundary, because the sandbox will
happily issue a good proof and little else. We ended up with an injected `verifyProof` in tests and a
World call in production, which is the right shape anyway, but it means the refusal paths are proven
against our model of World rather than against World.

**Suggestion**: sandbox app ids that always return a specific outcome (rejected, already-used, 5xx)
would make refusal handling testable end to end. This is the single thing that would most improve
integration quality.

## Smaller notes

- The Developer Portal's action id and the `action` string passed to IDKit must match exactly, and a
  mismatch surfaces as a generic verification failure rather than "unknown action".
- `verification_level` values differ between what the widget reports and what the verify response
  echoes (`selfie` vs `selfie_check`, `device` vs `secure_document`); we normalise both.
- `parseAgentkitHeader` throws rather than returning a result, so every caller needs a try/catch to
  avoid a malformed header becoming a 500.

## Reproducing any of this

The Door is `backend/src/door/` and the agent path is `backend/src/door/agentkit.ts`, both tested in
`backend/test/door-*.test.ts` with no network. `cd backend && npm test` runs them. The live Door
needs `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_ACTION`, and `WORLD_RP_SIGNING_KEY`; the agent path needs
a registered agent wallet and nothing else.
