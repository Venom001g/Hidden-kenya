# Local development

Requirements: Node.js 22+, npm, and either a Supabase project (simplest) or the Supabase CLI.

## Option A — a development Supabase project

1. Create a free project at supabase.com (pick a region near Kenya, e.g. eu-west or af-south if offered).
2. Apply migrations: `npx supabase link --project-ref <ref>` then `npx supabase db push`
   (see [supabase-setup.md](supabase-setup.md)).
3. `cp .env.example .env.local` and fill the Supabase URL, publishable key, secret key, `HASH_SALT`
   and `CRON_SECRET`. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
4. In Supabase → Authentication → URL Configuration add `http://localhost:3000/**` to redirect URLs.
5. `npm install && npm run dev`.
6. Sign up through the site, confirm the email, then make yourself admin:
   `SUPABASE_URL=… SUPABASE_SECRET_KEY=… npm run admin:bootstrap -- you@example.com`.
7. In Admin → Settings, add a default commission rule. Bookings are refused until one exists.

## Option B — Supabase CLI (Docker)

```bash
npx supabase init          # creates supabase/config.toml; keep the existing migrations folder
npx supabase start         # prints local URL and keys
npx supabase db reset      # applies supabase/migrations
```

Use the printed API URL and keys in `.env.local`. Local auth emails appear in the Inbucket/Mailpit
UI the CLI prints. This option was not exercised in the build environment (no Docker); the
migrations were verified with plain Postgres and the Supabase Auth binary instead.

## Payments locally

Use Paystack **test** keys (`sk_test_…`). To receive webhooks on localhost, expose the dev server with
a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and set the test webhook URL in
Paystack to `https://<tunnel>/api/webhooks/paystack`. Without a tunnel, the return page and the
"check payment status" button still reconcile by querying Paystack directly.

## Running cron locally

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/maintenance
```
