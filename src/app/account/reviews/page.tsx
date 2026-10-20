import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/layout/dashboard-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { requestNow } from "@/lib/time";

export const metadata: Metadata = { title: "Your reviews" };

async function Content() {
  const user = await requireUser("/account/reviews");
  const supabase = await createClient();
  const [{ data: reviews }, { data: toReview }] = await Promise.all([
    supabase.from("reviews").select("id, rating, title, body, status, created_at, provider_response, experiences(title, slug)").eq("customer_id", user.id).order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select("id, starts_at, experiences(title), reviews(id)")
      .eq("customer_id", user.id)
      .eq("status", "completed")
      .gte("completed_at", new Date(requestNow() - 90 * 86400000).toISOString()),
  ]);
  const pending = (toReview ?? []).filter((b) => !b.reviews);
  return (
    <div className="space-y-6">
      <PageHeader title="Your reviews" />
      {pending.length ? (
        <div className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5">
          <h2 className="text-xl">Waiting for your review</h2>
          <ul className="mt-3 space-y-2">
            {pending.map((b) => (
              <li key={b.id}>
                <Link href={`/account/bookings/${b.id}`} className="text-forest underline">
                  {b.experiences?.title}
                </Link>{" "}
                <span className="text-sm text-stone">{formatShortDate(b.starts_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {reviews?.length ? (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/experiences/${r.experiences?.slug}`} className="font-medium hover:underline">
                  {r.experiences?.title}
                </Link>
                <span aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}</span>
                {r.status !== "published" ? <Badge tone="outline">{r.status === "removed" ? "Removed by moderators" : "Under review"}</Badge> : null}
              </div>
              {r.title ? <p className="mt-2 font-medium">{r.title}</p> : null}
              <p className="mt-1 whitespace-pre-line">{r.body}</p>
              {r.provider_response ? <p className="mt-3 border-l-2 border-sand-deep pl-3 text-sm text-stone">Host reply: {r.provider_response}</p> : null}
            </li>
          ))}
        </ul>
      ) : !pending.length ? (
        <EmptyState title="No reviews yet">You can review an experience after it has taken place.</EmptyState>
      ) : null}
    </div>
  );
}

export default function MyReviewsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
