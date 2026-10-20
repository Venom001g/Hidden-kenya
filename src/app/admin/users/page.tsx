import type { Metadata } from "next";
import { Suspense } from "react";
import { setAdminRole, setUserActive } from "@/actions/admin";
import { DashboardSkeleton, DataTable, td } from "@/components/layout/dashboard-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { ConfirmAction } from "@/components/ui/forms";
import { Pagination } from "@/components/ui/pagination";
import { readParam, requireAdmin } from "@/lib/data/admin";
import { formatShortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Users" };
const PAGE = 50;

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const search = readParam(sp, "q");
  const page = Math.max(1, Number(sp.page) || 1);
  const { db, user: me } = await requireAdmin("/admin/users");
  const { data: rows } = await db.rpc("admin_list_users", { p_search: search ?? null, p_limit: PAGE, p_offset: (page - 1) * PAGE });
  const total = rows?.[0] ? Number(rows[0].total_count) : 0;
  return (
    <div className="space-y-6">
      <PageHeader title="Users" />
      <form method="get" className="flex max-w-md gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search by email or name
        </label>
        <Input id="q" name="q" placeholder="Email or name" defaultValue={search ?? ""} />
        <button className="rounded-[var(--radius-control)] border border-sand-deep px-4 hover:bg-sand">Search</button>
      </form>
      {rows?.length ? (
        <div className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5 sm:p-2">
          <DataTable head={["User", "Roles", "Joined", "Last sign-in", "Actions"]}>
            {rows.map((u) => {
              const isAdmin = u.roles.includes("admin");
              return (
                <tr key={u.id}>
                  <td className={td}>
                    <span className="font-medium">{u.full_name || "—"}</span>
                    <span className="block break-all text-sm text-stone">{u.email}</span>
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r} tone={r === "admin" ? "terracotta" : "neutral"}>
                          {r}
                        </Badge>
                      ))}
                      {u.deactivated_at ? <Badge tone="danger">deactivated</Badge> : null}
                    </div>
                  </td>
                  <td className={td}>{formatShortDate(u.created_at)}</td>
                  <td className={td}>{u.last_sign_in_at ? formatShortDate(u.last_sign_in_at) : "—"}</td>
                  <td className={td}>
                    {u.id === me.id ? (
                      <span className="text-sm text-stone">You</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <ConfirmAction
                          action={setAdminRole}
                          hidden={{ userId: u.id, grant: String(!isAdmin) }}
                          trigger={isAdmin ? "Remove admin" : "Make admin"}
                          title={isAdmin ? "Remove administrator access?" : "Grant administrator access?"}
                          description={isAdmin ? "They lose access to the admin area immediately." : "Administrators can see personal data and move money. Grant only to staff who need it."}
                          confirmLabel={isAdmin ? "Remove access" : "Grant access"}
                        />
                        <ConfirmAction
                          action={setUserActive}
                          hidden={{ userId: u.id, active: String(Boolean(u.deactivated_at)) }}
                          trigger={u.deactivated_at ? "Reactivate" : "Deactivate"}
                          title={u.deactivated_at ? "Reactivate this account?" : "Deactivate this account?"}
                          description={u.deactivated_at ? "They can sign in again." : "They are signed out and cannot sign in, book or host. Data is kept."}
                          confirmLabel={u.deactivated_at ? "Reactivate" : "Deactivate"}
                          reason={{ label: "Reason (internal)", required: !u.deactivated_at }}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      ) : (
        <EmptyState title="No users found" />
      )}
      <Pagination page={page} pageSize={PAGE} total={total} basePath="/admin/users" params={{ q: search }} />
    </div>
  );
}

export default function AdminUsersPage(props: PageProps<"/admin/users">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
