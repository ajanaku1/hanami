#!/usr/bin/env bash
# Hanami Wave 3 — executable done predicates.
#
# Done means this script exits 0. Source review, a checked task list, or a summary is not enough.
# Usage: ./verify.sh [spec|foundation|safety|ui|release|live]

set -uo pipefail
cd "$(dirname "$0")"

FILTER="${1:-}"
pass=0
fail=0
executed=0

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

echo "== Hanami Wave 3 verify =="

checksh spec "formal spec contains 40 FRs, 12 SCs, and 72 ordered tasks" '
  test -f specs/001-bouncer-safety-redesign/spec.md &&
  test -f specs/001-bouncer-safety-redesign/plan.md &&
  test -f specs/001-bouncer-safety-redesign/tasks.md &&
  test "$(grep -c "^-[[:space:]]\\*\\*FR-[0-9][0-9][0-9]\\*\\*" specs/001-bouncer-safety-redesign/spec.md)" -eq 40 &&
  test "$(grep -c "^-[[:space:]]\\*\\*SC-[0-9][0-9][0-9]\\*\\*" specs/001-bouncer-safety-redesign/spec.md)" -eq 12 &&
  test "$(grep -Ec "^- \\[[ xX]\\] T[0-9][0-9][0-9]" specs/001-bouncer-safety-redesign/tasks.md)" -eq 72
'
checksh spec "formal artifacts contain no unresolved placeholders" '
  test -d specs/001-bouncer-safety-redesign &&
  ! grep -RIE "\\[NEEDS CLARIFICATION|TODO|TBD|FIXME|<placeholder>" \
    specs/001-bouncer-safety-redesign/spec.md \
    specs/001-bouncer-safety-redesign/plan.md \
    specs/001-bouncer-safety-redesign/research.md \
    specs/001-bouncer-safety-redesign/data-model.md \
    specs/001-bouncer-safety-redesign/tasks.md
'

checksh foundation "backend safety foundations pass their tests and compile" '
  test -f backend/src/safety/content-hash.ts &&
  test -f backend/test/safety-repository.test.ts &&
  cd backend && npm test && npm run build
'
checksh foundation "frontend exact-content and test foundations pass" '
  test -f frontend/src/lib/content-hash.ts &&
  test -f frontend/test/content-hash.test.ts &&
  cd frontend && npm test
'

checksh safety "strict safety runner, routes, prepare gate, and publication policy pass" '
  test -f backend/src/safety/runner.ts &&
  test -f backend/test/safety-runner.test.ts &&
  test -f backend/test/safety-visibility.test.ts &&
  cd backend && npm test && npm run build
'
checksh safety "Create and Admin safety behavior pass" '
  test -f frontend/src/components/safety/SafetyReport.tsx &&
  test -f frontend/test/safety-report.test.tsx &&
  test -f frontend/test/admin-safety.test.tsx &&
  cd frontend && npm test
'
checksh safety "privacy-safe report code excludes forbidden persisted fields" '
  test -f backend/src/safety/report.ts &&
  ! grep -Ei "persona(text)?[[:space:]]*:|lorebook(text)?[[:space:]]*:|sampleReply|reasoning[[:space:]]*:|transcript[[:space:]]*:" backend/src/safety/report.ts
'

checksh ui "frontend behavior, lint, and production build pass" '
  test -d frontend/test && cd frontend && npm test && npm run lint && npm run build
'
checksh ui "UI audit has no major or critical violations" '
  if test -f /Users/mac/.agents/skills/ui-revamp/scripts/audit.js; then
    output=$(node /Users/mac/.agents/skills/ui-revamp/scripts/audit.js frontend/src) &&
    (printf "%s" "$output" | grep -Eq "No violations found" ||
      (printf "%s" "$output" | grep -Eq "Critical: 0" && printf "%s" "$output" | grep -Eq "Major: 0"))
  else
    test -d frontend/src &&
    ! grep -RIE "transition: .transform 700ms|a:hover[[:space:]]*\\{" frontend/src
  fi
'

checksh release "complete backend, frontend, and contract regression matrix passes" '
  (cd backend && npm test && npm run build) &&
  (cd frontend && npm test && npm run lint && npm run build) &&
  (cd contracts && forge test --offline)
'
checksh release "deployed contract source remains byte-for-byte unchanged" '
  printf "%s\\n" \
    "172d7b043ab454284eb8c0a228a621bac027799986f9a0900983a171c67767be  contracts/src/BouncerRegistry.sol" \
    "491192f42a29a1a9452b25bed6afb1d3e34db0dfce224e58b5fec7b70e93471a  contracts/src/Campaign.sol" \
    "07f790ac21879d5e3acaf15ffadf2758a49e8770c99b5f8d441a0418ad6b5f2b  contracts/src/Foo.sol" |
    shasum -a 256 -c -
'
checksh release "README and Wave 3 evidence name the new gate and preserve the video" '
  test -f README.md && test -f docs/wave3-submission.md &&
  grep -qi "Bouncer Safety Report" README.md &&
  grep -qi "Wave 3" README.md &&
  grep -qi "existing demo video" docs/wave3-submission.md &&
  grep -qi "production redesign" docs/wave3-submission.md
'

checksh live "deployed frontend exposes the Wave 3 safety experience" '
  curl --max-time 30 -fsS https://hanami-hazel.vercel.app/create | grep -qi "Test this exact bouncer"
'
checksh live "deployed backend exposes the safety API contract" '
  code=$(curl --max-time 30 -sS -o /dev/null -w "%{http_code}" \
    https://hanami-backend-ugak.onrender.com/api/safety-runs/00000000-0000-4000-8000-000000000000) &&
  test "$code" = "404"
'
checksh live "recorded live run is passed and exposes a 0G report root" '
  test -f docs/wave3-submission.md &&
  run_id=$(sed -n "s/.*Safety run ID: \\`\\([^\\`]*\\)\\`.*/\\1/p" docs/wave3-submission.md | head -n 1) &&
  test -n "$run_id" &&
  curl --max-time 30 -fsS "https://hanami-backend-ugak.onrender.com/api/safety-runs/$run_id" |
    grep -Eq "\\\"status\\\":\\\"passed\\\".*\\\"reportRoot\\\":\\\"0x[0-9a-fA-F]{64}\\\""
'
checksh live "0G mainnet registry and factory addresses contain code" '
  for address in 0x764883319e51e46F683aB54D93F26bcBb74A7030 0xfe6b2417407595Ad4d1F8D4D8c95860881d539d4; do
    body=$(curl --max-time 30 -fsS https://evmrpc.0g.ai \
      -H "content-type: application/json" \
      --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$address\",\"latest\"]}") || exit 1
    printf "%s" "$body" | grep -Eq "\\\"result\\\":\\\"0x[0-9a-fA-F]{10,}\\\"" || exit 1
  done
'

echo
if [ "$executed" -eq 0 ]; then
  printf '  FAIL  [filter] no checks matched "%s"; executed 0 predicates\n' "$FILTER"
  fail=$((fail + 1))
fi
printf 'passed %d, failed %d\n' "$pass" "$fail"

cat <<'MANUAL'

manual release checks:
  [ ] Landing, Create, Applicant, Admin, Gallery, and Mine look production-ready at 390x844 and 1280x800.
  [ ] The report and UI disclose no persona, lorebook, complete simulated reply, hidden instruction, or reasoning.
  [ ] The existing demo video remains truthful for the unchanged core flow; new screenshots explain the Wave 3 delta.
  [ ] Submission copy sounds human, clearly separates new work, and uses only reproducible claims.
  [ ] The independent checker exited 0 with network access and no degraded-access findings.
MANUAL

[ "$fail" -eq 0 ] || exit 1
