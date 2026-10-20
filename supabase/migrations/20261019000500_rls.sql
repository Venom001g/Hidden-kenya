-- Hidden Kenya: table privileges and Row Level Security.
--
-- Model
--   1. Start from zero: revoke every table privilege from anon and authenticated.
--   2. Grant only the operations (and, for writes, only the columns) each role needs.
--   3. RLS policies decide which rows those operations may touch.
--   4. Anything that changes status, money or roles goes through SECURITY DEFINER
--      functions (next migration), never through direct table writes.
-- service_role bypasses RLS and is used only by trusted server code.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
revoke all on all tables in schema app_private from anon, authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.counties enable row level security;
alter table public.experience_categories enable row level security;
alter table public.site_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.provider_profiles enable row level security;
alter table public.provider_private_details enable row level security;
alter table public.provider_service_categories enable row level security;
alter table public.provider_payout_accounts enable row level security;
alter table public.provider_verification_documents enable row level security;
alter table public.destinations enable row level security;
alter table public.destination_images enable row level security;
alter table public.experiences enable row level security;
alter table public.experience_images enable row level security;
alter table public.experience_availability enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.experience_sessions enable row level security;
alter table public.commission_rules enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.refunds enable row level security;
alter table public.provider_payouts enable row level security;
alter table public.payout_items enable row level security;
alter table public.reviews enable row level security;
alter table public.review_reports enable row level security;
alter table public.favorites enable row level security;
alter table public.notifications enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.newsletter_subscriptions enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.data_requests enable row level security;

------------------------------------------------------------------------------
-- profiles
------------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name, phone, country_code, email_booking_reminders, email_product_updates)
  on public.profiles to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select app_private.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

------------------------------------------------------------------------------
-- user_roles (read-only to clients)
------------------------------------------------------------------------------
grant select on public.user_roles to authenticated;
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.is_admin()));

------------------------------------------------------------------------------
-- Reference data
------------------------------------------------------------------------------
grant select on public.counties to anon, authenticated;
create policy counties_public_read on public.counties for select to anon, authenticated using (true);

grant select on public.experience_categories to anon, authenticated;
grant insert, update, delete on public.experience_categories to authenticated;
create policy categories_public_read on public.experience_categories for select to anon, authenticated
  using (is_active or (select app_private.is_admin()));
create policy categories_admin_insert on public.experience_categories for insert to authenticated
  with check ((select app_private.is_admin()));
create policy categories_admin_update on public.experience_categories for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy categories_admin_delete on public.experience_categories for delete to authenticated
  using ((select app_private.is_admin()));

grant select on public.site_settings to anon, authenticated;
create policy site_settings_read on public.site_settings for select to anon, authenticated
  using (is_public or (select app_private.is_admin()));

------------------------------------------------------------------------------
-- audit_logs and moderation_actions
------------------------------------------------------------------------------
grant select on public.audit_logs to authenticated;
create policy audit_logs_admin_read on public.audit_logs for select to authenticated
  using ((select app_private.is_admin()));

grant select on public.moderation_actions to authenticated;
create policy moderation_actions_read on public.moderation_actions for select to authenticated
  using (
    (select app_private.is_admin())
    or (provider_id is not null and provider_id = (select app_private.my_provider_id()))
  );

------------------------------------------------------------------------------
-- Providers
------------------------------------------------------------------------------
grant select on public.provider_profiles to anon, authenticated;
grant update (business_name, description, operating_areas, website_url, year_established)
  on public.provider_profiles to authenticated;

create policy provider_profiles_public_read on public.provider_profiles for select to anon, authenticated
  using (
    verification_status = 'verified'
    or user_id = (select auth.uid())
    or (select app_private.is_admin())
  );
create policy provider_profiles_owner_update on public.provider_profiles for update to authenticated
  using (user_id = (select auth.uid()) and verification_status <> 'suspended')
  with check (user_id = (select auth.uid()));

grant select on public.provider_private_details to authenticated;
grant update (contact_email, contact_phone, legal_name, registration_number, tourism_licence_number)
  on public.provider_private_details to authenticated;
create policy provider_private_read on public.provider_private_details for select to authenticated
  using (provider_id = (select app_private.my_provider_id()) or (select app_private.is_admin()));
create policy provider_private_update on public.provider_private_details for update to authenticated
  using (provider_id = (select app_private.my_provider_id()))
  with check (provider_id = (select app_private.my_provider_id()));

grant select on public.provider_service_categories to anon, authenticated;
grant insert, delete on public.provider_service_categories to authenticated;
create policy provider_categories_read on public.provider_service_categories for select to anon, authenticated
  using (
    (select app_private.provider_is_public(provider_id))
    or provider_id = (select app_private.my_provider_id())
    or (select app_private.is_admin())
  );
create policy provider_categories_insert on public.provider_service_categories for insert to authenticated
  with check (provider_id = (select app_private.my_provider_id()));
create policy provider_categories_delete on public.provider_service_categories for delete to authenticated
  using (provider_id = (select app_private.my_provider_id()));

-- Payout accounts are written by server code after the gateway tokenises details.
grant select on public.provider_payout_accounts to authenticated;
create policy payout_accounts_read on public.provider_payout_accounts for select to authenticated
  using (provider_id = (select app_private.my_provider_id()) or (select app_private.is_admin()));

grant select on public.provider_verification_documents to authenticated;
grant insert (provider_id, document_type, storage_path, original_filename, mime_type, size_bytes)
  on public.provider_verification_documents to authenticated;
grant delete on public.provider_verification_documents to authenticated;
create policy provider_documents_read on public.provider_verification_documents for select to authenticated
  using (provider_id = (select app_private.my_provider_id()) or (select app_private.is_admin()));
create policy provider_documents_insert on public.provider_verification_documents for insert to authenticated
  with check (
    provider_id = (select app_private.my_provider_id())
    and storage_path like provider_id::text || '/%'
  );
create policy provider_documents_delete on public.provider_verification_documents for delete to authenticated
  using (provider_id = (select app_private.my_provider_id()) and status = 'submitted');

------------------------------------------------------------------------------
-- Destinations (admin-managed)
------------------------------------------------------------------------------
grant select on public.destinations to anon, authenticated;
grant insert, update, delete on public.destinations to authenticated;
create policy destinations_public_read on public.destinations for select to anon, authenticated
  using (status = 'published' or (select app_private.is_admin()));
create policy destinations_admin_insert on public.destinations for insert to authenticated
  with check ((select app_private.is_admin()));
create policy destinations_admin_update on public.destinations for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy destinations_admin_delete on public.destinations for delete to authenticated
  using ((select app_private.is_admin()) and status = 'draft');

grant select on public.destination_images to anon, authenticated;
grant insert, update, delete on public.destination_images to authenticated;
create policy destination_images_read on public.destination_images for select to anon, authenticated
  using (
    exists (select 1 from public.destinations d where d.id = destination_id and d.status = 'published')
    or (select app_private.is_admin())
  );
create policy destination_images_admin_insert on public.destination_images for insert to authenticated
  with check ((select app_private.is_admin()));
create policy destination_images_admin_update on public.destination_images for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy destination_images_admin_delete on public.destination_images for delete to authenticated
  using ((select app_private.is_admin()));

------------------------------------------------------------------------------
-- Experiences
------------------------------------------------------------------------------
grant select on public.experiences to anon, authenticated;
-- Providers write content columns only. status, provider_id, published_at and
-- submitted_at are not grantable and change only through functions.
grant insert (
  provider_id, destination_id, county_code, category_id, slug, title, summary, description,
  pricing_model, price_minor, currency, duration_minutes, min_participants, max_participants,
  included, excluded, languages, tags, accessibility_features, accessibility_notes,
  meeting_point_name, meeting_point_instructions, meeting_latitude, meeting_longitude,
  booking_mode, lead_time_hours, max_advance_days, cancellation_policy
) on public.experiences to authenticated;
grant update (
  destination_id, county_code, category_id, title, summary, description,
  pricing_model, price_minor, currency, duration_minutes, min_participants, max_participants,
  included, excluded, languages, tags, accessibility_features, accessibility_notes,
  meeting_point_name, meeting_point_instructions, meeting_latitude, meeting_longitude,
  booking_mode, lead_time_hours, max_advance_days, cancellation_policy
) on public.experiences to authenticated;
grant delete on public.experiences to authenticated;

create policy experiences_read on public.experiences for select to anon, authenticated
  using (
    (status = 'published' and (select app_private.provider_is_public(provider_id)))
    or provider_id = (select app_private.my_provider_id())
    or (select app_private.is_admin())
  );
create policy experiences_provider_insert on public.experiences for insert to authenticated
  with check (
    provider_id = (select app_private.my_provider_id())
    and (select app_private.has_role('provider'))
  );
create policy experiences_provider_update on public.experiences for update to authenticated
  using (
    provider_id = (select app_private.my_provider_id())
    and status not in ('suspended', 'archived')
  )
  with check (provider_id = (select app_private.my_provider_id()));
create policy experiences_provider_delete on public.experiences for delete to authenticated
  using (provider_id = (select app_private.my_provider_id()) and status = 'draft');

grant select on public.experience_images to anon, authenticated;
grant insert (experience_id, storage_path, alt_text, credit, rights_confirmed, width, height, position)
  on public.experience_images to authenticated;
grant update (alt_text, credit, position) on public.experience_images to authenticated;
grant delete on public.experience_images to authenticated;
create policy experience_images_read on public.experience_images for select to anon, authenticated
  using (
    (select app_private.experience_is_public(experience_id))
    or (select app_private.owns_experience(experience_id))
    or (select app_private.is_admin())
  );
create policy experience_images_insert on public.experience_images for insert to authenticated
  with check (
    (select app_private.owns_experience(experience_id))
    and storage_path like (select app_private.my_provider_id())::text || '/' || experience_id::text || '/%'
  );
create policy experience_images_update on public.experience_images for update to authenticated
  using ((select app_private.owns_experience(experience_id)))
  with check ((select app_private.owns_experience(experience_id)));
create policy experience_images_delete on public.experience_images for delete to authenticated
  using ((select app_private.owns_experience(experience_id)));

grant select, insert, update, delete on public.experience_availability to authenticated;
create policy availability_owner_all on public.experience_availability for all to authenticated
  using ((select app_private.owns_experience(experience_id)) or (select app_private.is_admin()))
  with check ((select app_private.owns_experience(experience_id)));

grant select, insert, update, delete on public.availability_exceptions to authenticated;
create policy exceptions_owner_all on public.availability_exceptions for all to authenticated
  using ((select app_private.owns_experience(experience_id)) or (select app_private.is_admin()))
  with check ((select app_private.owns_experience(experience_id)));

grant select on public.experience_sessions to authenticated;
create policy sessions_read on public.experience_sessions for select to authenticated
  using ((select app_private.owns_experience(experience_id)) or (select app_private.is_admin()));

------------------------------------------------------------------------------
-- Commission (admin; written via functions)
------------------------------------------------------------------------------
grant select on public.commission_rules to authenticated;
create policy commission_read on public.commission_rules for select to authenticated
  using (
    (select app_private.is_admin())
    or scope = 'default'
    or (scope = 'provider' and provider_id = (select app_private.my_provider_id()))
    or (scope = 'category' and (select app_private.has_role('provider')))
  );

------------------------------------------------------------------------------
-- Bookings and money (read-only to clients)
------------------------------------------------------------------------------
grant select on public.bookings to authenticated;
create policy bookings_read on public.bookings for select to authenticated
  using (
    customer_id = (select auth.uid())
    or provider_id = (select app_private.my_provider_id())
    or (select app_private.is_admin())
  );

grant select on public.payments to authenticated;
create policy payments_read on public.payments for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.customer_id = (select auth.uid()) or b.provider_id = (select app_private.my_provider_id()))
    )
    or (select app_private.is_admin())
  );

grant select on public.payment_events to authenticated;
create policy payment_events_admin_read on public.payment_events for select to authenticated
  using ((select app_private.is_admin()));

grant select on public.refunds to authenticated;
create policy refunds_read on public.refunds for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.customer_id = (select auth.uid()) or b.provider_id = (select app_private.my_provider_id()))
    )
    or (select app_private.is_admin())
  );

grant select on public.provider_payouts to authenticated;
create policy payouts_read on public.provider_payouts for select to authenticated
  using (provider_id = (select app_private.my_provider_id()) or (select app_private.is_admin()));

grant select on public.payout_items to authenticated;
create policy payout_items_read on public.payout_items for select to authenticated
  using (
    exists (
      select 1 from public.provider_payouts p
      where p.id = payout_id and p.provider_id = (select app_private.my_provider_id())
    )
    or (select app_private.is_admin())
  );

------------------------------------------------------------------------------
-- Reviews
------------------------------------------------------------------------------
grant select on public.reviews to anon, authenticated;
create policy reviews_read on public.reviews for select to anon, authenticated
  using (
    (status = 'published' and (select app_private.experience_is_public(experience_id)))
    or customer_id = (select auth.uid())
    or provider_id = (select app_private.my_provider_id())
    or (select app_private.is_admin())
  );
grant select on public.experience_review_stats to anon, authenticated;

grant select on public.review_reports to authenticated;
create policy review_reports_read on public.review_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select app_private.is_admin()));

------------------------------------------------------------------------------
-- Favourites
------------------------------------------------------------------------------
grant select, insert, delete on public.favorites to authenticated;
create policy favorites_own_read on public.favorites for select to authenticated
  using (user_id = (select auth.uid()));
create policy favorites_own_insert on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and (select app_private.experience_is_public(experience_id)));
create policy favorites_own_delete on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()));

------------------------------------------------------------------------------
-- Notifications (in-app read access; writes by server)
------------------------------------------------------------------------------
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_own_read on public.notifications for select to authenticated
  using ((user_id = (select auth.uid()) and channel = 'in_app') or (select app_private.is_admin()));
create policy notifications_own_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid()) and channel = 'in_app')
  with check (user_id = (select auth.uid()));

------------------------------------------------------------------------------
-- Support
------------------------------------------------------------------------------
grant select on public.support_tickets to authenticated;
grant insert (user_id, booking_id, subject, category) on public.support_tickets to authenticated;
grant update (status) on public.support_tickets to authenticated;
create policy tickets_read on public.support_tickets for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.is_admin()));
create policy tickets_insert on public.support_tickets for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (booking_id is null or exists (
      select 1 from public.bookings b where b.id = booking_id and b.customer_id = (select auth.uid())
    ))
  );
-- Customers may only close their own ticket; admins may set any status.
create policy tickets_admin_update on public.support_tickets for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy tickets_owner_close on public.support_tickets for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status = 'closed');

grant select on public.support_messages to authenticated;
grant insert (ticket_id, body) on public.support_messages to authenticated;
create policy support_messages_read on public.support_messages for select to authenticated
  using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid()))
    or (select app_private.is_admin())
  );
create policy support_messages_insert on public.support_messages for insert to authenticated
  with check (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = (select auth.uid()) and t.status <> 'closed'
    )
    or (select app_private.is_admin())
  );

------------------------------------------------------------------------------
-- Newsletter: server-only (service role). No client policies => no client access.
------------------------------------------------------------------------------
create policy newsletter_admin_read on public.newsletter_subscriptions for select to authenticated
  using ((select app_private.is_admin()));
grant select on public.newsletter_subscriptions to authenticated;

------------------------------------------------------------------------------
-- Privacy requests
------------------------------------------------------------------------------
grant select on public.data_requests to authenticated;
grant insert (user_id, request_type, details) on public.data_requests to authenticated;
create policy data_requests_read on public.data_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.is_admin()));
create policy data_requests_insert on public.data_requests for insert to authenticated
  with check (user_id = (select auth.uid()));
