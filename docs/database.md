# Database

All schema lives in `supabase/migrations/` and is applied in filename order. Migrations were tested
on PostgreSQL 16 against the real Supabase Auth schema (see [testing.md](testing.md)); they have not yet
been applied to a hosted Supabase project.

| File | Contents |
| --- | --- |
| `…0100_foundation` | enums, profiles, user_roles, counties, categories, site_settings, audit_logs, rate limits |
| `…0200_marketplace` | provider profiles (public + private details), payout accounts, verification documents, destinations, experiences, images, availability, sessions |
| `…0300_bookings_payments` | commission rules, bookings, payments, payment_events, refunds, payouts |
| `…0400_engagement` | reviews, favourites, notifications, support tickets, newsletter, moderation, data requests |
| `…0500_rls` | grants and Row Level Security policies for every table |
| `…0600_listing_functions` | host onboarding, verification, listing review, availability, search |
| `…0700_booking_functions` | booking creation, responses, cancellation, payment/refund application, expiry, reviews |
| `…0800_admin_functions` | admin bootstrap and roles, users, commission, settings, payouts, metrics, data export, account deletion |
| `…0900_storage` | buckets and storage policies |
| `…1000_reference_data` | 47 counties, category taxonomy |
| `…1100_function_privileges` | who may execute each function |
| `…1200`–`…1500` | webhook retry semantics, payout transfers, moderation guards, audit erasure, host contact for guests |

## Conventions

- Errors raised by functions start with `HK_<CODE>:`; `src/lib/errors.ts` turns them into plain messages.
- Helper functions not meant for clients live in schema `app_private`.
- Personal data is kept out of public tables: host phone/ID details are in `provider_private_details`,
  payout accounts store only a gateway token and a masked label (never the full number).
- `booking_accounting` (view) is the single source for gross, refunds, commission and host net.
  Commission is charged on gross minus refunds, at the rate fixed when the booking was made.

## Settings (`site_settings`, edited in Admin → Settings)

| Key | Default | Meaning |
| --- | --- | --- |
| `payment_hold_minutes` | 30 | how long instant bookings hold seats while unpaid |
| `provider_response_hours` | 48 | how long hosts have to answer a request |
| `request_payment_hold_hours` | 24 | guest's payment window after a request is accepted |
| `review_window_days` | 90 | how long after an experience a guest may review |
| `support_email` | empty | shown in the footer |
| `featured_experiences` | empty | admin-chosen homepage listings (marked "sponsored" where applicable) |

## Regenerating types

```bash
TEST_DATABASE_URL=postgres://…/hk_test npm run db:test:reset   # local throwaway DB
TEST_DATABASE_URL=postgres://…/hk_test npm run db:types
```

Or with the Supabase CLI against a hosted project: `supabase gen types typescript --linked > src/lib/database.types.ts`.

## Changing the schema

Add a new timestamped file; never edit an applied migration. Run `npm run test:db` before shipping.
