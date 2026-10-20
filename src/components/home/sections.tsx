import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { ExperienceGrid } from "@/components/experiences/experience-card";
import { getCategories, getDestinations, getFeatured, searchExperiences } from "@/lib/data/public";
import { publicImageUrl } from "@/lib/media";
import { REGIONS } from "@/lib/site";

export function SectionHeading({ title, description, href, linkLabel }: { title: string; description?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-3xl sm:text-[2.1rem]">{title}</h2>
        {description ? <p className="mt-2 max-w-2xl text-stone">{description}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="shrink-0 text-forest underline underline-offset-4">
          {linkLabel ?? "See all"}
        </Link>
      ) : null}
    </div>
  );
}

const REGION_NOTES: Record<(typeof REGIONS)[number], string> = {
  Nairobi: "The capital: museums, markets, food and the national park on the city's edge.",
  Central: "Highlands, forests and the slopes of Mount Kenya.",
  Coast: "Swahili towns, coral reefs and the Indian Ocean shoreline.",
  Eastern: "From Meru's farmland to the drylands of the north.",
  "North Eastern": "Remote rangelands bordering Somalia and Ethiopia.",
  Nyanza: "Lake Victoria, its islands and the Kisii hills.",
  "Rift Valley": "Lakes, escarpments, conservancies and the Maasai Mara.",
  Western: "Rainforest, sugarcane country and Mount Elgon.",
};

export function RegionsSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <SectionHeading title="Explore Kenya by region" description="Regions follow Kenya's former provinces, still the way most travellers and hosts describe where things are." />
      <ul className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-sand-deep bg-sand-deep sm:grid-cols-2 lg:grid-cols-4">
        {REGIONS.map((r) => (
          <li key={r} className="bg-paper">
            <Link href={`/experiences?region=${encodeURIComponent(r)}`} className="block h-full p-5 transition-colors hover:bg-ivory">
              <span className="font-display text-xl">{r}</span>
              <span className="mt-1.5 block text-sm text-stone">{REGION_NOTES[r]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function CategoriesSection() {
  const categories = await getCategories();
  if (!categories.length) return null;
  return (
    <section className="border-y border-sand-deep/70 bg-paper">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading title="Find something to do" />
        <ul className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={`/experiences?category=${c.slug}`} className="group block border-l-2 border-sand-deep pl-4 hover:border-forest">
                <span className="text-lg font-semibold group-hover:text-forest">{c.name}</span>
                <span className="mt-1 block text-stone">{c.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export async function FeaturedSection() {
  const featured = await getFeatured();
  if (!featured.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionHeading title="Selected by our team" description="Chosen by Hidden Kenya editors. Paid placements are marked “Sponsored”." />
      <ExperienceGrid items={featured} labelFor={(i) => (featured.find((f) => f.id === i.id)?.sponsored ? "Sponsored" : undefined)} />
    </section>
  );
}

/** A category row; renders nothing when there are no live listings in it. */
export async function CategoryRow({ slug, title, description }: { slug: string; title: string; description: string }) {
  const { items, total } = await searchExperiences({ category: slug, sort: "newest" }, 4);
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <SectionHeading title={title} description={description} href={`/experiences?category=${slug}`} linkLabel={`See all ${total}`} />
      <ExperienceGrid items={items} />
    </section>
  );
}

export async function RecentSection() {
  const { items, total, error } = await searchExperiences({ sort: "newest" }, 8);
  if (error) return null;
  if (!total) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          title="The first experiences are being reviewed"
          action={
            <>
              <ButtonLink href="/for-providers">Host an experience</ButtonLink>
              <ButtonLink href="#newsletter" variant="secondary">
                Get notified
              </ButtonLink>
            </>
          }
        >
          No experiences are bookable yet. Every listing is checked by our team before it appears here, so we do not show placeholders.
        </EmptyState>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <SectionHeading title="Recently added" href="/experiences?sort=newest" linkLabel={`Browse all ${total}`} />
      <ExperienceGrid items={items} />
    </section>
  );
}

export async function DestinationsSection() {
  const destinations = (await getDestinations()).slice(0, 6);
  if (!destinations.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <SectionHeading title="Destinations" href="/destinations" linkLabel="All destinations" />
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {destinations.map((d) => {
          const img = [...(d.destination_images ?? [])].sort((a, b) => a.position - b.position)[0];
          return (
            <li key={d.id}>
              <Link href={`/destinations/${d.slug}`} className="group block">
                <div className="relative aspect-[3/2] overflow-hidden rounded-[var(--radius-card)] bg-sand">
                  {img ? (
                    <Image src={publicImageUrl("destination-media", img.storage_path)} alt={img.alt_text} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  ) : null}
                </div>
                <p className="mt-3 font-display text-xl group-hover:text-forest">{d.name}</p>
                <p className="text-sm text-stone">{d.counties?.name} County</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const STEPS = [
  { title: "Discover", text: "Search by place, type of experience, date or budget." },
  { title: "Compare", text: "Read what is included, the meeting point, cancellation terms and reviews from guests who booked." },
  { title: "Check the host", text: "See what our team has verified about the host, and what the host describes themselves." },
  { title: "Book", text: "Pick a departure with places left. Some hosts confirm requests first; you pay only after they accept." },
  { title: "Pay", text: "Pay by M-Pesa or card through our payment provider. Your booking is confirmed once payment is verified." },
  { title: "Go, then review", text: "After the experience, you can leave a review. Only guests with a completed booking can review." },
];

export function HowItWorks({ compact }: { compact?: boolean }) {
  return (
    <section className={compact ? "" : "bg-forest-deep text-paper"}>
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-[2.1rem]">How booking works</h2>
        <ol className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className={`font-display text-3xl leading-none ${compact ? "text-terracotta" : "text-[#E7B98F]"}`} aria-hidden>
                {i + 1}
              </span>
              <div>
                <h3 className="font-sans text-lg font-semibold">{s.title}</h3>
                <p className={`mt-1 ${compact ? "text-stone" : "text-paper/80"}`}>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function TrustSection() {
  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-2 lg:px-8">
      <div>
        <h2 className="text-3xl sm:text-[2.1rem]">What “verified” means here</h2>
        <p className="mt-4 text-stone">
          We separate what our team has checked from what hosts tell us. Listing pages label each one, so you can see which is which.
        </p>
      </div>
      <dl className="space-y-6">
        <div>
          <dt className="font-semibold">Verified host</dt>
          <dd className="mt-1 text-stone">
            Our team reviewed the host&apos;s documents (for example business registration or identity) and approved their profile. Hosts cannot take bookings until this is done.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Tourism licence checked</dt>
          <dd className="mt-1 text-stone">We reviewed a tourism licence document the host uploaded. This is shown only when that check has happened.</dd>
        </div>
        <div>
          <dt className="font-semibold">Described by the host</dt>
          <dd className="mt-1 text-stone">
            Itineraries, inclusions and accessibility details are written by hosts. We review listings before they go live but do not inspect every claim on site.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Guest reviews</dt>
          <dd className="mt-1 text-stone">Reviews can only be written by guests whose booking was completed. We do not import or write reviews.</dd>
        </div>
      </dl>
    </section>
  );
}

export function HostsSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="grid gap-8 rounded-[var(--radius-card)] bg-sand/70 p-8 sm:p-12 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div>
          <h2 className="text-3xl">Run tours or activities in Kenya?</h2>
          <p className="mt-3 max-w-xl text-charcoal/80">
            List your experiences, manage dates and capacity, and get paid for confirmed bookings. We charge a commission on completed bookings, shown to you before you publish.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 md:justify-end">
          <ButtonLink href="/for-providers" size="lg">
            How hosting works
          </ButtonLink>
          <ButtonLink href="/signup?intent=host" size="lg" variant="secondary">
            Create a host account
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
