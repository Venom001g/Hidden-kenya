import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatusFilter } from "@/components/admin/status-filter";
import { DashboardSkeleton, DataTable, td } from "@/components/layout/dashboard-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import type { Enums } from "@/lib/database.types";
import { readParam, requireAdmin } from "@/lib/data/admin";
import { formatMoney, formatShortDate } from "@/lib/format";
import { EXPERIENCE_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Listings" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const status = readParam(sp, "status") as Enums<"experience_status"> | undefined;
  const { db } = await requireAdmin("/admin/listings");
  let q = db.from("experiences").select("id, title, status, price_minor, currency, submitted_at, updated_at, provider_profiles(business_name, verification_status)").order("submitted_at", { ascending: true, nullsFirst: false }).limit(200);
  if (status && status in EXPERIENCE_STATUS) q = q.eq("status", status);
  const { data: rows } = await q;
  return (
    <div className="space-y-6">
      <PageHeader title="Listings" description="Review listings before they go live. Edits to live listings return here automatically." />
      <StatusFilter base="/admin/listings" current={status} options={Object.entries(EXPERIENCE_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      {rows?.length ? (
        <div className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5 sm:p-2">
          <DataTable head={["Listing", "Host", "Price", "Status", "Submitted"]}>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className={td}>
                  <Link href={`/admin/listings/${l.id}`} className="font-medium text-forest hover:underline">
                    {l.title}
                  </Link>
                </td>
                <td className={td}>
                  {l.provider_profiles?.business_name}
                  {l.provider_profiles?.verification_status !== "verified" ? <span className="block text-xs text-terracotta">host not verified</span> : null}
                </td>
                <td className={td}>{formatMoney(l.price_minor, l.currency)}</td>
                <td className={td}>
                  <Badge tone={EXPERIENCE_STATUS[l.status].tone}>{EXPERIENCE_STATUS[l.status].label}</Badge>
                </td>
                <td className={td}>{l.submitted_at ? formatShortDate(l.submitted_at) : "—"}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : (
        <EmptyState title="No listings in this view" />
      )}
    </div>
  );
}

export default function AdminListingsPage(props: PageProps<"/admin/listings">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
