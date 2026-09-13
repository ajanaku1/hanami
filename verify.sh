#!/usr/bin/env bash
# Hanami ETHOnline 2026 — executable done predicates (feature 002).
#
# Done means this script exits 0. Source review, a checked task list, or a summary is not enough.
# THIS FILE STARTS RED on the fresh feature branch; that is expected. Never weaken a check to
# make it pass; fix the build or fix the predicate deliberately and say so.
# Usage: ./verify.sh [spec|contracts|door|tickets|brief|ui|agent|release|live]

set -uo pipefail
cd "$(dirname "$0")"

FILTER="${1:-}"
pass=0
fail=0
executed=0
FEATURE=specs/002-human-door-tickets

check() {
  local tag="$1" desc="$2"
  shift 2
  if [ -n "$FILTER" ] && [ "$tag" != "$FILTER" ]; then return 0; fi
  executed=$((executed + 1))
  if "$@" >/dev/null 2>&1; then
    printf '  PASS  [%s] %s\n' "$tag" "$desc"
    pass=$((pass + 1))
  else
    printf '  FAIL  [%s] %s\n' "$tag" "$desc"
    fail=$((fail + 1))
  fi
}

checksh() {
  local tag="$1" desc="$2" cmd="$3"
  check "$tag" "$desc" sh -c "$cmd"
}

echo "== Hanami ETHOnline 2026 verify =="

# ---------------------------------------------------------------- spec
checksh spec "formal spec has 21 FRs, 10 SCs, 78 ordered tasks, and constitution v2.0.0" '
  test "$(grep -c "^-[[:space:]]\\*\\*FR-[0-9][0-9][0-9]\\*\\*" '"$FEATURE"'/spec.md)" -eq 21 &&
  test "$(grep -c "^-[[:space:]]\\*\\*SC-[0-9][0-9][0-9]\\*\\*" '"$FEATURE"'/spec.md)" -eq 10 &&
  test "$(grep -Ec "^- \\[[ xX]\\] T[0-9][0-9][0-9]" '"$FEATURE"'/tasks.md)" -eq 78 &&
  grep -q "Version\\*\\*: 2.0.0" .specify/memory/constitution.md
'
checksh spec "formal artifacts contain no unresolved placeholders" '
  test -d '"$FEATURE"' &&
  ! grep -RIE "\\[NEEDS CLARIFICATION|TODO|TBD|FIXME|<placeholder>" \
    '"$FEATURE"'/spec.md '"$FEATURE"'/plan.md '"$FEATURE"'/research.md \
    '"$FEATURE"'/data-model.md '"$FEATURE"'/tasks.md
'
checksh spec "dependency approval is recorded before any install" '
  grep -q "Hanami feature 002" ../loop/memory/STATE.md &&
  grep -qE "^Status: feature 002 dependencies approved by the user on 20[0-9]{2}-[0-9]{2}-[0-9]{2}" ../loop/memory/STATE.md
'

# ---------------------------------------------------------------- contracts (Phase 1)
checksh contracts "V1 contract sources remain byte-for-byte unchanged" '
  printf "%s\\n" \
    "172d7b043ab454284eb8c0a228a621bac027799986f9a0900983a171c67767be  contracts/src/BouncerRegistry.sol" \
    "491192f42a29a1a9452b25bed6afb1d3e34db0dfce224e58b5fec7b70e93471a  contracts/src/Campaign.sol" |
    shasum -a 256 -c -
'
checksh contracts "CampaignV2, Ticket, TicketGate exist with their Foundry suites and forge test is green" '
  test -f contracts/src/CampaignV2.sol && test -f contracts/src/Ticket.sol && test -f contracts/src/TicketGate.sol &&
  test -f contracts/test/CampaignV2.t.sol && test -f contracts/test/Ticket.t.sol && test -f contracts/test/TicketGate.t.sol &&
  grep -q "DecisionRecordedV2" contracts/src/CampaignV2.sol &&
  grep -q "Soulbound" contracts/src/Ticket.sol &&
  cd contracts && forge test --offline
'
checksh contracts "additive schema: proofs table with both UNIQUE constraints and new columns" '
  grep -q "CREATE TABLE IF NOT EXISTS proofs" backend/src/db/schema.sql &&
  grep -q "UNIQUE(campaign_slug, nullifier)" backend/src/db/schema.sql &&
  grep -q "UNIQUE(campaign_slug, wallet_address)" backend/src/db/schema.sql &&
  grep -q "contract_version" backend/src/db/index.ts &&
  test -f backend/test/door-schema.test.ts &&
  test -f backend/test/tickets-chain.test.ts &&
  cd backend && npm test
'

# ---------------------------------------------------------------- door (Phase 2, US1)
checksh door "Door modules, tests, and guard on /begin and /turns pass" '
  test -f backend/src/door/world-verify.ts && test -f backend/src/door/proofs.ts && test -f backend/src/door/routes.ts &&
  test -f backend/test/door-verify.test.ts && test -f backend/test/door-proofs.test.ts && test -f backend/test/door-routes.test.ts &&
  grep -q "door required" backend/src/server.ts &&
  cd backend && npm test && npm run build
'
checksh door "Door never logs proof material" '
  test -f backend/src/door/world-verify.ts &&
  ! grep -En "console\\.(log|info|debug).*(proof|merkle_root|nullifier)" backend/src/door/world-verify.ts backend/src/door/routes.ts
'
checksh door "DoorPanel with all states is tested and wired before the chat" '
  test -f frontend/src/components/door/DoorPanel.tsx && test -f frontend/test/door-panel.test.tsx &&
  grep -q "DoorPanel" "frontend/src/app/c/[slug]/page.tsx" &&
  cd frontend && npm test
'

# ---------------------------------------------------------------- tickets (Phase 3, US2)
checksh tickets "decision branch mints tickets on V2, keeps V1 path, and roster/revoke routes pass" '
  test -f backend/src/tickets/chain-v2.ts && test -f backend/src/tickets/roster.ts &&
  test -f backend/test/tickets-decide.test.ts && test -f backend/test/roster.test.ts &&
  grep -q "tickets/retry" backend/src/server.ts &&
  grep -q "/roster" backend/src/server.ts &&
  cd backend && npm test
'
checksh tickets "Receipt, RosterTable, RevokeButton are tested and mounted" '
  test -f frontend/src/components/door/Receipt.tsx &&
  test -f frontend/src/components/roster/RosterTable.tsx && test -f frontend/src/components/roster/RevokeButton.tsx &&
  test -f frontend/test/receipt.test.tsx && test -f frontend/test/roster.test.tsx &&
  grep -q "RosterTable" "frontend/src/app/c/[slug]/admin/page.tsx" &&
  grep -qi "chains other than 0G" "frontend/src/app/c/[slug]/admin/page.tsx" &&
  cd frontend && npm test
'

# ---------------------------------------------------------------- brief (Phase 4, US3 + US4)
checksh brief "ledger modules read seven sources with one template each and the pure brief is tested" '
  test -f backend/src/ledger/graph-client.ts && test -f backend/src/ledger/brief.ts && test -f backend/src/ledger/prompt.ts &&
  test -f backend/test/ledger-brief.test.ts && test -f backend/test/ledger-graph.test.ts && test -f backend/test/ledger-prompt.test.ts &&
  test $(grep -Eo "subgraphId: .[1-9A-HJ-NP-Za-km-z]+" backend/src/ledger/graph-client.ts | sort -u | wc -l) -ge 7 &&
  grep -q "first: 500" backend/src/ledger/graph-client.ts &&
  grep -qi "evidence" backend/src/ledger/prompt.ts &&
  cd backend && npm test
'
checksh brief "BriefPanel and Verify three-hash panel are tested" '
  test -f frontend/src/components/door/BriefPanel.tsx && test -f frontend/test/brief-panel.test.tsx &&
  test -f frontend/test/verify-three-hash.test.tsx &&
  grep -q "nullifier" frontend/src/components/VerifyOn0G.tsx &&
  grep -q "attestationPath" frontend/src/components/VerifyOn0G.tsx &&
  cd frontend && npm test
'

# ---------------------------------------------------------------- ui (Phase 5, US5 + direct broker)
checksh ui "create/admin settings and ticket counts are tested; lint and build pass" '
  test -f frontend/test/create-settings.test.tsx &&
  grep -q "requiredCredential" frontend/src/app/create/page.tsx &&
  grep -q "liveTicketCount" frontend/src/components/MarketCard.tsx &&
  test -f backend/test/campaign-settings.test.ts && test -f backend/test/attestation-path.test.ts &&
  (cd backend && npm test) &&
  cd frontend && npm test && npm run lint && npm run build
'
checksh ui "UI audit has no major or critical violations" '
  if test -f /Users/mac/.agents/skills/ui-revamp/scripts/audit.js; then
    output=$(node /Users/mac/.agents/skills/ui-revamp/scripts/audit.js frontend/src) &&
    (printf "%s" "$output" | grep -Eq "No violations found" ||
      (printf "%s" "$output" | grep -Eq "Critical: 0" && printf "%s" "$output" | grep -Eq "Major: 0"))
  else
    test -d frontend/src && ! grep -RIE "transition: .transform 700ms|a:hover[[:space:]]*\\{" frontend/src
  fi
'

# ---------------------------------------------------------------- agent (Phase 6, US6)
checksh agent "AgentKit door path is tested on the backend" '
  test -f backend/src/door/agentkit.ts && test -f backend/test/door-agentkit.test.ts &&
  grep -q "createAgentkitHooks" backend/src/door/agentkit.ts &&
  grep -q "503" backend/src/door/agentkit.ts &&
  grep -q "createAgentDoor" backend/src/server.ts &&
  grep -Eq "app.use\(.\/api\/campaigns\/:slug\/(begin|turns)., agentDoor\)" backend/src/server.ts &&
  cd backend && npm test
'
checksh agent "agent CLI workspace tests pass and README documents register/status/apply" '
  test -f agent/package.json && test -f agent/src/cli.ts && test -f agent/README.md &&
  grep -q "register" agent/README.md && grep -q "status" agent/README.md && grep -q "apply" agent/README.md &&
  (test -f agent/test/apply.test.ts || grep -qi "descoped" docs/feedback-world.md) &&
  cd agent && npm test
'

# ---------------------------------------------------------------- release (Phase 7)
checksh release "complete backend, frontend, agent, and contract regression matrix passes" '
  (cd backend && npm test && npm run build) &&
  (cd frontend && npm test && npm run lint && npm run build) &&
  (cd agent && npm test) &&
  (cd contracts && forge test --offline)
'
checksh release "no TypeScript any and no secrets in new code" '
  test -d backend/src/door && test -d backend/src/ledger && test -d backend/src/tickets && test -d agent/src &&
  ! grep -RIn ":[[:space:]]*any\\b" backend/src/door backend/src/ledger backend/src/tickets agent/src frontend/src/components/door frontend/src/components/roster &&
  ! grep -RInE "0x[0-9a-fA-F]{64}" backend/src agent/src frontend/src
'
checksh release "README continuity section, feedback doc, AI-usage note, and video reference exist" '
  test -f README.md && test -f docs/feedback-world.md && test -f docs/ai-usage.md &&
  grep -qi "ETHOnline 2026" README.md &&
  grep -qiE "pre-existing|before the event" README.md &&
  grep -qE "[0-9a-f]{7}\\.\\.[0-9a-f]{7}" README.md &&
  grep -qi "0G" README.md && grep -qi "World" README.md && grep -qi "The Graph" README.md &&
  grep -qiE "demo video|\\.mp4|youtu|loom" README.md &&
  grep -qi "Selfie Check" docs/feedback-world.md && grep -qi "AgentKit" docs/feedback-world.md
'
checksh release "V2 addresses recorded in README and env example" '
  grep -q "CAMPAIGN_FACTORY_V2" backend/.env.example && grep -q "TICKET_ADDRESS" backend/.env.example &&
  grep -qi "CampaignFactoryV2" README.md && grep -qi "TicketGate" README.md
'

# ---------------------------------------------------------------- live (Phase 7, network)
checksh live "0G mainnet V1 registry/factory and V2 factory, Ticket, TicketGate contain code" '
  factory=$(grep -Eo "CampaignFactoryV2[^0-9x]*(0x[0-9a-fA-F]{40})" README.md | grep -Eo "0x[0-9a-fA-F]{40}" | head -1) &&
  ticket=$(grep -Eo "Ticket[^G][^0-9x]*(0x[0-9a-fA-F]{40})" README.md | grep -Eo "0x[0-9a-fA-F]{40}" | head -1) &&
  gate=$(grep -Eo "TicketGate[^0-9x]*(0x[0-9a-fA-F]{40})" README.md | grep -Eo "0x[0-9a-fA-F]{40}" | head -1) &&
  test -n "$factory" && test -n "$ticket" && test -n "$gate" &&
  for address in 0x764883319e51e46F683aB54D93F26bcBb74A7030 0xfe6b2417407595Ad4d1F8D4D8c95860881d539d4 "$factory" "$ticket" "$gate"; do
    body=$(curl --max-time 30 -fsS https://evmrpc.0g.ai -H "content-type: application/json" \
      --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$address\",\"latest\"]}") || exit 1
    printf "%s" "$body" | grep -Eq "\\\"result\\\":\\\"0x[0-9a-fA-F]{10,}\\\"" || exit 1
  done
'
checksh live "a mainnet V2 decision receipt carries nullifier, ticket id, and attestation path" '
  test -f docs/ethonline-evidence.md &&
  slug=$(grep -m1 "Evidence campaign:" docs/ethonline-evidence.md | grep -Eo "[a-z0-9-]+$") &&
  wallet=$(grep -m1 "Evidence wallet:" docs/ethonline-evidence.md | grep -Eo "0x[0-9a-fA-F]{40}") &&
  test -n "$slug" && test -n "$wallet" &&
  body=$(curl --max-time 30 -fsS "https://hanami-backend-ugak.onrender.com/api/campaigns/$slug/verify/$wallet") &&
  printf "%s" "$body" | grep -Eq "\\\"nullifier\\\":\\\"0x[0-9a-fA-F]+\\\"" &&
  printf "%s" "$body" | grep -Eq "\\\"ticketId\\\":[0-9]+" &&
  printf "%s" "$body" | grep -Eq "\\\"attestationPath\\\":\\\"(direct|router)\\\""
'
checksh live "deployed frontend serves the Door and the backend refuses an interview without a proof" '
  curl --max-time 30 -fsS https://hanami-hazel.vercel.app/ | grep -qi "hanami" &&
  slug=$(grep -m1 "Evidence campaign:" docs/ethonline-evidence.md | grep -Eo "[a-z0-9-]+$") &&
  code=$(curl --max-time 30 -sS -o /dev/null -w "%{http_code}" -X POST \
    -H "content-type: application/json" --data "{\"walletAddress\":\"0x000000000000000000000000000000000000dEaD\"}" \
    "https://hanami-backend-ugak.onrender.com/api/campaigns/$slug/begin") &&
  test "$code" = "403"
'
checksh live "the enclave-signed path is on and a decision made with it reports direct" '
  test -f docs/ethonline-evidence.md &&
  slug=$(grep -m1 "Direct-path campaign:" docs/ethonline-evidence.md | grep -Eo "[a-z0-9-]+$") &&
  wallet=$(grep -m1 "Direct-path wallet:" docs/ethonline-evidence.md | grep -Eo "0x[0-9a-fA-F]{40}") &&
  test -n "$slug" && test -n "$wallet" &&
  body=$(curl --max-time 30 -fsS "https://hanami-backend-ugak.onrender.com/api/campaigns/$slug/verify/$wallet") &&
  printf "%s" "$body" | grep -Eq "\\"attestationPath\\":\\"direct\\"" &&
  printf "%s" "$body" | grep -Eq "\\"kind\\":\\"tee-signature\\""
'
checksh live "The Graph gateway answers the marketplace template from at least two sources within 12s" '
  test -n "${GRAPH_API_KEY:-}" &&
  ok=0 &&
  for id in 2GmLsgYGWoFoouZzKjp8biYDkfmeLTkEY3VDQyZqSJHA ECtdoov16DUmk5qbhFx4PVVN7vidiNDwzFNsui6FoHEo 3cMswgcjkpLmuF99ViQRZfCPRyCsnimqQsR9z6mY5e2i; do
    body=$(curl --max-time 12 -sS "https://gateway.thegraph.com/api/$GRAPH_API_KEY/subgraphs/id/$id" \
      -H "content-type: application/json" --data "{\"query\":\"{ trades(first:1){ id } }\"}") &&
    printf "%s" "$body" | grep -q "\"trades\"" && ok=$((ok+1))
  done &&
  test "$ok" -ge 2
'

echo
if [ "$executed" -eq 0 ]; then
  printf '  FAIL  [filter] no checks matched "%s"; executed 0 predicates\n' "$FILTER"
  fail=$((fail + 1))
fi
printf 'passed %d, failed %d\n' "$pass" "$fail"

cat <<'MANUAL'

manual release checks:
  [ ] Door, Brief, Receipt, Roster read correctly at 390x844 and 1280x800 with keyboard focus visible.
  [ ] The Selfie Check (or Orb/Device) QR completes in the World sandbox app on a real phone.
  [ ] Verify-on-0G recovers the enclave signer for a direct-path decision and labels router-path decisions.
  [ ] TicketGate on mainnet accepts a live ticket holder and refuses the revoked wallet (Chainscan txs recorded in docs/ethonline-evidence.md).
  [ ] The agent CLI applies end to end against the live campaign from a clean machine following agent/README.md.
  [ ] Demo video is 2-4 minutes, 720p or better, follows the design.md demo path; narration is
      synthesised (Edge TTS) and docs/ai-usage.md says so — the original human-voiceover rule was
      changed deliberately on 2026-09-13, not quietly dropped.
  [ ] README continuity section separates pre-existing work from in-window work by commit range; feedback document is reproducible.
  [ ] The independent checker exited 0 with network access and no degraded-access findings.
MANUAL

[ "$fail" -eq 0 ] || exit 1
