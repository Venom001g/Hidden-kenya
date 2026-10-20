import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/layout/dashboard-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { TICKET_STATUS } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Support" };

async function Content() {
  const user = await requireUser("/account/support");
  const supabase = await createClient();
  const { data: tickets } = await supabase.from("support_tickets").select("id, subject, status, category, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
  return (
    <div className="space-y-6">
      <PageHeader title="Support" description="For anything about a booking, payment or your account. For emergencies call 999 or 112." actions={<ButtonLink href="/account/support/new">New request</ButtonLink>} />
      {tickets?.length ? (
        <ul className="divide-y divide-sand-deep rounded-[var(--radius-card)] border border-sand-deep bg-paper">
          {tickets.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/account/support/${t.id}`} className="font-medium hover:underline">
                  {t.subject}
                </Link>
                <p className="text-sm text-stone">Updated {formatDateTime(t.updated_at)}</p>
              </div>
              <Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No support requests" action={<ButtonLink href="/account/support/new">Ask for help</ButtonLink>} />
      )}
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
