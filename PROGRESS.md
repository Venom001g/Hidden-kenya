# Hidden Kenya — build progress

This file tracks implementation state so work can resume after an interruption.

## Decisions (with reasons)

- **Fresh repository.** No existing code was provided; scaffolded with `create-next-app` (Next.js 16.4, React 19.3, Tailwind 4).
- **Fonts self-hosted via Fontsource.** Google Fonts is unreachable from the build sandbox, and self-hosting avoids sending visitor IPs to a third party.
- **Payment provider: Paystack** behind a `PaymentGateway` adapter (M-Pesa + cards in KES for Kenyan merchants, subject to Paystack KYC).
- **No `booking_participants` table.** Party size plus a lead-contact snapshot is enough (data minimisation).
- **Customer cancellations are processed immediately per the listing's policy** (deterministic refund quote).
- **Bookings are refused until an admin sets a commission rule.** The platform does not invent a rate.
- **Reference data limited to factual taxonomy**: 47 counties and the category list. No businesses, listings, reviews or users are seeded.
- **Webhook amounts are never trusted**; every event triggers a verify call to Paystack.
- **Duplicate charges are accepted then refunded** rather than rejected by a unique index (money already moved).
- **Uploads capped at 4 MB** to fit Vercel's 4.5 MB request limit.
- **Error monitoring**: structured JSON logs via `instrumentation.ts`; no hosted service integrated (needs an account).

## Phase status

- [x] 1–2 Foundation, design system
- [x] 3 Database, auth, RLS
- [x] 4 Public discovery
- [x] 5 Provider onboarding & listings
- [x] 6–7 Booking engine & payments (adapter verified against a local test double only)
- [x] 8–9 Dashboards & admin
- [x] 10 Email, maps, legal (drafts), accessibility
- [x] 11 Tests & security review
- [x] 12 Docs & deployment preparation (not deployed)

## Test results (2026-10-19)

- Unit: 55 passed
- Database (PostgreSQL 16, all 15 migrations): 73 passed
- End to end (production build, real Supabase Auth v2.180.0 + PostgREST v12.2.12, Chromium, mobile + desktop): 45 passed
- `npm run lint`, `npm run typecheck`, `npm run build`: clean

## Not done / needs the owner

- No real Supabase project, Paystack, Resend or Mapbox credentials: migrations not applied to a hosted project; payments, email and maps not verified live.
- Not deployed to Vercel.
- Legal pages are drafts with bracketed placeholders; need review by a Kenyan advocate.
- Hosted error tracking (Sentry etc.) not integrated.
- `data_requests` table has no admin screen; privacy requests by email are handled manually.
- Supabase CLI `config.toml` not generated (no Docker in the build sandbox).

## Next steps

Follow `docs/launch-checklist.md`.
