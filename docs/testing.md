# Testing

| Suite | Command | Needs | Count |
| --- | --- | --- | --- |
| Unit | `npm test` | nothing | 55 |
| Database | `npm run test:db` | local PostgreSQL 15+ | 73 |
| End to end | `npm run test:e2e` | PostgreSQL, Supabase Auth and PostgREST binaries, Chromium | 45 (mobile + desktop) |

## Unit (`tests/unit`)

Webhook signatures, Paystack adapter requests and status mapping, phone normalisation, the test
gateway guard, webhook service (never trusts payload amounts, duplicate handling, retry codes), money
formatting, CSV injection, validation schemas, upload sniffing.

## Database (`tests/db`)

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/hk_test npm run test:db
```

The URL must point at localhost; the database is dropped and recreated. A shim
(`supabase/tests/supabase-shim.sql`) supplies `auth.users`, `auth.uid()`, roles and the storage schema.
Covers RLS isolation between users and hosts, privilege escalation attempts, storage policies,
concurrent booking without overselling, idempotency, holds and expiry, payment mismatch/late/duplicate
handling, webhook dedupe and retry, every cancellation policy boundary, refunds, commission, payouts,
reviews, account deletion, search filters.

## End to end (`tests/e2e`)

Runs the production build against a local stack that uses the **real** Supabase Auth (GoTrue) and
PostgREST binaries, plus a small storage emulator enforcing the same RLS policies, an SMTP sink to read
confirmation emails, and a Paystack test double that signs webhooks.

```bash
E2E_DATABASE_URL=postgres://user:pass@localhost:5432/hk_e2e \
AUTH_BIN=/path/to/auth POSTGREST_BIN=/path/to/postgrest \
CHROMIUM_PATH=/path/to/chromium   # optional \
npm run test:e2e
```

Tested with Supabase Auth v2.180.0 and PostgREST v12.2.12. The journey covers: sign-up with email
confirmation, admin bootstrap, commission rule, host onboarding with document upload and verification,
listing with real photo upload and moderation, search and filters, booking, payment via signed
(and duplicated) webhooks, cross-user access attempts through the UI and directly against PostgREST,
cancellation with refund, password reset, no horizontal overflow at 390 px, and axe accessibility
checks (no serious or critical violations) on key pages at both viewport sizes.

What the e2e stack does **not** prove: behaviour of hosted Supabase Storage/Realtime, real Paystack,
real email delivery, Vercel limits. Those need the staging checks in the launch checklist.
