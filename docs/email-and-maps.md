# Email and maps

## Transactional email (Resend)

Not yet connected to a real Resend account.

1. Add and verify your domain in Resend (SPF, DKIM records at your DNS provider; add DMARC).
2. Set `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` (e.g. `Hidden Kenya <bookings@yourdomain>`) and
   optionally `EMAIL_REPLY_TO` in Vercel.
3. Use the same Resend account for Supabase Auth SMTP ([supabase-setup.md](supabase-setup.md)).

Emails sent by the app (templates in `src/lib/email/templates.ts`): request received (guest) and new
request (host), request accepted with payment deadline, booking confirmed (guest and host), booking
cancelled or declined, refund processed, reminder 24–48 h before the start, host verification
decision, listing review decision, support reply, newsletter confirmation. Hold expiry is not emailed.

Every send is recorded in `notifications` with a dedupe key, so retries never send twice. Without
Resend configured, sends are recorded as `skipped_unconfigured` and Admin → Overview shows a warning.
Auth emails (confirm, reset) are sent by Supabase, not this code.

The newsletter uses double opt-in; confirm and unsubscribe links require a button press (POST) so
link scanners cannot trigger them.

## Maps

- With `NEXT_PUBLIC_MAPBOX_TOKEN` (a public `pk.` token): static map images on listings and
  destinations. In Mapbox, restrict the token to your domains (URL restrictions). The CSP already
  allows `api.mapbox.com`.
- Without it: the coordinates are shown with an "Open in OpenStreetMap" link. Nothing breaks.
- Coordinates are only stored with a stated source (host-entered, or the import's `location_source`).
  The meeting point a host enters is shown publicly on the listing, so hosts should enter a public
  meeting place, not a home address (the listing form says so).
