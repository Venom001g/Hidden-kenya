# Production launch checklist

Nothing here is done yet unless ticked.

## Accounts and credentials
- [ ] Supabase production project on a paid plan, PITR enabled
- [ ] Migrations applied (`supabase db push`), Security Advisor reviewed
- [ ] Auth: email confirmation on, Site URL and redirect URLs set, custom SMTP via Resend
- [ ] Resend domain verified (SPF, DKIM, DMARC)
- [ ] Paystack business verified for Kenya; M-Pesa and cards enabled; transfers enabled if paying hosts via API
- [ ] Mapbox public token restricted to the domain (optional)
- [ ] All variables in Vercel; secrets only in server-side variables

## Staging verification (with test keys)
- [ ] Full journey: sign-up → host verification → listing approval → booking → M-Pesa test payment → confirmation email
- [ ] Card test payment; failed payment; abandoned payment expires and frees seats
- [ ] Webhook received and verified (Paystack dashboard shows 200)
- [ ] Cancellation refund processed by Paystack
- [ ] Payout to a test M-Pesa recipient (or manual payout recorded)
- [ ] Cron running on schedule (Vercel → Cron Jobs)
- [ ] Photo and document uploads (up to 4 MB) succeed on the deployed site
- [ ] Restore from backup tested

## Legal and policy (needs a Kenyan advocate)
- [ ] Terms, privacy notice, cookie notice, host agreement, cancellation and refund policy reviewed;
      bracketed placeholders in `src/lib/content/legal.ts` replaced (company name, address, ODPC registration)
- [ ] Registration with the Office of the Data Protection Commissioner as controller/processor as applicable
- [ ] Decide which host licences are mandatory per category and write them into the verification policy
- [ ] Tax treatment of commission (VAT, Digital Service Tax / Significant Economic Presence tax) confirmed with an accountant

## Operations
- [ ] First admin bootstrapped; second admin added
- [ ] Default commission rule set
- [ ] Support email set in Admin → Settings
- [ ] Destinations written and published from real sources
- [ ] Error alerts: Vercel log drain or Sentry wired into `src/instrumentation.ts`
- [ ] Uptime monitoring on `/` and the webhook route
- [ ] Live key swap, one real low-value booking and refund by the team
