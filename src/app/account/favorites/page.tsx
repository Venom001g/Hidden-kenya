import type { Metadata } from "next";
import { Suspense } from "react";
import { ExperienceGrid } from "@/components/experiences/experience-card";
import { DashboardSkeleton } from "@/components/layout/dashboard-shell";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth";
import { getExperienceCards } from "@/lib/data/public";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Saved experiences" };

async function Content() {
  const user = await requireUser("/account/favorites");
  const supabase = await createClient();
  const { data: favs } = await supabase.from("favorites").select("experience_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(48);
  const items = await getExperienceCards((favs ?? []).map((f) => f.experience_id));
  const hidden = (favs?.length ?? 0) - items.length;
  return (
    <div className="space-y-6">
      <PageHeader title="Saved experiences" />
      {items.length ? <ExperienceGrid items={items} /> : <EmptyState title="Nothing saved yet" action={<ButtonLink href="/experiences">Browse experiences</ButtonLink>}>Use “Save” on any experience to keep it here.</EmptyState>}
      {hidden > 0 ? <p className="text-sm text-stone">{hidden} saved experience{hidden === 1 ? " is" : "s are"} no longer available and not shown.</p> : null}
    </div>
  );
}

export default function FavoritesPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
