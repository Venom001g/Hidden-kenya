import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, DataTable, td } from "@/components/layout/dashboard-shell";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { readParam, requireAdmin } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };
const PAGE = 100;

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const action = readParam(sp, "action");
  const page = Math.max(1, Number(sp.page) || 1);
  const { db } = await requireAdmin("/admin/audit");
  let q = db.from("audit_logs").select("id, actor_id, action, entity_type, entity_id, metadata, created_at", { count: "exact" }).order("created_at", { ascending: false });
  if (action) q = q.ilike("action", `${action.replace(/[%_]/g, "")}%`);
  const { data: rows, count } = await q.range((page - 1) * PAGE, page * PAGE - 1);
  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Append-only record of sensitive actions. It cannot be edited or deleted from the application." />
      <form method="get" className="flex max-w-md gap-2" role="search">
        <label htmlFor="action" className="sr-only">
          Filter by action
        </label>
        <Input id="action" name="action" placeholder="e.g. provider. or payout." defaultValue={action ?? ""} />
        <button className="rounded-[var(--radius-control)] border border-sand-deep px-4 hover:bg-sand">Filter</button>
      </form>
      {rows?.length ? (
        <div className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5 sm:p-2">
          <DataTable head={["When", "Action", "Entity", "Actor", "Details"]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={`${td} whitespace-nowrap`}>{formatDateTime(r.created_at)}</td>
                <td className={td}>{r.action}</td>
                <td className={`${td} text-sm`}>
                  {r.entity_type}
                  <span className="block font-mono text-xs text-stone">{r.entity_id}</span>
                </td>
                <td className={`${td} font-mono text-xs`}>{r.actor_id ?? "system"}</td>
                <td className={`${td} max-w-xs break-all font-mono text-xs`}>{JSON.stringify(r.metadata)}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : (
        <EmptyState title="No entries" />
      )}
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/audit" params={{ action }} />
    </div>
  );
}

export default function AuditPage(props: PageProps<"/admin/audit">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
