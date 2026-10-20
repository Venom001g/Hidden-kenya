# Payments (Paystack, Kenya)

Status: the adapter is implemented and tested against a local Paystack test double that mimics the
documented API and signs webhooks the same way. It has **not** been run against Paystack's real test
or live environment, because no account credentials were available.

## Why Paystack

Paystack accepts M-Pesa and cards for Kenyan merchants in KES through one hosted checkout, offers
refunds and M-Pesa transfers (used for host payouts) through the same API. Another provider can be
added by implementing `PaymentGateway` in `src/lib/payments/types.ts`.

## Onboarding (business owner)

1. Create a Paystack account choosing Kenya; complete business verification (KYC). Paystack decides
   eligibility and which channels (M-Pesa, cards) are enabled.
2. Settings → API Keys & Webhooks: copy the **test** secret key first.
3. Webhook URL: `https://<your-domain>/api/webhooks/paystack` (test and live are set separately).
4. Set `PAYSTACK_SECRET_KEY` in Vercel. Do one full test booking (Paystack test M-Pesa/card
   numbers), check the booking is confirmed, then do a cancellation to see the refund.
5. Go live: replace with the live secret key and set the live webhook URL. Make one small real
   booking yourself and refund it.

## How a payment flows

1. Guest clicks Pay → `startPayment` → `begin_payment` (creates `HKP_…` reference for the booking's
   amount) → Paystack initialise → redirect to Paystack's page.
2. Paystack sends `charge.success` to the webhook. The handler: verifies the signature, stores the event
   once (duplicates return 200), **re-fetches the transaction** and applies the verified result.
3. Guest returns to `/checkout/<id>/return`, which also reconciles. Cron reconciles anything still
   pending after 5 minutes (up to 3 days).

Webhook responses: 401 bad signature, 400 unreadable, 200 processed or duplicate, 500 to make Paystack
retry after a temporary failure (the event is reprocessed on retry).

## Refunds

Cancellation computes the refund from the listing's policy (flexible, moderate, strict; shown on the
listing and at checkout). Host and admin cancellations refund in full. Refund rows are queued and
submitted to Paystack immediately and again by cron if that fails; `refund.processed` / `refund.failed`
webhooks finish them. Admins see failed refunds in Admin → Payments.

## Host payouts

Hosts add an M-Pesa number in their earnings page; it is registered with Paystack as a transfer
recipient and only the recipient code and a masked number are stored. Admins create a payout from
completed, unpaid bookings (Admin → Payouts) and either send it via Paystack Transfers (requires
transfers enabled and a funded balance) or record a manual payment with its reference. Transfer
webhooks mark payouts paid or failed.

## Testing safely

Automated tests never use real credentials: unit tests use fake keys, and the e2e suite talks only to
`tests/e2e/stack/paystack-mock.mjs` on localhost.
