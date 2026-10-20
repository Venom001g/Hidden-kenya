-- Hidden Kenya: foundation
-- Schemas, enums, shared utilities, profiles, roles, reference tables, settings,
-- audit log and rate limiting.
--
-- Conventions
--   * All timestamps are timestamptz stored in UTC.
--   * Money is stored as bigint minor units (cents) plus an ISO-4217 currency code.
--     KES and USD both use 2 decimal places (exponent 2).
--   * Internal helpers live in schema app_private, which is NOT exposed through the
--     Supabase Data API. Client-callable RPCs live in public and are SECURITY DEFINER
--     with an empty search_path and explicit permission checks.

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to anon, authenticated, service_role;

-- Functions are not executable by PUBLIC unless explicitly granted.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema app_private revoke execute on functions from public;

------------------------------------------------------------------------------
-- Enums
------------------------------------------------------------------------------
create type public.app_role as enum ('customer', 'provider', 'admin');

create type public.provider_status as enum (
  'draft', 'pending_review', 'verified', 'changes_requested', 'rejected', 'suspended'
);

create type public.document_type as enum (
  'business_registration', 'tourism_licence', 'identity_document',
  'tax_pin_certificate', 'insurance_certificate', 'guide_certification', 'other'
);

create type public.document_status as enum ('submitted', 'accepted', 'rejected');

create type public.content_status as enum ('draft', 'published', 'archived');

create type public.experience_status as enum (
  'draft', 'pending_review', 'changes_requested', 'published', 'paused',
  'archived', 'rejected', 'suspended'
);

create type public.pricing_model as enum ('per_person', 'per_group');
create type public.booking_mode as enum ('instant', 'request');
create type public.cancellation_policy as enum ('flexible', 'moderate', 'strict');

create type public.booking_status as enum (
  'pending_provider_confirmation', 'pending_payment', 'payment_failed', 'confirmed',
  'refund_pending', 'refunded', 'cancelled', 'expired', 'completed'
);

create type public.payment_status as enum (
  'initiated', 'pending', 'succeeded', 'failed', 'abandoned', 'amount_mismatch'
);

create type public.refund_status as enum ('pending', 'processing', 'processed', 'failed');
create type public.payout_status as enum ('draft', 'processing', 'paid', 'failed', 'cancelled');
create type public.review_status as enum ('published', 'under_review', 'removed');
create type public.notification_status as enum (
  'queued', 'sent', 'failed', 'skipped_unconfigured', 'skipped_preference'
);
create type public.ticket_status as enum ('open', 'awaiting_customer', 'resolved', 'closed');
create type public.newsletter_status as enum ('pending', 'subscribed', 'unsubscribed');
create type public.data_request_type as enum ('export', 'deletion');
create type public.data_request_status as enum ('received', 'in_progress', 'completed', 'rejected');

------------------------------------------------------------------------------
-- Utilities
------------------------------------------------------------------------------
create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Great-circle distance in kilometres (haversine). Coordinates are degrees.
create or replace function app_private.distance_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 6371.0088 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

------------------------------------------------------------------------------
-- Profiles and roles
------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  country_code char(2) check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  email_booking_reminders boolean not null default true,
  email_product_updates boolean not null default false,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is
  'One row per auth user. Created by trigger on auth.users. Deleted with the auth user.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function app_private.set_updated_at();

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is
  'Authorisation roles. Never writable by clients; changed only by SECURITY DEFINER functions or the service role.';
create index user_roles_role_idx on public.user_roles (role);

create or replace function app_private.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = p_role
  );
$$;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_role('admin');
$$;

grant execute on function app_private.has_role(public.app_role) to anon, authenticated, service_role;
grant execute on function app_private.is_admin() to anon, authenticated, service_role;
grant execute on function app_private.distance_km(double precision, double precision, double precision, double precision)
  to anon, authenticated, service_role;

-- New auth user => profile + customer role. Role is NEVER read from user metadata.
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''), 120)
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

------------------------------------------------------------------------------
-- Reference data tables
------------------------------------------------------------------------------
create table public.counties (
  code smallint primary key check (code between 1 and 47),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  former_province text not null
);
comment on table public.counties is
  'Kenya''s 47 counties. Source: Constitution of Kenya 2010, First Schedule. former_province is the pre-2013 province grouping, used as a familiar travel region.';

create table public.experience_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null unique check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 300),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger experience_categories_updated_at before update on public.experience_categories
  for each row execute function app_private.set_updated_at();

------------------------------------------------------------------------------
-- Site settings (admin-managed configuration)
------------------------------------------------------------------------------
create table public.site_settings (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  value jsonb not null,
  is_public boolean not null default false,
  description text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function app_private.set_updated_at();

-- Typed setting readers with documented defaults (defaults are operational limits,
-- not business data).
create or replace function app_private.setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::integer from public.site_settings where key = p_key), p_default);
$$;
grant execute on function app_private.setting_int(text, integer) to anon, authenticated, service_role;

------------------------------------------------------------------------------
-- Audit log (append-only)
------------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 3 and 80),
  entity_type text not null check (char_length(entity_type) between 2 and 40),
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.audit_logs is
  'Append-only record of sensitive actions. Metadata must never contain secrets, tokens, passwords or document contents.';
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

create or replace function app_private.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function app_private.prevent_mutation();

create or replace function app_private.audit(
  p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Server-side code (service role) records actions on behalf of a verified actor.
create or replace function public.record_audit_event(
  p_actor_id uuid, p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;
revoke execute on function public.record_audit_event(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_audit_event(uuid, text, text, text, jsonb) to service_role;

------------------------------------------------------------------------------
-- Rate limiting (fixed window, database-backed so it works across serverless instances)
------------------------------------------------------------------------------
create table app_private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_idx on app_private.rate_limits (window_start);

-- Returns true when the call is allowed. Key should be a hash, never raw PII.
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or char_length(p_key) > 200 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into app_private.rate_limits as rl (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = rl.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup of old windows.
  if random() < 0.01 then
    delete from app_private.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
