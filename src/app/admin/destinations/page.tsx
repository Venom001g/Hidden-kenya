import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton, DataTable, td } from "@/components/layout/dashboard-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/data/admin";
import { formatShortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Destinations" };

async function Content() {
  const { db } = await requireAdmin("/admin/destinations");
  const { data: rows } = await db.from("destinations").select("id, name, status, content_source_name, updated_at, counties(name)").order("name");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Destinations"
        description="General information pages about places. Record a source for every published page. Destinations are not bookable; listings are."
        actions={<ButtonLink href="/admin/destinations/new">New destination</ButtonLink>}
      />
      {rows?.length ? (
        <div className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5 sm:p-2">
          <DataTable head={["Name", "County", "Status", "Source", "Updated"]}>
            {rows.map((d) => (
              <tr key={d.id}>
                <td className={td}>
                  <Link href={`/admin/destinations/${d.id}`} className="font-medium text-forest hover:underline">
                    {d.name}
                  </Link>
                </td>
                <td className={td}>{d.counties?.name}</td>
                <td className={td}>
                  <Badge tone={d.status === "published" ? "forest" : "outline"}>{d.status}</Badge>
                </td>
                <td className={td}>{d.content_source_name || <span className="text-terracotta">none</span>}</td>
                <td className={td}>{formatShortDate(d.updated_at)}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : (
        <EmptyState title="No destinations yet" action={<ButtonLink href="/admin/destinations/new">Create the first destination</ButtonLink>}>
          Destinations can also be imported from a reviewed data file: see docs/data-onboarding.md.
        </EmptyState>
      )}
    </div>
  );
}

export default function AdminDestinationsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
