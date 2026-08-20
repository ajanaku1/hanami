# Feature Specification: Bouncer Safety Certification and Production Redesign

**Feature Branch**: `001-bouncer-safety-redesign`

**Created**: 2026-08-20

**Status**: Draft

**Input**: Approved Hanami Wave 3 product design in `design.md`

## User Scenarios & Testing

### User Story 1 - Certify a Draft Before Minting (Priority: P1)

As a campaign owner, I want to test my draft bouncer against a fixed adversarial suite so that I
can mint only after its exact persona and lorebook demonstrate safe, TEE-verified decisions.

**Why this priority**: This is the primary new Wave 3 capability and the safety guarantee on which
the redesigned creator journey depends.

**Independent Test**: Use deterministic scenario outcomes to run a complete draft through pass,
fail, interruption, edit invalidation, and resume paths without publishing a campaign.

**Acceptance Scenarios**:

1. **Given** a complete private draft and its connected owner, **When** the owner signs the gasless
   safety request, **Then** eight named scenarios run with visible progress while draft inputs remain
   read-only.
2. **Given** all eight expected decisions are correct and all eight responses are TEE verified,
   **When** the report is persisted, **Then** the owner sees `8/8`, the report root, and
   **Certified to mint**, and mint becomes available for the tested content.
3. **Given** at least one completed scenario returns the wrong decision, **When** the run finishes,
   **Then** mint remains locked and the owner sees the failed scenario and expected-versus-actual
   decision without seeing private reasoning or full simulated replies.
4. **Given** a certified draft, **When** its persona or lorebook changes, **Then** certification is
   immediately invalidated and mint locks until the edited content passes a new full run.
5. **Given** a run is interrupted by a technical dependency, **When** the owner retries or returns
   after refresh or reconnect, **Then** the run resumes from recoverable state and the interruption
   is not counted as an incorrect verdict.

---

### User Story 2 - Control Publication from Admin (Priority: P1)

As an existing campaign owner, I want Admin to show whether my bouncer is certified and enforce
certification before new publication so that I cannot accidentally expose an untested private
bouncer while existing public campaigns remain usable.

**Why this priority**: Publication enforcement turns the report from a decorative test into a real
owner safety gate without breaking campaigns created before Wave 3.

**Independent Test**: Exercise public grandfathering, private campaign blocking, owner
authorization, successful certification, and public-to-private-to-public transitions using existing
campaign records.

**Acceptance Scenarios**:

1. **Given** a campaign that was public before the feature, **When** the feature launches, **Then**
   the campaign remains public and is visibly identified as not yet safety-certified.
2. **Given** an existing private campaign without a matching report, **When** its owner opens Admin,
   **Then** Admin shows **Safety check required** and prevents publication.
3. **Given** a grandfathered public campaign, **When** its owner makes it private, **Then** the
   grandfathered publication allowance ends and a passing report is required to publish it again.
4. **Given** an existing immutable bouncer passes all eight scenarios with verified TEE responses,
   **When** its report is persisted, **Then** Admin shows **Certified to publish** and enables the
   publication action.
5. **Given** a connected wallet that is not the campaign owner, **When** it attempts to start a test
   or change publication, **Then** the protected action remains unavailable.

---

### User Story 3 - Complete a Clear Production Creator Flow (Priority: P2)

As a first-time owner, I want a polished, understandable Create-to-Admin journey so that I know
what information is private, why each action is required, and which wallet confirmation comes next.

**Why this priority**: The new safety capability must feel like part of a credible product rather
than an isolated technical demonstration.

**Independent Test**: Complete the owner journey at mobile and desktop widths, including validation,
wallet connection, safety states, all three on-chain steps, retry of a later failed step, and the
success handoff to Admin.

**Acceptance Scenarios**:

1. **Given** an owner opens Create, **When** the page is ready, **Then** campaign identity, private
   intelligence, readiness, the gasless test signature, and the three later on-chain transactions
   are distinguishable before any wallet action.
2. **Given** a certified draft, **When** the owner starts minting, **Then** each of the three
   transactions has an explicit wallet, submitted, confirmed, failure, and retry state.
3. **Given** an earlier transaction succeeded and a later transaction failed, **When** the owner
   retries, **Then** completed transactions are not requested again.
4. **Given** the complete flow succeeds, **When** the success view appears, **Then** it provides the
   applicant link, bouncer identity, transaction and storage evidence, private publication state,
   sharing actions, and a route to Admin.

---

### User Story 4 - Understand and Complete a Trusted Interview (Priority: P2)

As an applicant, I want to understand the interview's length, privacy, and verification before
connecting so that I can participate with confidence and follow my progress to a clear outcome.

**Why this priority**: Applicant trust is central to Hanami's value and is the public-facing proof
that the production redesign supports the safety story.

**Independent Test**: Open a certified campaign without a wallet, connect, complete a three-to-six
turn conversation with loading and retry states, and inspect the final verdict and available
verification links on mobile and desktop.

**Acceptance Scenarios**:

1. **Given** an applicant has not connected, **When** they open a campaign, **Then** they can see the
   interview purpose, expected length, privacy statement, TEE-attested 0G statement, and available
   certification status before connecting.
2. **Given** an interview is active, **When** turns progress, **Then** the applicant sees turn
   progress, connected wallet, thinking or retry feedback, and a persistent private/TEE indicator.
3. **Given** the interview reaches a verdict, **When** the result appears, **Then** approval or
   rejection is explicit and available attestation and transaction evidence is reachable without
   exposing private reasoning.

---

### User Story 5 - Browse and Operate Hanami Responsively (Priority: P3)

As a visitor or owner, I want consistent navigation, campaign cards, and management surfaces so
that the whole product feels coherent and remains usable with touch, pointer, or keyboard.

**Why this priority**: Shared production quality prevents the redesigned critical journey from
feeling disconnected from the rest of Hanami.

**Independent Test**: Navigate Landing, Gallery, Mine, Applicant, Create, and Admin at reference
mobile and desktop widths using touch-equivalent input and keyboard only, including loading, empty,
error, and populated states.

**Acceptance Scenarios**:

1. **Given** any current route at a mobile or desktop width, **When** navigation and primary actions
   are used, **Then** the wordmark and controls remain readable, reachable, and free of horizontal
   page overflow.
2. **Given** a Gallery or Mine card, **When** it is viewed without hover, **Then** campaign status,
   certification, owner, capacity, destination chain, and the primary action remain available.
3. **Given** Admin contains applicant records, **When** it is viewed on a small screen, **Then** the
   records remain readable without forcing the entire page into horizontal scrolling.

### Edge Cases

- A run with eight correct decisions but one missing, false, or malformed TEE verification does not
  pass and is classified as a technical interruption.
- A completed compute run whose report cannot be persisted remains uncertified and offers a safe
  persistence retry without claiming success.
- Repeated start requests for the same owner, draft identity, and unchanged content return the
  current run rather than creating competing runs.
- A resume request whose persona or lorebook no longer matches the run cannot certify the edited
  draft.
- Disconnecting or changing wallets during a protected action cannot transfer ownership of the run
  or unlock owner-only controls.
- Empty optional lorebook content has a stable identity and can be certified; changing between empty
  and non-empty content invalidates the prior match.
- Long campaign names, wallet addresses, hashes, translated error text, and transaction links do not
  create page-level horizontal overflow.
- A failed second or third mint transaction preserves evidence of all earlier confirmed steps.
- Existing public campaigns with no Wave 3 report remain operational but are never presented as
  certified.
- Reduced-motion preferences remove decorative and non-essential movement without hiding state
  changes or content.

## Requirements

### Functional Requirements

#### Safety certification

- **FR-001**: Every new campaign draft MUST begin private and MUST NOT offer publication before it
  has a matching safety certification.
- **FR-002**: Only the connected owner MUST be able to authorize a safety run through a gasless
  wallet signature that is clearly distinguished from on-chain transactions.
- **FR-003**: Each safety run MUST contain exactly eight fixed scenarios grouped as thoughtful,
  low-effort, jailbreak, and edge-case scenarios.
- **FR-004**: The running report MUST show each scenario's name, category, progress, expected
  decision, actual decision when complete, and TEE-verification state.
- **FR-005**: Certification MUST require all eight actual decisions to match their expected
  decisions and all eight responses to be TEE verified.
- **FR-006**: Network, provider, rate-limit, persistence, and attestation-validation problems MUST be
  represented as technical interruptions and MUST NOT be counted as incorrect product decisions.
- **FR-007**: A certification MUST apply only to the exact persona and lorebook content tested.
- **FR-008**: Persona and lorebook inputs MUST remain read-only while their safety run is active.
- **FR-009**: An unfinished or interrupted run MUST remain recoverable after refresh and wallet
  reconnect without repeating completed scenario work.
- **FR-010**: A passing report MUST persist a privacy-safe summary to 0G Storage and expose its
  retrievable root to the owner.
- **FR-011**: Safety reports and routine logs MUST exclude persona text, lorebook text, complete
  simulated replies, hidden instructions, and private reasoning.
- **FR-012**: Mint MUST remain locked unless the latest passing report matches the draft's current
  persona and lorebook.
- **FR-013**: Editing a certified draft's persona or lorebook MUST immediately invalidate its mint
  eligibility until a new complete run passes.

#### Existing campaign publication

- **FR-014**: Campaigns public before this feature launches MUST remain public without a report.
- **FR-015**: A grandfathered public campaign MUST lose its grandfathered allowance after its owner
  changes it to private.
- **FR-016**: A private existing campaign MUST require a matching passing report before publication.
- **FR-017**: Admin MUST display **Certified to publish** for a matching pass and **Safety check
  required** otherwise.
- **FR-018**: Existing minted persona and lorebook content MUST remain immutable; this feature MUST
  NOT introduce an existing-bouncer intelligence editor.
- **FR-019**: Existing public campaigns without a report MUST be visibly distinguished from
  safety-certified campaigns without interrupting applicant access.
- **FR-020**: Safety runs and publication changes for an existing campaign MUST be restricted to its
  owner.

#### Production owner flow

- **FR-021**: Create MUST group campaign identity, private bouncer intelligence, and readiness into
  distinct, labeled sections.
- **FR-022**: Create MUST explain before action that the safety authorization is gasless and minting
  later requires three on-chain transactions.
- **FR-023**: The mint flow MUST represent mint, authorization, and campaign creation separately,
  with wallet, submitted, confirmed, failure, and retry states.
- **FR-024**: Retrying a later mint step MUST NOT request a transaction whose confirmation was
  already recorded.
- **FR-025**: Successful mint completion MUST provide the applicant link, bouncer identity,
  transaction references, 0G Storage references, publication state, share actions, and Admin entry.
- **FR-026**: Admin's first viewport MUST identify the campaign, certification state, publication
  state, current activity, and next owner action before secondary metrics and records.
- **FR-027**: Every asynchronous mutation in scope MUST provide action-specific active, success,
  failure, and recovery feedback adjacent to the affected action.

#### Applicant, discovery, and responsive experience

- **FR-028**: Before wallet connection, an applicant MUST see the interview purpose, three-to-six
  turn expectation, privacy statement, TEE-attested 0G statement, and applicable certification
  status.
- **FR-029**: Active interviews MUST display turn progress, connected wallet, thinking or retry
  feedback, and a persistent private/TEE indicator.
- **FR-030**: Final verdicts MUST be explicit and provide available attestation and transaction
  verification paths without exposing private reasoning.
- **FR-031**: Landing MUST lead with the user outcome and expose the safety gate, TEE verification,
  0G Storage evidence, mainnet contract evidence, and two clear primary journeys.
- **FR-032**: Gallery and Mine cards MUST expose status, certification, owner, capacity,
  destination chain, and primary action without requiring hover.
- **FR-033**: Card detail or flip interactions MUST work with pointer, touch, and keyboard, and
  functional transitions MUST complete within 300 milliseconds.
- **FR-034**: Shared navigation MUST remain readable without wordmark wrapping or control crowding
  at supported mobile and desktop widths.
- **FR-035**: Applicant records in Admin MUST use a presentation suitable for small screens without
  page-level horizontal scrolling.
- **FR-036**: Primary controls MUST have programmatic labels, visible keyboard focus, non-color state
  text, touch-safe targets, and reduced-motion behavior.
- **FR-037**: Loading, empty, interrupted, error, retry, and success states MUST be visually distinct
  for the safety and mint journeys.

#### Evidence and submission integrity

- **FR-038**: Visible evidence references MUST distinguish 0G Compute/TEE, 0G Storage, 0G Chain, and
  ERC-7857 responsibilities accurately.
- **FR-039**: Repository and submission documentation MUST identify the safety certification and
  production redesign as Wave 3 work and separate them from pre-existing capabilities.
- **FR-040**: The feature MUST reuse the existing demo video and MUST NOT require a replacement video
  to explain or operate the redesigned product.

### Key Entities

- **Safety Run**: An owner-authorized evaluation of one immutable snapshot of draft or minted
  bouncer intelligence; tracks lifecycle, scenario progress, owner, content identity, and recovery
  state.
- **Safety Scenario Result**: One of eight expected-versus-actual decisions with category,
  completion state, and TEE-verification status; excludes complete response and private reasoning.
- **Safety Report**: The privacy-safe completed summary of a run, including counts, overall status,
  content identity, scenario summaries, and its 0G Storage root.
- **Certification**: The passing relationship between a report and the exact bouncer intelligence it
  evaluated; controls mint or publication eligibility.
- **Campaign Publication State**: Private or public campaign state plus whether legacy
  grandfathering or a current certification authorizes publication.
- **Mint Progress**: The ordered record of the three owner transactions and their recoverable
  states.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In automated gate scenarios, 100% of runs with any incorrect decision are prevented
  from enabling mint or new publication.
- **SC-002**: In automated gate scenarios, 100% of runs with any missing or false TEE verification
  are prevented from passing and are shown as technical interruptions.
- **SC-003**: A valid eight-scenario run reaches a persisted pass or actionable interruption within
  five minutes under normal dependency availability.
- **SC-004**: After refresh or reconnect, an owner can recover the current run and see its completed
  scenario progress within ten seconds under normal dependency availability.
- **SC-005**: At 390-by-844 and 1280-by-800 reference viewports, every current route has no
  page-level horizontal overflow, clipped primary action, or wrapped Hanami wordmark.
- **SC-006**: 100% of primary actions on current routes are reachable and visibly focused using
  keyboard-only navigation.
- **SC-007**: 100% of safety states communicate their meaning with text in addition to color or
  animation.
- **SC-008**: Before connecting a wallet, an applicant can identify interview length, privacy,
  TEE/0G verification, and certification status in the first campaign viewport.
- **SC-009**: In the first Admin viewport, an owner can identify certification state, publication
  state, and the next required action without opening another view.
- **SC-010**: Every displayed 0G Storage root, mainnet address, transaction reference, and
  attestation verification path used as submission evidence resolves through its intended verifier.
- **SC-011**: Automated privacy checks find zero persona strings, lorebook strings, complete
  simulated replies, hidden instructions, or private reasoning in stored reports and routine logs.
- **SC-012**: Wave 3 documentation labels all material new commits and features separately from
  pre-existing Hanami functionality.

## Assumptions

- The connected wallet signature is the existing source of campaign-owner authorization.
- The existing 0G TEE-attested inference provider and 0G Storage integration remain available; their
  temporary outages use the interruption behavior defined above.
- Existing minted persona and lorebook references are immutable and can be loaded by the current
  backend for an owner-authorized safety run.
- The persisted report is retrievable by its root and contains only the privacy-safe summary defined
  in this specification.
- One current run exists per owner, draft identity, and content identity; duplicate starts resolve
  to that run.
- The current three-to-six-turn applicant conversation, existing contracts, campaign data,
  deployments, and demo video remain the baseline on which this feature builds.
- English remains the product language for this delivery; responsive and accessible behavior is in
  scope, full localization is not.
