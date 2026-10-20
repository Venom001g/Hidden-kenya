-- TEST ONLY. Never run against a Supabase project.
--
-- Emulates the parts of a Supabase database that the migrations depend on, so the real
-- migrations can be applied to a plain local PostgreSQL for integration tests:
--   * roles, default privileges and storage (storage-shim.sql)
--   * auth.users, auth.uid(), auth.jwt()

\ir storage-shim.sql

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

alter table storage.objects alter column owner set default auth.uid();
