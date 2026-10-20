#!/usr/bin/env bash
# End-to-end tests against a local Supabase-compatible stack (real Supabase Auth + PostgREST),
# a storage emulator, an SMTP sink and a Paystack test double. Nothing leaves this machine.
#
# Requirements (see docs/testing.md):
#   E2E_DATABASE_URL  local PostgreSQL database URL (dropped and recreated)
#   AUTH_BIN          Supabase Auth binary (github.com/supabase/auth releases, tested with v2.180.0)
#   POSTGREST_BIN     PostgREST binary (tested with v12.2.12)
#   CHROMIUM_PATH     optional Chromium executable (defaults to Playwright's bundled browser)
#
#   npm run test:e2e            # build + run all specs
#   E2E_SKIP_BUILD=1 npm run test:e2e -- tests/e2e/specs/public.spec.ts
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${E2E_DATABASE_URL:?}" "${AUTH_BIN:?}" "${POSTGREST_BIN:?}"

eval "$(node tests/e2e/stack/app-env.mjs)"
export NEXT_DIST_DIR=.next-e2e E2E_STORAGE_DIR="${E2E_STORAGE_DIR:-$PWD/.e2e-storage}"

for port in 3100 54321 9999 3001 2525 4010; do fuser -k "$port/tcp" 2>/dev/null || true; done
tests/e2e/stack/setup-db.sh
if [ "${E2E_SKIP_BUILD:-0}" != "1" ]; then npx next build > .e2e-build.log 2>&1 || { tail -40 .e2e-build.log; exit 1; }; fi

node tests/e2e/stack/run-stack.mjs > .e2e-stack.log 2>&1 &
STACK=$!
npx next start -p 3100 > .e2e-app.log 2>&1 &
APP=$!
cleanup() {
  kill "$APP" "$STACK" 2>/dev/null || true
  # next start spawns a child server; make sure every stack port is released.
  for port in 3100 54321 9999 3001 2525 4010; do fuser -k "$port/tcp" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT

for i in $(seq 1 60); do
  if curl -sf http://localhost:54321/__test/health > /dev/null && curl -sf -o /dev/null http://localhost:3100/legal/privacy; then break; fi
  sleep 1
  [ "$i" = 60 ] && { echo "Stack did not start"; tail -20 .e2e-stack.log .e2e-app.log; exit 1; }
done

npx playwright test "$@"
