import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatusFilter } from "@/components/admin/status-filter";
import { DashboardSkeleton, DataTable, td } from "@/components/layout/dashboard-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import type { Enums } from "@/lib/database.types";
import { readParam, requireAdmin } from "@/lib/data/admin";
import { formatShortDate } from "@/lib/format";
import { PROVIDER_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Hosts" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const status = readParam(sp, "status") as Enums<"provider_status"> | undefined;
  const { db } = await requireAdmin("/admin/providers");
  let q = db.from("provider_profiles").select("id, business_name, verification_status, submitted_at, created_at, licence_checked_at, provider_verification_documents(status)").order("submitted_at", { ascending: true, nullsFirst: false }).limit(200);
  if (status && status in PROVIDER_STATUS) q = q.eq("verification_status", status);
  const { data: rows } = await q;
  return (
    <div className="space-y-6">
      <PageHeader title="Hosts" description="Verify hosts before they can publish listings or take bookings." />
      <StatusFilter base="/admin/providers" current={status} options={Object.entries(PROVIDER_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      {rows?.length ? (
        <div className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5 sm:p-2">
          <DataTable head={["Host", "Status", "Documents", "Submitted", "Joined"]}>
            {rows.map((p) => {
              const unreviewed = p.provider_verification_documents.filter((d) => d.status === "submitted").length;
              return (
                <tr key={p.id}>
                  <td className={td}>
                    <Link href={`/admin/providers/${p.id}`} className="font-medium text-forest hover:underline">
                      {p.business_name}
                    </Link>
                  </td>
                  <td className={td}>
                    <Badge tone={PROVIDER_STATUS[p.verification_status].tone}>{PROVIDER_STATUS[p.verification_status].label}</Badge>
                  </td>
                  <td className={td}>
                    {p.provider_verification_documents.length} {unreviewed ? <span className="text-terracotta">({unreviewed} to review)</span> : null}
                  </td>
                  <td className={td}>{p.submitted_at ? formatShortDate(p.submitted_at) : "—"}</td>
                  <td className={td}>{formatShortDate(p.created_at)}</td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      ) : (
        <EmptyState title="No hosts in this view" />
      )}
    </div>
  );
}

export default function AdminProvidersPage(props: PageProps<"/admin/providers">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
