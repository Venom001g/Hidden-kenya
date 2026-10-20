-- Hidden Kenya: bookings, payments, refunds, commission and payouts.

------------------------------------------------------------------------------
-- Commission rules. Bookings are blocked until an admin configures a default rule.
------------------------------------------------------------------------------
create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('default', 'category', 'provider')),
  category_id uuid references public.experience_categories (id) on delete cascade,
  provider_id uuid references public.provider_profiles (id) on delete cascade,
  rate_bps integer not null check (rate_bps between 0 and 5000),
  active_from timestamptz not null default now(),
  active_until timestamptz,
  note text not null default '' check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint commission_scope_target check (
    (scope = 'default' and category_id is null and provider_id is null) or
    (scope = 'category' and category_id is not null and provider_id is null) or
    (scope = 'provider' and provider_id is not null and category_id is null)
  ),
  constraint commission_window check (active_until is null or active_until > active_from)
);
comment on column public.commission_rules.rate_bps is 'Basis points: 1000 = 10%.';
create index commission_rules_lookup_idx on public.commission_rules (scope, active_from desc);

-- Most specific active rule wins: provider > category > default.
create or replace function app_private.commission_rate_bps(p_provider_id uuid, p_category_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select rate_bps from public.commission_rules
  where active_from <= now() and (active_until is null or active_until > now())
    and (
      (scope = 'provider' and provider_id = p_provider_id) or
      (scope = 'category' and category_id = p_category_id) or
      scope = 'default'
    )
  order by case scope when 'provider' then 1 when 'category' then 2 else 3 end, active_from desc
  limit 1;
$$;

------------------------------------------------------------------------------
-- Bookings
------------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^HK-[A-Z0-9]{8}$'),
  customer_id uuid references auth.users (id) on delete set null,
  experience_id uuid not null references public.experiences (id) on delete restrict,
  provider_id uuid not null references public.provider_profiles (id) on delete restrict,
  session_id uuid not null references public.experience_sessions (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  party_size integer not null check (party_size between 1 and 500),
  pricing_model public.pricing_model not null,
  unit_price_minor bigint not null check (unit_price_minor > 0),
  total_minor bigint not null check (total_minor > 0),
  currency char(3) not null check (currency in ('KES', 'USD')),
  commission_rate_bps integer not null check (commission_rate_bps between 0 and 5000),
  cancellation_policy public.cancellation_policy not null,
  booking_mode public.booking_mode not null,
  status public.booking_status not null,
  hold_expires_at timestamptz,
  -- Contact snapshot needed by the provider to fulfil the booking.
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  contact_email text not null check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text not null check (contact_phone ~ '^\+?[0-9 ()-]{7,20}$'),
  customer_notes text not null default '' check (char_length(customer_notes) <= 1000),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  refund_minor bigint not null default 0 check (refund_minor >= 0),
  provider_response_note text not null default '' check (char_length(provider_response_note) <= 1000),
  cancellation_reason text not null default '' check (char_length(cancellation_reason) <= 1000),
  cancelled_by text check (cancelled_by is null or cancelled_by in ('customer', 'provider', 'admin', 'system')),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_idempotency unique (customer_id, idempotency_key),
  constraint bookings_refund_not_exceeding check (refund_minor <= total_minor),
  constraint bookings_hold_for_pending check (
    status not in ('pending_payment', 'pending_provider_confirmation', 'payment_failed')
    or hold_expires_at is not null
  ),
  constraint bookings_confirmed_timestamp check (
    status not in ('confirmed', 'completed') or confirmed_at is not null
  )
);
comment on table public.bookings is
  'Created only by create_booking(). Status changes only through SECURITY DEFINER functions. Retained for 7 years for financial record keeping; contact fields are scrubbed when a customer deletes their account.';
create index bookings_customer_idx on public.bookings (customer_id, starts_at desc);
create index bookings_provider_idx on public.bookings (provider_id, starts_at desc);
create index bookings_session_active_idx on public.bookings (session_id)
  where status in ('pending_provider_confirmation', 'pending_payment', 'payment_failed', 'confirmed', 'completed');
create index bookings_status_idx on public.bookings (status, hold_expires_at);
create trigger bookings_updated_at before update on public.bookings
  for each row execute function app_private.set_updated_at();

-- Seats currently held or sold for a session. Pending holds count only while unexpired,
-- so availability is correct even if the expiry job has not run yet.
create or replace function app_private.session_seats_taken(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(b.party_size), 0)::integer
  from public.bookings b
  where b.session_id = p_session_id
    and (
      b.status in ('confirmed', 'completed')
      or (b.status in ('pending_provider_confirmation', 'pending_payment', 'payment_failed')
          and b.hold_expires_at > now())
    );
$$;

------------------------------------------------------------------------------
-- Payments
------------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  gateway text not null default 'paystack' check (gateway in ('paystack')),
  reference text not null unique check (reference ~ '^HKP_[a-z0-9]{32}$'),
  gateway_transaction_id text,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency in ('KES', 'USD')),
  status public.payment_status not null default 'initiated',
  channel text check (channel is null or char_length(channel) <= 40),
  fees_minor bigint check (fees_minor is null or fees_minor >= 0),
  received_amount_minor bigint,
  received_currency char(3),
  failure_reason text not null default '' check (char_length(failure_reason) <= 300),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_booking_idx on public.payments (booking_id, created_at desc);
create index payments_status_idx on public.payments (status);
-- More than one succeeded payment per booking is possible (e.g. a customer completes two
-- M-Pesa prompts). apply_payment_result() records the duplicate and opens a refund for it.
create trigger payments_updated_at before update on public.payments
  for each row execute function app_private.set_updated_at();

-- Every webhook delivery is recorded. dedupe_key makes processing idempotent.
create table public.payment_events (
  id bigint generated always as identity primary key,
  gateway text not null,
  dedupe_key text not null unique check (char_length(dedupe_key) <= 200),
  event_type text not null check (char_length(event_type) <= 80),
  reference text,
  -- Sanitised payload: customer and card details are stripped before storage.
  payload jsonb not null,
  outcome text not null default 'received' check (char_length(outcome) <= 80),
  processing_error text check (processing_error is null or char_length(processing_error) <= 500),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index payment_events_reference_idx on public.payment_events (reference);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency in ('KES', 'USD')),
  status public.refund_status not null default 'pending',
  reason text not null check (char_length(reason) between 2 and 300),
  gateway_refund_id text,
  failure_reason text not null default '' check (char_length(failure_reason) <= 300),
  initiated_by uuid references auth.users (id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_booking_idx on public.refunds (booking_id);
create index refunds_status_idx on public.refunds (status);
create unique index refunds_one_open_per_payment on public.refunds (payment_id)
  where status in ('pending', 'processing');
create trigger refunds_updated_at before update on public.refunds
  for each row execute function app_private.set_updated_at();

------------------------------------------------------------------------------
-- Provider payouts
------------------------------------------------------------------------------
create table public.provider_payouts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency in ('KES', 'USD')),
  status public.payout_status not null default 'draft',
  transfer_reference text check (transfer_reference is null or char_length(transfer_reference) <= 120),
  failure_reason text not null default '' check (char_length(failure_reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payouts_paid_has_reference check (status <> 'paid' or (transfer_reference is not null and paid_at is not null))
);
create index provider_payouts_provider_idx on public.provider_payouts (provider_id, created_at desc);
create trigger provider_payouts_updated_at before update on public.provider_payouts
  for each row execute function app_private.set_updated_at();

create table public.payout_items (
  payout_id uuid not null references public.provider_payouts (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  gross_minor bigint not null,
  refunded_minor bigint not null,
  commission_minor bigint not null,
  net_minor bigint not null check (net_minor >= 0),
  primary key (payout_id, booking_id)
);
-- A booking can be in at most one non-cancelled payout. Enforced in admin_create_payout()
-- with row locks; this index supports the lookup.
create index payout_items_booking_idx on public.payout_items (booking_id);

-- Accounting for a single booking (all minor units, booking currency).
--   gross       = amount paid by the customer (0 if never paid)
--   refunded    = processed refunds
--   commission  = commission on (gross - refunded), rounded half-up
--   net         = gross - refunded - commission
-- Payment-gateway fees are borne by the platform and reported separately.
create or replace function app_private.booking_accounting(p_booking_id uuid)
returns table (gross_minor bigint, refunded_minor bigint, commission_minor bigint, net_minor bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with paid as (
    select coalesce(sum(p.amount_minor), 0)::bigint as gross
    from public.payments p where p.booking_id = p_booking_id and p.status = 'succeeded'
  ), ref as (
    select coalesce(sum(r.amount_minor), 0)::bigint as refunded
    from public.refunds r where r.booking_id = p_booking_id and r.status = 'processed'
  ), b as (
    select commission_rate_bps from public.bookings where id = p_booking_id
  )
  select paid.gross,
         ref.refunded,
         round((paid.gross - ref.refunded) * b.commission_rate_bps / 10000.0)::bigint,
         (paid.gross - ref.refunded) - round((paid.gross - ref.refunded) * b.commission_rate_bps / 10000.0)::bigint
  from paid, ref, b;
$$;
