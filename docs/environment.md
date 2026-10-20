# Environment variables

`.env.example` lists every variable with comments. Put local values in `.env.local` (git-ignored) and
production values in Vercel's environment settings. Never paste secrets into source files.

| Variable | Exposed to browser | Required | Without it |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | yes | yes in production | links in emails and payment callbacks are wrong |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | app runs in "not configured" mode with empty pages |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | yes | yes | as above |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | yes | no | maps show coordinates with an OpenStreetMap link |
| `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) | **no** | yes | webhooks, cron, email and admin scripts fail |
| `HASH_SALT` | no | yes | rate limiting and newsletter links fail closed |
| `CRON_SECRET` | no | yes on Vercel | `/api/cron/maintenance` rejects every call |
| `PAYSTACK_SECRET_KEY` | no | for payments | checkout says online payment is not available yet |
| `PAYMENT_PROVIDER` | no | no (`paystack`) | — |
| `PAYMENT_SUPPORTED_CURRENCIES` | no | no (`KES`) | listings in other currencies cannot be paid online |
| `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` | no | for email | emails recorded as "not sent"; admin overview warns |
| `EMAIL_REPLY_TO` | no | no | — |

Test-only (never set in production): `TEST_DATABASE_URL`, `HK_ALLOW_TEST_GATEWAY`,
`PAYSTACK_API_BASE_URL`, `HK_E2E`, `NEXT_DIST_DIR`. The Paystack base-URL override is ignored unless
`HK_ALLOW_TEST_GATEWAY=1` **and** the key starts with `sk_test_`, so a live key can only ever be
sent to `api.paystack.co` (covered by unit tests).

Admin → Overview shows which integrations are configured, without revealing values.

Generate secrets with `openssl rand -base64 48`.
