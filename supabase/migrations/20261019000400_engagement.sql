-- Hidden Kenya: reviews, favourites, notifications, support, newsletter,
-- moderation records and privacy requests.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  experience_id uuid not null references public.experiences (id) on delete cascade,
  provider_id uuid not null references public.provider_profiles (id) on delete cascade,
  customer_id uuid references auth.users (id) on delete set null,
  -- Display name captured at creation (first name + initial); avoids exposing profiles.
  reviewer_display_name text not null check (char_length(reviewer_display_name) between 1 and 60),
  rating smallint not null check (rating between 1 and 5),
  title text not null default '' check (char_length(title) <= 120),
  body text not null check (char_length(body) between 20 and 4000),
  status public.review_status not null default 'published',
  provider_response text not null default '' check (char_length(provider_response) <= 2000),
  provider_responded_at timestamptz,
  experienced_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reviews_experience_idx on public.reviews (experience_id, created_at desc) where status = 'published';
create index reviews_provider_idx on public.reviews (provider_id);
create index reviews_customer_idx on public.reviews (customer_id);
create trigger reviews_updated_at before update on public.reviews
  for each row execute function app_private.set_updated_at();

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  reporter_id uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'open' check (status in ('open', 'upheld', 'dismissed')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);
create index review_reports_status_idx on public.review_reports (status, created_at);

-- Aggregates of published reviews only.
create view public.experience_review_stats
with (security_invoker = true) as
  select experience_id,
         count(*)::integer as review_count,
         round(avg(rating)::numeric, 2) as average_rating
  from public.reviews
  where status = 'published'
  group by experience_id;

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  experience_id uuid not null references public.experiences (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, experience_id)
);
create index favorites_experience_idx on public.favorites (experience_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  recipient_email text check (recipient_email is null or recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  channel text not null check (channel in ('email', 'in_app')),
  template text not null check (char_length(template) <= 80),
  subject text not null check (char_length(subject) <= 200),
  -- Minimal non-sensitive context for in-app display (e.g. booking reference, link).
  data jsonb not null default '{}'::jsonb,
  dedupe_key text unique check (dedupe_key is null or char_length(dedupe_key) <= 200),
  status public.notification_status not null default 'queued',
  gateway_message_id text,
  error text check (error is null or char_length(error) <= 500),
  attempts smallint not null default 0,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.notifications is
  'Outbound email log and in-app notifications. Retention: 18 months.';
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_status_idx on public.notifications (status, created_at);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  subject text not null check (char_length(subject) between 4 and 160),
  category text not null check (category in ('booking', 'payment', 'account', 'listing', 'safety', 'other')),
  status public.ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets (user_id, updated_at desc);
create index support_tickets_status_idx on public.support_tickets (status, updated_at);
create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function app_private.set_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null default auth.uid(),
  is_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

-- is_staff is derived from the author's role, never from client input.
create or replace function app_private.support_message_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
    new.is_staff := app_private.is_admin();
  end if;
  update public.support_tickets
     set status = case when new.is_staff then 'awaiting_customer'::public.ticket_status else 'open'::public.ticket_status end,
         updated_at = now()
   where id = new.ticket_id;
  return new;
end;
$$;
create trigger support_messages_defaults before insert on public.support_messages
  for each row execute function app_private.support_message_defaults();

create table public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  status public.newsletter_status not null default 'pending',
  consent_text text not null check (char_length(consent_text) between 10 and 500),
  consented_at timestamptz not null default now(),
  -- SHA-256 hashes of single-purpose tokens; raw tokens are only ever emailed.
  confirm_token_hash text,
  unsubscribe_token_hash text not null,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  source text not null default 'website' check (char_length(source) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index newsletter_email_unique on public.newsletter_subscriptions (lower(email));
create unique index newsletter_confirm_token_idx on public.newsletter_subscriptions (confirm_token_hash) where confirm_token_hash is not null;
create unique index newsletter_unsubscribe_token_idx on public.newsletter_subscriptions (unsubscribe_token_hash);
create trigger newsletter_updated_at before update on public.newsletter_subscriptions
  for each row execute function app_private.set_updated_at();

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  target_type text not null check (target_type in ('experience', 'provider', 'document', 'review', 'destination', 'user')),
  target_id uuid not null,
  -- Provider affected by the decision, so the provider can read feedback addressed to them.
  provider_id uuid references public.provider_profiles (id) on delete cascade,
  action text not null check (char_length(action) between 2 and 40),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id, created_at desc);
create index moderation_actions_provider_idx on public.moderation_actions (provider_id, created_at desc);

create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  request_type public.data_request_type not null,
  status public.data_request_status not null default 'received',
  details text not null default '' check (char_length(details) <= 2000),
  handled_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index data_requests_status_idx on public.data_requests (status, created_at);
create trigger data_requests_updated_at before update on public.data_requests
  for each row execute function app_private.set_updated_at();
