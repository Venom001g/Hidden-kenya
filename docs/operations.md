# Operations

## Daily admin work

- **Admin → Providers:** review new hosts. Open each document (signed link, expires quickly), check it
  matches the business, approve or reject documents, then verify or reject the host with a reason.
  Check licences where your policy requires them (e.g. Tourism Regulatory Authority licence for tour
  operators, KWS/conservancy permissions where relevant); the app records when you checked.
- **Admin → Listings:** approve listings or send them back with a reason.
- **Admin → Bookings / Payments:** look for payments held for review (wrong amount) and failed refunds.
- **Admin → Reviews:** reported reviews. Hidden reviews stay in the database with the reason.
- **Admin → Support:** tickets from guests and hosts.
- **Admin → Audit:** append-only record of admin and money actions.

## Privacy requests (Kenya Data Protection Act 2019)

- Users download their data from Account → Settings (JSON export).
- Users delete their account from the same page (password re-entry). Bookings are kept with personal
  fields scrubbed for accounting; reviews are deleted. Hosts with active bookings must resolve them first.
- Requests received by email: record them and act within the statutory period. The `data_requests`
  table exists but has no admin screen yet.

## Backups and recovery

- Supabase paid plans take daily backups; enable Point-in-Time Recovery for a booking business.
- Storage files are not included in database backups. Periodically copy the buckets
  (e.g. `rclone` with the S3-compatible endpoint) or accept that photos may need re-uploading.
- Test a restore into a separate project before launch, and note how long it takes.
- After a restore, run the cron endpoint once and reconcile payments in Paystack's dashboard against
  `payments` for the gap period.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| "This service isn't configured" | Supabase public URL/key missing in the environment |
| Confirmation emails don't arrive | Supabase SMTP settings; Resend domain verification; spam |
| Email link says expired | redirect URL list in Supabase; link opened twice; Site URL wrong |
| Bookings refused: "no commission rule" | add a default rule in Admin → Settings |
| "Online payment is not available yet" | `PAYSTACK_SECRET_KEY` missing, or listing currency not in `PAYMENT_SUPPORTED_CURRENCIES` |
| Paid but booking still pending | webhook URL/secret in Paystack; Vercel logs for `/api/webhooks/paystack`; press "Check payment status" |
| Cron returns 401 | `CRON_SECRET` mismatch |
| Upload rejected | files are limited to 4 MB; photos at least 400×300 px |
| Errors | Vercel logs, search for `"source":"hidden-kenya"` |
