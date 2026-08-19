#!/usr/bin/env bash
# test-local.sh — end-to-end local test of the Gmail OAuth + email parsing pipeline.
# Run this while `npm run dev` is running in a separate terminal.
#
# Requirements: curl, jq
# Usage: bash scripts/test-local.sh
set -euo pipefail

API="http://localhost:3000"
EMAIL="test-$(date +%s)@censored-link.com"
PASSWORD="testpassword123"

# ── colour helpers ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓ $*${NC}"; }
warn() { echo -e "${YELLOW}  ! $*${NC}"; }
fail() { echo -e "${RED}  ✗ $*${NC}"; exit 1; }

echo ""
echo "======================================"
echo "  App — Local Gmail Test"
echo "======================================"
echo ""

# ── 0. Preflight ───────────────────────────────────────────────────────────────
echo "[0/5] Checking prerequisites..."

command -v jq  &>/dev/null || fail "jq not installed (brew install jq / apt install jq)"
command -v curl &>/dev/null || fail "curl not installed"

# Check server is up
if ! curl -sf "${API}/health" >/dev/null 2>&1; then
  fail "Server not running. Start it with: npm run dev"
fi
ok "Server is up"

# Check Docker services
if ! docker compose ps --services --filter status=running 2>/dev/null | grep -q 'postgres'; then
  warn "PostgreSQL container may not be running. Run: docker compose up -d"
fi

# ── 1. Register test user ──────────────────────────────────────────────────────
echo ""
echo "[1/5] Registering test user (${EMAIL})..."

REGISTER=$(curl -sf -X POST "${API}/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
  || fail "Registration request failed")

ACCESS_TOKEN=$(echo "${REGISTER}" | jq -r '.accessToken')
if [ -z "${ACCESS_TOKEN}" ] || [ "${ACCESS_TOKEN}" = "null" ]; then
  fail "No accessToken in response: ${REGISTER}"
fi
ok "Registered. Token: ${ACCESS_TOKEN:0:20}..."

# ── 2. Get Gmail OAuth URL ─────────────────────────────────────────────────────
echo ""
echo "[2/5] Fetching Gmail OAuth URL..."

GMAIL_RESP=$(curl -sf "${API}/v1/auth/gmail" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  || fail "GET /v1/auth/gmail failed — is GOOGLE_CLIENT_ID set in .env?")

OAUTH_URL=$(echo "${GMAIL_RESP}" | jq -r '.url')
if [ -z "${OAUTH_URL}" ] || [ "${OAUTH_URL}" = "null" ]; then
  fail "No url in response: ${GMAIL_RESP}"
fi

ok "Got OAuth URL"
echo ""
echo "  ┌────────────────────────────────────────────────────────────────┐"
echo "  │  Open this URL in your browser and grant Gmail access:        │"
echo "  └────────────────────────────────────────────────────────────────┘"
echo ""
echo "  ${OAUTH_URL}"
echo ""

# ── 3. Wait for user to complete OAuth ────────────────────────────────────────
echo "[3/5] Waiting for you to complete Gmail consent..."
read -rp "  Press ENTER after you've granted access and seen the success page: "

# ── 4. Wait for background sync ───────────────────────────────────────────────
echo ""
echo "[4/5] Waiting for email sync worker to process your inbox..."
echo "      (checking every 5s for up to 3 minutes)"

FOUND=0
for i in $(seq 1 36); do
  SUBS=$(curl -sf "${API}/v1/subscriptions" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    || echo '{"subscriptions":[]}')

  COUNT=$(echo "${SUBS}" | jq '.subscriptions | length')

  if [ "${COUNT}" -gt "0" ]; then
    FOUND="${COUNT}"
    break
  fi

  printf "  Attempt %d/36 — %d subscriptions so far...\r" "${i}" "${COUNT}"
  sleep 5
done
echo ""

# ── 5. Results ─────────────────────────────────────────────────────────────────
echo ""
echo "[5/5] Results"
echo "======================================"

FINAL=$(curl -sf "${API}/v1/subscriptions" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  || echo '{"subscriptions":[]}')

FINAL_COUNT=$(echo "${FINAL}" | jq '.subscriptions | length')

if [ "${FINAL_COUNT}" -eq "0" ]; then
  warn "No subscriptions detected yet."
  echo ""
  echo "  Possible reasons:"
  echo "  • Historical sync is still running (worker processes in background)"
  echo "  • No billing emails matched the filter (domain whitelist + subject regex)"
  echo "  • OPENAI_API_KEY quota exhausted"
  echo ""
  echo "  Watch live: npm run dev logs — look for [worker:email-sync] lines"
else
  ok "${FINAL_COUNT} subscription(s) detected"
  echo ""
  echo "${FINAL}" | jq '.subscriptions[] | {service: .serviceName, price: .price, currency: .currency, renewal: .renewalDate, trial: .trialStatus}'
fi

echo ""
echo "======================================"
echo "  Test complete"
echo "======================================"
echo ""
echo "  Inspect DB:    npx prisma studio"
echo "  Server logs:   (check the npm run dev terminal)"
echo "  Re-run test:   bash scripts/test-local.sh"
echo ""
