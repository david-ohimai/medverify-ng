#!/usr/bin/env bash
# End-to-end smoke test against a RUNNING server (real Postgres + Redis).
# Used by CI; also runnable locally:  npm run dev  (other terminal)  bash scripts/smoke-test.sh
#
# Walks the device flow and checks the security behaviour end to end:
# register → me → elevate → old token revoked → refresh → reused refresh rejected.
set -euo pipefail

API="${API:-http://localhost:3000/api/v1}"
PIN="${REGULATOR_DEMO_PIN:-246810}"
INSTALL_ID="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || node -e 'console.log(crypto.randomUUID())')"

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; echo "    response: $2"; exit 1; }

# Prints the body, then the status code on the last line.
call() { curl -s -w '\n%{http_code}' "$@"; }
body() { echo "$1" | sed '$d'; }
status() { echo "$1" | tail -n1; }
# Reads a dotted path from JSON on stdin, e.g. json .data.tokens.accessToken.
# Uses Node (always present here) rather than jq, so it also runs in Git Bash on Windows.
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let v=JSON.parse(s);for(const k of process.argv[1].split(".").filter(Boolean))v=v?.[k];process.stdout.write(v==null?"null":String(v))})' "$1"; }

echo "Smoke test against $API"

res=$(call "${API%/api/v1}/health/ready")
[ "$(status "$res")" = "200" ] || fail "readiness: database and Redis up" "$res"
pass "readiness: database and Redis up"

res=$(call -X POST "$API/devices/register" -H 'Content-Type: application/json' \
  -d "{\"installId\":\"$INSTALL_ID\",\"platform\":\"android\",\"appVersion\":\"1.0.0+1\",\"language\":\"en\"}")
[ "$(status "$res")" = "201" ] || fail "register a new device" "$res"
ACCESS=$(body "$res" | json .data.tokens.accessToken)
REFRESH=$(body "$res" | json .data.tokens.refreshToken)
pass "register a new device"

res=$(call "$API/devices/me" -H "Authorization: Bearer $ACCESS")
[ "$(status "$res")" = "200" ] && [ "$(body "$res" | json .data.role)" = "public" ] || fail "GET /devices/me as public" "$res"
pass "GET /devices/me as public"

res=$(call -X POST "$API/devices/me/elevate" -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' -d '{"pin":"000000"}')
[ "$(status "$res")" = "403" ] || fail "wrong PIN is rejected" "$res"
pass "wrong PIN is rejected"

res=$(call -X POST "$API/devices/me/elevate" -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' -d "{\"pin\":\"$PIN\"}")
[ "$(status "$res")" = "200" ] || fail "right PIN unlocks regulator mode" "$res"
REG_ACCESS=$(body "$res" | json .data.tokens.accessToken)
REG_REFRESH=$(body "$res" | json .data.tokens.refreshToken)
pass "right PIN unlocks regulator mode"

res=$(call "$API/devices/me" -H "Authorization: Bearer $ACCESS")
[ "$(status "$res")" = "401" ] && [ "$(body "$res" | json .code)" = "TOKEN_REVOKED" ] || fail "pre-elevation access token is revoked immediately" "$res"
pass "pre-elevation access token is revoked immediately"

res=$(call -X POST "$API/devices/refresh" -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$REFRESH\"}")
[ "$(status "$res")" = "401" ] && [ "$(body "$res" | json .code)" = "REFRESH_INVALID" ] || fail "pre-elevation refresh token is stale (not flagged as theft)" "$res"
pass "pre-elevation refresh token is stale (not flagged as theft)"

res=$(call -X POST "$API/devices/refresh" -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$REG_REFRESH\"}")
[ "$(status "$res")" = "200" ] || fail "refresh rotates the token" "$res"
pass "refresh rotates the token"

res=$(call -X POST "$API/devices/refresh" -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$REG_REFRESH\"}")
[ "$(status "$res")" = "401" ] && [ "$(body "$res" | json .code)" = "REFRESH_REUSED" ] || fail "reusing a rotated refresh token is detected" "$res"
pass "reusing a rotated refresh token is detected"

# ── Registry + manual verification (needs `npm run seed`; uses the fictional X9- demo rows) ──
verify() { call -X POST "$API/verify/manual" -H "Authorization: Bearer $REG_ACCESS" -H 'Content-Type: application/json' -d "$1"; }

res=$(call "$API/products/search?q=demoqine" -H "Authorization: Bearer $REG_ACCESS")
[ "$(status "$res")" = "200" ] && [ "$(body "$res" | json .data.0.nafdacNo)" = "X9-0001" ] || fail "fuzzy search finds Demoquine from a typo" "$res"
pass "fuzzy search finds Demoquine from a typo (pg_trgm)"

res=$(verify '{"nafdacNo":"x9 - 0001","productName":"Demoquine","batchNo":"dq2401"}')
[ "$(status "$res")" = "201" ] && [ "$(body "$res" | json .data.verdict)" = "likely_genuine" ] || fail "known batch, messy input → likely genuine" "$res"
pass "known batch, messy input → likely genuine"

res=$(verify '{"nafdacNo":"X9-0001","batchNo":"DQ2310"}')
[ "$(body "$res" | json .data.verdict)" = "high_risk" ] || fail "recalled batch → high risk" "$res"
pass "recalled batch → high risk"

res=$(verify '{"nafdacNo":"X9-0001","productName":"Paramed Demo"}')
[ "$(body "$res" | json .data.verdict)" = "suspicious" ] || fail "real number on the wrong product → suspicious" "$res"
pass "real number on the wrong product → suspicious"

res=$(verify '{"nafdacNo":"B7-9999"}')
[ "$(body "$res" | json .data.verdict)" = "unregistered" ] || fail "unknown number → unregistered" "$res"
pass "unknown number → unregistered"

res=$(call "$API/scans?limit=2" -H "Authorization: Bearer $REG_ACCESS")
[ "$(status "$res")" = "200" ] && [ "$(body "$res" | json .meta.total)" = "4" ] || fail "scan history lists this device's 4 checks" "$res"
pass "scan history lists this device's 4 checks"

res=$(call -X DELETE "$API/devices/me" -H "Authorization: Bearer $REG_ACCESS")
# The reuse above revoked the whole chain but not the access token, which is still current.
[ "$(status "$res")" = "200" ] || fail "delete my data" "$res"
res=$(call "$API/devices/me" -H "Authorization: Bearer $REG_ACCESS")
[ "$(status "$res")" = "401" ] || fail "token of a deleted device stops working" "$res"
pass "delete my data, and its token stops working"

echo "All smoke checks passed."
