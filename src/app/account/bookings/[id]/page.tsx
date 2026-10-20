import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelBooking } from "@/actions/bookings";
import { createReview } from "@/actions/account";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { MapBlock } from "@/components/map-block";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Badge, PageHeader } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/forms";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { CANCELLATION_POLICIES } from "@/lib/site";
import { BOOKING_STATUS, PAYMENT_STATUS, REFUND_STATUS } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";
import { isFuture } from "@/lib/time";

export const metadata: Metadata = { title: "Booking" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser(`/account/bookings/${id}`);
  const supabase = await createClient();
  const { data: b } = await supabase
    .from("bookings")
    .select(
      "*, experiences(title, slug, meeting_point_name, meeting_point_instructions, meeting_latitude, meeting_longitude), payments(id, status, amount_minor, currency, channel, paid_at, created_at), refunds(id, status, amount_minor, currency, created_at, processed_at), reviews(id)",
    )
    .eq("id", id)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (!b) notFound();

  const [{ data: quote }, { data: host }] = await Promise.all([
    b.status === "confirmed" ? supabase.rpc("cancellation_quote", { p_booking_id: id }) : Promise.resolve({ data: null }),
    supabase.rpc("booking_host_contact", { p_booking_id: id }),
  ]);
  const q = quote?.[0];
  const contact = host?.[0];
  const s = BOOKING_STATUS[b.status];
  const exp = b.experiences;
  const paid = b.payments.some((p) => p.status === "succeeded");
  const canReview = b.status === "completed" && !b.reviews;
  const policy = CANCELLATION_POLICIES[b.cancellation_policy];
  const holdActive = isFuture(b.hold_expires_at);

  return (
    <div className="space-y-6">
      <PageHeader
        title={exp?.title ?? "Booking"}
        description={
          <>
            <Badge tone={s.tone}>{s.label}</Badge> <span className="ml-2">Reference {b.reference}</span>
          </>
        }
        actions={paid ? <ButtonLink href={`/account/bookings/${id}/receipt`} variant="secondary">Receipt</ButtonLink> : null}
      />

      {["pending_payment", "payment_failed", "pending_provider_confirmation"].includes(b.status) && holdActive ? (
        <Alert tone="warning" title={b.status === "pending_provider_confirmation" ? "Waiting for the host to accept" : "Payment needed to confirm"}>
          <Link href={`/checkout/${id}`}>{b.status === "pending_provider_confirmation" ? "View request" : "Complete payment"}</Link>
        </Alert>
      ) : null}
      {b.status === "refund_pending" ? <Alert tone="info" title="Refund in progress">{formatMoney(b.refund_minor, b.currency)} is being returned to your original payment method.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Your booking">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-[0.95rem]">
            <dt className="text-stone">When</dt>
            <dd>{formatDateTime(b.starts_at)}</dd>
            <dt className="text-stone">Guests</dt>
            <dd>{b.party_size}</dd>
            <dt className="text-stone">Lead guest</dt>
            <dd>{b.contact_name}</dd>
            <dt className="text-stone">Total</dt>
            <dd>{formatMoney(b.total_minor, b.currency)}</dd>
            <dt className="text-stone">Cancellation</dt>
            <dd>
              {policy.label}: {policy.summary}
            </dd>
          </dl>
          {exp ? (
            <Link href={`/experiences/${exp.slug}`} className="mt-4 inline-block text-sm text-forest underline">
              View the experience page
            </Link>
          ) : null}
        </Section>

        <Section title="Meeting point">
          {["confirmed", "completed"].includes(b.status) && exp ? (
            <div className="space-y-3">
              <p className="font-medium">{exp.meeting_point_name}</p>
              <p className="whitespace-pre-line">{exp.meeting_point_instructions}</p>
              {exp.meeting_latitude !== null && exp.meeting_longitude !== null ? (
                <MapBlock point={{ lat: exp.meeting_latitude, lng: exp.meeting_longitude }} label={exp.meeting_point_name} />
              ) : null}
              {contact ? (
                <p className="text-sm">
                  Host: {contact.business_name}
                  {contact.contact_phone ? (
                    <>
                      {" "}·{" "}
                      <a className="underline" href={`tel:${contact.contact_phone.replace(/[^\d+]/g, "")}`}>
                        {contact.contact_phone}
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-stone">Shown once the booking is confirmed.</p>
          )}
        </Section>
      </div>

      <Section title="Payments and refunds">
        {b.payments.length || b.refunds.length ? (
          <ul className="space-y-2 text-[0.95rem]">
            {b.payments.map((p) => (
              <li key={p.id}>
                {formatMoney(p.amount_minor, p.currency)} {p.channel ? `by ${p.channel.replace("_", " ")}` : ""} ·{" "}
                <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge> · {formatDateTime(p.paid_at ?? p.created_at)}
              </li>
            ))}
            {b.refunds.map((r) => (
              <li key={r.id}>
                Refund {formatMoney(r.amount_minor, r.currency)} · <Badge tone={REFUND_STATUS[r.status].tone}>{REFUND_STATUS[r.status].label}</Badge>
                {r.processed_at ? ` · ${formatDateTime(r.processed_at)}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone">No payments yet.</p>
        )}
      </Section>

      {canReview ? (
        <Section title="Review this experience" description="Your first name and last initial are shown with your review.">
          <ActionForm action={createReview} className="space-y-4">
            <input type="hidden" name="bookingId" value={id} />
            <Field id="rating" label="Rating">
              <Select id="rating" name="rating" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} – {["", "Poor", "Fair", "Good", "Very good", "Excellent"][n]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="title" label="Headline" optional>
              <Input id="title" name="title" maxLength={120} />
            </Field>
            <Field id="body" label="Your review" hint="What was it like? What should other guests know? At least 20 characters.">
              <Textarea id="body" name="body" required minLength={20} maxLength={4000} rows={5} aria-describedby="body-hint" />
            </Field>
            <SubmitButton>Publish review</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {["confirmed", "pending_payment", "payment_failed", "pending_provider_confirmation"].includes(b.status) ? (
          <ConfirmAction
            action={cancelBooking}
            hidden={{ bookingId: id }}
            trigger="Cancel booking"
            triggerSize="md"
            title="Cancel this booking?"
            description={
              b.status === "confirmed" && q ? (
                q.refund_percent > 0 ? (
                  <>You will be refunded {formatMoney(Number(q.refund_minor), q.currency)} ({q.refund_percent}%) under the {policy.label.toLowerCase()} policy.</>
                ) : (
                  <>Under the {policy.label.toLowerCase()} policy, no refund is due if you cancel now.</>
                )
              ) : (
                <>Nothing has been charged, so no refund is needed.</>
              )
            }
            confirmLabel="Cancel booking"
            reason={{ label: "Reason (optional, shared with the host)" }}
          />
        ) : null}
        <ButtonLink href={`/account/support/new?booking=${id}`} variant="ghost">
          Get help with this booking
        </ButtonLink>
      </div>
    </div>
  );
}

export default function BookingPage(props: PageProps<"/account/bookings/[id]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
