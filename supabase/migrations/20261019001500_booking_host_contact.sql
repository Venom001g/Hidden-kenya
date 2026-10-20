-- Hidden Kenya: host contact details for a guest's own active booking.
-- Provider contact details are otherwise private; a guest sees them only for a booking
-- they made that is confirmed (or awaiting their payment after the host accepted).

create or replace function public.booking_host_contact(p_booking_id uuid)
returns table (business_name text, contact_phone text, contact_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.business_name, d.contact_phone, d.contact_email
  from public.bookings b
  join public.provider_profiles p on p.id = b.provider_id
  join public.provider_private_details d on d.provider_id = p.id
  where b.id = p_booking_id
    and b.customer_id = (select auth.uid())
    and b.status in ('confirmed', 'completed')
    and b.starts_at > now() - interval '7 days';
$$;

revoke execute on function public.booking_host_contact(uuid) from public, anon;
grant execute on function public.booking_host_contact(uuid) to authenticated, service_role;

-- Guests keep read access to the listing and host of their own bookings, even if the
-- listing is later paused, archived or the host suspended (meeting details stay available).
create or replace function app_private.booked_experience(p_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.bookings where experience_id = p_experience_id and customer_id = (select auth.uid()));
$$;

create or replace function app_private.booked_provider(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.bookings where provider_id = p_provider_id and customer_id = (select auth.uid()));
$$;

revoke execute on function app_private.booked_experience(uuid) from public;
revoke execute on function app_private.booked_provider(uuid) from public;
grant execute on function app_private.booked_experience(uuid) to authenticated, service_role;
grant execute on function app_private.booked_provider(uuid) to authenticated, service_role;

create policy experiences_read_by_guests on public.experiences for select to authenticated
  using ((select app_private.booked_experience(id)));
create policy provider_profiles_read_by_guests on public.provider_profiles for select to authenticated
  using ((select app_private.booked_provider(id)));
