#!/usr/bin/env bash
# Creates the END-TO-END TEST database: real Supabase Auth migrations, the storage shim,
# and all Hidden Kenya migrations. Local only.
#
#   E2E_DATABASE_URL=postgres://user:pass@localhost:5432/hk_e2e AUTH_BIN=/path/to/auth tests/e2e/stack/setup-db.sh
set -euo pipefail
: "${E2E_DATABASE_URL:?Set E2E_DATABASE_URL (local PostgreSQL)}"
: "${AUTH_BIN:?Set AUTH_BIN to the Supabase Auth (GoTrue) binary}"
case "$E2E_DATABASE_URL" in *@localhost*|*@127.0.0.1*) ;; *) echo "Refusing: E2E_DATABASE_URL must be local." >&2; exit 1 ;; esac

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DB_NAME="${E2E_DATABASE_URL##*/}"; DB_NAME="${DB_NAME%%\?*}"
ADMIN_URL="${E2E_DATABASE_URL%/*}/postgres"
AUTHENTICATOR_PASSWORD="${E2E_AUTHENTICATOR_PASSWORD:-e2e-authenticator}"

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q <<SQL
drop database if exists "$DB_NAME" with (force);
create database "$DB_NAME";
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password '$AUTHENTICATOR_PASSWORD';
  end if;
end \$\$;
SQL

psql "$E2E_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "create schema if not exists auth;"
# Supabase Auth creates and migrates its own auth schema.
DATABASE_URL="${E2E_DATABASE_URL}?search_path=auth" GOTRUE_DB_DRIVER=postgres GOTRUE_DB_MIGRATIONS_PATH="$(dirname "$AUTH_BIN")/migrations" \
  GOTRUE_JWT_SECRET=migration-only-secret-migration-only-secret API_EXTERNAL_URL=http://localhost GOTRUE_SITE_URL=http://localhost \
  "$AUTH_BIN" migrate > /dev/null

psql "$E2E_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/storage-shim.sql"
psql "$E2E_DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant anon, authenticated, service_role to authenticator;
SQL
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$E2E_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" > /dev/null || { echo "Migration failed: $f" >&2; exit 1; }
done
echo "E2E database $DB_NAME ready."
