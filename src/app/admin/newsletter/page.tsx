import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, Section, Stat } from "@/components/layout/dashboard-shell";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/data/admin";

export const metadata: Metadata = { title: "Newsletter" };

async function Content() {
  const { db } = await requireAdmin("/admin/newsletter");
  const counts = await Promise.all(
    (["subscribed", "pending", "unsubscribed"] as const).map(async (s) => {
      const { count } = await db.from("newsletter_subscriptions").select("id", { count: "exact", head: true }).eq("status", s);
      return [s, count ?? 0] as const;
    }),
  );
  const c = Object.fromEntries(counts);
  return (
    <div className="space-y-6">
      <PageHeader title="Newsletter" description="Subscribers confirmed by email (double opt-in). Send newsletters from your email tool using the export." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Subscribed" value={c.subscribed} />
        <Stat label="Awaiting confirmation" value={c.pending} />
        <Stat label="Unsubscribed" value={c.unsubscribed} />
      </div>
      <Section title="Export" description="CSV of confirmed subscribers with consent date and a personal unsubscribe link to include in every email. Downloads are recorded in the audit log.">
        <ButtonLink href="/admin/newsletter/export" variant="secondary" prefetch={false}>
          Download subscribers (CSV)
        </ButtonLink>
      </Section>
    </div>
  );
}

export default function AdminNewsletterPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
