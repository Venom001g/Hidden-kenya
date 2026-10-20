-- Hidden Kenya: provider onboarding, listing moderation, availability and search.
--
-- Errors raised for users carry a machine-readable prefix "HK_<CODE>: message".
-- The application maps the code to a friendly message; the text is a fallback.

------------------------------------------------------------------------------
-- Provider onboarding
------------------------------------------------------------------------------
create or replace function app_private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.become_provider(p_business_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_base text;
  v_slug text;
  v_n integer := 0;
begin
  if v_uid is null then
    raise exception 'HK_AUTH_REQUIRED: Sign in to continue.' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and deactivated_at is not null) then
    raise exception 'HK_ACCOUNT_DEACTIVATED: This account is deactivated.' using errcode = '42501';
  end if;
  select id into v_id from public.provider_profiles where user_id = v_uid;
  if found then
    return v_id;
  end if;
  p_business_name := trim(coalesce(p_business_name, ''));
  if char_length(p_business_name) not between 2 and 120 then
    raise exception 'HK_INVALID_INPUT: Business name must be 2–120 characters.' using errcode = '22023';
  end if;

  v_base := left(nullif(app_private.slugify(p_business_name), ''), 70);
  if v_base is null then v_base := 'provider'; end if;
  v_slug := v_base;
  while exists (select 1 from public.provider_profiles where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into public.provider_profiles (user_id, business_name, slug)
  values (v_uid, p_business_name, v_slug)
  returning id into v_id;

  insert into public.provider_private_details (provider_id, contact_email)
  select v_id, coalesce(u.email, '') from auth.users u where u.id = v_uid;

  insert into public.user_roles (user_id, role) values (v_uid, 'provider') on conflict do nothing;
  perform app_private.audit('provider.created', 'provider', v_id::text, '{}'::jsonb);
  return v_id;
end;
$$;

create or replace function public.submit_provider_for_verification()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider public.provider_profiles%rowtype;
  v_private public.provider_private_details%rowtype;
begin
  select * into v_provider from public.provider_profiles where user_id = auth.uid() for update;
  if not found then
    raise exception 'HK_NOT_PROVIDER: Create a provider profile first.' using errcode = '42501';
  end if;
  if v_provider.verification_status not in ('draft', 'changes_requested', 'rejected') then
    raise exception 'HK_INVALID_STATE: This profile is already % .', v_provider.verification_status using errcode = '22023';
  end if;
  select * into v_private from public.provider_private_details where provider_id = v_provider.id;
  if char_length(v_provider.description) < 80 or v_provider.operating_areas = ''
     or v_private.contact_phone = '' or v_private.contact_email = '' or v_private.legal_name = '' then
    raise exception 'HK_PROFILE_INCOMPLETE: Add a description (80+ characters), operating areas, legal name, phone and email.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.provider_verification_documents where provider_id = v_provider.id and status = 'submitted')
     and not exists (select 1 from public.provider_verification_documents where provider_id = v_provider.id and status = 'accepted') then
    raise exception 'HK_DOCUMENTS_REQUIRED: Upload at least one verification document.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.provider_service_categories where provider_id = v_provider.id) then
    raise exception 'HK_PROFILE_INCOMPLETE: Choose at least one service category.' using errcode = '22023';
  end if;

  update public.provider_profiles
     set verification_status = 'pending_review', submitted_at = now()
   where id = v_provider.id;
  perform app_private.audit('provider.submitted', 'provider', v_provider.id::text, '{}'::jsonb);
end;
$$;

create or replace function public.admin_review_provider(p_provider_id uuid, p_decision text, p_notes text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.provider_status;
  v_new public.provider_status;
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  select verification_status into v_current from public.provider_profiles where id = p_provider_id for update;
  if not found then
    raise exception 'HK_NOT_FOUND: Provider not found.' using errcode = 'P0002';
  end if;
  p_notes := left(coalesce(p_notes, ''), 2000);

  v_new := case p_decision
    when 'verify' then 'verified'
    when 'request_changes' then 'changes_requested'
    when 'reject' then 'rejected'
    when 'suspend' then 'suspended'
    when 'reinstate' then 'verified'
    else null end::public.provider_status;
  if v_new is null then
    raise exception 'HK_INVALID_INPUT: Unknown decision.' using errcode = '22023';
  end if;
  if p_decision in ('verify', 'request_changes', 'reject') and v_current not in ('pending_review', 'changes_requested', 'rejected', 'verified') then
    raise exception 'HK_INVALID_STATE: Provider is %.', v_current using errcode = '22023';
  end if;
  if p_decision = 'verify' and not exists (
    select 1 from public.provider_verification_documents where provider_id = p_provider_id and status = 'accepted'
  ) then
    raise exception 'HK_DOCUMENTS_REQUIRED: Accept at least one verification document before verifying.' using errcode = '22023';
  end if;
  if p_decision = 'reinstate' and v_current <> 'suspended' then
    raise exception 'HK_INVALID_STATE: Only suspended providers can be reinstated.' using errcode = '22023';
  end if;
  if p_decision in ('request_changes', 'reject', 'suspend') and char_length(trim(p_notes)) < 5 then
    raise exception 'HK_NOTES_REQUIRED: Explain the decision so the provider can act on it.' using errcode = '22023';
  end if;

  update public.provider_profiles
     set verification_status = v_new,
         verified_at = case when v_new = 'verified' then coalesce(verified_at, now()) else verified_at end
   where id = p_provider_id;
  update public.provider_private_details set verification_feedback = p_notes where provider_id = p_provider_id;

  insert into public.moderation_actions (actor_id, target_type, target_id, provider_id, action, notes)
  values (auth.uid(), 'provider', p_provider_id, p_provider_id, p_decision, p_notes);
  perform app_private.audit('provider.' || p_decision, 'provider', p_provider_id::text,
    jsonb_build_object('from', v_current, 'to', v_new));
end;
$$;

create or replace function public.admin_review_document(p_document_id uuid, p_decision text, p_notes text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.provider_verification_documents%rowtype;
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'HK_INVALID_INPUT: Decision must be accepted or rejected.' using errcode = '22023';
  end if;
  select * into v_doc from public.provider_verification_documents where id = p_document_id for update;
  if not found then
    raise exception 'HK_NOT_FOUND: Document not found.' using errcode = 'P0002';
  end if;
  update public.provider_verification_documents
     set status = p_decision::public.document_status, review_notes = left(coalesce(p_notes, ''), 1000),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_document_id;

  if v_doc.document_type = 'tourism_licence' then
    update public.provider_profiles
       set licence_checked_at = case when p_decision = 'accepted' then now() else null end
     where id = v_doc.provider_id;
  end if;

  insert into public.moderation_actions (actor_id, target_type, target_id, provider_id, action, notes)
  values (auth.uid(), 'document', p_document_id, v_doc.provider_id, p_decision, left(coalesce(p_notes, ''), 2000));
  perform app_private.audit('document.' || p_decision, 'provider_document', p_document_id::text,
    jsonb_build_object('provider_id', v_doc.provider_id, 'document_type', v_doc.document_type));
end;
$$;

------------------------------------------------------------------------------
-- Listing lifecycle
------------------------------------------------------------------------------
create or replace function public.submit_experience_for_review(p_experience_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exp public.experiences%rowtype;
begin
  select e.* into v_exp from public.experiences e
  join public.provider_profiles p on p.id = e.provider_id
  where e.id = p_experience_id and p.user_id = auth.uid()
  for update of e;
  if not found then
    raise exception 'HK_NOT_FOUND: Listing not found.' using errcode = 'P0002';
  end if;
  if v_exp.status not in ('draft', 'changes_requested', 'rejected') then
    raise exception 'HK_INVALID_STATE: This listing is %.', v_exp.status using errcode = '22023';
  end if;
  if char_length(v_exp.summary) < 20 or char_length(v_exp.description) < 150 then
    raise exception 'HK_LISTING_INCOMPLETE: Add a summary (20+ characters) and a description (150+ characters).' using errcode = '22023';
  end if;
  if v_exp.meeting_point_name = '' or char_length(v_exp.meeting_point_instructions) < 20 then
    raise exception 'HK_LISTING_INCOMPLETE: Add a meeting point and instructions (20+ characters).' using errcode = '22023';
  end if;
  if not exists (select 1 from public.experience_images where experience_id = p_experience_id) then
    raise exception 'HK_LISTING_INCOMPLETE: Add at least one photo.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.experience_availability
    where experience_id = p_experience_id and is_active
      and (valid_until is null or valid_until >= (now() at time zone 'Africa/Nairobi')::date)
  ) then
    raise exception 'HK_LISTING_INCOMPLETE: Add availability with at least one future date.' using errcode = '22023';
  end if;

  perform set_config('app.moderation_bypass', 'on', true);
  update public.experiences set status = 'pending_review', submitted_at = now() where id = p_experience_id;
  perform set_config('app.moderation_bypass', 'off', true);
  perform app_private.audit('experience.submitted', 'experience', p_experience_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.set_experience_state(p_experience_id uuid, p_action text)
returns public.experience_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.experience_status;
  v_new public.experience_status;
begin
  select e.status into v_status from public.experiences e
  join public.provider_profiles p on p.id = e.provider_id
  where e.id = p_experience_id and p.user_id = auth.uid()
  for update of e;
  if not found then
    raise exception 'HK_NOT_FOUND: Listing not found.' using errcode = 'P0002';
  end if;

  v_new := case
    when p_action = 'pause' and v_status = 'published' then 'paused'
    when p_action = 'resume' and v_status = 'paused' then 'published'
    when p_action = 'archive' and v_status not in ('suspended', 'archived') then 'archived'
    when p_action = 'withdraw' and v_status = 'pending_review' then 'draft'
    else null end::public.experience_status;
  if v_new is null then
    raise exception 'HK_INVALID_STATE: Cannot % a listing that is %.', p_action, v_status using errcode = '22023';
  end if;

  perform set_config('app.moderation_bypass', 'on', true);
  update public.experiences set status = v_new where id = p_experience_id;
  perform set_config('app.moderation_bypass', 'off', true);
  perform app_private.audit('experience.' || p_action, 'experience', p_experience_id::text,
    jsonb_build_object('from', v_status, 'to', v_new));
  return v_new;
end;
$$;

create or replace function public.admin_moderate_experience(p_experience_id uuid, p_decision text, p_notes text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exp public.experiences%rowtype;
  v_new public.experience_status;
begin
  if not app_private.is_admin() then
    raise exception 'HK_FORBIDDEN: Administrator access required.' using errcode = '42501';
  end if;
  select * into v_exp from public.experiences where id = p_experience_id for update;
  if not found then
    raise exception 'HK_NOT_FOUND: Listing not found.' using errcode = 'P0002';
  end if;
  p_notes := left(coalesce(p_notes, ''), 2000);

  v_new := case p_decision
    when 'approve' then 'published'
    when 'request_changes' then 'changes_requested'
    when 'reject' then 'rejected'
    when 'suspend' then 'suspended'
    when 'archive' then 'archived'
    when 'reinstate' then 'published'
    else null end::public.experience_status;
  if v_new is null then
    raise exception 'HK_INVALID_INPUT: Unknown decision.' using errcode = '22023';
  end if;
  if p_decision in ('approve', 'request_changes', 'reject') and v_exp.status <> 'pending_review' then
    raise exception 'HK_INVALID_STATE: Only listings awaiting review can be %.', p_decision using errcode = '22023';
  end if;
  if p_decision = 'reinstate' and v_exp.status <> 'suspended' then
    raise exception 'HK_INVALID_STATE: Only suspended listings can be reinstated.' using errcode = '22023';
  end if;
  if p_decision in ('approve', 'reinstate') and not app_private.provider_is_public(v_exp.provider_id) then
    raise exception 'HK_PROVIDER_NOT_VERIFIED: Verify the provider before publishing their listings.' using errcode = '22023';
  end if;
  if p_decision in ('request_changes', 'reject', 'suspend') and char_length(trim(p_notes)) < 5 then
    raise exception 'HK_NOTES_REQUIRED: Explain the decision so the provider can act on it.' using errcode = '22023';
  end if;

  perform set_config('app.moderation_bypass', 'on', true);
  update public.experiences
     set status = v_new,
         published_at = case when v_new = 'published' then coalesce(published_at, now()) else published_at end
   where id = p_experience_id;
  perform set_config('app.moderation_bypass', 'off', true);

  insert into public.moderation_actions (actor_id, target_type, target_id, provider_id, action, notes)
  values (auth.uid(), 'experience', p_experience_id, v_exp.provider_id, p_decision, p_notes);
  perform app_private.audit('experience.' || p_decision, 'experience', p_experience_id::text,
    jsonb_build_object('from', v_exp.status, 'to', v_new));
end;
$$;

------------------------------------------------------------------------------
-- Availability
------------------------------------------------------------------------------
-- Capacity of a specific departure, or null when no such departure exists.
create or replace function app_private.occurrence_capacity(p_experience_id uuid, p_starts_at timestamptz)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_starts_at at time zone 'Africa/Nairobi';
  v_date date := v_local::date;
  v_time time := v_local::time;
  v_cap integer;
  v_override integer;
begin
  select max(capacity) into v_cap
  from public.experience_availability
  where experience_id = p_experience_id and is_active
    and v_date >= valid_from and v_date <= coalesce(valid_until, 'infinity'::date)
    and extract(isodow from v_date)::smallint = any (weekdays)
    and start_time = v_time;
  if v_cap is null then
    return null;
  end if;

  if exists (
    select 1 from public.availability_exceptions
    where experience_id = p_experience_id and exception_date = v_date and kind = 'closed'
      and (start_time is null or start_time = v_time)
  ) then
    return null;
  end if;

  select capacity_override into v_override
  from public.availability_exceptions
  where experience_id = p_experience_id and exception_date = v_date and kind = 'capacity_override'
    and (start_time is null or start_time = v_time)
  order by start_time nulls last
  limit 1;

  return coalesce(v_override, v_cap);
end;
$$;

-- Departures with remaining places. No permission checks: internal use only.
create or replace function app_private.availability_between(p_experience_id uuid, p_from date, p_to date)
returns table (starts_at timestamptz, capacity integer, seats_available integer)
language sql
stable
security definer
set search_path = ''
as $$
  with exp as (
    select lead_time_hours, max_advance_days from public.experiences where id = p_experience_id
  ),
  days as (
    select d::date as d from generate_series(p_from, p_to, interval '1 day') d
  ),
  occ as (
    select distinct ((days.d + r.start_time) at time zone r.timezone) as starts_at
    from days
    join public.experience_availability r
      on r.experience_id = p_experience_id and r.is_active
     and days.d >= r.valid_from and days.d <= coalesce(r.valid_until, 'infinity'::date)
     and extract(isodow from days.d)::smallint = any (r.weekdays)
  ),
  caps as (
    select occ.starts_at, app_private.occurrence_capacity(p_experience_id, occ.starts_at) as capacity
    from occ, exp
    where occ.starts_at >= now() + make_interval(hours => exp.lead_time_hours)
      and occ.starts_at <= now() + make_interval(days => exp.max_advance_days)
  )
  select caps.starts_at,
         caps.capacity,
         greatest(caps.capacity - coalesce(app_private.session_seats_taken(s.id), 0), 0)::integer
  from caps
  left join public.experience_sessions s
    on s.experience_id = p_experience_id and s.starts_at = caps.starts_at
  where caps.capacity is not null
  order by caps.starts_at;
$$;

create or replace function public.get_experience_availability(p_experience_id uuid, p_from date, p_to date)
returns table (starts_at timestamptz, capacity integer, seats_available integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if not (app_private.experience_is_public(p_experience_id)
          or app_private.owns_experience(p_experience_id)
          or app_private.is_admin()) then
    raise exception 'HK_NOT_FOUND: Listing not found.' using errcode = 'P0002';
  end if;
  p_from := greatest(coalesce(p_from, v_today), v_today);
  p_to := least(coalesce(p_to, p_from + 60), p_from + 120);
  if p_to < p_from then
    return;
  end if;
  return query select * from app_private.availability_between(p_experience_id, p_from, p_to);
end;
$$;

create or replace function app_private.has_availability_on(p_experience_id uuid, p_date date, p_party integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app_private.availability_between(p_experience_id, p_date, p_date) a
    where a.seats_available >= greatest(coalesce(p_party, 1), 1)
  );
$$;

------------------------------------------------------------------------------
-- Search and discovery (security invoker: RLS applies)
------------------------------------------------------------------------------
create or replace function public.search_experiences(
  p_query text default null,
  p_category text default null,
  p_region text default null,
  p_county smallint default null,
  p_destination text default null,
  p_currency text default null,
  p_min_price_minor bigint default null,
  p_max_price_minor bigint default null,
  p_duration text default null,
  p_date date default null,
  p_group_size integer default null,
  p_accessibility text[] default null,
  p_licence_checked boolean default null,
  p_sort text default 'recommended',
  p_limit integer default 12,
  p_offset integer default 0,
  p_ids uuid[] default null,
  p_provider uuid default null
)
returns table (
  id uuid, slug text, title text, summary text,
  price_minor bigint, currency text, pricing_model public.pricing_model,
  duration_minutes integer, max_participants integer, booking_mode public.booking_mode,
  county_name text, region text,
  destination_name text, destination_slug text,
  category_name text, category_slug text,
  provider_name text, provider_slug text, provider_licence_checked boolean,
  cover_path text, cover_alt text,
  review_count integer, average_rating numeric,
  published_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select case when nullif(trim(p_query), '') is null then null
                else websearch_to_tsquery('english', left(p_query, 200)) end as tsq
  ),
  base as (
    select e.*, q.tsq
    from public.experiences e
    cross join q
    join public.provider_profiles p on p.id = e.provider_id and p.verification_status = 'verified'
    join public.counties c on c.code = e.county_code
    join public.experience_categories cat on cat.id = e.category_id
    left join public.destinations d on d.id = e.destination_id
    where e.status = 'published'
      and (q.tsq is null or e.search_vector @@ q.tsq
           or d.name ilike '%' || left(p_query, 100) || '%'
           or c.name ilike '%' || left(p_query, 100) || '%')
      and (p_category is null or cat.slug = p_category)
      and (p_region is null or c.former_province = p_region)
      and (p_county is null or e.county_code = p_county)
      and (p_destination is null or d.slug = p_destination)
      and (p_currency is null or e.currency = p_currency)
      and (p_min_price_minor is null or e.price_minor >= p_min_price_minor)
      and (p_max_price_minor is null or e.price_minor <= p_max_price_minor)
      and (p_duration is null
           or (p_duration = 'up_to_3h' and e.duration_minutes <= 180)
           or (p_duration = '3_to_8h' and e.duration_minutes > 180 and e.duration_minutes <= 480)
           or (p_duration = 'full_day' and e.duration_minutes > 480 and e.duration_minutes <= 1440)
           or (p_duration = 'multi_day' and e.duration_minutes > 1440))
      and (p_group_size is null or (e.min_participants <= p_group_size and e.max_participants >= p_group_size))
      and (p_accessibility is null or cardinality(p_accessibility) = 0 or e.accessibility_features @> p_accessibility)
      and (p_licence_checked is not true or p.licence_checked_at is not null)
      and (p_date is null or app_private.has_availability_on(e.id, p_date, p_group_size))
      and (p_ids is null or e.id = any (p_ids))
      and (p_provider is null or e.provider_id = p_provider)
  )
  select b.id, b.slug, b.title, b.summary,
         b.price_minor, b.currency::text, b.pricing_model,
         b.duration_minutes, b.max_participants, b.booking_mode,
         c.name, c.former_province,
         d.name, d.slug,
         cat.name, cat.slug,
         p.business_name, p.slug, p.licence_checked_at is not null,
         img.storage_path, img.alt_text,
         coalesce(rs.review_count, 0), rs.average_rating,
         b.published_at,
         count(*) over ()
  from base b
  join public.provider_profiles p on p.id = b.provider_id
  join public.counties c on c.code = b.county_code
  join public.experience_categories cat on cat.id = b.category_id
  left join public.destinations d on d.id = b.destination_id
  left join lateral (
    select i.storage_path, i.alt_text from public.experience_images i
    where i.experience_id = b.id order by i.position, i.created_at limit 1
  ) img on true
  left join public.experience_review_stats rs on rs.experience_id = b.id
  order by
    case when p_sort = 'price_asc' then b.price_minor end asc nulls last,
    case when p_sort = 'price_desc' then b.price_minor end desc nulls last,
    case when p_sort = 'rating' then rs.average_rating end desc nulls last,
    case when p_sort = 'recommended' and b.tsq is not null then ts_rank(b.search_vector, b.tsq) end desc nulls last,
    b.published_at desc nulls last,
    b.id
  limit least(greatest(coalesce(p_limit, 12), 1), 48)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.related_experiences(p_experience_id uuid, p_limit integer default 4)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  with src as (
    select category_id, county_code, destination_id from public.experiences where id = p_experience_id
  )
  select e.id
  from public.experiences e, src
  where e.id <> p_experience_id
    and e.status = 'published'
    and (e.category_id = src.category_id or e.county_code = src.county_code
         or (src.destination_id is not null and e.destination_id = src.destination_id))
  order by (e.destination_id is not distinct from src.destination_id) desc,
           (e.category_id = src.category_id) desc,
           (e.county_code = src.county_code) desc,
           e.published_at desc
  limit least(greatest(coalesce(p_limit, 4), 1), 12);
$$;

create or replace function public.nearby_destinations(p_destination_id uuid, p_radius_km double precision default 150, p_limit integer default 6)
returns table (id uuid, slug text, name text, distance_km double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.id, d.slug, d.name,
         round(app_private.distance_km(src.latitude, src.longitude, d.latitude, d.longitude)::numeric, 1)::double precision
  from public.destinations src
  join public.destinations d on d.id <> src.id and d.status = 'published' and d.latitude is not null
  where src.id = p_destination_id and src.latitude is not null
    and app_private.distance_km(src.latitude, src.longitude, d.latitude, d.longitude) <= least(p_radius_km, 500)
  order by 4
  limit least(greatest(coalesce(p_limit, 6), 1), 12);
$$;
