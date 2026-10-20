import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatusFilter } from "@/components/admin/status-filter";
import { DashboardSkeleton, DataTable, td } from "@/components/layout/dashboard-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import type { Enums } from "@/lib/database.types";
import { readParam, requireAdmin } from "@/lib/data/admin";
import { formatDateTime, formatMoney } from "@/lib/format";
import { BOOKING_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Bookings" };
const PAGE = 50;

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const status = readParam(sp, "status") as Enums<"booking_status"> | undefined;
  const ref = readParam(sp, "ref")?.toUpperCase();
  const page = Math.max(1, Number(sp.page) || 1);
  const { db } = await requireAdmin("/admin/bookings");
  let q = db
    .from("bookings")
    .select("id, reference, status, starts_at, party_size, total_minor, currency, created_at, experiences(title), provider_profiles(business_name)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (status && status in BOOKING_STATUS) q = q.eq("status", status);
  if (ref && /^HK-[A-Z0-9]{1,8}$/.test(ref)) q = q.ilike("reference", `${ref}%`);
  const { data: rows, count } = await q.range((page - 1) * PAGE, page * PAGE - 1);
  return (
    <div className="space-y-6">
      <PageHeader title="Bookings" />
      <form method="get" className="flex max-w-sm gap-2" role="search">
        <label htmlFor="ref" className="sr-only">
          Booking reference
        </label>
        <Input id="ref" name="ref" placeholder="HK-…" defaultValue={ref ?? ""} />
        <button className="rounded-[var(--radius-control)] border border-sand-deep px-4 hover:bg-sand">Find</button>
      </form>
      <StatusFilter base="/admin/bookings" current={status} options={Object.entries(BOOKING_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      {rows?.length ? (
        <div className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5 sm:p-2">
          <DataTable head={["Reference", "Experience", "Host", "Starts", "Total", "Status"]}>
            {rows.map((b) => (
              <tr key={b.id}>
                <td className={td}>
                  <Link href={`/admin/bookings/${b.id}`} className="font-medium text-forest hover:underline">
                    {b.reference}
                  </Link>
                </td>
                <td className={td}>{b.experiences?.title}</td>
                <td className={td}>{b.provider_profiles?.business_name}</td>
                <td className={td}>{formatDateTime(b.starts_at)}</td>
                <td className={td}>{formatMoney(b.total_minor, b.currency)}</td>
                <td className={td}>
                  <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : (
        <EmptyState title="No bookings found" />
      )}
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/bookings" params={{ status, ref }} />
    </div>
  );
}

export default function AdminBookingsPage(props: PageProps<"/admin/bookings">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
