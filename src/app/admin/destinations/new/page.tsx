import type { Metadata } from "next";
import { Suspense } from "react";
import { DestinationForm } from "@/components/admin/destination-form";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/data/admin";
import { getCounties } from "@/lib/data/public";

export const metadata: Metadata = { title: "New destination" };

async function Content() {
  await requireAdmin("/admin/destinations/new");
  const counties = await getCounties();
  return (
    <div className="space-y-6">
      <PageHeader title="New destination" description="Start as a draft. Add photos with their credit and licence after saving." />
      <Section title="Details">
        <DestinationForm counties={counties} />
      </Section>
    </div>
  );
}

export default function NewDestinationPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
