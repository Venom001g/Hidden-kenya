-- Hidden Kenya: retryable webhook processing and payout transfer results.

-- A delivery is "new" if it was never seen, or if a previous attempt failed before
-- completing (so the gateway's retry is processed instead of being dropped).
create or replace function public.record_payment_event(
  p_gateway text, p_dedupe_key text, p_event_type text, p_reference text, p_payload jsonb
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.payment_events as pe (gateway, dedupe_key, event_type, reference, payload)
  values (p_gateway, p_dedupe_key, p_event_type, p_reference, coalesce(p_payload, '{}'::jsonb))
  on conflict (dedupe_key) do update
    set outcome = 'redelivered', processing_error = null
    where pe.processed_at is null or pe.processing_error is not null
  returning pe.id into v_id;
  return v_id is not null;
end;
$$;

create or replace function public.finish_payment_event(p_dedupe_key text, p_outcome text, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_events
     set outcome = left(p_outcome, 80),
         processing_error = left(p_error, 500),
         processed_at = case when p_error is null then now() else null end
   where dedupe_key = p_dedupe_key;
$$;

-- Transfer outcome reported by the gateway (service role only).
create or replace function public.apply_payout_transfer_result(
  p_payout_id uuid, p_status text, p_transfer_reference text default null, p_failure_reason text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.payout_status;
begin
  select status into v_current from public.provider_payouts where id = p_payout_id for update;
  if not found then
    return 'unknown_payout';
  end if;
  if v_current = 'paid' then
    return 'already_paid';
  end if;
  if p_status = 'success' and v_current = 'processing' then
    update public.provider_payouts
       set status = 'paid', paid_at = now(), transfer_reference = coalesce(p_transfer_reference, transfer_reference)
     where id = p_payout_id;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (null, 'payout.paid', 'payout', p_payout_id::text, jsonb_build_object('via', 'gateway'));
    return 'paid';
  elsif p_status in ('failed', 'reversed') and v_current = 'processing' then
    update public.provider_payouts
       set status = 'failed', failure_reason = left(coalesce(p_failure_reason, 'Transfer ' || p_status), 300)
     where id = p_payout_id;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (null, 'payout.failed', 'payout', p_payout_id::text, jsonb_build_object('via', 'gateway', 'status', p_status));
    return 'failed';
  end if;
  return 'ignored';
end;
$$;

revoke execute on function public.record_payment_event(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.finish_payment_event(text, text, text) from public, anon, authenticated;
revoke execute on function public.apply_payout_transfer_result(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_payment_event(text, text, text, text, jsonb) to service_role;
grant execute on function public.finish_payment_event(text, text, text) to service_role;
grant execute on function public.apply_payout_transfer_result(uuid, text, text, text) to service_role;
