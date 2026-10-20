import type { Metadata } from "next";
import { Suspense } from "react";
import { respondToReview } from "@/actions/provider-bookings";
import { DashboardSkeleton } from "@/components/layout/dashboard-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { requireProvider } from "@/lib/data/provider";
import { formatShortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Reviews" };

async function Content() {
  const { profile, supabase } = await requireProvider("/provider/reviews");
  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, rating, title, body, status, reviewer_display_name, provider_response, created_at, experiences(title)")
    .eq("provider_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <div className="space-y-6">
      <PageHeader title="Reviews" description="Reviews come only from guests with completed bookings. You can reply once publicly to each." />
      {reviews?.length ? (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{r.experiences?.title}</span>
                <span aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}</span>
                <span className="text-sm text-stone">
                  {r.reviewer_display_name}, {formatShortDate(r.created_at)}
                </span>
                {r.status !== "published" ? <Badge tone="outline">{r.status === "removed" ? "Removed by moderators" : "Under review"}</Badge> : null}
              </div>
              {r.title ? <p className="mt-2 font-medium">{r.title}</p> : null}
              <p className="mt-1 whitespace-pre-line">{r.body}</p>
              {r.status === "published" ? (
                <ActionForm action={respondToReview} className="mt-4 space-y-3">
                  <input type="hidden" name="reviewId" value={r.id} />
                  <Field id={`resp-${r.id}`} label={r.provider_response ? "Your public reply" : "Reply publicly"}>
                    <Textarea id={`resp-${r.id}`} name="response" rows={3} maxLength={2000} defaultValue={r.provider_response} />
                  </Field>
                  <SubmitButton size="sm" variant="secondary">
                    {r.provider_response ? "Update reply" : "Publish reply"}
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No reviews yet">Guests can review after their experience has taken place.</EmptyState>
      )}
    </div>
  );
}

export default function ProviderReviewsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
