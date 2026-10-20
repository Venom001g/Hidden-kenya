import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/ui/feedback";
import { ListingForm } from "@/components/provider/listing-form";
import { getCategories, getCounties, getDestinations } from "@/lib/data/public";
import { requireProvider } from "@/lib/data/provider";
import { EMPTY_LISTING } from "@/lib/listing-defaults";

export const metadata: Metadata = { title: "New listing" };

async function Content() {
  await requireProvider("/provider/listings/new");
  const [categories, counties, destinations] = await Promise.all([getCategories(), getCounties(), getDestinations()]);
  return (
    <div className="space-y-6">
      <PageHeader title="New listing" description="Saved as a draft. Add photos and dates next, then submit it for review." />
      <Section title="Listing details">
        <ListingForm
          defaults={EMPTY_LISTING}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))}
          counties={counties.map((c) => ({ value: String(c.code), label: c.name }))}
          destinations={destinations.map((d) => ({ value: d.id, label: d.name }))}
        />
      </Section>
    </div>
  );
}

export default function NewListingPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
