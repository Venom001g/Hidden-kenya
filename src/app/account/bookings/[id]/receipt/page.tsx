import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/print-button";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Receipt" };

async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser(`/account/bookings/${id}/receipt`);
  const supabase = await createClient();
  const { data: b } = await supabase
    .from("bookings")
    .select("*, experiences(title), provider_profiles(business_name), payments(reference, status, amount_minor, currency, channel, paid_at), refunds(status, amount_minor, currency, processed_at)")
    .eq("id", id)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (!b) notFound();
  const paid = b.payments.filter((p) => p.status === "succeeded");
  if (!paid.length) notFound();
  const refunded = b.refunds.filter((r) => r.status === "processed").reduce((s, r) => s + r.amount_minor, 0);

  return (
    <article className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-6 print:border-0 print:p-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-xl text-forest">Hidden Kenya</p>
          <h1 className="mt-4 text-3xl">Payment receipt</h1>
        </div>
        <PrintButton />
      </div>
      <dl className="mt-6 grid grid-cols-[10rem_1fr] gap-y-2 text-[0.95rem]">
        <dt className="text-stone">Booking</dt>
        <dd>{b.reference}</dd>
        <dt className="text-stone">Experience</dt>
        <dd>{b.experiences?.title}</dd>
        <dt className="text-stone">Host</dt>
        <dd>{b.provider_profiles?.business_name}</dd>
        <dt className="text-stone">Date</dt>
        <dd>{formatDateTime(b.starts_at)}</dd>
        <dt className="text-stone">Guests</dt>
        <dd>{b.party_size}</dd>
        <dt className="text-stone">Billed to</dt>
        <dd>{b.contact_name}</dd>
      </dl>
      <table className="mt-6 w-full text-left text-[0.95rem]">
        <thead>
          <tr className="border-b border-sand-deep text-stone">
            <th className="py-2 font-medium">Payment</th>
            <th className="py-2 font-medium">Method</th>
            <th className="py-2 font-medium">Date</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {paid.map((p) => (
            <tr key={p.reference} className="border-b border-sand-deep/60">
              <td className="py-2 font-mono text-xs">{p.reference}</td>
              <td className="py-2">{p.channel?.replace("_", " ") ?? "—"}</td>
              <td className="py-2">{p.paid_at ? formatDateTime(p.paid_at) : "—"}</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(p.amount_minor, p.currency)}</td>
            </tr>
          ))}
          {refunded > 0 ? (
            <tr>
              <td className="py-2" colSpan={3}>
                Refunded
              </td>
              <td className="py-2 text-right tabular-nums">−{formatMoney(refunded, b.currency)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="mt-6 text-sm text-stone">
        Payments processed by Paystack on behalf of [LEGAL ENTITY NAME]. [KRA PIN / VAT details to be added by the business if applicable.] This receipt is not a tax invoice.
      </p>
    </article>
  );
}

export default function ReceiptPage(props: PageProps<"/account/bookings/[id]/receipt">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-sand/50" />}>
      <Receipt params={props.params} />
    </Suspense>
  );
}
