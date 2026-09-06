# Feature Specification: Human Door, Ledger Brief, and Soulbound Tickets

**Feature Branch**: `002-human-door-tickets`

**Created**: 2026-09-06

**Status**: Draft

**Input**: User description: "ETHOnline 2026 Continuity: World proof-of-human door, Graph ledger brief as bouncer evidence, soulbound expiring tickets on 0G, agent CLI via AgentKit, Direct broker attestation" (approved design: `design.md`; competition evidence: `loop/memory/ethonline-2026-ideation-v2-report.md`)

## Clarifications

### Session 2026-09-06

- Q: When an owner does not set a ticket expiry, what should the default be, given campaigns have no close date today? → A: Campaigns get a required close date-time set by the owner at creation (or in Admin when enabling tickets on an existing campaign); ticket expiry defaults to the campaign close and is editable per campaign. No open-ended default. After the close date the Door refuses new applicants with "this campaign has closed".
- Q: Over what time window should the ledger brief read the applicant's marketplace and exchange history? → A: All-time, capped at the 500 most recent marketplace trades and the 500 most recent swaps; when a cap is hit the brief states that older activity was not read.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Door: prove a person is present before any interview (Priority: P1)

An applicant opens a campaign, connects a wallet, and is shown one step before the chat: prove there is a person behind the screen using the credential the campaign requires. Once the proof is verified, that person is bound to this wallet for this campaign and may proceed to the interview. Without a verified proof there is no chat.

**Why this priority**: It is the abuse-prevention mechanic the whole entry rests on, and it is the first thing a judge sees.

**Independent Test**: Open a campaign with a fresh wallet, attempt to send a message before proving, observe refusal; complete the proof in the sandbox app, observe the interview unlocking; attempt a second proof with the same person from another wallet, observe refusal with a reason.

**Acceptance Scenarios**:

1. **Given** a connected wallet with no proof, **When** the applicant tries to start or continue an interview, **Then** the request is refused and the Door is shown with the required credential named.
2. **Given** the Door is shown, **When** the applicant completes the required credential in the sandbox app, **Then** the proof is verified, the applicant sees "verified", and the interview becomes available.
3. **Given** a person has already used their proof on this campaign, **When** the same person proves from a different wallet, **Then** the Door refuses with "this person has already applied" and no interview starts.
4. **Given** a campaign requires Selfie Check and the applicant's app cannot provide it, **When** the applicant opens the Door, **Then** the message names the missing credential and offers no alternative.
5. **Given** a proof is rejected, **When** the applicant retries, **Then** the Door allows another attempt without losing the connected wallet.

---

### User Story 2 - The Ticket: approval becomes a revocable, expiring object on 0G (Priority: P1)

When the bouncer approves an applicant, the campaign issues a ticket to the applicant's wallet on 0G: one per wallet, non-transferable, with an expiry that defaults to the campaign close. The verdict, the proof-of-human, and the ticket are recorded together. The owner can revoke a ticket from the Roster. A demo mint contract admits a wallet only while its ticket is live.

**Why this priority**: It is the new on-chain work a 0G judge scores and the whitelist output the product promises.

**Independent Test**: Approve one applicant and observe exactly one ticket with the expected expiry; call the demo mint with that wallet and observe success; revoke from the Roster and observe the mint refusing that wallet.

**Acceptance Scenarios**:

1. **Given** an interview ends in approval, **When** the decision is recorded, **Then** exactly one ticket exists for that wallet with the campaign's configured expiry, and the decision record carries the attestation, the proof-of-human identifier, and the ticket identifier together.
2. **Given** an interview ends in rejection, **When** the decision is recorded, **Then** no ticket exists and the receipt shows the decision without a ticket.
3. **Given** a live ticket, **When** the demo mint contract is called by that wallet, **Then** the mint succeeds; **When** called by a wallet without a live ticket, **Then** it is refused.
4. **Given** a live ticket, **When** the owner revokes it from the Roster and confirms in the wallet, **Then** the ticket shows "revoked", the demo mint refuses that wallet, and the Roster row reflects the chain state.
5. **Given** a ticket past its expiry, **When** the demo mint is called, **Then** it is refused and the Roster shows "expired".
6. **Given** campaigns created before this feature, **When** the product loads them, **Then** they remain readable and operable exactly as before.

---

### User Story 3 - The Ledger Brief: the bouncer reads the applicant's real record (Priority: P2)

After the Door, the product reads the applicant's wallet across several NFT marketplaces and decentralized exchanges using one shared data schema and produces a short brief: NFTs sold within seven days of mint, sales back to the same counterparty, median holding time, and swap count. The brief is shown to the applicant, given to the bouncer as evidence it may cite, and listed on the receipt with the sources read.

**Why this priority**: It turns the "degen detector" persona from a prompt into a data-backed judgement and is the load-bearing use of The Graph.

**Independent Test**: Apply with a wallet that has marketplace history and observe a populated brief naming at least two sources; apply with a fresh wallet and observe an "empty history" brief; simulate the data provider being unreachable and observe the interview proceeding with "brief unavailable" on the receipt.

**Acceptance Scenarios**:

1. **Given** a verified applicant whose wallet has marketplace and exchange history, **When** the brief is read, **Then** it shows the four figures and names at least two sources read.
2. **Given** a verified applicant with no history, **When** the brief is read, **Then** it shows "empty history" and the interview proceeds.
3. **Given** the data provider is unreachable, **When** the brief is read, **Then** the interview proceeds, the bouncer is told it has no ledger evidence, and the receipt states the brief was unavailable.
4. **Given** a brief exists, **When** the bouncer decides, **Then** the transcript stored with the decision includes the brief, and the Roster row shows its summary.
5. **Given** a brief with clear flip activity, **When** the bouncer reasons, **Then** it may cite the brief, but the brief alone never produces a decision.

---

### User Story 4 - Verify on 0G: three facts side by side (Priority: P2)

Anyone viewing a decision can see the attestation, the proof-of-human identifier, and the ticket identifier together, recompute the on-chain hash in the browser, and, when the decision was signed inside the enclave, recover the enclave signer and match it to the provider's registered signer.

**Why this priority**: It is how a 0G judge confirms that the new record and the enclave signature are real without trusting the README.

**Independent Test**: Open Verify on a new decision, observe three identifiers, run the in-browser recompute, and observe the match; for an enclave-signed decision, observe the recovered signer matching the registered one.

**Acceptance Scenarios**:

1. **Given** a decision recorded with this feature, **When** Verify is opened, **Then** attestation, proof-of-human identifier, and ticket identifier are shown and the recomputed hash matches the chain.
2. **Given** the decision turn was signed inside the enclave, **When** Verify runs, **Then** the recovered signer equals the provider's registered signer and the panel says so.
3. **Given** the enclave path was unavailable and the fallback path was used, **When** Verify runs, **Then** the panel says which path produced the attestation.

---

### User Story 5 - Owner controls: credential choice, expiry, Roster (Priority: P2)

A campaign owner chooses the required credential and the ticket expiry when creating a campaign, or from Admin for an existing campaign. Admin gains a Roster tab listing tickets with wallet, issued, expiry, status, the brief summary the bouncer saw, an "applied via agent" mark where relevant, and a Revoke action.

**Why this priority**: Without it the Door and Ticket cannot be configured or demonstrated end to end by an owner.

**Independent Test**: Create a campaign choosing a credential and expiry; open Admin and observe the Roster after one approval; revoke and observe the change.

**Acceptance Scenarios**:

1. **Given** the create form, **When** the owner selects a credential, sets a campaign close date-time, and optionally overrides the ticket expiry, **Then** the campaign enforces that credential at the Door, refuses new applicants after the close, and issues tickets with the configured expiry (the close by default).
2. **Given** an existing campaign without a credential set, **When** the owner sets one in Admin, **Then** new applicants meet the Door; applicants already decided are unaffected.
3. **Given** approved applicants, **When** the owner opens the Roster, **Then** each ticket row shows wallet, issued, expiry, status, the brief summary, and the "via agent" mark when applicable.
4. **Given** the Gallery or Mine page, **When** a campaign card renders, **Then** it shows the live ticket count.

---

### User Story 6 - Agent applicant: a human-backed agent applies once (Priority: P3)

A human registers an agent once with the World agent registry. From the terminal, the agent applies to a campaign on the human's behalf: its registry proof satisfies the Door in place of the QR step, it conducts the interview itself, it prints the receipt, and any ticket is issued to the wallet the human chose. The Roster marks the application "via agent" with the agent's registry identifier. One human still gets one attempt.

**Why this priority**: It unlocks the World agent track and shows the Door working for non-browser applicants, but the core product works without it.

**Independent Test**: Run the shipped command against a live campaign with a registered agent and observe a receipt and a ticket without any browser interaction; run it twice for the same human and observe the second refusal.

**Acceptance Scenarios**:

1. **Given** a registered agent and a campaign URL, **When** the command runs, **Then** the Door accepts the registry proof, the interview completes, the receipt prints, and the ticket issues to the chosen wallet.
2. **Given** the same human's agent applies again to the same campaign, **When** the command runs, **Then** the Door refuses with the same reason a browser applicant would see.
3. **Given** an unregistered agent, **When** the command runs, **Then** it stops at the Door with a message explaining registration is required.

---

### Edge Cases

- The proof verifies but the wallet disconnects before the interview starts: the proof stays bound to that wallet and campaign; reconnecting the same wallet resumes at the interview.
- The decision is recorded on chain but ticket issuance fails: the applicant sees a recoverable technical failure, not a rejection, and the owner can retry issuance from the Roster without re-interviewing.
- The brief read exceeds its time budget: the interview proceeds with "brief unavailable"; a late result is discarded.
- A campaign close or ticket expiry is set earlier than the current time: the form refuses the value.
- An applicant arrives after the campaign close: the Door refuses with "this campaign has closed" before any proof is requested.
- A campaign's whitelist cap is reached: the Door still verifies, but the applicant is told the campaign is full before any interview.
- Two proofs arrive for the same person within seconds from two wallets: exactly one is accepted.
- Revoke is confirmed in the wallet but the transaction fails: the row stays "live" and the owner sees the failure with a retry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST require a verified proof-of-human, using the credential the campaign specifies, before any interview message is accepted for that wallet on that campaign.
- **FR-002**: The system MUST bind each verified proof to one wallet and one campaign, and MUST refuse a second attempt by the same person on the same campaign regardless of wallet.
- **FR-003**: The system MUST accept a verified human-backed-agent registry proof as satisfying FR-001 for applicants arriving without a browser.
- **FR-004**: The system MUST require an owner to set a campaign close date-time and choose the required credential at campaign creation, MUST default the ticket expiry to the campaign close while allowing an override, MUST let an owner set these for an existing campaign from Admin without re-minting the bouncer, and MUST refuse new applicants at the Door after the close.
- **FR-005**: On approval, the system MUST issue exactly one non-transferable ticket to the approved wallet on 0G with the campaign's configured expiry, and MUST issue none on rejection.
- **FR-006**: The system MUST record, with each decision, the attestation, the proof-of-human identifier, and the ticket identifier together on 0G.
- **FR-007**: The system MUST let the owner revoke a live ticket with one confirmed wallet action, after which the ticket is not live.
- **FR-008**: The system MUST expose whether a wallet holds a live ticket so that an external mint contract can admit or refuse it, and MUST ship a demo mint that does so.
- **FR-009**: Existing campaigns, bouncers, and decisions MUST remain readable and operable after the feature ships.
- **FR-010**: After the Door, the system MUST read the applicant's all-time wallet activity across at least two NFT marketplaces and at least one exchange source via one shared schema, capped at the 500 most recent trades and 500 most recent swaps, and produce a brief with: sales within seven days of mint, sales back to the same counterparty, median holding time, swap count, the sources read, and a note when a cap truncated older activity.
- **FR-011**: The system MUST present the brief to the applicant and to the bouncer as evidence, MUST never decide from the brief alone, and MUST proceed with the interview when the brief is empty or unavailable, stating which on the receipt.
- **FR-012**: The system MUST store the brief with the decision transcript and show its summary in the Roster.
- **FR-013**: The receipt MUST show the decision, attestation, proof-of-human identifier, sources read, and, on approval, the ticket identifier with expiry and the words indicating it is non-transferable and revocable by the owner.
- **FR-014**: Verify MUST show attestation, proof-of-human identifier, and ticket identifier side by side, recompute the on-chain hash in the browser, and, for enclave-signed decisions, recover the signer and compare it with the provider's registered signer, stating which attestation path was used.
- **FR-015**: The decision turn MUST use the enclave-signed path when it is funded and reachable, and fall back to the existing verified path otherwise, recording which was used.
- **FR-016**: Admin MUST include a Roster listing each ticket's wallet, issued time, expiry, status (live, expired, revoked), brief summary, and an "applied via agent" mark with the agent's registry identifier where applicable.
- **FR-017**: Gallery and Mine cards MUST show the live ticket count per campaign.
- **FR-018**: The system MUST ship a runnable agent command that applies to a live campaign end to end without browser interaction and documents how a reviewer runs it.
- **FR-019**: Every new asynchronous action MUST expose active, success, failure, and recovery states, naming the network and what happens next, consistent with existing conventions.
- **FR-020**: Private persona text, hidden instructions, private reasoning, proof material, and any applicant's brief MUST NOT be shown to other applicants or on public surfaces.
- **FR-021**: The repository MUST document which capabilities pre-existed and which were built during the event, with commit ranges, plus a World feedback document and AI-tool usage.

### Key Entities

- **Campaign**: a whitelist round owned by a bouncer's owner; now carries a required credential, a close date-time, a ticket expiry (defaulting to the close), and a version indicating whether it issues tickets.
- **Proof of Human**: a verified credential or agent-registry proof bound to one wallet and one campaign; identified by a person-level identifier that cannot be reused on the same campaign.
- **Ledger Brief**: a per-applicant summary of all-time on-chain marketplace and exchange activity (capped at 500 trades and 500 swaps) with the list of sources read, a truncation note, and a status (ready, empty, unavailable).
- **Decision Record**: the bouncer's verdict with attestation, proof-of-human identifier, ticket identifier, attestation path, transcript, and brief.
- **Ticket**: a non-transferable, expiring, owner-revocable object on 0G held by an approved wallet; status live, expired, or revoked.
- **Agent Application**: an application made through a registered human-backed agent, carrying the agent's registry identifier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of attempts to send an interview message without a verified proof are refused.
- **SC-002**: 100% of second attempts by the same person on the same campaign are refused, across wallets.
- **SC-003**: Every approval on a ticket-issuing campaign yields exactly one ticket whose expiry equals the configured value; every rejection yields none.
- **SC-004**: A revoked or expired ticket is refused by the demo mint on the next attempt after the revocation confirms.
- **SC-005**: At least two live sources are named on every receipt where the brief is ready, and a fresh wallet produces an "empty history" receipt.
- **SC-006**: The Door, brief, and receipt add no more than 30 seconds to an applicant's journey when the data provider responds normally.
- **SC-007**: A reviewer can run the agent command from the README against a live campaign and obtain a receipt without touching the browser.
- **SC-008**: All previously certified campaigns load and operate unchanged after the feature ships.
- **SC-009**: The demo walkthrough covers Door, brief, interview, receipt, Verify, Roster revoke, demo mint accept and refuse, and the agent command in under three minutes.
- **SC-010**: The repository's continuity section lists the commit ranges of in-window work, and a World feedback document exists.

## Assumptions

- The World sandbox app and the credential feature flag are available to the team; if Selfie Check is not granted, campaigns use Orb or Device and the design's fallback applies.
- The standardized marketplace and exchange sources cover Ethereum mainnet activity; applicants' relevant history is on Ethereum mainnet for the demo.
- Tickets live on 0G mainnet where the existing contracts live; the demo mint is deployed there too. Merkle export remains for mints elsewhere and is unchanged.
- The enclave-signed path requires a funded ledger; funding is a configuration step, not a product feature.
- One human corresponds to one person-level identifier per campaign as provided by the credential system.
- ENS, new personas, portrait or safety-report changes, and a public ticket page are out of scope.
