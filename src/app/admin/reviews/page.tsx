import type { Metadata } from "next";
import { Suspense } from "react";
import { moderateReview } from "@/actions/admin";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/forms";
import { requireAdmin } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Reviews" };

async function Content() {
  const { db } = await requireAdmin("/admin/reviews");
  const [{ data: reports }, { data: recent }] = await Promise.all([
    db.from("review_reports").select("id, reason, created_at, reviews(id, rating, title, body, status, reviewer_display_name, experiences(title))").eq("status", "open").order("created_at"),
    db.from("reviews").select("id, rating, title, body, status, reviewer_display_name, created_at, experiences(title)").order("created_at", { ascending: false }).limit(30),
  ]);
  const ReviewActions = ({ id, status }: { id: string; status: string }) => (
    <div className="flex flex-wrap gap-2">
      {status !== "removed" ? (
        <ConfirmAction action={moderateReview} hidden={{ reviewId: id, status: "removed" }} trigger="Remove" title="Remove this review?" description="It is hidden from the public. Open reports are marked upheld." confirmLabel="Remove review" reason={{ label: "Moderator note", required: true }} />
      ) : null}
      {status !== "published" ? (
        <ActionForm action={moderateReview}>
          <input type="hidden" name="reviewId" value={id} />
          <input type="hidden" name="status" value="published" />
          <SubmitButton size="sm" variant="secondary">
            Restore
          </SubmitButton>
        </ActionForm>
      ) : (
        <ActionForm action={moderateReview}>
          <input type="hidden" name="reviewId" value={id} />
          <input type="hidden" name="status" value="published" />
          <SubmitButton size="sm" variant="secondary">
            Keep (dismiss reports)
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
  return (
    <div className="space-y-8">
      <PageHeader title="Reviews" description="Reviews are never edited. Remove those that break the community guidelines." />
      <Section title="Reported reviews">
        {reports?.length ? (
          <ul className="divide-y divide-sand-deep">
            {reports.map((r) => (
              <li key={r.id} className="space-y-2 py-4">
                <p className="text-sm text-stone">
                  Reported {formatDateTime(r.created_at)}: <span className="text-charcoal">{r.reason}</span>
                </p>
                {r.reviews ? (
                  <>
                    <p className="font-medium">
                      {r.reviews.experiences?.title} · {"★".repeat(r.reviews.rating)} · {r.reviews.reviewer_display_name}
                    </p>
                    <p className="whitespace-pre-line">{r.reviews.body}</p>
                    <ReviewActions id={r.reviews.id} status={r.reviews.status} />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone">No open reports.</p>
        )}
      </Section>
      <Section title="Latest reviews">
        {recent?.length ? (
          <ul className="divide-y divide-sand-deep">
            {recent.map((r) => (
              <li key={r.id} className="space-y-2 py-4">
                <p className="font-medium">
                  {r.experiences?.title} · {"★".repeat(r.rating)} · {r.reviewer_display_name} <Badge tone={r.status === "published" ? "forest" : "outline"}>{r.status}</Badge>
                </p>
                <p className="whitespace-pre-line text-[0.95rem]">{r.body}</p>
                <ReviewActions id={r.id} status={r.status} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No reviews yet" />
        )}
      </Section>
    </div>
  );
}

export default function AdminReviewsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
