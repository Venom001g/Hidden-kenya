import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/layout/dashboard-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireProvider } from "@/lib/data/provider";
import { formatMoney, formatShortDate } from "@/lib/format";
import { EXPERIENCE_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Listings" };

async function Content() {
  const { profile, supabase } = await requireProvider("/provider/listings");
  const { data: listings } = await supabase
    .from("experiences")
    .select("id, title, slug, status, price_minor, currency, pricing_model, updated_at, experience_images(id)")
    .eq("provider_id", profile.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader title="Listings" actions={<ButtonLink href="/provider/listings/new">New listing</ButtonLink>} />
      {!listings?.length ? (
        <EmptyState title="No listings yet" action={<ButtonLink href="/provider/listings/new">Create your first listing</ButtonLink>}>
          Start a draft any time. You can submit it for review once your host profile is verified.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-sand-deep rounded-[var(--radius-card)] border border-sand-deep bg-paper">
          {listings.map((l) => {
            const s = EXPERIENCE_STATUS[l.status];
            return (
              <li key={l.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/provider/listings/${l.id}`} className="font-medium hover:underline">
                    {l.title}
                  </Link>
                  <p className="text-sm text-stone">
                    {formatMoney(l.price_minor, l.currency)} {l.pricing_model === "per_person" ? "per person" : "per group"} · {l.experience_images.length} photo
                    {l.experience_images.length === 1 ? "" : "s"} · updated {formatShortDate(l.updated_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <ButtonLink href={`/provider/listings/${l.id}`} size="sm" variant="secondary">
                    Edit
                  </ButtonLink>
                  <ButtonLink href={`/provider/listings/${l.id}/availability`} size="sm" variant="secondary">
                    Dates
                  </ButtonLink>
                  {l.status === "published" ? (
                    <ButtonLink href={`/experiences/${l.slug}`} size="sm" variant="ghost">
                      View live
                    </ButtonLink>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ListingsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
