# Deployment (Vercel)

The app has **not** been deployed. This is the procedure.

1. Push the repository to GitHub and import it in Vercel (framework preset: Next.js; defaults for
   build and output).
2. Set environment variables for Production (and Preview if you use a separate Supabase project for
   previews; do not point previews at production data). See [environment.md](environment.md).
3. Deploy. Then add your domain, and set `NEXT_PUBLIC_SITE_URL` to `https://<domain>` and redeploy.
4. Supabase: set Site URL and redirect URLs to the domain.
5. Paystack: set the webhook URL to `https://<domain>/api/webhooks/paystack`.
6. Cron: `vercel.json` schedules `/api/cron/maintenance` every 15 minutes; Vercel sends
   `CRON_SECRET` as a Bearer token. **On the Hobby plan crons run at most once a day**, which delays
   reminders, refund retries, payment reconciliation and marking bookings completed (seat availability stays correct
   because expired holds stop counting immediately). Use Pro, or call the endpoint from another
   scheduler with the same header.
7. Smoke test: sign up, confirm email, bootstrap admin, add commission rule, verify a host, approve a
   listing, book and pay with test keys, cancel and see the refund.

Region: set the Vercel function region close to your Supabase region (Project Settings → Functions).

Uploads are capped at 4 MB per file (photos and verification documents) and server action bodies at
4.5 MB, to stay inside Vercel's 4.5 MB function request limit. To allow larger files later, switch
uploads to direct-to-Storage signed upload URLs.
