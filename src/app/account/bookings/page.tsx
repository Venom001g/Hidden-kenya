import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/layout/dashboard-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { BOOKING_STATUS } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Bookings" };
const PAGE = 20;

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const view = sp.view === "past" ? "past" : "upcoming";
  const page = Math.max(1, Number(sp.page) || 1);
  const user = await requireUser("/account/bookings");
  const supabase = await createClient();
  const now = new Date().toISOString();
  let q = supabase
    .from("bookings")
    .select("id, reference, starts_at, party_size, total_minor, currency, status, experiences(title)", { count: "exact" })
    .eq("customer_id", user.id);
  q = view === "upcoming" ? q.gte("starts_at", now).order("starts_at") : q.lt("starts_at", now).order("starts_at", { ascending: false });
  const { data: rows, count } = await q.range((page - 1) * PAGE, page * PAGE - 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Bookings" />
      <nav aria-label="Booking views" className="flex gap-2">
        {(["upcoming", "past"] as const).map((k) => (
          <Link
            key={k}
            href={`/account/bookings?view=${k}`}
            aria-current={k === view ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1.5 text-sm", k === view ? "border-forest bg-forest text-paper" : "border-sand-deep hover:bg-sand")}
          >
            {k === "upcoming" ? "Upcoming" : "Past"}
          </Link>
        ))}
      </nav>
      {rows?.length ? (
        <ul className="divide-y divide-sand-deep rounded-[var(--radius-card)] border border-sand-deep bg-paper">
          {rows.map((b) => (
            <li key={b.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Link href={`/account/bookings/${b.id}`} className="font-medium hover:underline">
                  {b.experiences?.title}
                </Link>
                <p className="text-sm text-stone">
                  {formatDateTime(b.starts_at)} · {b.party_size} guest{b.party_size === 1 ? "" : "s"} · {formatMoney(b.total_minor, b.currency)} · {b.reference}
                </p>
              </div>
              <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={view === "upcoming" ? "No upcoming bookings" : "No past bookings"} action={<ButtonLink href="/experiences">Browse experiences</ButtonLink>} />
      )}
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/account/bookings" params={{ view }} />
    </div>
  );
}

export default function BookingsPage(props: PageProps<"/account/bookings">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
