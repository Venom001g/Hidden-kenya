import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { providerCancelBooking, respondToBookingRequest } from "@/actions/provider-bookings";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { Alert, Badge, PageHeader } from "@/components/ui/feedback";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/forms";
import { requireProvider } from "@/lib/data/provider";
import { isFuture } from "@/lib/time";
import { formatDateTime, formatMoney } from "@/lib/format";
import { BOOKING_STATUS, PAYMENT_STATUS, REFUND_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Booking" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { profile, supabase } = await requireProvider(`/provider/bookings/${id}`);
  const { data: b } = await supabase
    .from("bookings")
    .select("*, experiences(title, slug, meeting_point_name), payments(status, amount_minor, currency, channel, paid_at), refunds(status, amount_minor, currency, created_at)")
    .eq("id", id)
    .eq("provider_id", profile.id)
    .maybeSingle();
  if (!b) notFound();
  const s = BOOKING_STATUS[b.status];
  const showContact = ["confirmed", "completed", "pending_provider_confirmation", "pending_payment"].includes(b.status);
  const isRequest = b.status === "pending_provider_confirmation" && isFuture(b.hold_expires_at);
  const commission = Math.round((b.total_minor * b.commission_rate_bps) / 10000);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Booking ${b.reference}`}
        description={
          <>
            <Badge tone={s.tone}>{s.label}</Badge> <span className="ml-2">{b.experiences?.title}</span>
          </>
        }
      />

      {isRequest ? (
        <Section title="Respond to this request" description={`Answer by ${formatDateTime(b.hold_expires_at!)}. If you accept, the guest is asked to pay to confirm.`}>
          <div className="flex flex-wrap gap-3">
            <ActionForm action={respondToBookingRequest}>
              <input type="hidden" name="bookingId" value={b.id} />
              <input type="hidden" name="decision" value="accept" />
              <SubmitButton>Accept request</SubmitButton>
            </ActionForm>
            <ConfirmAction
              action={respondToBookingRequest}
              hidden={{ bookingId: b.id, decision: "decline" }}
              trigger="Decline"
              triggerSize="md"
              title="Decline this request?"
              description="The guest is told and their places are released. Nothing has been charged."
              confirmLabel="Decline request"
              reason={{ label: "Message to the guest", required: true, placeholder: "e.g. The guide is unavailable that day; we have space the next morning." }}
            />
          </div>
        </Section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Details">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-[0.95rem]">
            <dt className="text-stone">Date</dt>
            <dd>{formatDateTime(b.starts_at)}</dd>
            <dt className="text-stone">Guests</dt>
            <dd>{b.party_size}</dd>
            <dt className="text-stone">Booked</dt>
            <dd>{formatDateTime(b.created_at)}</dd>
            {b.customer_notes ? (
              <>
                <dt className="text-stone">Guest notes</dt>
                <dd className="whitespace-pre-line">{b.customer_notes}</dd>
              </>
            ) : null}
            {b.cancellation_reason ? (
              <>
                <dt className="text-stone">Cancellation</dt>
                <dd>
                  {b.cancellation_reason} ({b.cancelled_by})
                </dd>
              </>
            ) : null}
          </dl>
        </Section>
        <Section title="Lead guest" description="Use these details only to deliver this booking.">
          {showContact ? (
            <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-[0.95rem]">
              <dt className="text-stone">Name</dt>
              <dd>{b.contact_name}</dd>
              <dt className="text-stone">Phone</dt>
              <dd>
                <a href={`tel:${b.contact_phone.replace(/[^\d+]/g, "")}`} className="underline">
                  {b.contact_phone}
                </a>
              </dd>
              <dt className="text-stone">Email</dt>
              <dd className="break-all">
                <a href={`mailto:${b.contact_email}`} className="underline">
                  {b.contact_email}
                </a>
              </dd>
            </dl>
          ) : (
            <p className="text-stone">Contact details are not shown for bookings that are no longer active.</p>
          )}
        </Section>
      </div>

      <Section title="Money" description="Commission is charged on what the guest paid, minus refunds. Payment fees are covered by Hidden Kenya.">
        <dl className="grid grid-cols-[12rem_1fr] gap-y-2 text-[0.95rem] tabular-nums">
          <dt className="text-stone">Booking total</dt>
          <dd>{formatMoney(b.total_minor, b.currency)}</dd>
          <dt className="text-stone">Commission rate</dt>
          <dd>{(b.commission_rate_bps / 100).toFixed(b.commission_rate_bps % 100 ? 2 : 0)}% (fixed when booked)</dd>
          <dt className="text-stone">Commission on total</dt>
          <dd>{formatMoney(commission, b.currency)}</dd>
          {b.refund_minor > 0 ? (
            <>
              <dt className="text-stone">Refund to guest</dt>
              <dd>{formatMoney(b.refund_minor, b.currency)}</dd>
            </>
          ) : null}
        </dl>
        {b.payments.length ? (
          <ul className="mt-4 space-y-1 text-sm">
            {b.payments.map((p, i) => (
              <li key={i}>
                Payment {formatMoney(p.amount_minor, p.currency)}: <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
                {p.paid_at ? ` ${formatDateTime(p.paid_at)}` : ""}
              </li>
            ))}
            {b.refunds.map((r, i) => (
              <li key={`r${i}`}>
                Refund {formatMoney(r.amount_minor, r.currency)}: <Badge tone={REFUND_STATUS[r.status].tone}>{REFUND_STATUS[r.status].label}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      {["confirmed", "pending_payment", "payment_failed"].includes(b.status) ? (
        <Section title="Cancel this booking">
          <Alert tone="warning" className="mb-4">
            Cancelling gives the guest a full refund of anything they paid. Frequent cancellations can lead to your listings being suspended.
          </Alert>
          <ConfirmAction
            action={providerCancelBooking}
            hidden={{ bookingId: b.id }}
            trigger="Cancel booking"
            triggerVariant="danger"
            triggerSize="md"
            title="Cancel this booking?"
            description="The guest is notified and refunded in full."
            confirmLabel="Cancel booking"
            reason={{ label: "Reason (shared with the guest)", required: true }}
          />
        </Section>
      ) : null}
    </div>
  );
}

export default function ProviderBookingPage(props: PageProps<"/provider/bookings/[id]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
