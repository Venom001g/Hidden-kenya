# Architecture

## Layout

```
src/
  app/                 routes (public, (auth), account, provider, admin, checkout, api)
  actions/             server actions — the only way the UI changes data
  components/          UI (ui/ primitives, layout/, experiences/, checkout/, provider/, admin/)
  lib/
    supabase/          server, browser, proxy and service-role clients
    data/              read queries (public, provider, admin, settings)
    validation/        Zod schemas shared by forms and actions
    payments/          PaymentGateway interface, Paystack adapter, webhook/reconcile service
    email/             Resend sender + templates
    security.ts        hashing, rate limiting, upload sniffing, audit helper
  proxy.ts             refreshes the Supabase session; redirects signed-out users from private areas
supabase/migrations/   the whole database: schema, RLS, functions, storage policies
tests/                 unit, db, e2e
```

## Principles

- **The database enforces the rules.** Prices, capacity, status transitions, refund amounts,
  commission and permissions live in Postgres functions and RLS policies. The Next.js layer
  validates input for good error messages but is not trusted to be correct. A bug in a page cannot
  oversell a session or show one host another host's bookings.
- **Three keys, three trust levels.** Browsers use the publishable key and the user's session (RLS
  applies). Server actions use the same, acting as the user. Only webhooks, cron, email sending and
  admin scripts use the secret key, from `server-only` modules.
- **No invented data.** Empty states everywhere instead of placeholders. Ratings appear only from real
  reviews tied to completed bookings.
- **Money is integer minor units** (`amount_minor`, cents), with currency stored alongside. Times are
  stored in UTC and shown in Africa/Nairobi.

## Roles

`user_roles` holds `customer`, `provider`, `admin`. Every account gets `customer` at sign-up (the
trigger ignores any role in sign-up metadata). `become_provider()` adds `provider` and creates an
unverified host profile. Only an existing admin (or the one-time bootstrap script) can grant `admin`.

Hosts are public only when **verified** by an admin, which requires reviewing their uploaded
documents. Listings are public only when the host is verified **and** an admin has approved the listing.
Editing key fields (title, price, location, photos) of an approved listing sends it back to review.

## Booking lifecycle

```
                 create_booking (instant)                 payment confirmed
  ──────────────► pending_payment ───────────────────────► confirmed ──► completed
                       │  hold expires                       │  start time passes (cron)
                       ▼                                     │
                    expired                                  ├─► cancelled_by_customer (refund per policy)
                                                             ├─► cancelled_by_provider (full refund)
  create_booking (request)                                   └─► cancelled_by_admin
  ──────────────► awaiting_provider ──accept──► pending_payment (payment window)
                       │ decline / no answer in time
                       ▼
                  declined / expired
```

- **Capacity:** each date+time gets an `experience_sessions` row, created on first booking and locked
  with `SELECT … FOR UPDATE`. Seats are counted from bookings holding or using them; expired holds
  stop counting the moment they expire, so availability is correct even if cron is late.
- **Idempotency:** every booking request carries a key; retrying returns the same booking.
- **Abuse limits:** max 5 open holds per guest, rate limits on sign-up, sign-in, booking and uploads.

## Payments

`begin_payment` creates a payment row with an unguessable reference (`HKP_…`) for the booking's
current amount; the guest pays on Paystack's hosted page (M-Pesa or card). Confirmation happens in
two places that both call the same idempotent `reconcilePayment`:

1. the **webhook** (`/api/webhooks/paystack`): signature checked with HMAC-SHA512, event stored once,
   then the transaction is **re-fetched from Paystack** — amounts in the webhook body are never trusted;
2. the **return page** and the **cron** sweep for payments still pending.

Edge cases handled in `apply_payment_result`: wrong amount or currency (held for review), payment
arriving after the hold expired (seats re-checked; refunded if gone), duplicate charges (refunded).

## Security summary

- RLS on every table; column-level grants restrict which fields users can write.
- SECURITY DEFINER functions use `search_path = ''` and check the caller.
- Private documents in a private bucket, readable only by the owner and admins, via signed URLs.
- Uploads: size limits, magic-byte checks, images re-encoded with sharp (strips EXIF/GPS).
- CSP, HSTS, frame-ancestors none, referrer policy, permissions policy (`next.config.ts`).
- Rate limits stored in Postgres keyed by a salted hash of the IP; raw IPs are not stored.
- Audit log (append-only) for admin and money actions.
- CSV exports neutralise formula injection.
- Open-redirect protection on `next` parameters.

## Observability

`src/instrumentation.ts` logs every unhandled server error as one JSON line (no query strings,
headers or bodies). Hosted error tracking (e.g. Sentry) is **not integrated**; add it there.
