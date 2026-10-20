import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton, DataTable, td } from "@/components/layout/dashboard-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { requireProvider } from "@/lib/data/provider";
import { formatDateTime, formatMoney } from "@/lib/format";
import { BOOKING_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Bookings" };

const VIEWS = {
  upcoming: { label: "Upcoming", statuses: ["confirmed"] as const, future: true },
  requests: { label: "Requests", statuses: ["pending_provider_confirmation"] as const, future: true },
  pending: { label: "Awaiting payment", statuses: ["pending_payment", "payment_failed"] as const, future: true },
  past: { label: "Completed", statuses: ["completed"] as const, future: false },
  cancelled: { label: "Cancelled", statuses: ["cancelled", "refund_pending", "refunded", "expired"] as const, future: false },
};
type View = keyof typeof VIEWS;
const PAGE = 25;

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const view: View = (typeof sp.view === "string" && sp.view in VIEWS ? sp.view : "upcoming") as View;
  const page = Math.max(1, Number(sp.page) || 1);
  const { profile, supabase } = await requireProvider("/provider/bookings");
  const v = VIEWS[view];
  let query = supabase
    .from("bookings")
    .select("id, reference, starts_at, party_size, total_minor, currency, status, contact_name, experiences(title)", { count: "exact" })
    .eq("provider_id", profile.id)
    .in("status", [...v.statuses]);
  query = v.future ? query.gte("starts_at", new Date().toISOString()).order("starts_at") : query.order("starts_at", { ascending: false });
  const { data: rows, count } = await query.range((page - 1) * PAGE, page * PAGE - 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Bookings" actions={<ButtonLink href="/provider/bookings/export" variant="secondary" prefetch={false}>Export CSV</ButtonLink>} />
      <nav aria-label="Booking views" className="flex flex-wrap gap-2">
        {(Object.keys(VIEWS) as View[]).map((k) => (
          <Link
            key={k}
            href={`/provider/bookings?view=${k}`}
            aria-current={k === view ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1.5 text-sm", k === view ? "border-forest bg-forest text-paper" : "border-sand-deep hover:bg-sand")}
          >
            {VIEWS[k].label}
          </Link>
        ))}
      </nav>
      {rows?.length ? (
        <div className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5 sm:p-2">
          <DataTable head={["Booking", "Experience", "Date", "Guests", "Total", "Status"]}>
            {rows.map((b) => (
              <tr key={b.id}>
                <td className={td}>
                  <Link href={`/provider/bookings/${b.id}`} className="font-medium text-forest underline-offset-2 hover:underline">
                    {b.reference}
                  </Link>
                  <span className="block text-sm text-stone">{b.status === "confirmed" || b.status === "pending_provider_confirmation" ? b.contact_name : ""}</span>
                </td>
                <td className={td}>{b.experiences?.title}</td>
                <td className={td}>{formatDateTime(b.starts_at)}</td>
                <td className={td}>{b.party_size}</td>
                <td className={cn(td, "tabular-nums")}>{formatMoney(b.total_minor, b.currency)}</td>
                <td className={td}>
                  <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : (
        <EmptyState title={`No ${VIEWS[view].label.toLowerCase()} bookings`} />
      )}
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/provider/bookings" params={{ view }} />
    </div>
  );
}

export default function ProviderBookingsPage(props: PageProps<"/provider/bookings">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
