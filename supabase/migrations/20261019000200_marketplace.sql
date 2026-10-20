-- Hidden Kenya: providers, destinations, experiences, media, availability.

------------------------------------------------------------------------------
-- Providers
------------------------------------------------------------------------------
-- Public-safe provider fields. Anything sensitive lives in provider_private_details.
create table public.provider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete restrict,
  business_name text not null check (char_length(business_name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  description text not null default '' check (char_length(description) <= 4000),
  operating_areas text not null default '' check (char_length(operating_areas) <= 500),
  website_url text check (website_url is null or website_url ~ '^https://'),
  year_established smallint check (year_established is null or year_established between 1900 and 2100),
  verification_status public.provider_status not null default 'draft',
  submitted_at timestamptz,
  verified_at timestamptz,
  -- Set only when an administrator has accepted a tourism licence document.
  licence_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.provider_profiles.verification_status is
  'Set only through admin_review_provider(). A provider is advertised as verified only when this is ''verified''.';
create index provider_profiles_status_idx on public.provider_profiles (verification_status);
create trigger provider_profiles_updated_at before update on public.provider_profiles
  for each row execute function app_private.set_updated_at();

create table public.provider_private_details (
  provider_id uuid primary key references public.provider_profiles (id) on delete cascade,
  contact_email text not null default '' check (contact_email = '' or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text not null default '' check (contact_phone = '' or contact_phone ~ '^\+?[0-9 ()-]{7,20}$'),
  legal_name text not null default '' check (char_length(legal_name) <= 160),
  registration_number text not null default '' check (char_length(registration_number) <= 60),
  tourism_licence_number text not null default '' check (char_length(tourism_licence_number) <= 60),
  -- Feedback from the most recent verification decision (visible to the provider).
  verification_feedback text not null default '' check (char_length(verification_feedback) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger provider_private_details_updated_at before update on public.provider_private_details
  for each row execute function app_private.set_updated_at();

create table public.provider_service_categories (
  provider_id uuid not null references public.provider_profiles (id) on delete cascade,
  category_id uuid not null references public.experience_categories (id) on delete cascade,
  primary key (provider_id, category_id)
);

-- Payout destination. Only a payment-provider token and a masked label are stored;
-- raw account numbers are sent straight to the payment provider and never persisted.
create table public.provider_payout_accounts (
  provider_id uuid primary key references public.provider_profiles (id) on delete cascade,
  method text not null check (method in ('mobile_money', 'bank_account')),
  display_label text not null check (char_length(display_label) <= 80),
  gateway text not null default 'paystack',
  gateway_recipient_code text not null check (char_length(gateway_recipient_code) <= 80),
  currency char(3) not null default 'KES' check (currency in ('KES', 'USD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger provider_payout_accounts_updated_at before update on public.provider_payout_accounts
  for each row execute function app_private.set_updated_at();

create table public.provider_verification_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles (id) on delete cascade,
  document_type public.document_type not null,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  original_filename text not null check (char_length(original_filename) <= 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  status public.document_status not null default 'submitted',
  review_notes text not null default '' check (char_length(review_notes) <= 1000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.provider_verification_documents is
  'Metadata for private verification files stored in the verification-documents bucket. Retention: deleted 24 months after the provider account closes (see docs/privacy.md).';
create index provider_documents_provider_idx on public.provider_verification_documents (provider_id);
create index provider_documents_status_idx on public.provider_verification_documents (status);

create or replace function app_private.my_provider_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.provider_profiles where user_id = (select auth.uid());
$$;
grant execute on function app_private.my_provider_id() to anon, authenticated, service_role;

create or replace function app_private.provider_is_public(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_profiles
    where id = p_provider_id and verification_status = 'verified'
  );
$$;
grant execute on function app_private.provider_is_public(uuid) to anon, authenticated, service_role;

------------------------------------------------------------------------------
-- Destinations (general information, not bookable inventory)
------------------------------------------------------------------------------
create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(name) between 2 and 120),
  county_code smallint not null references public.counties (code),
  summary text not null default '' check (char_length(summary) <= 300),
  description text not null default '' check (char_length(description) <= 10000),
  travel_information text not null default '' check (char_length(travel_information) <= 5000),
  latitude double precision check (latitude is null or latitude between -5.0 and 5.5),
  longitude double precision check (longitude is null or longitude between 33.5 and 42.5),
  -- How the coordinates were established (e.g. 'Geocoded via Mapbox 2026-10-19', 'Entered by admin from official park map').
  location_source text not null default '' check (char_length(location_source) <= 300),
  content_source_name text not null default '' check (char_length(content_source_name) <= 200),
  content_source_url text check (content_source_url is null or content_source_url ~ '^https?://'),
  content_retrieved_on date,
  status public.content_status not null default 'draft',
  created_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint destinations_coordinates_pair check ((latitude is null) = (longitude is null)),
  constraint destinations_coordinates_sourced check (latitude is null or location_source <> '')
);
create index destinations_status_idx on public.destinations (status);
create index destinations_county_idx on public.destinations (county_code);
create trigger destinations_updated_at before update on public.destinations
  for each row execute function app_private.set_updated_at();

create table public.destination_images (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations (id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null check (char_length(alt_text) between 3 and 250),
  credit text not null check (char_length(credit) between 2 and 200),
  licence text not null check (char_length(licence) between 2 and 120),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index destination_images_destination_idx on public.destination_images (destination_id, position);

------------------------------------------------------------------------------
-- Experiences
------------------------------------------------------------------------------
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles (id) on delete restrict,
  destination_id uuid references public.destinations (id) on delete set null,
  county_code smallint not null references public.counties (code),
  category_id uuid not null references public.experience_categories (id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  title text not null check (char_length(title) between 5 and 120),
  summary text not null default '' check (char_length(summary) <= 300),
  description text not null default '' check (char_length(description) <= 10000),
  pricing_model public.pricing_model not null default 'per_person',
  price_minor bigint not null check (price_minor > 0 and price_minor <= 100000000000),
  currency char(3) not null default 'KES' check (currency in ('KES', 'USD')),
  duration_minutes integer not null check (duration_minutes between 15 and 43200),
  min_participants integer not null default 1 check (min_participants >= 1),
  max_participants integer not null check (max_participants between 1 and 500),
  included text[] not null default '{}' check (cardinality(included) <= 30),
  excluded text[] not null default '{}' check (cardinality(excluded) <= 30),
  languages text[] not null default '{}' check (cardinality(languages) <= 15),
  tags text[] not null default '{}' check (cardinality(tags) <= 15),
  -- Provider-supplied. Never presented as independently verified.
  accessibility_features text[] not null default '{}' check (cardinality(accessibility_features) <= 15),
  accessibility_notes text not null default '' check (char_length(accessibility_notes) <= 2000),
  meeting_point_name text not null default '' check (char_length(meeting_point_name) <= 200),
  meeting_point_instructions text not null default '' check (char_length(meeting_point_instructions) <= 2000),
  meeting_latitude double precision check (meeting_latitude is null or meeting_latitude between -5.0 and 5.5),
  meeting_longitude double precision check (meeting_longitude is null or meeting_longitude between 33.5 and 42.5),
  booking_mode public.booking_mode not null default 'instant',
  lead_time_hours integer not null default 24 check (lead_time_hours between 0 and 720),
  max_advance_days integer not null default 365 check (max_advance_days between 1 and 730),
  cancellation_policy public.cancellation_policy not null default 'moderate',
  status public.experience_status not null default 'draft',
  submitted_at timestamptz,
  published_at timestamptz,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experiences_participants_range check (min_participants <= max_participants),
  constraint experiences_meeting_pair check ((meeting_latitude is null) = (meeting_longitude is null))
);
create index experiences_provider_idx on public.experiences (provider_id);
create index experiences_status_published_idx on public.experiences (status, published_at desc);
create index experiences_category_idx on public.experiences (category_id) where status = 'published';
create index experiences_county_idx on public.experiences (county_code) where status = 'published';
create index experiences_destination_idx on public.experiences (destination_id) where status = 'published';
create index experiences_price_idx on public.experiences (currency, price_minor) where status = 'published';
create index experiences_search_idx on public.experiences using gin (search_vector);
create trigger experiences_updated_at before update on public.experiences
  for each row execute function app_private.set_updated_at();

-- Material edits to an approved listing send it back to moderation, so content
-- cannot be changed after approval without review. Status changes made by
-- SECURITY DEFINER moderation functions set app.moderation_bypass.
create or replace function app_private.experiences_require_rereview()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.moderation_bypass', true), '') = 'on' then
    return new;
  end if;
  if old.status in ('published', 'paused') and (
       new.title is distinct from old.title or
       new.summary is distinct from old.summary or
       new.description is distinct from old.description or
       new.price_minor is distinct from old.price_minor or
       new.currency is distinct from old.currency or
       new.pricing_model is distinct from old.pricing_model or
       new.category_id is distinct from old.category_id or
       new.county_code is distinct from old.county_code or
       new.destination_id is distinct from old.destination_id or
       new.meeting_point_name is distinct from old.meeting_point_name or
       new.meeting_point_instructions is distinct from old.meeting_point_instructions or
       new.meeting_latitude is distinct from old.meeting_latitude or
       new.meeting_longitude is distinct from old.meeting_longitude or
       new.included is distinct from old.included or
       new.excluded is distinct from old.excluded or
       new.accessibility_features is distinct from old.accessibility_features or
       new.accessibility_notes is distinct from old.accessibility_notes or
       new.cancellation_policy is distinct from old.cancellation_policy
     ) then
    new.status := 'pending_review';
    new.submitted_at := now();
  end if;
  return new;
end;
$$;
create trigger experiences_rereview before update on public.experiences
  for each row execute function app_private.experiences_require_rereview();

create or replace function app_private.experience_is_public(p_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.experiences e
    join public.provider_profiles p on p.id = e.provider_id
    where e.id = p_experience_id
      and e.status = 'published'
      and p.verification_status = 'verified'
  );
$$;
grant execute on function app_private.experience_is_public(uuid) to anon, authenticated, service_role;

create or replace function app_private.owns_experience(p_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.experiences e
    join public.provider_profiles p on p.id = e.provider_id
    where e.id = p_experience_id and p.user_id = (select auth.uid())
  );
$$;
grant execute on function app_private.owns_experience(uuid) to anon, authenticated, service_role;

create table public.experience_images (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  alt_text text not null check (char_length(alt_text) between 3 and 250),
  credit text not null default '' check (char_length(credit) <= 200),
  -- Provider confirms they own or are licensed to use the photo.
  rights_confirmed boolean not null check (rights_confirmed),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  position smallint not null default 0 check (position between 0 and 50),
  created_at timestamptz not null default now()
);
create index experience_images_experience_idx on public.experience_images (experience_id, position);

------------------------------------------------------------------------------
-- Availability
------------------------------------------------------------------------------
-- Recurring weekly rules. A one-off date is a rule whose valid_from = valid_until.
create table public.experience_availability (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  weekdays smallint[] not null check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
  ),
  start_time time not null,
  timezone text not null default 'Africa/Nairobi' check (timezone in ('Africa/Nairobi')),
  capacity integer not null check (capacity between 1 and 1000),
  valid_from date not null,
  valid_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_valid_range check (valid_until is null or valid_until >= valid_from),
  constraint availability_range_limit check (valid_until is null or valid_until <= valid_from + 800)
);
comment on column public.experience_availability.weekdays is 'ISO weekday numbers: 1 = Monday … 7 = Sunday.';
create index experience_availability_experience_idx on public.experience_availability (experience_id) where is_active;
create trigger experience_availability_updated_at before update on public.experience_availability
  for each row execute function app_private.set_updated_at();

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  exception_date date not null,
  -- null start_time = applies to the whole day.
  start_time time,
  kind text not null check (kind in ('closed', 'capacity_override')),
  capacity_override integer check (capacity_override is null or capacity_override between 0 and 1000),
  reason text not null default '' check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  constraint exception_override_requires_capacity check (kind <> 'capacity_override' or capacity_override is not null)
);
create unique index availability_exceptions_unique
  on public.availability_exceptions (experience_id, exception_date, coalesce(start_time, '00:00:00'::time), kind);

-- Materialised occurrences, created lazily when the first booking is made.
-- A row lock on the session serialises concurrent bookings for the same departure.
create table public.experience_sessions (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete restrict,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (experience_id, starts_at)
);
