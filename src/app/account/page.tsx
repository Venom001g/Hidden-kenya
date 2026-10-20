import Link from "next/link";
import { Suspense } from "react";
import { markNotificationsRead } from "@/actions/account";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { BOOKING_STATUS } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";

async function markRead() {
  "use server";
  return markNotificationsRead();
}

async function Overview() {
  const user = await requireUser("/account");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [{ data: upcoming }, { data: actions }, { data: notes }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, reference, starts_at, party_size, status, experiences(title)")
      .eq("customer_id", user.id)
      .eq("status", "confirmed")
      .gte("starts_at", now)
      .order("starts_at")
      .limit(5),
    supabase
      .from("bookings")
      .select("id, reference, status, hold_expires_at, experiences(title)")
      .eq("customer_id", user.id)
      .in("status", ["pending_payment", "payment_failed", "pending_provider_confirmation"])
      .gt("hold_expires_at", now)
      .order("hold_expires_at"),
    supabase.from("notifications").select("id, subject, data, created_at, read_at").eq("user_id", user.id).eq("channel", "in_app").order("created_at", { ascending: false }).limit(8),
  ]);
  const unread = (notes ?? []).filter((n) => !n.read_at).length;

  return (
    <div className="space-y-8">
      <PageHeader title={user.fullName ? `Hello, ${user.fullName.split(" ")[0]}` : "Your account"} actions={<ButtonLink href="/experiences" variant="secondary">Find an experience</ButtonLink>} />

      {actions?.length ? (
        <Section title="Needs your attention">
          <ul className="divide-y divide-sand-deep">
            {actions.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{b.experiences?.title}</p>
                  <p className="text-sm text-stone">
                    <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>{" "}
                    {b.status === "pending_provider_confirmation" ? "Host replies by" : "Pay by"} {b.hold_expires_at ? formatDateTime(b.hold_expires_at) : ""}
                  </p>
                </div>
                <ButtonLink href={`/checkout/${b.id}`} size="sm">
                  {b.status === "pending_provider_confirmation" ? "View request" : "Complete payment"}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Upcoming" actions={<Link href="/account/bookings" className="text-sm text-forest underline">All bookings</Link>}>
        {upcoming?.length ? (
          <ul className="divide-y divide-sand-deep">
            {upcoming.map((b) => (
              <li key={b.id} className="py-3">
                <Link href={`/account/bookings/${b.id}`} className="font-medium hover:underline">
                  {b.experiences?.title}
                </Link>
                <p className="text-sm text-stone">
                  {formatDateTime(b.starts_at)} · {b.party_size} guest{b.party_size === 1 ? "" : "s"} · {b.reference}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing booked yet" action={<ButtonLink href="/experiences">Browse experiences</ButtonLink>} className="py-8" />
        )}
      </Section>

      <Section
        title="Updates"
        actions={
          unread ? (
            <ActionForm action={markRead}>
              <SubmitButton size="sm" variant="ghost">
                Mark all read
              </SubmitButton>
            </ActionForm>
          ) : null
        }
      >
        {notes?.length ? (
          <ul className="divide-y divide-sand-deep">
            {notes.map((n) => {
              const href = typeof (n.data as Record<string, unknown>)?.href === "string" ? ((n.data as Record<string, string>).href as string) : null;
              return (
                <li key={n.id} className="flex items-start gap-3 py-3">
                  {!n.read_at ? <span className="mt-2 size-2 shrink-0 rounded-full bg-terracotta" aria-label="Unread" /> : <span className="size-2 shrink-0" />}
                  <div>
                    {href?.startsWith("/") ? (
                      <Link href={href} className="hover:underline">
                        {n.subject}
                      </Link>
                    ) : (
                      <span>{n.subject}</span>
                    )}
                    <p className="text-sm text-stone">{formatDateTime(n.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-stone">No updates yet.</p>
        )}
      </Section>
    </div>
  );
}

export default function AccountHome() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Overview />
    </Suspense>
  );
}
