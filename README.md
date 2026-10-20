# Hidden Kenya

A marketplace for experiences run by Kenyan guides, community groups and small tourism businesses.
Guests discover, compare, book and pay. Hosts get verified, publish listings and manage bookings.
Administrators moderate, set commission and record payouts.

> **Status: works locally, not deployed.** Every flow has been exercised end to end on a local
> Supabase-compatible stack (see [docs/testing.md](docs/testing.md)). It has **not** been connected to
> a real Supabase project, Paystack account, Resend domain or Mapbox account, and the legal pages are
> drafts awaiting review by a Kenyan advocate. See [docs/launch-checklist.md](docs/launch-checklist.md).

The database ships with **no content**: no listings, hosts, reviews or bookings. The only reference
data is Kenya's 47 counties and the platform's category list. Real content comes from hosts signing
up and from the reviewed destination import ([docs/data-onboarding.md](docs/data-onboarding.md)).

## Stack

| Concern | Choice |
| --- | --- |
| App | Next.js 16 (App Router, Cache Components), React 19, TypeScript strict |
| UI | Tailwind CSS 4, Radix primitives, Lucide icons, self-hosted fonts |
| Forms | Server Actions + Zod (shared schemas), React Hook Form where interactive |
| Data | Supabase Postgres with Row Level Security, Auth, Storage |
| Payments | Paystack (M-Pesa and cards, KES) behind a `PaymentGateway` adapter |
| Email | Resend, every send recorded in `notifications` |
| Maps | Mapbox static maps when a public token is set; otherwise coordinates + OpenStreetMap link |
| Hosting | Vercel (cron every 15 minutes for maintenance) |
| Tests | Vitest (unit + database), Playwright + axe (end to end) |

## Quick start (local)

```bash
npm install
cp .env.example .env.local      # fill in your Supabase project values; never commit this file
npm run dev
```

Without Supabase variables the public pages render empty states, and account pages explain that the
service is not configured. Full instructions: [docs/local-development.md](docs/local-development.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint; route type generation + `tsc --noEmit` |
| `npm test` | Unit tests (no network, no database) |
| `npm run test:db` | Applies every migration to a throwaway local Postgres and runs 73 security, booking and payment tests |
| `npm run test:e2e` | Builds the app and runs Playwright against real Supabase Auth + PostgREST binaries |
| `npm run check` | lint + typecheck + unit tests |
| `npm run db:types` | Regenerates `src/lib/database.types.ts` from a migrated database |
| `npm run admin:bootstrap -- you@example.com` | Makes the first administrator (refuses if one exists) |
| `npm run import:destinations -- file.json` | Imports sourced destination records as drafts |

## Documentation

- [Architecture](docs/architecture.md): how the pieces fit, booking lifecycle, security model
- [Database](docs/database.md): schema, RLS, functions, migrations
- [Local development](docs/local-development.md) and [environment variables](docs/environment.md)
- [Supabase setup](docs/supabase-setup.md): project, migrations, auth emails, storage
- [Payments](docs/payments.md): Paystack onboarding, webhooks, refunds, payouts, test vs live
- [Email and maps](docs/email-and-maps.md)
- [Deployment](docs/deployment.md): Vercel, cron, domains
- [Operations](docs/operations.md): first admin, moderation, backups, troubleshooting
- [Data onboarding](docs/data-onboarding.md): destination import format
- [Testing](docs/testing.md)
- [Launch checklist](docs/launch-checklist.md)
- [PROGRESS.md](PROGRESS.md): build log and open items
