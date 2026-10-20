import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExperienceGrid, ExperienceGridSkeleton } from "@/components/experiences/experience-card";
import { MapBlock } from "@/components/map-block";
import { EmptyState } from "@/components/ui/feedback";
import { getDestinationBySlug, getNearbyDestinations, searchExperiences } from "@/lib/data/public";
import { formatShortDate } from "@/lib/format";
import { publicImageUrl } from "@/lib/media";

export async function generateMetadata(props: PageProps<"/destinations/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const d = await getDestinationBySlug(slug);
  if (!d) return { title: "Destination not found", robots: { index: false } };
  return { title: d.name, description: d.summary || undefined, alternates: { canonical: `/destinations/${d.slug}` } };
}

async function Experiences({ slug, name }: { slug: string; name: string }) {
  const { items, total } = await searchExperiences({ destination: slug, sort: "newest" }, 8);
  if (!items.length) {
    return <EmptyState title={`No bookable experiences in ${name} yet`}>When a verified host lists an experience here, it will appear on this page.</EmptyState>;
  }
  return (
    <>
      <ExperienceGrid items={items} />
      {total > items.length ? (
        <Link href={`/experiences?destination=${slug}`} className="mt-8 inline-block text-forest underline underline-offset-4">
          See all {total} experiences
        </Link>
      ) : null}
    </>
  );
}

async function Nearby({ id }: { id: string }) {
  const nearby = await getNearbyDestinations(id);
  if (!nearby.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-2xl">Nearby</h2>
      <ul className="space-y-2">
        {nearby.map((n) => (
          <li key={n.id}>
            <Link href={`/destinations/${n.slug}`} className="text-forest underline underline-offset-4">
              {n.name}
            </Link>{" "}
            <span className="text-sm text-stone">about {Math.round(n.distance_km)} km away in a straight line</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Detail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await getDestinationBySlug(slug);
  if (!d) notFound();
  const images = [...(d.destination_images ?? [])].sort((a, b) => a.position - b.position);
  const hero = images[0];
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-stone">
        <Link href="/destinations" className="hover:underline">
          Destinations
        </Link>{" "}
        / <span className="text-charcoal">{d.name}</span>
      </nav>
      <h1 className="text-4xl sm:text-5xl">{d.name}</h1>
      <p className="mt-2 text-stone">
        {d.counties?.name} County, {d.counties?.former_province}
      </p>
      {hero ? (
        <figure className="mt-6">
          <div className="relative aspect-[21/9] overflow-hidden rounded-[var(--radius-card)] bg-sand">
            <Image src={publicImageUrl("destination-media", hero.storage_path)} alt={hero.alt_text} fill preload sizes="100vw" className="object-cover" />
          </div>
          <figcaption className="mt-2 text-xs text-stone">
            Photo: {hero.credit}, {hero.licence}
            {hero.source_url ? (
              <>
                {" "}
                (<a href={hero.source_url} className="underline" rel="noopener noreferrer" target="_blank">source</a>)
              </>
            ) : null}
          </figcaption>
        </figure>
      ) : null}

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_22rem]">
        <div className="prose-hk space-y-4">
          {d.summary ? <p className="text-lg">{d.summary}</p> : null}
          {d.description.split(/\n{2,}/).filter(Boolean).map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
          {d.travel_information ? (
            <>
              <h2>Getting there and practical information</h2>
              {d.travel_information.split(/\n{2,}/).filter(Boolean).map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
            </>
          ) : null}
          {d.content_source_name ? (
            <p className="text-sm text-stone">
              Source:{" "}
              {d.content_source_url ? (
                <a href={d.content_source_url} rel="noopener noreferrer" target="_blank">
                  {d.content_source_name}
                </a>
              ) : (
                d.content_source_name
              )}
              {d.content_retrieved_on ? `, retrieved ${formatShortDate(`${d.content_retrieved_on}T12:00:00+03:00`)}` : ""}. Last updated {formatShortDate(d.updated_at)}.
            </p>
          ) : null}
        </div>
        <aside className="space-y-8">
          {d.latitude !== null && d.longitude !== null ? (
            <MapBlock point={{ lat: d.latitude, lng: d.longitude }} label={d.name} source={d.location_source} />
          ) : null}
          <Suspense fallback={null}>
            <Nearby id={d.id} />
          </Suspense>
        </aside>
      </div>

      <section className="mt-16">
        <h2 className="mb-8 text-3xl">Experiences in {d.name}</h2>
        <Suspense fallback={<ExperienceGridSkeleton />}>
          <Experiences slug={d.slug} name={d.name} />
        </Suspense>
      </section>
    </div>
  );
}

export default function DestinationPage(props: PageProps<"/destinations/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-7xl animate-pulse px-4" />}>
      <Detail params={props.params} />
    </Suspense>
  );
}
