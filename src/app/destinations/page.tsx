import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { getDestinations } from "@/lib/data/public";
import { publicImageUrl } from "@/lib/media";
import { REGIONS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Destinations in Kenya",
  description: "Places in Kenya with experiences hosted by verified local guides and businesses.",
  alternates: { canonical: "/destinations" },
};

async function List() {
  const destinations = await getDestinations();
  if (!destinations.length) {
    return (
      <EmptyState title="Destination guides are being written" action={<ButtonLink href="/experiences" variant="secondary">Browse experiences</ButtonLink>}>
        We publish a destination page only once its information has been researched and its sources recorded.
      </EmptyState>
    );
  }
  const byRegion = REGIONS.map((r) => ({ region: r, items: destinations.filter((d) => d.counties?.former_province === r) })).filter((g) => g.items.length);
  return (
    <div className="space-y-14">
      {byRegion.map((g) => (
        <section key={g.region} aria-labelledby={`r-${g.region}`}>
          <h2 id={`r-${g.region}`} className="mb-6 text-2xl">
            {g.region}
          </h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((d) => {
              const img = [...(d.destination_images ?? [])].sort((a, b) => a.position - b.position)[0];
              return (
                <li key={d.id}>
                  <Link href={`/destinations/${d.slug}`} className="group block">
                    <div className="relative aspect-[3/2] overflow-hidden rounded-[var(--radius-card)] bg-sand">
                      {img ? <Image src={publicImageUrl("destination-media", img.storage_path)} alt={img.alt_text} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover" /> : null}
                    </div>
                    <p className="mt-3 font-display text-xl group-hover:text-forest">{d.name}</p>
                    <p className="text-sm text-stone">{d.counties?.name} County</p>
                    {d.summary ? <p className="mt-1 line-clamp-2 text-[0.95rem] text-charcoal/80">{d.summary}</p> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function DestinationsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-4xl">Destinations</h1>
      <p className="mb-10 mt-2 max-w-2xl text-stone">General information about places in Kenya. Bookable experiences are listed on each destination page.</p>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-[var(--radius-card)] bg-sand/50" />}>
        <List />
      </Suspense>
    </div>
  );
}
