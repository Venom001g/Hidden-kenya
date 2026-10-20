import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton, Section, Stat } from "@/components/layout/dashboard-shell";
import { Alert, PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/data/admin";
import { integrationStatus } from "@/lib/env";
import { formatMoney } from "@/lib/format";

type Metrics = {
  users_total: number;
  users_new_30d: number;
  providers_by_status: Record<string, number>;
  experiences_by_status: Record<string, number>;
  bookings_30d_by_status: Record<string, number>;
  payments_succeeded_30d: Record<string, number>;
  refunds_processed_30d: Record<string, number>;
  payments_needing_attention: number;
  refunds_needing_attention: number;
  providers_awaiting_review: number;
  documents_awaiting_review: number;
  listings_awaiting_review: number;
  open_review_reports: number;
  open_support_tickets: number;
  failed_or_unsent_emails_7d: number;
  newsletter_subscribed: number;
  open_data_requests: number;
  commission_configured: boolean;
};

const money = (m: Record<string, number>) =>
  Object.keys(m).length ? Object.entries(m).map(([c, v]) => formatMoney(v, c)).join(" + ") : formatMoney(0, "KES");

async function Overview() {
  const { db } = await requireAdmin();
  const { data, error } = await db.rpc("admin_metrics");
  if (error || !data) return <Alert tone="error">Metrics could not be loaded.</Alert>;
  const m = data as unknown as Metrics;
  const env = integrationStatus();
  const queue = [
    { n: m.providers_awaiting_review, label: "hosts awaiting verification", href: "/admin/providers?status=pending_review" },
    { n: m.documents_awaiting_review, label: "documents not yet reviewed", href: "/admin/providers?status=pending_review" },
    { n: m.listings_awaiting_review, label: "listings awaiting review", href: "/admin/listings?status=pending_review" },
    { n: m.payments_needing_attention, label: "payments with amount mismatches", href: "/admin/payments?status=amount_mismatch" },
    { n: m.refunds_needing_attention, label: "refunds queued or failed", href: "/admin/payments?view=refunds" },
    { n: m.open_review_reports, label: "reported reviews", href: "/admin/reviews" },
    { n: m.open_support_tickets, label: "open support requests", href: "/admin/support" },
  ].filter((q) => q.n > 0);

  return (
    <div className="space-y-8">
      <PageHeader title="Overview" description="Every figure below is calculated live from database records." />

      {!m.commission_configured ? (
        <Alert tone="warning" title="Bookings are closed">
          No default commission rate is set, so guests cannot book. <Link href="/admin/settings">Set the commission</Link>.
        </Alert>
      ) : null}
      {!env.payments || !env.email || !env.cron || !env.hashSalt || !env.supabaseSecret ? (
        <Alert tone="warning" title="Integrations awaiting configuration">
          <ul className="mt-1 list-disc pl-5">
            {!env.supabaseSecret ? <li>Supabase secret key (server operations)</li> : null}
            {!env.payments ? <li>Paystack secret key: online payment is off and no money can be taken</li> : null}
            {env.payments && !env.paymentsLive ? <li>Paystack is in test mode: payments are not real</li> : null}
            {!env.email ? <li>Resend email: booking emails are recorded but not sent</li> : null}
            {!env.cron ? <li>CRON_SECRET: scheduled maintenance is disabled</li> : null}
            {!env.hashSalt ? <li>HASH_SALT: rate limiting will refuse requests</li> : null}
            {!env.maps ? <li>Mapbox token (optional): maps show coordinates and links only</li> : null}
          </ul>
        </Alert>
      ) : null}
      {m.failed_or_unsent_emails_7d > 0 ? (
        <Alert tone="warning">{m.failed_or_unsent_emails_7d} email(s) in the last 7 days failed or were not sent because email is not configured.</Alert>
      ) : null}

      <Section title="Needs attention">
        {queue.length ? (
          <ul className="space-y-2">
            {queue.map((q) => (
              <li key={q.label}>
                <Link href={q.href} className="underline underline-offset-4">
                  <span className="font-semibold tabular-nums">{q.n}</span> {q.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone">Nothing is waiting.</p>
        )}
      </Section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Accounts" value={m.users_total} hint={`${m.users_new_30d} created in the last 30 days`} />
        <Stat label="Verified hosts" value={m.providers_by_status.verified ?? 0} />
        <Stat label="Live listings" value={m.experiences_by_status.published ?? 0} />
        <Stat label="Newsletter subscribers" value={m.newsletter_subscribed} hint="Confirmed (double opt-in)" />
        <Stat label="Payments received, 30 days" value={money(m.payments_succeeded_30d)} hint="Sum of payments verified as succeeded" />
        <Stat label="Refunds processed, 30 days" value={money(m.refunds_processed_30d)} />
        <Stat label="Bookings created, 30 days" value={Object.values(m.bookings_30d_by_status).reduce((a, b) => a + b, 0)} hint="All statuses, including expired" />
        <Stat label="Confirmed or completed, 30 days" value={(m.bookings_30d_by_status.confirmed ?? 0) + (m.bookings_30d_by_status.completed ?? 0)} />
      </div>

      <Section title="Bookings in the last 30 days by status">
        {Object.keys(m.bookings_30d_by_status).length ? (
          <ul className="grid gap-2 sm:grid-cols-3">
            {Object.entries(m.bookings_30d_by_status).map(([k, v]) => (
              <li key={k} className="flex justify-between rounded-md bg-ivory px-3 py-2">
                <span>{k.replace(/_/g, " ")}</span>
                <span className="tabular-nums">{v}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone">No bookings yet.</p>
        )}
      </Section>
    </div>
  );
}

export default function AdminHome() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Overview />
    </Suspense>
  );
}
