# Phase 1 Data Model: Bouncer Safety Certification

## Content Identity

`content_hash = keccak256(abi.encode(persona, lorebook))`

The digest is based on exact UTF-8 strings. Whitespace and empty/non-empty lorebook changes are
material. Persona or lorebook text is never stored in the new libSQL records.

## Safety Run

Represents one owner-authorized attempt to evaluate one content identity.

| Field | Type | Rules |
|---|---|---|
| `id` | text | Random UUID, primary key |
| `scope` | text | `draft` or `campaign` |
| `slug` | text | 3-64 lowercase slug characters |
| `owner_address` | text | Lowercase EVM address |
| `content_hash` | text | 32-byte hex digest of exact intelligence |
| `persona_uri` | text | Existing or newly uploaded `0g://` root |
| `lorebook_uri` | text nullable | Existing or newly uploaded `0g://` root |
| `status` | text | `running`, `passed`, `failed`, or `interrupted` |
| `current_scenario` | integer | Count of terminal scenario results, 0-8 |
| `report_root` | text nullable | 0G Storage root only after persisted pass |
| `error_code` | text nullable | Stable technical classification only |
| `error_message` | text nullable | Sanitized recovery guidance; no prompt/reply data |
| `created_at` | integer | Unix seconds |
| `updated_at` | integer | Unix seconds, refreshed at every checkpoint |
| `completed_at` | integer nullable | Unix seconds for passed/failed terminal result |

**Uniqueness**: `(scope, slug, owner_address, content_hash)` identifies the current run. A duplicate
start returns the same row. A new content hash creates a new run.

**Relationships**:

- Has exactly eight Safety Scenario Result rows after semantic completion.
- May certify one draft preparation or one immutable campaign intelligence snapshot.
- A passed run has one report root; a failed run remains locally auditable without a public root.

## Safety Scenario Result

Represents the privacy-safe checkpoint for one fixed scenario.

| Field | Type | Rules |
|---|---|---|
| `run_id` | text | Foreign key to Safety Run, cascade delete |
| `scenario_id` | text | Stable fixed-suite ID |
| `category` | text | `thoughtful`, `low-effort`, `jailbreak`, or `edge` |
| `expected_decision` | text | `approve` or `reject` |
| `actual_decision` | text nullable | `approve`, `reject`, or `no-decision` |
| `tee_verified` | integer nullable | 1 only when every inference response in scenario verifies |
| `status` | text | `pending`, `passed`, `failed`, or `interrupted` |
| `turn_count` | integer | Completed applicant messages, 0 through scenario maximum |
| `error_code` | text nullable | Technical classification for interrupted only |
| `updated_at` | integer | Unix seconds |

**Primary key**: `(run_id, scenario_id)`.

**Forbidden fields**: persona, lorebook, prompt, applicant message, bouncer reply, transcript,
reasoning, hidden instruction, or raw response payload.

## Campaign Publication Policy

Add the following field to `campaigns`:

| Field | Type | Rules |
|---|---|---|
| `publication_policy` | text | `legacy-public` or `certification-required`; default `certification-required` |

Migration behavior:

1. Add the column with `certification-required` default.
2. Mark rows that are public at migration time as `legacy-public`.
3. Leave private rows `certification-required`.
4. Every newly indexed campaign is explicitly private and `certification-required`.
5. Changing a `legacy-public` campaign to private permanently sets `certification-required`.

No contract or existing campaign identifier changes.

## Derived Certification View

Certification is derived rather than duplicated:

- **Draft certified**: latest run is `passed`, has a report root, and its owner, slug, and content
  hash match the current draft request.
- **Campaign certified**: latest run is `passed`, has a report root, has campaign scope, and its
  persona/lorebook URIs match the immutable campaign URIs.
- **Legacy public**: campaign is public with `legacy-public` policy and has no matching pass.
- **Required**: campaign is private or certification-required without a matching pass.

Campaign read responses expose a derived object containing state, latest run ID, report root, and
publication eligibility. They never expose private run inputs.

## State Transitions

### Safety Run

```text
no row --owner signature--> running
running --all 8 semantically complete, any mismatch--> failed
running --all 8 correct + all TEE verified--> report persistence
report persistence --0G upload succeeds--> passed
running/report persistence --technical error--> interrupted
interrupted --owner resume--> running
failed --content edit + new authorization--> new running row
passed --content edit--> old row remains passed; new content is uncertified
```

A stale `running` row found after a process restart is presented as recoverable/interrupted until
resume reacquires it. Completed scenario rows are never repeated.

### Publication

```text
existing public + legacy-public -> public and operational
legacy-public --make private--> private + certification-required
private + certification-required --matching pass--> publish enabled
private + certification-required --publish--> public + certification-required
```

## Report Document

The uploaded JSON report is versioned and contains only:

- schema version, product, run ID, scope, slug, owner, content hash;
- started and completed timestamps;
- eight scenario summaries: ID, category, expected decision, actual decision, TEE verified;
- aggregate counts and `passed: true`.

The database stores only the returned root. The storage transaction metadata may be logged, but the
report payload and logs must continue to exclude the forbidden fields above.

## Mint Progress

Mint progress remains frontend-managed by the existing prepared result and transaction hashes. The
prepare result now points to the certified persona/lorebook roots. Existing `mintTx`, `authorizeTx`,
and `campaignTx` fields continue to make later-step retries idempotent; no new database entity is
required within this scope.
