import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { adminCancelBooking } from "@/actions/admin";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { Badge, PageHeader } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { requireAdmin } from "@/lib/data/admin";
import { formatDateTime, formatMoney, fromMinorUnits } from "@/lib/format";
import { BOOKING_STATUS, PAYMENT_STATUS, REFUND_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Booking" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db } = await requireAdmin(`/admin/bookings/${id}`);
  const { data: b } = await db
    .from("bookings")
    .select("*, experiences(id, title), provider_profiles(id, business_name), payments(*), refunds(*)")
    .eq("id", id)
    .maybeSingle();
  if (!b) notFound();
  const paid = b.payments.filter((p) => p.status === "succeeded").reduce((s, p) => s + p.amount_minor, 0);
  const cancellable = ["confirmed", "pending_payment", "payment_failed", "pending_provider_confirmation"].includes(b.status);
  return (
    <div className="space-y-6">
      <PageHeader title={`Booking ${b.reference}`} description={<Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Booking">
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-[0.95rem]">
            <dt className="text-stone">Experience</dt>
            <dd><Link className="underline" href={`/admin/listings/${b.experiences?.id}`}>{b.experiences?.title}</Link></dd>
            <dt className="text-stone">Host</dt>
            <dd><Link className="underline" href={`/admin/providers/${b.provider_profiles?.id}`}>{b.provider_profiles?.business_name}</Link></dd>
            <dt className="text-stone">Starts</dt>
            <dd>{formatDateTime(b.starts_at)}</dd>
            <dt className="text-stone">Guests</dt>
            <dd>{b.party_size}</dd>
            <dt className="text-stone">Total</dt>
            <dd>{formatMoney(b.total_minor, b.currency)} (commission {(b.commission_rate_bps / 100).toFixed(2)}%)</dd>
            <dt className="text-stone">Mode / policy</dt>
            <dd>{b.booking_mode} / {b.cancellation_policy}</dd>
            <dt className="text-stone">Hold until</dt>
            <dd>{b.hold_expires_at ? formatDateTime(b.hold_expires_at) : "—"}</dd>
            <dt className="text-stone">Created</dt>
            <dd>{formatDateTime(b.created_at)}</dd>
            {b.cancellation_reason ? (
              <>
                <dt className="text-stone">Cancellation</dt>
                <dd>{b.cancellation_reason} ({b.cancelled_by})</dd>
              </>
            ) : null}
          </dl>
        </Section>
        <Section title="Lead guest">
          <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-[0.95rem]">
            <dt className="text-stone">Name</dt>
            <dd>{b.contact_name}</dd>
            <dt className="text-stone">Email</dt>
            <dd className="break-all">{b.contact_email}</dd>
            <dt className="text-stone">Phone</dt>
            <dd>{b.contact_phone}</dd>
            <dt className="text-stone">Notes</dt>
            <dd className="whitespace-pre-line">{b.customer_notes || "—"}</dd>
          </dl>
        </Section>
      </div>
      <Section title="Payments">
        <ul className="space-y-2 text-sm">
          {b.payments.map((p) => (
            <li key={p.id}>
              <span className="font-mono text-xs">{p.reference}</span> · {formatMoney(p.amount_minor, p.currency)} ·{" "}
              <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
              {p.status === "amount_mismatch" ? ` received ${p.received_amount_minor} ${p.received_currency}` : ""} · {p.channel ?? ""} · fees {p.fees_minor ?? "?"} · {formatDateTime(p.created_at)}
            </li>
          ))}
          {b.refunds.map((r) => (
            <li key={r.id}>
              Refund {formatMoney(r.amount_minor, r.currency)} · <Badge tone={REFUND_STATUS[r.status].tone}>{REFUND_STATUS[r.status].label}</Badge> · {r.reason}
              {r.failure_reason ? ` · ${r.failure_reason}` : ""}
            </li>
          ))}
          {!b.payments.length && !b.refunds.length ? <li className="text-stone">None.</li> : null}
        </ul>
      </Section>
      {cancellable ? (
        <Section title="Cancel as administrator" description="Leave the refund empty to refund everything paid. The guest and host are notified.">
          <ActionForm action={adminCancelBooking} className="space-y-4">
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="currency" value={b.currency} />
            <Field id="refund" label={`Refund (${b.currency}, max ${fromMinorUnits(paid, b.currency)})`} optional>
              <Input id="refund" name="refund" inputMode="decimal" className="max-w-xs" />
            </Field>
            <Field id="reason" label="Reason (shared with guest and host)">
              <Textarea id="reason" name="reason" required minLength={5} rows={3} />
            </Field>
            <SubmitButton variant="danger">Cancel booking</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}
    </div>
  );
}

export default function AdminBookingPage(props: PageProps<"/admin/bookings/[id]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
