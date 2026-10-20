#!/usr/bin/env bash
# Recreates the LOCAL TEST database and applies the Supabase shim plus all migrations.
# Usage: TEST_DATABASE_URL=postgres://user:pass@localhost:5432/hk_test scripts/db-test-reset.sh
# Refuses to run against anything that is not localhost.
set -euo pipefail

: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a local PostgreSQL test database}"

case "$TEST_DATABASE_URL" in
  *@localhost*|*@127.0.0.1*) ;;
  *) echo "Refusing to reset a non-local database: TEST_DATABASE_URL must point at localhost." >&2; exit 1 ;;
esac

DB_NAME="${TEST_DATABASE_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
ADMIN_URL="${TEST_DATABASE_URL%/*}/postgres"

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists \"$DB_NAME\" with (force);" -c "create database \"$DB_NAME\";"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$(dirname "$0")/../supabase/tests/supabase-shim.sql"
for f in "$(dirname "$0")"/../supabase/migrations/*.sql; do
  psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" > /dev/null || { echo "Migration failed: $f" >&2; exit 1; }
done
echo "Test database $DB_NAME ready ($(ls "$(dirname "$0")"/../supabase/migrations/*.sql | wc -l) migrations applied)."
