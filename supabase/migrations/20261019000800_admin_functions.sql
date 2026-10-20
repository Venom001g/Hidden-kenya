-- Hidden Kenya: administration, accounting, payouts, privacy.

------------------------------------------------------------------------------
-- Roles and users
------------------------------------------------------------------------------
-- First administrator. Service role only; refuses once any admin exists.
create or replace function public.bootstrap_first_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'An administrator already exists. Grant further admin roles from the admin dashboard.'
      using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  insert into public.user_roles (user_id, role) values (p_user_id, 'admin') on conflict do nothing;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (null, 'role.bootstrap_admin', 'user', p_user_id::text, '{"via":"bootstrap script"}'::jsonb);
end;
$$;

create or replace function public.admin_set_admin_role(p_user_id uuid, p_grant boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (p_user_id, 'admin', auth.uid())
    on conflict do nothing;
  else
    if p_user_id = auth.uid() then
      raise exception 'HK_INVALID_INPUT: You cannot remove your own administrator role.' using errcode = '22023';
    end if;
    if (select count(*) from public.user_roles where role = 'admin') <= 1 then
      raise exception 'HK_INVALID_INPUT: At least one administrator must remain.' using errcode = '22023';
    end if;
    delete from public.user_roles where user_id = p_user_id and role = 'admin';
  end if;
  perform app_private.audit(case when p_grant then 'role.admin_granted' else 'role.admin_revoked' end,
    'user', p_user_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'HK_INVALID_INPUT: You cannot deactivate your own account.' using errcode = '22023';
  end if;
  update public.profiles set deactivated_at = case when p_active then null else now() end where id = p_user_id;
  if not found then
    raise exception 'HK_NOT_FOUND: User not found.' using errcode = 'P0002';
  end if;
  insert into public.moderation_actions (actor_id, target_type, target_id, action, notes)
  values (auth.uid(), 'user', p_user_id, case when p_active then 'reactivate' else 'deactivate' end, left(coalesce(p_reason, ''), 2000));
  perform app_private.audit(case when p_active then 'user.reactivated' else 'user.deactivated' end,
    'user', p_user_id::text, '{}'::jsonb);
end;
$$;

-- Admin user directory (joins auth emails, which clients cannot read directly).
create or replace function public.admin_list_users(p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, email text, full_name text, roles public.app_role[], created_at timestamptz,
  last_sign_in_at timestamptz, deactivated_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  return query
  select u.id, u.email::text, p.full_name,
         coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}'),
         u.created_at, u.last_sign_in_at, p.deactivated_at,
         count(*) over ()
  from auth.users u
  join public.profiles p on p.id = u.id
  left join public.user_roles r on r.user_id = u.id
  where p_search is null or u.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%'
  group by u.id, u.email, p.full_name, u.created_at, u.last_sign_in_at, p.deactivated_at
  order by u.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

------------------------------------------------------------------------------
-- Configuration
------------------------------------------------------------------------------
create or replace function public.admin_set_commission_rule(
  p_scope text, p_rate_bps integer, p_category_id uuid default null, p_provider_id uuid default null, p_note text default ''
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  update public.commission_rules
     set active_until = now()
   where scope = p_scope
     and category_id is not distinct from p_category_id
     and provider_id is not distinct from p_provider_id
     and (active_until is null or active_until > now());
  insert into public.commission_rules (scope, category_id, provider_id, rate_bps, note, created_by)
  values (p_scope, p_category_id, p_provider_id, p_rate_bps, left(coalesce(p_note, ''), 300), auth.uid())
  returning id into v_id;
  perform app_private.audit('commission.set', 'commission_rule', v_id::text,
    jsonb_build_object('scope', p_scope, 'rate_bps', p_rate_bps, 'category_id', p_category_id, 'provider_id', p_provider_id));
  return v_id;
end;
$$;

create or replace function public.admin_end_commission_rule(p_rule_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  update public.commission_rules set active_until = now()
   where id = p_rule_id and (active_until is null or active_until > now());
  perform app_private.audit('commission.ended', 'commission_rule', p_rule_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_site_setting(p_key text, p_value jsonb, p_is_public boolean default false, p_description text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  insert into public.site_settings (key, value, is_public, description, updated_by)
  values (p_key, p_value, p_is_public, left(coalesce(p_description, ''), 300), auth.uid())
  on conflict (key) do update
    set value = excluded.value, is_public = excluded.is_public,
        description = excluded.description, updated_by = excluded.updated_by;
  perform app_private.audit('setting.updated', 'site_setting', p_key, jsonb_build_object('value', p_value));
end;
$$;

------------------------------------------------------------------------------
-- Reviews moderation
------------------------------------------------------------------------------
create or replace function public.admin_moderate_review(p_review_id uuid, p_status public.review_status, p_notes text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  update public.reviews set status = p_status where id = p_review_id returning provider_id into v_provider;
  if not found then
    raise exception 'HK_NOT_FOUND: Review not found.' using errcode = 'P0002';
  end if;
  update public.review_reports
     set status = case when p_status = 'removed' then 'upheld' else 'dismissed' end,
         resolved_by = auth.uid(), resolved_at = now()
   where review_id = p_review_id and status = 'open' and p_status <> 'under_review';
  insert into public.moderation_actions (actor_id, target_type, target_id, provider_id, action, notes)
  values (auth.uid(), 'review', p_review_id, v_provider, 'set_' || p_status::text, left(coalesce(p_notes, ''), 2000));
  perform app_private.audit('review.' || p_status::text, 'review', p_review_id::text, '{}'::jsonb);
end;
$$;

------------------------------------------------------------------------------
-- Accounting and payouts
------------------------------------------------------------------------------
-- Per-currency earnings for a provider. Definitions:
--   gross_minor          paid by guests (succeeded payments)
--   refunded_minor       refunds processed back to guests
--   commission_minor     platform commission on (gross - refunded)
--   gateway_fees_minor   payment-gateway fees, borne by the platform (informational)
--   net_minor            gross - refunded - commission
--   paid_out_minor       included in payouts marked paid
--   in_payout_minor      included in draft/processing payouts
--   available_minor      net from past experiences not yet in any payout
--   upcoming_minor       net from confirmed experiences that have not happened yet
create or replace function public.provider_earnings_summary(p_provider_id uuid default null)
returns table (
  currency text, gross_minor bigint, refunded_minor bigint, commission_minor bigint, gateway_fees_minor bigint,
  net_minor bigint, paid_out_minor bigint, in_payout_minor bigint, available_minor bigint, upcoming_minor bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  p_provider_id := coalesce(p_provider_id, app_private.my_provider_id());
  if p_provider_id is null or not (p_provider_id = app_private.my_provider_id() or app_private.is_admin()) then
    raise exception 'HK_FORBIDDEN: Not allowed.' using errcode = '42501';
  end if;
  return query
  with acc as (
    select b.id, b.currency::text as cur, b.starts_at, b.status, a.*,
           (select coalesce(sum(p.fees_minor), 0) from public.payments p where p.booking_id = b.id and p.status = 'succeeded') as fees,
           (select po.status from public.payout_items pi join public.provider_payouts po on po.id = pi.payout_id
             where pi.booking_id = b.id and po.status not in ('cancelled', 'failed') limit 1) as payout_status
    from public.bookings b
    cross join lateral app_private.booking_accounting(b.id) a
    where b.provider_id = p_provider_id
  )
  select cur,
         sum(acc.gross_minor)::bigint, sum(acc.refunded_minor)::bigint, sum(acc.commission_minor)::bigint,
         sum(acc.fees)::bigint, sum(acc.net_minor)::bigint,
         coalesce(sum(acc.net_minor) filter (where acc.payout_status = 'paid'), 0)::bigint,
         coalesce(sum(acc.net_minor) filter (where acc.payout_status in ('draft', 'processing')), 0)::bigint,
         coalesce(sum(acc.net_minor) filter (where acc.payout_status is null and acc.starts_at < now()
                                              and acc.status in ('completed', 'cancelled', 'refunded')), 0)::bigint,
         coalesce(sum(acc.net_minor) filter (where acc.status = 'confirmed'), 0)::bigint
  from acc
  where acc.gross_minor > 0
  group by cur
  order by cur;
end;
$$;

-- Bookings whose provider share can be paid: the experience date has passed, money was
-- received, no refund is still open, and the booking is not in a live payout.
create or replace function app_private.payout_eligible_bookings(p_provider_id uuid, p_currency text)
returns table (booking_id uuid, gross_minor bigint, refunded_minor bigint, commission_minor bigint, net_minor bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, a.gross_minor, a.refunded_minor, a.commission_minor, a.net_minor
  from public.bookings b
  cross join lateral app_private.booking_accounting(b.id) a
  where b.provider_id = p_provider_id and b.currency = p_currency
    and b.status in ('completed', 'cancelled', 'refunded') and b.starts_at < now()
    and a.net_minor > 0
    and not exists (select 1 from public.refunds r where r.booking_id = b.id and r.status in ('pending', 'processing', 'failed'))
    and not exists (
      select 1 from public.payout_items pi join public.provider_payouts po on po.id = pi.payout_id
      where pi.booking_id = b.id and po.status not in ('cancelled', 'failed')
    );
$$;

create or replace function public.admin_create_payout(p_provider_id uuid, p_currency text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_total bigint;
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  -- Lock candidate bookings so the same booking cannot enter two payouts.
  perform 1 from public.bookings b
   where b.provider_id = p_provider_id and b.currency = p_currency
     and b.status in ('completed', 'cancelled', 'refunded') and b.starts_at < now()
   for update;

  select coalesce(sum(e.net_minor), 0) into v_total
  from app_private.payout_eligible_bookings(p_provider_id, p_currency) e;
  if v_total <= 0 then
    raise exception 'HK_NOTHING_TO_PAY: No earnings are ready for payout.' using errcode = '22023';
  end if;

  insert into public.provider_payouts (provider_id, amount_minor, currency, created_by)
  values (p_provider_id, v_total, p_currency, auth.uid()) returning id into v_id;
  insert into public.payout_items (payout_id, booking_id, gross_minor, refunded_minor, commission_minor, net_minor)
  select v_id, e.booking_id, e.gross_minor, e.refunded_minor, e.commission_minor, e.net_minor
  from app_private.payout_eligible_bookings(p_provider_id, p_currency) e;

  perform app_private.audit('payout.created', 'payout', v_id::text,
    jsonb_build_object('provider_id', p_provider_id, 'amount_minor', v_total, 'currency', p_currency));
  return v_id;
end;
$$;

create or replace function public.admin_update_payout(
  p_payout_id uuid, p_status public.payout_status, p_transfer_reference text default null, p_failure_reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.payout_status;
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  select status into v_current from public.provider_payouts where id = p_payout_id for update;
  if not found then
    raise exception 'HK_NOT_FOUND: Payout not found.' using errcode = 'P0002';
  end if;
  if not (
    (v_current = 'draft' and p_status in ('processing', 'paid', 'cancelled')) or
    (v_current = 'processing' and p_status in ('paid', 'failed')) or
    -- A failed payout's bookings become eligible again; create a new payout to retry.
    (v_current = 'failed' and p_status = 'cancelled')
  ) then
    raise exception 'HK_INVALID_STATE: Cannot move a % payout to %.', v_current, p_status using errcode = '22023';
  end if;
  if p_status = 'paid' and char_length(trim(coalesce(p_transfer_reference, ''))) < 3 then
    raise exception 'HK_NOTES_REQUIRED: Record the transfer reference.' using errcode = '22023';
  end if;
  update public.provider_payouts
     set status = p_status,
         transfer_reference = coalesce(nullif(trim(p_transfer_reference), ''), transfer_reference),
         failure_reason = left(coalesce(p_failure_reason, ''), 300),
         paid_at = case when p_status = 'paid' then now() else paid_at end
   where id = p_payout_id;
  perform app_private.audit('payout.' || p_status::text, 'payout', p_payout_id::text,
    jsonb_build_object('from', v_current, 'reference', p_transfer_reference));
end;
$$;

------------------------------------------------------------------------------
-- Metrics (all figures computed from records; definitions in docs/admin.md)
------------------------------------------------------------------------------
create or replace function public.admin_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_new_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'providers_by_status', coalesce((select jsonb_object_agg(verification_status, n) from
        (select verification_status, count(*) n from public.provider_profiles group by 1) s), '{}'::jsonb),
    'experiences_by_status', coalesce((select jsonb_object_agg(status, n) from
        (select status, count(*) n from public.experiences group by 1) s), '{}'::jsonb),
    'bookings_30d_by_status', coalesce((select jsonb_object_agg(status, n) from
        (select status, count(*) n from public.bookings where created_at > now() - interval '30 days' group by 1) s), '{}'::jsonb),
    'payments_succeeded_30d', coalesce((select jsonb_object_agg(currency, total) from
        (select currency, sum(amount_minor) total from public.payments
          where status = 'succeeded' and paid_at > now() - interval '30 days' group by 1) s), '{}'::jsonb),
    'refunds_processed_30d', coalesce((select jsonb_object_agg(currency, total) from
        (select currency, sum(amount_minor) total from public.refunds
          where status = 'processed' and processed_at > now() - interval '30 days' group by 1) s), '{}'::jsonb),
    'payments_needing_attention', (select count(*) from public.payments where status = 'amount_mismatch'),
    'refunds_needing_attention', (select count(*) from public.refunds where status in ('pending', 'failed')),
    'providers_awaiting_review', (select count(*) from public.provider_profiles where verification_status = 'pending_review'),
    'documents_awaiting_review', (select count(*) from public.provider_verification_documents where status = 'submitted'),
    'listings_awaiting_review', (select count(*) from public.experiences where status = 'pending_review'),
    'open_review_reports', (select count(*) from public.review_reports where status = 'open'),
    'open_support_tickets', (select count(*) from public.support_tickets where status = 'open'),
    'failed_or_unsent_emails_7d', (select count(*) from public.notifications
        where channel = 'email' and status in ('failed', 'skipped_unconfigured') and created_at > now() - interval '7 days'),
    'newsletter_subscribed', (select count(*) from public.newsletter_subscriptions where status = 'subscribed'),
    'open_data_requests', (select count(*) from public.data_requests where status in ('received', 'in_progress')),
    'commission_configured', exists (select 1 from public.commission_rules where scope = 'default'
        and active_from <= now() and (active_until is null or active_until > now()))
  ) into v;
  return v;
end;
$$;

------------------------------------------------------------------------------
-- Privacy: account deletion (service role, called by server after re-authentication)
------------------------------------------------------------------------------
-- Scrubs personal data that is not needed for legal record keeping. The server then
-- deletes the auth user, which cascades to profile, favourites, tickets and notifications.
create or replace function public.prepare_account_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.provider_profiles where user_id = p_user_id) then
    raise exception 'HK_PROVIDER_ACCOUNT: Provider accounts are closed through support so payouts can be settled.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.bookings where customer_id = p_user_id
             and status in ('confirmed', 'pending_payment', 'pending_provider_confirmation', 'payment_failed', 'refund_pending')) then
    raise exception 'HK_ACTIVE_BOOKINGS: Cancel or complete your active bookings before deleting your account.'
      using errcode = '22023';
  end if;
  update public.bookings
     set contact_name = 'Deleted user', contact_email = 'deleted-user@hiddenkenya.invalid',
         contact_phone = '+0000000', customer_notes = ''
   where customer_id = p_user_id;
  delete from public.reviews where customer_id = p_user_id;
  delete from public.review_reports where reporter_id = p_user_id;
  update public.data_requests set status = 'completed', completed_at = now()
   where user_id = p_user_id and request_type = 'deletion' and status <> 'completed';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_user_id, 'user.deleted', 'user', p_user_id::text, '{}'::jsonb);
end;
$$;

-- Data export for the signed-in user (DPA 2019 right of access).
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'HK_AUTH_REQUIRED: Sign in first.' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'account', (select jsonb_build_object('email', u.email, 'created_at', u.created_at) from auth.users u where u.id = v_uid),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'roles', (select coalesce(jsonb_agg(role), '[]'::jsonb) from public.user_roles where user_id = v_uid),
    'bookings', (select coalesce(jsonb_agg(jsonb_build_object(
        'reference', b.reference, 'experience_id', b.experience_id, 'starts_at', b.starts_at, 'party_size', b.party_size,
        'total_minor', b.total_minor, 'currency', b.currency, 'status', b.status,
        'contact_name', b.contact_name, 'contact_email', b.contact_email, 'contact_phone', b.contact_phone,
        'customer_notes', b.customer_notes, 'created_at', b.created_at) order by b.created_at), '[]'::jsonb)
      from public.bookings b where b.customer_id = v_uid),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
        'reference', p.reference, 'amount_minor', p.amount_minor, 'currency', p.currency, 'status', p.status,
        'channel', p.channel, 'paid_at', p.paid_at)), '[]'::jsonb)
      from public.payments p join public.bookings b on b.id = p.booking_id where b.customer_id = v_uid),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('rating', r.rating, 'title', r.title, 'body', r.body,
        'created_at', r.created_at)), '[]'::jsonb) from public.reviews r where r.customer_id = v_uid),
    'favorites', (select coalesce(jsonb_agg(experience_id), '[]'::jsonb) from public.favorites where user_id = v_uid),
    'support_tickets', (select coalesce(jsonb_agg(jsonb_build_object('subject', t.subject, 'status', t.status,
        'created_at', t.created_at)), '[]'::jsonb) from public.support_tickets t where t.user_id = v_uid),
    'provider_profile', (select to_jsonb(pp) from public.provider_profiles pp where pp.user_id = v_uid),
    'newsletter', (select jsonb_build_object('status', n.status, 'consented_at', n.consented_at)
      from public.newsletter_subscriptions n join auth.users u on lower(u.email) = lower(n.email) where u.id = v_uid)
  );
end;
$$;
