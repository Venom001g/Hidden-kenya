import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { retryRefund } from "@/actions/admin";
import { DashboardSkeleton, DataTable, Section, td } from "@/components/layout/dashboard-shell";
import { Badge, PageHeader } from "@/components/ui/feedback";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import type { Enums } from "@/lib/database.types";
import { readParam, requireAdmin } from "@/lib/data/admin";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PAYMENT_STATUS, REFUND_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments and refunds" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const view = readParam(sp, "view") ?? "payments";
  const status = readParam(sp, "status") as Enums<"payment_status"> | undefined;
  const { db } = await requireAdmin("/admin/payments");
  const tabs = [
    { key: "payments", label: "Payments" },
    { key: "refunds", label: "Refunds" },
    { key: "events", label: "Webhook log" },
  ];

  let body: React.ReactNode = null;
  if (view === "refunds") {
    const { data } = await db.from("refunds").select("id, amount_minor, currency, status, reason, failure_reason, created_at, booking_id, bookings(reference)").order("created_at", { ascending: false }).limit(200);
    body = (
      <DataTable head={["Booking", "Amount", "Status", "Reason", "Created", ""]}>
        {(data ?? []).map((r) => (
          <tr key={r.id}>
            <td className={td}>
              <Link href={`/admin/bookings/${r.booking_id}`} className="text-forest hover:underline">
                {r.bookings?.reference}
              </Link>
            </td>
            <td className={td}>{formatMoney(r.amount_minor, r.currency)}</td>
            <td className={td}>
              <Badge tone={REFUND_STATUS[r.status].tone}>{REFUND_STATUS[r.status].label}</Badge>
              {r.failure_reason ? <span className="block text-xs text-danger">{r.failure_reason}</span> : null}
            </td>
            <td className={td}>{r.reason}</td>
            <td className={td}>{formatDateTime(r.created_at)}</td>
            <td className={td}>
              {r.status === "failed" ? (
                <ActionForm action={retryRefund}>
                  <input type="hidden" name="refundId" value={r.id} />
                  <SubmitButton size="sm" variant="secondary">
                    Retry
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </td>
          </tr>
        ))}
      </DataTable>
    );
  } else if (view === "events") {
    const { data } = await db.from("payment_events").select("id, event_type, reference, outcome, processing_error, received_at").order("received_at", { ascending: false }).limit(200);
    body = (
      <DataTable head={["Received", "Event", "Reference", "Outcome"]}>
        {(data ?? []).map((e) => (
          <tr key={e.id}>
            <td className={td}>{formatDateTime(e.received_at)}</td>
            <td className={td}>{e.event_type}</td>
            <td className={cn(td, "font-mono text-xs")}>{e.reference ?? "—"}</td>
            <td className={td}>
              {e.outcome}
              {e.processing_error ? <span className="block text-xs text-danger">{e.processing_error}</span> : null}
            </td>
          </tr>
        ))}
      </DataTable>
    );
  } else {
    let q = db.from("payments").select("id, reference, amount_minor, currency, status, channel, fees_minor, received_amount_minor, received_currency, created_at, booking_id, bookings(reference)").order("created_at", { ascending: false }).limit(200);
    if (status && status in PAYMENT_STATUS) q = q.eq("status", status);
    const { data } = await q;
    body = (
      <DataTable head={["Booking", "Reference", "Amount", "Status", "Method", "Fees", "Created"]}>
        {(data ?? []).map((p) => (
          <tr key={p.id}>
            <td className={td}>
              <Link href={`/admin/bookings/${p.booking_id}`} className="text-forest hover:underline">
                {p.bookings?.reference}
              </Link>
            </td>
            <td className={cn(td, "font-mono text-xs")}>{p.reference}</td>
            <td className={td}>
              {formatMoney(p.amount_minor, p.currency)}
              {p.status === "amount_mismatch" ? <span className="block text-xs text-danger">received {p.received_amount_minor} {p.received_currency}</span> : null}
            </td>
            <td className={td}>
              <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
            </td>
            <td className={td}>{p.channel ?? "—"}</td>
            <td className={td}>{p.fees_minor !== null ? formatMoney(p.fees_minor, p.currency) : "—"}</td>
            <td className={td}>{formatDateTime(p.created_at)}</td>
          </tr>
        ))}
      </DataTable>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments and refunds"
        description="Payment status is set only from Paystack-verified results. Amount mismatches are never confirmed automatically; resolve them in Paystack and refund or contact the guest."
      />
      <nav aria-label="Views" className="flex gap-2">
        {tabs.map((t) => (
          <Link key={t.key} href={`/admin/payments?view=${t.key}`} aria-current={t.key === view ? "page" : undefined} className={cn("rounded-full border px-3 py-1.5 text-sm", t.key === view ? "border-forest bg-forest text-paper" : "border-sand-deep hover:bg-sand")}>
            {t.label}
          </Link>
        ))}
      </nav>
      <Section title={tabs.find((t) => t.key === view)?.label ?? "Payments"}>{body}</Section>
    </div>
  );
}

export default function AdminPaymentsPage(props: PageProps<"/admin/payments">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
