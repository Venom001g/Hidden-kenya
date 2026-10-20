import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatusFilter } from "@/components/admin/status-filter";
import { DashboardSkeleton, DataTable, td } from "@/components/layout/dashboard-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import type { Enums } from "@/lib/database.types";
import { readParam, requireAdmin } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";
import { TICKET_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Support" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const status = (readParam(sp, "status") ?? "open") as Enums<"ticket_status"> | "all";
  const { db } = await requireAdmin("/admin/support");
  let q = db.from("support_tickets").select("id, subject, category, status, updated_at").order("updated_at", { ascending: true }).limit(200);
  if (status !== "all" && status in TICKET_STATUS) q = q.eq("status", status);
  const { data: rows } = await q;
  return (
    <div className="space-y-6">
      <PageHeader title="Support" description="Oldest first. Safety reports should be answered first." />
      <StatusFilter base="/admin/support" current={status === "all" ? "" : status} options={Object.entries(TICKET_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      {rows?.length ? (
        <div className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5 sm:p-2">
          <DataTable head={["Subject", "Topic", "Status", "Last activity"]}>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className={td}>
                  <Link href={`/admin/support/${t.id}`} className="font-medium text-forest hover:underline">
                    {t.subject}
                  </Link>
                </td>
                <td className={td}>{t.category === "safety" ? <Badge tone="danger">safety</Badge> : t.category}</td>
                <td className={td}>
                  <Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge>
                </td>
                <td className={td}>{formatDateTime(t.updated_at)}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : (
        <EmptyState title="No requests in this view" />
      )}
    </div>
  );
}

export default function AdminSupportPage(props: PageProps<"/admin/support">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
