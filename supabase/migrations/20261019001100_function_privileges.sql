-- Hidden Kenya: function execute privileges.
-- Start from nothing, then grant exactly what each role may call.
-- (Supabase grants EXECUTE on new public functions to anon/authenticated by default.)

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app_private from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema app_private to service_role;

-- Helpers referenced by RLS policies must be executable by the querying role.
grant execute on function app_private.has_role(public.app_role) to anon, authenticated;
grant execute on function app_private.is_admin() to anon, authenticated;
grant execute on function app_private.my_provider_id() to anon, authenticated;
grant execute on function app_private.provider_is_public(uuid) to anon, authenticated;
grant execute on function app_private.experience_is_public(uuid) to anon, authenticated;
grant execute on function app_private.owns_experience(uuid) to anon, authenticated;
grant execute on function app_private.try_uuid(text) to anon, authenticated;
grant execute on function app_private.distance_km(double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function app_private.has_availability_on(uuid, date, integer) to anon, authenticated;
-- Trigger functions run as the table owner for SECURITY DEFINER, but the invoker still
-- needs EXECUTE for non-definer trigger functions.
grant execute on function app_private.set_updated_at() to anon, authenticated;
grant execute on function app_private.experiences_require_rereview() to authenticated;
grant execute on function app_private.support_message_defaults() to authenticated;
grant execute on function app_private.prevent_mutation() to anon, authenticated;

-- Public (anonymous) RPCs: read-only discovery.
grant execute on function public.search_experiences(text, text, text, smallint, text, text, bigint, bigint, text, date, integer, text[], boolean, text, integer, integer, uuid[], uuid) to anon, authenticated;
grant execute on function public.get_experience_availability(uuid, date, date) to anon, authenticated;
grant execute on function public.related_experiences(uuid, integer) to anon, authenticated;
grant execute on function public.nearby_destinations(uuid, double precision, integer) to anon, authenticated;

-- Signed-in user RPCs. Each function checks ownership/role itself.
grant execute on function public.become_provider(text) to authenticated;
grant execute on function public.submit_provider_for_verification() to authenticated;
grant execute on function public.submit_experience_for_review(uuid) to authenticated;
grant execute on function public.set_experience_state(uuid, text) to authenticated;
grant execute on function public.create_booking(uuid, timestamptz, integer, text, text, text, text, text) to authenticated;
grant execute on function public.provider_respond_to_booking(uuid, boolean, text) to authenticated;
grant execute on function public.cancellation_quote(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.provider_cancel_booking(uuid, text) to authenticated;
grant execute on function public.begin_payment(uuid) to authenticated;
grant execute on function public.create_review(uuid, integer, text, text) to authenticated;
grant execute on function public.respond_to_review(uuid, text) to authenticated;
grant execute on function public.report_review(uuid, text) to authenticated;
grant execute on function public.provider_earnings_summary(uuid) to authenticated;
grant execute on function public.export_my_data() to authenticated;

-- Admin RPCs (each checks is_admin()).
grant execute on function public.admin_review_provider(uuid, text, text) to authenticated;
grant execute on function public.admin_review_document(uuid, text, text) to authenticated;
grant execute on function public.admin_moderate_experience(uuid, text, text) to authenticated;
grant execute on function public.admin_cancel_booking(uuid, text, bigint) to authenticated;
grant execute on function public.admin_set_admin_role(uuid, boolean) to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean, text) to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.admin_set_commission_rule(text, integer, uuid, uuid, text) to authenticated;
grant execute on function public.admin_end_commission_rule(uuid) to authenticated;
grant execute on function public.admin_set_site_setting(text, jsonb, boolean, text) to authenticated;
grant execute on function public.admin_moderate_review(uuid, public.review_status, text) to authenticated;
grant execute on function public.admin_create_payout(uuid, text) to authenticated;
grant execute on function public.admin_update_payout(uuid, public.payout_status, text, text) to authenticated;
grant execute on function public.admin_metrics() to authenticated;

-- Service-role only (not granted above): bootstrap_first_admin, record_payment_event,
-- finish_payment_event, apply_payment_result, apply_refund_result, expire_stale_bookings,
-- complete_past_bookings, prepare_account_deletion, record_audit_event, check_rate_limit.
