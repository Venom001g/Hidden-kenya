import { Suspense } from "react";
import { ExperienceGridSkeleton } from "@/components/experiences/experience-card";
import { Hero } from "@/components/home/hero";
import {
  CategoriesSection,
  CategoryRow,
  DestinationsSection,
  FeaturedSection,
  HostsSection,
  HowItWorks,
  RecentSection,
  RegionsSection,
  SectionHeading,
  TrustSection,
} from "@/components/home/sections";
import { FAQ } from "@/lib/content/faq";

const ROWS = [
  { slug: "wildlife-safari", title: "Wildlife and safari", description: "Game drives, walking safaris and conservancy visits." },
  { slug: "culture-community", title: "Culture and community", description: "Run by the people whose places and traditions they share." },
  { slug: "beaches-coast", title: "Beaches and the coast", description: "Reefs, dhows and the old Swahili towns." },
  { slug: "hiking-outdoors", title: "Hiking and the outdoors", description: "Forest walks, crater rims and mountain treks." },
  { slug: "food-culinary", title: "Food and cooking", description: "Markets, farms, kitchens and tastings." },
];

const rowFallback = (
  <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
    <ExperienceGridSkeleton />
  </div>
);

export default function HomePage() {
  return (
    <>
      <Suspense fallback={<div className="h-[640px] bg-sand/60" />}>
        <Hero />
      </Suspense>
      <Suspense fallback={rowFallback}>
        <FeaturedSection />
      </Suspense>
      <RegionsSection />
      <Suspense fallback={null}>
        <CategoriesSection />
      </Suspense>
      <Suspense fallback={rowFallback}>
        <RecentSection />
      </Suspense>
      {ROWS.map((r) => (
        <Suspense key={r.slug} fallback={null}>
          <CategoryRow {...r} />
        </Suspense>
      ))}
      <Suspense fallback={null}>
        <DestinationsSection />
      </Suspense>
      <HowItWorks />
      <TrustSection />
      <HostsSection />

      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <SectionHeading title="Questions" href="/faq" linkLabel="All questions" />
        <div className="divide-y divide-sand-deep border-y border-sand-deep">
          {FAQ.slice(0, 5).map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
                {f.q}
                <span className="text-2xl leading-none text-stone transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 max-w-3xl text-stone">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

    </>
  );
}
