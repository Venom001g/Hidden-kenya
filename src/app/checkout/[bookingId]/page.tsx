import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Countdown } from "@/components/checkout/countdown";
import { PayButton } from "@/components/checkout/pay-button";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getGateway } from "@/lib/payments";
import { CANCELLATION_POLICIES } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { isFuture } from "@/lib/time";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

async function Checkout({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) notFound();
  const user = await requireUser(`/checkout/${bookingId}`);
  const supabase = await createClient();
  const { data: b } = await supabase
    .from("bookings")
    .select("*, experiences(title, slug)")
    .eq("id", bookingId)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (!b) notFound();
  if (["confirmed", "completed", "refund_pending", "refunded"].includes(b.status)) redirect(`/account/bookings/${b.id}`);

  const holdActive = isFuture(b.hold_expires_at);
  const payable = ["pending_payment", "payment_failed"].includes(b.status) && holdActive;
  const gatewayReady = getGateway().isConfigured();
  const policy = CANCELLATION_POLICIES[b.cancellation_policy];

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <h1 className="text-4xl">{b.status === "pending_provider_confirmation" ? "Request sent" : "Confirm and pay"}</h1>

        {b.status === "pending_provider_confirmation" && holdActive ? (
          <Alert tone="info" title="Waiting for the host">
            The host has until {formatDateTime(b.hold_expires_at!)} to accept. We will email you; you pay only after they accept.
          </Alert>
        ) : null}
        {b.status === "payment_failed" && holdActive ? (
          <Alert tone="error" title="The last payment attempt did not go through">
            No money was taken for that attempt. You can try again below.
          </Alert>
        ) : null}
        {!holdActive && !["cancelled"].includes(b.status) ? (
          <Alert tone="warning" title="This reservation has expired">
            The places were released because payment was not completed in time. If you paid and were charged, the payment will be matched or refunded automatically.
          </Alert>
        ) : null}
        {b.status === "cancelled" ? <Alert tone="warning" title="This booking was cancelled">{b.cancellation_reason}</Alert> : null}

        {payable ? (
          <div className="space-y-4 rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5">
            <p>
              Your places are held for <Countdown until={b.hold_expires_at!} />. Pay by M-Pesa or card on Paystack&apos;s secure page; you will come back here afterwards.
            </p>
            {gatewayReady ? (
              <PayButton bookingId={b.id} label={`Pay ${formatMoney(b.total_minor, b.currency)}`} />
            ) : (
              <Alert tone="warning" title="Online payment is not switched on yet">
                No money can be taken at the moment, so this reservation will be released when the hold ends. Please check back soon.
              </Alert>
            )}
            <p className="text-sm text-stone">Your booking is confirmed only when Paystack confirms the payment to us. Hidden Kenya never sees your card or M-Pesa PIN.</p>
          </div>
        ) : null}

        {!payable && b.experiences ? (
          <ButtonLink href={`/experiences/${b.experiences.slug}`} variant="secondary">
            Back to the experience
          </ButtonLink>
        ) : null}
      </div>

      <aside className="h-fit space-y-4 rounded-[var(--radius-card)] bg-sand/60 p-5">
        <h2 className="text-xl">{b.experiences?.title}</h2>
        <dl className="space-y-2 text-[0.95rem]">
          <div className="flex justify-between gap-4">
            <dt className="text-stone">Date</dt>
            <dd className="text-right">{formatDateTime(b.starts_at)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone">Guests</dt>
            <dd>{b.party_size}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone">Price</dt>
            <dd>
              {formatMoney(b.unit_price_minor, b.currency)} {b.pricing_model === "per_person" ? "× " + b.party_size : "per group"}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-sand-deep pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatMoney(b.total_minor, b.currency)}</dd>
          </div>
          <div className="pt-2 text-sm text-stone">
            Reference {b.reference}. Cancellation: {policy.label.toLowerCase()}. {policy.summary}
          </div>
        </dl>
      </aside>
    </div>
  );
}

export default function CheckoutPage(props: PageProps<"/checkout/[bookingId]">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <Suspense fallback={<div className="h-80 animate-pulse rounded-[var(--radius-card)] bg-sand/50" />}>
        <Checkout params={props.params} />
      </Suspense>
    </div>
  );
}
