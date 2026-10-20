-- Hidden Kenya: booking engine.
--
-- Booking lifecycle (allowed transitions)
--   instant listing:  [create] -> pending_payment
--   request listing:  [create] -> pending_provider_confirmation
--   pending_provider_confirmation -> pending_payment   (provider accepts)
--                                 -> cancelled         (provider declines, customer cancels)
--                                 -> expired           (provider did not respond in time)
--   pending_payment  -> confirmed       (verified payment success)
--                    -> payment_failed  (verified payment failure)
--                    -> cancelled       (customer cancels before paying)
--                    -> expired         (hold elapsed)
--   payment_failed   -> pending_payment (customer retries) | cancelled | expired
--   confirmed        -> refund_pending  (cancellation with refund > 0)
--                    -> cancelled       (cancellation with no refund due)
--                    -> completed       (experience end time passed)
--   refund_pending   -> refunded        (gateway confirms refund processed)
--   expired/cancelled + late verified payment -> confirmed if places remain, else refund_pending
--
-- Seats are held by pending bookings only while hold_expires_at is in the future.

------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------
create or replace function app_private.new_booking_reference()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'HK-' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8));
$$;

-- Refund percentage for a customer cancellation made at p_at.
--   flexible: 100% if >= 24h before start, else 0%
--   moderate: 100% if >= 5 days, 50% if >= 24h, else 0%
--   strict:   100% if >= 14 days, 50% if >= 7 days, else 0%
create or replace function app_private.refund_percent(
  p_policy public.cancellation_policy, p_starts_at timestamptz, p_at timestamptz
) returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_starts_at <= p_at then 0
    when p_policy = 'flexible' then case when p_starts_at - p_at >= interval '24 hours' then 100 else 0 end
    when p_policy = 'moderate' then case
      when p_starts_at - p_at >= interval '5 days' then 100
      when p_starts_at - p_at >= interval '24 hours' then 50
      else 0 end
    else case
      when p_starts_at - p_at >= interval '14 days' then 100
      when p_starts_at - p_at >= interval '7 days' then 50
      else 0 end
  end;
$$;

create or replace function app_private.paid_amount(p_booking_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount_minor), 0)::bigint
  from public.payments where booking_id = p_booking_id and status = 'succeeded';
$$;

-- Opens refunds against succeeded payments for p_amount in total (largest payments first).
create or replace function app_private.open_refunds(
  p_booking_id uuid, p_amount bigint, p_reason text, p_actor uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining bigint := p_amount;
  v_pay record;
  v_available bigint;
  v_take bigint;
begin
  for v_pay in
    select p.id, p.amount_minor, p.currency,
           p.amount_minor - coalesce((select sum(r.amount_minor) from public.refunds r
                                      where r.payment_id = p.id and r.status <> 'failed'), 0) as refundable
    from public.payments p
    where p.booking_id = p_booking_id and p.status = 'succeeded'
    order by p.amount_minor desc, p.created_at
  loop
    exit when v_remaining <= 0;
    v_available := v_pay.refundable;
    continue when v_available <= 0;
    v_take := least(v_available, v_remaining);
    insert into public.refunds (booking_id, payment_id, amount_minor, currency, reason, initiated_by)
    values (p_booking_id, v_pay.id, v_take, v_pay.currency, left(p_reason, 300), p_actor);
    v_remaining := v_remaining - v_take;
  end loop;
  if v_remaining > 0 then
    raise exception 'HK_REFUND_EXCEEDS_PAYMENT: Refund exceeds the amount paid.' using errcode = '22023';
  end if;
end;
$$;

------------------------------------------------------------------------------
-- Create booking
------------------------------------------------------------------------------
create or replace function public.create_booking(
  p_experience_id uuid,
  p_starts_at timestamptz,
  p_party_size integer,
  p_idempotency_key text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_notes text default ''
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.bookings%rowtype;
  v_exp record;
  v_cap integer;
  v_session uuid;
  v_taken integer;
  v_rate integer;
  v_total bigint;
  v_status public.booking_status;
  v_hold timestamptz;
  v_id uuid;
  v_attempt integer := 0;
begin
  if v_uid is null then
    raise exception 'HK_AUTH_REQUIRED: Sign in to book.' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and deactivated_at is not null) then
    raise exception 'HK_ACCOUNT_DEACTIVATED: This account is deactivated.' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'HK_INVALID_INPUT: Missing request key.' using errcode = '22023';
  end if;

  -- Idempotent replay: same key returns the same booking.
  select * into v_existing from public.bookings where customer_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.experience_id <> p_experience_id or v_existing.starts_at <> p_starts_at
       or v_existing.party_size <> p_party_size then
      raise exception 'HK_IDEMPOTENCY_CONFLICT: This request key was already used for a different booking.' using errcode = '22023';
    end if;
    return v_existing.id;
  end if;

  select e.id, e.provider_id, e.category_id, e.price_minor, e.currency, e.pricing_model,
         e.duration_minutes, e.min_participants, e.max_participants, e.lead_time_hours,
         e.max_advance_days, e.booking_mode, e.cancellation_policy, p.user_id as provider_user_id
    into v_exp
  from public.experiences e
  join public.provider_profiles p on p.id = e.provider_id
  where e.id = p_experience_id and e.status = 'published' and p.verification_status = 'verified';
  if not found then
    raise exception 'HK_LISTING_UNAVAILABLE: This experience is not available for booking.' using errcode = 'P0002';
  end if;
  if v_exp.provider_user_id = v_uid then
    raise exception 'HK_OWN_LISTING: You cannot book your own experience.' using errcode = '22023';
  end if;
  if p_party_size is null or p_party_size < v_exp.min_participants or p_party_size > v_exp.max_participants then
    raise exception 'HK_PARTY_SIZE: Group size must be between % and %.', v_exp.min_participants, v_exp.max_participants
      using errcode = '22023';
  end if;
  if p_starts_at < now() + make_interval(hours => v_exp.lead_time_hours) then
    raise exception 'HK_TOO_SOON: This departure is too soon to book (needs % hours notice).', v_exp.lead_time_hours
      using errcode = '22023';
  end if;
  if p_starts_at > now() + make_interval(days => v_exp.max_advance_days) then
    raise exception 'HK_TOO_FAR: This date is beyond the booking window.' using errcode = '22023';
  end if;

  p_contact_name := trim(coalesce(p_contact_name, ''));
  p_contact_email := lower(trim(coalesce(p_contact_email, '')));
  p_contact_phone := trim(coalesce(p_contact_phone, ''));
  if char_length(p_contact_name) not between 2 and 120
     or p_contact_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or p_contact_phone !~ '^\+?[0-9 ()-]{7,20}$' then
    raise exception 'HK_INVALID_CONTACT: Enter a valid name, email and phone number.' using errcode = '22023';
  end if;

  -- Anti-hoarding: cap concurrent unpaid holds per customer.
  if (select count(*) from public.bookings
      where customer_id = v_uid
        and status in ('pending_payment', 'payment_failed', 'pending_provider_confirmation')
        and hold_expires_at > now()) >= 5 then
    raise exception 'HK_TOO_MANY_HOLDS: Complete or cancel your pending bookings first.' using errcode = '22023';
  end if;

  v_rate := app_private.commission_rate_bps(v_exp.provider_id, v_exp.category_id);
  if v_rate is null then
    raise exception 'HK_BOOKINGS_NOT_OPEN: Bookings are not open yet. Please try again later.' using errcode = '55000';
  end if;

  v_cap := app_private.occurrence_capacity(p_experience_id, p_starts_at);
  if v_cap is null then
    raise exception 'HK_NO_DEPARTURE: There is no departure at that time.' using errcode = '22023';
  end if;

  -- Serialise bookings for this departure.
  insert into public.experience_sessions (experience_id, starts_at)
  values (p_experience_id, p_starts_at)
  on conflict (experience_id, starts_at) do nothing;
  select id into v_session from public.experience_sessions
  where experience_id = p_experience_id and starts_at = p_starts_at
  for update;

  v_taken := app_private.session_seats_taken(v_session);
  if v_taken + p_party_size > v_cap then
    raise exception 'HK_SOLD_OUT: Only % place(s) left for this departure.', greatest(v_cap - v_taken, 0)
      using errcode = '22023';
  end if;

  v_total := case when v_exp.pricing_model = 'per_person' then v_exp.price_minor * p_party_size else v_exp.price_minor end;

  if v_exp.booking_mode = 'instant' then
    v_status := 'pending_payment';
    v_hold := least(now() + make_interval(mins => app_private.setting_int('payment_hold_minutes', 30)), p_starts_at);
  else
    v_status := 'pending_provider_confirmation';
    v_hold := least(now() + make_interval(hours => app_private.setting_int('provider_response_hours', 48)), p_starts_at);
  end if;

  loop
    begin
      insert into public.bookings (
        reference, customer_id, experience_id, provider_id, session_id, starts_at, ends_at,
        party_size, pricing_model, unit_price_minor, total_minor, currency, commission_rate_bps,
        cancellation_policy, booking_mode, status, hold_expires_at,
        contact_name, contact_email, contact_phone, customer_notes, idempotency_key
      ) values (
        app_private.new_booking_reference(), v_uid, p_experience_id, v_exp.provider_id, v_session,
        p_starts_at, p_starts_at + make_interval(mins => v_exp.duration_minutes),
        p_party_size, v_exp.pricing_model, v_exp.price_minor, v_total, v_exp.currency, v_rate,
        v_exp.cancellation_policy, v_exp.booking_mode, v_status, v_hold,
        p_contact_name, p_contact_email, p_contact_phone, left(coalesce(p_notes, ''), 1000), p_idempotency_key
      ) returning id into v_id;
      exit;
    exception when unique_violation then
      -- A concurrent request with the same idempotency key won the race.
      select * into v_existing from public.bookings where customer_id = v_uid and idempotency_key = p_idempotency_key;
      if found then
        return v_existing.id;
      end if;
      -- Otherwise the generated reference collided; retry.
      v_attempt := v_attempt + 1;
      if v_attempt > 5 then
        raise;
      end if;
    end;
  end loop;

  return v_id;
end;
$$;

------------------------------------------------------------------------------
-- Provider decision for request-mode bookings
------------------------------------------------------------------------------
create or replace function public.provider_respond_to_booking(p_booking_id uuid, p_accept boolean, p_note text default '')
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings%rowtype;
  v_new public.booking_status;
begin
  select * into v_b from public.bookings
  where id = p_booking_id and provider_id = app_private.my_provider_id()
  for update;
  if not found then
    raise exception 'HK_NOT_FOUND: Booking not found.' using errcode = 'P0002';
  end if;
  if v_b.status <> 'pending_provider_confirmation' or v_b.hold_expires_at <= now() then
    raise exception 'HK_INVALID_STATE: This request can no longer be answered.' using errcode = '22023';
  end if;
  if p_accept then
    v_new := 'pending_payment';
    update public.bookings
       set status = v_new,
           hold_expires_at = least(now() + make_interval(hours => app_private.setting_int('request_payment_hold_hours', 24)), starts_at),
           provider_response_note = left(coalesce(p_note, ''), 1000)
     where id = p_booking_id;
  else
    if char_length(trim(coalesce(p_note, ''))) < 5 then
      raise exception 'HK_NOTES_REQUIRED: Tell the guest why you cannot accept.' using errcode = '22023';
    end if;
    v_new := 'cancelled';
    update public.bookings
       set status = v_new, cancelled_at = now(), cancelled_by = 'provider',
           cancellation_reason = left(p_note, 1000), provider_response_note = left(p_note, 1000)
     where id = p_booking_id;
  end if;
  perform app_private.audit('booking.provider_' || case when p_accept then 'accepted' else 'declined' end,
    'booking', p_booking_id::text, '{}'::jsonb);
  return v_new;
end;
$$;

------------------------------------------------------------------------------
-- Cancellation
------------------------------------------------------------------------------
create or replace function public.cancellation_quote(p_booking_id uuid)
returns table (refund_minor bigint, refund_percent integer, currency text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_b public.bookings%rowtype;
  v_pct integer;
begin
  select * into v_b from public.bookings where id = p_booking_id and customer_id = auth.uid();
  if not found then
    raise exception 'HK_NOT_FOUND: Booking not found.' using errcode = 'P0002';
  end if;
  if v_b.status <> 'confirmed' then
    return query select 0::bigint, 0, v_b.currency::text;
    return;
  end if;
  v_pct := app_private.refund_percent(v_b.cancellation_policy, v_b.starts_at, now());
  return query select round(app_private.paid_amount(v_b.id) * v_pct / 100.0)::bigint, v_pct, v_b.currency::text;
end;
$$;

create or replace function app_private.cancel_booking_internal(
  p_booking_id uuid, p_actor text, p_reason text, p_refund_minor bigint
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings%rowtype;
  v_paid bigint;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.status in ('pending_provider_confirmation', 'pending_payment', 'payment_failed') then
    update public.bookings
       set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor, cancellation_reason = left(p_reason, 1000)
     where id = p_booking_id;
    update public.payments set status = 'abandoned'
     where booking_id = p_booking_id and status in ('initiated', 'pending');
    return 'cancelled';
  elsif v_b.status = 'confirmed' then
    v_paid := app_private.paid_amount(p_booking_id);
    p_refund_minor := least(greatest(coalesce(p_refund_minor, 0), 0), v_paid);
    if p_refund_minor > 0 then
      perform app_private.open_refunds(p_booking_id, p_refund_minor, 'Cancellation: ' || left(p_reason, 280), auth.uid());
      update public.bookings
         set status = 'refund_pending', refund_minor = p_refund_minor, cancelled_at = now(),
             cancelled_by = p_actor, cancellation_reason = left(p_reason, 1000)
       where id = p_booking_id;
      return 'refund_pending';
    end if;
    update public.bookings
       set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor, cancellation_reason = left(p_reason, 1000)
     where id = p_booking_id;
    return 'cancelled';
  else
    raise exception 'HK_INVALID_STATE: A % booking cannot be cancelled.', v_b.status using errcode = '22023';
  end if;
end;
$$;

-- Customer cancellation. Refund follows the listing's policy at the moment of cancelling.
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings%rowtype;
  v_refund bigint := 0;
  v_result text;
begin
  select * into v_b from public.bookings where id = p_booking_id and customer_id = auth.uid() for update;
  if not found then
    raise exception 'HK_NOT_FOUND: Booking not found.' using errcode = 'P0002';
  end if;
  if v_b.status = 'confirmed' then
    if v_b.starts_at <= now() then
      raise exception 'HK_TOO_LATE: This experience has already started.' using errcode = '22023';
    end if;
    v_refund := round(app_private.paid_amount(v_b.id)
                * app_private.refund_percent(v_b.cancellation_policy, v_b.starts_at, now()) / 100.0)::bigint;
  end if;
  v_result := app_private.cancel_booking_internal(p_booking_id, 'customer',
    coalesce(nullif(trim(p_reason), ''), 'Cancelled by guest'), v_refund);
  perform app_private.audit('booking.cancelled_by_customer', 'booking', p_booking_id::text,
    jsonb_build_object('refund_minor', v_refund, 'result', v_result));
  return v_result;
end;
$$;

-- Provider cancellation always refunds the guest in full.
create or replace function public.provider_cancel_booking(p_booking_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result text;
begin
  if not exists (select 1 from public.bookings where id = p_booking_id and provider_id = app_private.my_provider_id()) then
    raise exception 'HK_NOT_FOUND: Booking not found.' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'HK_NOTES_REQUIRED: Tell the guest why the booking is cancelled.' using errcode = '22023';
  end if;
  v_result := app_private.cancel_booking_internal(p_booking_id, 'provider', p_reason, app_private.paid_amount(p_booking_id));
  perform app_private.audit('booking.cancelled_by_provider', 'booking', p_booking_id::text, jsonb_build_object('result', v_result));
  return v_result;
end;
$$;

-- Admin cancellation with an explicit refund amount (null = full refund).
create or replace function public.admin_cancel_booking(p_booking_id uuid, p_reason text, p_refund_minor bigint default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result text;
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.bookings where id = p_booking_id) then
    raise exception 'HK_NOT_FOUND: Booking not found.' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'HK_NOTES_REQUIRED: Record a reason.' using errcode = '22023';
  end if;
  v_result := app_private.cancel_booking_internal(p_booking_id, 'admin', p_reason,
    coalesce(p_refund_minor, app_private.paid_amount(p_booking_id)));
  perform app_private.audit('booking.cancelled_by_admin', 'booking', p_booking_id::text,
    jsonb_build_object('result', v_result, 'refund_minor', p_refund_minor));
  return v_result;
end;
$$;

------------------------------------------------------------------------------
-- Payments
------------------------------------------------------------------------------
-- Customer starts (or retries) payment. Amount comes from the booking, never the client.
create or replace function public.begin_payment(p_booking_id uuid)
returns table (payment_id uuid, reference text, amount_minor bigint, currency text, email text, hold_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings%rowtype;
  v_id uuid;
  v_ref text;
begin
  select * into v_b from public.bookings where id = p_booking_id and customer_id = auth.uid() for update;
  if not found then
    raise exception 'HK_NOT_FOUND: Booking not found.' using errcode = 'P0002';
  end if;
  if v_b.status not in ('pending_payment', 'payment_failed') or v_b.hold_expires_at <= now() then
    raise exception 'HK_NOT_PAYABLE: This booking can no longer be paid. Start a new booking.' using errcode = '22023';
  end if;
  if not app_private.experience_is_public(v_b.experience_id) then
    raise exception 'HK_LISTING_UNAVAILABLE: This experience is no longer available.' using errcode = '22023';
  end if;
  if (select count(*) from public.payments where booking_id = p_booking_id) >= 10 then
    raise exception 'HK_TOO_MANY_ATTEMPTS: Too many payment attempts. Contact support.' using errcode = '22023';
  end if;

  update public.payments set status = 'abandoned'
   where booking_id = p_booking_id and status = 'initiated';
  if v_b.status = 'payment_failed' then
    update public.bookings set status = 'pending_payment' where id = p_booking_id;
  end if;

  v_ref := 'HKP_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.payments (booking_id, reference, amount_minor, currency)
  values (p_booking_id, v_ref, v_b.total_minor, v_b.currency)
  returning id into v_id;

  return query select v_id, v_ref, v_b.total_minor, v_b.currency::text, v_b.contact_email, v_b.hold_expires_at;
end;
$$;

-- Webhook deduplication. Returns true when this delivery has not been seen before.
create or replace function public.record_payment_event(
  p_gateway text, p_dedupe_key text, p_event_type text, p_reference text, p_payload jsonb
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payment_events (gateway, dedupe_key, event_type, reference, payload)
  values (p_gateway, p_dedupe_key, p_event_type, p_reference, coalesce(p_payload, '{}'::jsonb));
  return true;
exception when unique_violation then
  return false;
end;
$$;

create or replace function public.finish_payment_event(p_dedupe_key text, p_outcome text, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_events
     set outcome = left(p_outcome, 80), processing_error = left(p_error, 500), processed_at = now()
   where dedupe_key = p_dedupe_key;
$$;

-- Apply a VERIFIED gateway result. Called only by trusted server code after signature
-- verification and/or a server-to-server transaction lookup. Idempotent.
create or replace function public.apply_payment_result(
  p_reference text,
  p_outcome text,
  p_amount_minor bigint,
  p_currency text,
  p_gateway_transaction_id text default null,
  p_channel text default null,
  p_fees_minor bigint default null,
  p_paid_at timestamptz default null,
  p_failure_reason text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payments%rowtype;
  v_b public.bookings%rowtype;
  v_cap integer;
  v_taken integer;
begin
  if p_outcome not in ('succeeded', 'failed', 'pending') then
    raise exception 'invalid outcome %', p_outcome using errcode = '22023';
  end if;
  select * into v_p from public.payments where reference = p_reference for update;
  if not found then
    return 'unknown_reference';
  end if;
  select * into v_b from public.bookings where id = v_p.booking_id for update;

  if v_p.status = 'succeeded' then
    return 'already_succeeded';
  end if;

  if p_outcome = 'pending' then
    update public.payments set status = 'pending' where id = v_p.id and status = 'initiated';
    return 'pending';
  end if;

  if p_outcome = 'failed' then
    if v_p.status in ('initiated', 'pending', 'abandoned') then
      update public.payments
         set status = 'failed', failure_reason = left(coalesce(p_failure_reason, 'Payment failed'), 300),
             gateway_transaction_id = coalesce(p_gateway_transaction_id, gateway_transaction_id)
       where id = v_p.id;
      if v_b.status = 'pending_payment' then
        update public.bookings set status = 'payment_failed' where id = v_b.id;
      end if;
    end if;
    return 'failed';
  end if;

  -- Succeeded: verify amount and currency exactly.
  if p_amount_minor is distinct from v_p.amount_minor or upper(p_currency) is distinct from v_p.currency then
    update public.payments
       set status = 'amount_mismatch', received_amount_minor = p_amount_minor,
           received_currency = upper(left(p_currency, 3)),
           gateway_transaction_id = coalesce(p_gateway_transaction_id, gateway_transaction_id)
     where id = v_p.id;
    perform app_private.audit('payment.amount_mismatch', 'payment', v_p.id::text,
      jsonb_build_object('expected', v_p.amount_minor, 'received', p_amount_minor,
                         'expected_currency', v_p.currency, 'received_currency', p_currency));
    return 'amount_mismatch';
  end if;

  update public.payments
     set status = 'succeeded', paid_at = coalesce(p_paid_at, now()),
         gateway_transaction_id = coalesce(p_gateway_transaction_id, gateway_transaction_id),
         channel = left(p_channel, 40), fees_minor = p_fees_minor,
         received_amount_minor = p_amount_minor, received_currency = upper(p_currency)
   where id = v_p.id;

  -- Booking already paid by another attempt: refund this duplicate.
  if v_b.status in ('confirmed', 'completed', 'refund_pending', 'refunded') then
    perform app_private.open_refunds_for_payment(v_p.id, 'Duplicate payment');
    return 'duplicate_refund';
  end if;

  if v_b.status in ('pending_payment', 'payment_failed') and v_b.hold_expires_at > now() then
    update public.bookings set status = 'confirmed', confirmed_at = now() where id = v_b.id;
    return 'confirmed';
  end if;

  -- Late payment (hold expired, or booking cancelled while payment was in flight).
  if v_b.status in ('pending_payment', 'payment_failed', 'expired') and v_b.starts_at > now() then
    perform 1 from public.experience_sessions where id = v_b.session_id for update;
    v_cap := app_private.occurrence_capacity(v_b.experience_id, v_b.starts_at);
    v_taken := app_private.session_seats_taken(v_b.session_id);
    if v_cap is not null and app_private.experience_is_public(v_b.experience_id)
       and v_taken + v_b.party_size <= v_cap then
      update public.bookings set status = 'confirmed', confirmed_at = now() where id = v_b.id;
      return 'confirmed_late';
    end if;
  end if;

  perform app_private.open_refunds_for_payment(v_p.id, 'Payment received after the reservation ended');
  update public.bookings
     set status = 'refund_pending', refund_minor = least(total_minor, refund_minor + p_amount_minor),
         cancelled_at = coalesce(cancelled_at, now()), cancelled_by = coalesce(cancelled_by, 'system'),
         cancellation_reason = case when cancellation_reason = '' then 'Payment arrived after the reservation ended' else cancellation_reason end
   where id = v_b.id;
  return 'late_refund';
end;
$$;

create or replace function app_private.open_refunds_for_payment(p_payment_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.refunds (booking_id, payment_id, amount_minor, currency, reason)
  select p.booking_id, p.id, p.amount_minor, p.currency, p_reason
  from public.payments p
  where p.id = p_payment_id
    and not exists (select 1 from public.refunds r where r.payment_id = p.id and r.status <> 'failed');
$$;

-- Gateway refund outcome (service role).
create or replace function public.apply_refund_result(
  p_refund_id uuid, p_status public.refund_status, p_gateway_refund_id text default null, p_failure_reason text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.refunds%rowtype;
begin
  select * into v_r from public.refunds where id = p_refund_id for update;
  if not found then
    return 'unknown_refund';
  end if;
  if v_r.status = 'processed' then
    return 'already_processed';
  end if;
  update public.refunds
     set status = p_status,
         gateway_refund_id = coalesce(p_gateway_refund_id, gateway_refund_id),
         failure_reason = left(coalesce(p_failure_reason, ''), 300),
         processed_at = case when p_status = 'processed' then now() else processed_at end
   where id = p_refund_id;

  if p_status = 'processed' then
    update public.bookings b set status = 'refunded'
     where b.id = v_r.booking_id and b.status = 'refund_pending'
       and not exists (select 1 from public.refunds r where r.booking_id = b.id and r.status in ('pending', 'processing', 'failed'));
  end if;
  return p_status::text;
end;
$$;

------------------------------------------------------------------------------
-- Scheduled maintenance (service role)
------------------------------------------------------------------------------
create or replace function public.expire_stale_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.bookings
       set status = 'expired'
     where status in ('pending_payment', 'payment_failed', 'pending_provider_confirmation')
       and hold_expires_at <= now()
    returning id
  )
  select count(*) into v_count from expired;
  update public.payments p set status = 'abandoned'
   from public.bookings b
   where b.id = p.booking_id and b.status = 'expired' and p.status = 'initiated';
  return v_count;
end;
$$;

create or replace function public.complete_past_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with done as (
    update public.bookings
       set status = 'completed', completed_at = now()
     where status = 'confirmed' and ends_at <= now()
    returning id
  )
  select count(*) into v_count from done;
  return v_count;
end;
$$;

------------------------------------------------------------------------------
-- Reviews (only for completed bookings, by the guest, within the review window)
------------------------------------------------------------------------------
create or replace function public.create_review(p_booking_id uuid, p_rating integer, p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings%rowtype;
  v_name text;
  v_display text;
  v_id uuid;
begin
  select * into v_b from public.bookings where id = p_booking_id and customer_id = auth.uid();
  if not found then
    raise exception 'HK_NOT_FOUND: Booking not found.' using errcode = 'P0002';
  end if;
  if v_b.status <> 'completed' then
    raise exception 'HK_REVIEW_NOT_ELIGIBLE: You can review an experience after it has taken place.' using errcode = '22023';
  end if;
  if v_b.completed_at < now() - make_interval(days => app_private.setting_int('review_window_days', 90)) then
    raise exception 'HK_REVIEW_WINDOW_CLOSED: The review window for this booking has closed.' using errcode = '22023';
  end if;
  if exists (select 1 from public.reviews where booking_id = p_booking_id) then
    raise exception 'HK_ALREADY_REVIEWED: You have already reviewed this booking.' using errcode = '23505';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'HK_INVALID_INPUT: Rating must be 1 to 5.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_body, ''))) not between 20 and 4000 then
    raise exception 'HK_INVALID_INPUT: Review must be 20–4000 characters.' using errcode = '22023';
  end if;

  select trim(full_name) into v_name from public.profiles where id = auth.uid();
  v_display := case
    when coalesce(v_name, '') = '' then 'Guest'
    when position(' ' in v_name) = 0 then left(v_name, 40)
    else left(split_part(v_name, ' ', 1), 40) || ' ' || left(regexp_replace(v_name, '^.*\s', ''), 1) || '.'
  end;

  insert into public.reviews (booking_id, experience_id, provider_id, customer_id, reviewer_display_name,
                              rating, title, body, experienced_on)
  values (p_booking_id, v_b.experience_id, v_b.provider_id, auth.uid(), v_display,
          p_rating, left(trim(coalesce(p_title, '')), 120), trim(p_body),
          (v_b.starts_at at time zone 'Africa/Nairobi')::date)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.respond_to_review(p_review_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reviews
     set provider_response = left(trim(coalesce(p_response, '')), 2000), provider_responded_at = now()
   where id = p_review_id and provider_id = app_private.my_provider_id() and status = 'published';
  if not found then
    raise exception 'HK_NOT_FOUND: Review not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.report_review(p_review_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'HK_AUTH_REQUIRED: Sign in to report a review.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.reviews where id = p_review_id and status = 'published') then
    raise exception 'HK_NOT_FOUND: Review not found.' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 5 and 1000 then
    raise exception 'HK_INVALID_INPUT: Describe the problem (5–1000 characters).' using errcode = '22023';
  end if;
  insert into public.review_reports (review_id, reporter_id, reason)
  values (p_review_id, auth.uid(), trim(p_reason))
  on conflict (review_id, reporter_id) do nothing;
end;
$$;
