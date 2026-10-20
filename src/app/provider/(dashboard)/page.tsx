import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton, Section, Stat } from "@/components/layout/dashboard-shell";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Badge, PageHeader } from "@/components/ui/feedback";
import { requireProvider } from "@/lib/data/provider";
import { formatDateTime } from "@/lib/format";
import { BOOKING_STATUS, PROVIDER_STATUS } from "@/lib/status";
import { requestNow } from "@/lib/time";

async function Overview() {
  const { profile, details, supabase } = await requireProvider();
  const nowIso = new Date().toISOString();
  const [{ data: docs }, { data: cats }, { data: listings }, { data: requests }, { data: upcoming }, { data: payout }, { data: commission }] =
    await Promise.all([
      supabase.from("provider_verification_documents").select("id, status").eq("provider_id", profile.id),
      supabase.from("provider_service_categories").select("category_id").eq("provider_id", profile.id),
      supabase.from("experiences").select("id, status").eq("provider_id", profile.id),
      supabase
        .from("bookings")
        .select("id, reference, starts_at, party_size, hold_expires_at, experiences(title)")
        .eq("provider_id", profile.id)
        .eq("status", "pending_provider_confirmation")
        .gt("hold_expires_at", nowIso)
        .order("hold_expires_at"),
      supabase
        .from("bookings")
        .select("id, reference, starts_at, party_size, status, experiences(title)")
        .eq("provider_id", profile.id)
        .eq("status", "confirmed")
        .gte("starts_at", nowIso)
        .order("starts_at")
        .limit(5),
      supabase.from("provider_payout_accounts").select("display_label").eq("provider_id", profile.id).maybeSingle(),
      supabase.from("commission_rules").select("rate_bps, scope, provider_id, active_from, active_until").order("active_from", { ascending: false }),
    ]);

  const steps = [
    { done: profile.description.length >= 80 && profile.operating_areas !== "", label: "Describe your business and where you operate", href: "/provider/profile" },
    { done: Boolean(details.legal_name && details.contact_phone && details.contact_email), label: "Add your legal name and contact details", href: "/provider/profile" },
    { done: (cats?.length ?? 0) > 0, label: "Choose your service categories", href: "/provider/profile#categories" },
    { done: (docs?.length ?? 0) > 0, label: "Upload verification documents", href: "/provider/profile#documents" },
    { done: ["pending_review", "verified"].includes(profile.verification_status), label: "Submit your profile for review", href: "/provider/profile#submit" },
  ];
  const status = PROVIDER_STATUS[profile.verification_status];
  const counts = (listings ?? []).reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.status]: (acc[l.status] ?? 0) + 1 }), {});
  const now = requestNow();
  const rate =
    (commission ?? []).find((c) => c.scope === "provider" && c.provider_id === profile.id && (!c.active_until || Date.parse(c.active_until) > now)) ??
    (commission ?? []).find((c) => c.scope === "default" && (!c.active_until || Date.parse(c.active_until) > now));

  return (
    <div className="space-y-8">
      <PageHeader
        title={profile.business_name}
        description={
          <>
            Verification: <Badge tone={status.tone}>{status.label}</Badge>
          </>
        }
        actions={<ButtonLink href="/provider/listings/new">New listing</ButtonLink>}
      />

      {profile.verification_status === "changes_requested" || profile.verification_status === "rejected" ? (
        <Alert tone="warning" title="Our team needs changes before verifying you">
          {details.verification_feedback || "See your profile page."} <Link href="/provider/profile">Update your profile</Link>
        </Alert>
      ) : null}
      {profile.verification_status === "suspended" ? (
        <Alert tone="error" title="Your host account is suspended">
          Your listings are hidden and new bookings are blocked. {details.verification_feedback}
        </Alert>
      ) : null}

      {profile.verification_status !== "verified" ? (
        <Section title="Get verified" description="You can draft listings now. They can be published once you are verified.">
          <ol className="space-y-3">
            {steps.map((s) => (
              <li key={s.label} className="flex items-start gap-3">
                {s.done ? <CheckCircle2 className="mt-0.5 size-5 text-forest" aria-hidden /> : <Circle className="mt-0.5 size-5 text-sand-deep" aria-hidden />}
                <span>
                  <Link href={s.href} className={s.done ? "text-stone line-through decoration-sand-deep" : "underline underline-offset-4"}>
                    {s.label}
                  </Link>
                  <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Live listings" value={counts.published ?? 0} />
        <Stat label="In review" value={counts.pending_review ?? 0} />
        <Stat label="Requests to answer" value={requests?.length ?? 0} />
        <Stat label="Commission rate" value={rate ? `${(rate.rate_bps / 100).toFixed(rate.rate_bps % 100 ? 1 : 0)}%` : "Not set"} hint={rate ? "Fixed on each booking when it is made" : "Bookings open once set by Hidden Kenya"} />
      </div>

      {requests?.length ? (
        <Section title="Booking requests waiting for you">
          <ul className="divide-y divide-sand-deep">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{r.experiences?.title}</p>
                  <p className="text-sm text-stone">
                    {formatDateTime(r.starts_at)} · {r.party_size} guests · answer by {r.hold_expires_at ? formatDateTime(r.hold_expires_at) : "soon"}
                  </p>
                </div>
                <ButtonLink href={`/provider/bookings/${r.id}`} size="sm">
                  Review request
                </ButtonLink>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Upcoming confirmed bookings" actions={<Link href="/provider/bookings" className="text-sm text-forest underline">All bookings</Link>}>
        {upcoming?.length ? (
          <ul className="divide-y divide-sand-deep">
            {upcoming.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/provider/bookings/${b.id}`} className="font-medium hover:underline">
                    {b.experiences?.title}
                  </Link>
                  <p className="text-sm text-stone">
                    {formatDateTime(b.starts_at)} · {b.party_size} guests · {b.reference}
                  </p>
                </div>
                <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone">No upcoming confirmed bookings.</p>
        )}
      </Section>

      {!payout ? (
        <Alert tone="info" title="Add a payout account">
          Earnings are paid to M-Pesa. <Link href="/provider/earnings">Add your M-Pesa number</Link>
        </Alert>
      ) : null}
    </div>
  );
}

export default function ProviderHome() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Overview />
    </Suspense>
  );
}
