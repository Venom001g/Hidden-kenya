import { BadgeCheck, Check, Clock, Globe, Info, MapPin, Users, X } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookingWidget } from "@/components/experiences/booking-widget";
import { ExperienceGrid, Rating } from "@/components/experiences/experience-card";
import { FavoriteButton } from "@/components/experiences/favorite-button";
import { MapBlock } from "@/components/map-block";
import { Badge } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { getCurrentUser } from "@/lib/auth";
import { getAvailability, getExperienceBySlug, getRelatedExperiences, getReviews } from "@/lib/data/public";
import { formatDuration, formatMoney, formatShortDate, nairobiDate } from "@/lib/format";
import { publicImageUrl } from "@/lib/media";
import { accessibilityLabel, CANCELLATION_POLICIES } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

type Exp = NonNullable<Awaited<ReturnType<typeof getExperienceBySlug>>>;

export async function generateMetadata(props: PageProps<"/experiences/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const exp = await getExperienceBySlug(slug);
  if (!exp) return { title: "Experience not found", robots: { index: false } };
  const cover = exp.images[0];
  return {
    title: exp.title,
    description: exp.summary || undefined,
    alternates: { canonical: `/experiences/${exp.slug}` },
    openGraph: {
      title: exp.title,
      description: exp.summary || undefined,
      images: cover ? [{ url: publicImageUrl("experience-media", cover.storage_path), alt: cover.alt_text }] : undefined,
    },
  };
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
    </>
  );
}

function Gallery({ exp }: { exp: Exp }) {
  const imgs = exp.images.slice(0, 5);
  if (!imgs.length) return null;
  const [first, ...rest] = imgs;
  const credits = imgs.filter((i) => i.credit).map((i) => i.credit);
  return (
    <figure>
      <div className="grid gap-2 sm:grid-cols-4 sm:grid-rows-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] bg-sand sm:col-span-2 sm:row-span-2 sm:aspect-auto sm:min-h-[26rem]">
          <Image src={publicImageUrl("experience-media", first.storage_path)} alt={first.alt_text} fill preload sizes="(min-width: 640px) 50vw, 100vw" className="object-cover" />
        </div>
        {rest.map((img) => (
          <div key={img.id} className="relative hidden aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] bg-sand sm:block">
            <Image src={publicImageUrl("experience-media", img.storage_path)} alt={img.alt_text} fill sizes="25vw" className="object-cover" />
          </div>
        ))}
      </div>
      {credits.length ? <figcaption className="mt-2 text-xs text-stone">Photos: {[...new Set(credits)].join(", ")}. Supplied by the host.</figcaption> : null}
    </figure>
  );
}

async function BookingPanel({ exp }: { exp: Exp }) {
  const [user, availability] = await Promise.all([getCurrentUser(), getAvailability(exp.id, nairobiDate(), undefined)]);
  let contact: { name: string; email: string; phone: string } | null = null;
  let saved = false;
  if (user) {
    const supabase = await createClient();
    const [{ data: profile }, { data: fav }] = await Promise.all([
      supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
      supabase.from("favorites").select("experience_id").eq("user_id", user.id).eq("experience_id", exp.id).maybeSingle(),
    ]);
    contact = { name: profile?.full_name ?? "", email: user.email, phone: profile?.phone ?? "" };
    saved = Boolean(fav);
  }
  const loginHref = `/login?next=${encodeURIComponent(`/experiences/${exp.slug}`)}`;
  return (
    <div className="space-y-4">
      <BookingWidget
        experience={{
          id: exp.id,
          priceMinor: exp.price_minor,
          currency: exp.currency,
          pricingModel: exp.pricing_model,
          minParticipants: exp.min_participants,
          maxParticipants: exp.max_participants,
          bookingMode: exp.booking_mode,
        }}
        slots={availability.slots}
        contact={contact}
        loginHref={loginHref}
      />
      <div className="flex justify-center">
        <FavoriteButton experienceId={exp.id} saved={saved} signedIn={Boolean(user)} loginHref={loginHref} />
      </div>
    </div>
  );
}

async function Reviews({ exp, searchParams }: { exp: Exp; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.reviews) || 1);
  const { reviews, total } = await getReviews(exp.id, 10, (page - 1) * 10);
  return (
    <section aria-labelledby="reviews" className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="reviews" className="text-2xl">
          Guest reviews
        </h2>
        <Rating average={exp.stats?.average_rating ?? null} count={exp.stats?.review_count ?? 0} />
      </div>
      {total === 0 ? (
        <p className="text-stone">No reviews yet. Reviews can only be written by guests after a completed booking.</p>
      ) : (
        <>
          <p className="text-sm text-stone">Every review comes from a guest with a completed booking.</p>
          <ul className="divide-y divide-sand-deep">
            {reviews.map((r) => (
              <li key={r.id} className="py-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{r.reviewer_display_name}</span>
                  <span className="text-sm text-stone">Visited {formatShortDate(`${r.experienced_on}T12:00:00+03:00`)}</span>
                  <span className="text-sm" aria-label={`${r.rating} out of 5`}>
                    {"★".repeat(r.rating)}
                    <span className="text-sand-deep">{"★".repeat(5 - r.rating)}</span>
                  </span>
                </div>
                {r.title ? <p className="mt-2 font-medium">{r.title}</p> : null}
                <p className="mt-1 whitespace-pre-line text-charcoal/90">{r.body}</p>
                {r.provider_response ? (
                  <div className="mt-3 border-l-2 border-sand-deep pl-4 text-sm">
                    <p className="font-medium">Response from the host</p>
                    <p className="mt-1 whitespace-pre-line text-stone">{r.provider_response}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={10} total={total} basePath={`/experiences/${exp.slug}`} params={{ reviews: String(page) }} />
        </>
      )}
    </section>
  );
}

async function Related({ id }: { id: string }) {
  const items = await getRelatedExperiences(id);
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <h2 className="mb-8 text-3xl">Similar experiences</h2>
      <ExperienceGrid items={items} />
    </section>
  );
}

async function Detail({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const exp = await getExperienceBySlug(slug);
  if (!exp) notFound();
  const provider = exp.provider_profiles;
  const policy = CANCELLATION_POLICIES[exp.cancellation_policy];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: exp.title,
    description: exp.summary,
    url: `${siteUrl}/experiences/${exp.slug}`,
    image: exp.images.map((i) => publicImageUrl("experience-media", i.storage_path)),
    provider: provider ? { "@type": "Organization", name: provider.business_name } : undefined,
    offers: {
      "@type": "Offer",
      price: (exp.price_minor / 100).toFixed(2),
      priceCurrency: exp.currency,
    },
    ...(exp.stats && (exp.stats.review_count ?? 0) > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: exp.stats.average_rating, reviewCount: exp.stats.review_count } }
      : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-5 text-sm text-stone">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/experiences" className="hover:underline">
                Experiences
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href={`/experiences?category=${exp.experience_categories?.slug}`} className="hover:underline">
                {exp.experience_categories?.name}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="truncate text-charcoal">
              {exp.title}
            </li>
          </ol>
        </nav>
        <h1 className="max-w-4xl text-4xl sm:text-5xl">{exp.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-stone">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden />
            {exp.destinations ? (
              <Link href={`/destinations/${exp.destinations.slug}`} className="hover:underline">
                {exp.destinations.name}
              </Link>
            ) : null}
            {exp.destinations ? ", " : ""}
            {exp.counties?.name} County
          </span>
          <Rating average={exp.stats?.average_rating ?? null} count={exp.stats?.review_count ?? 0} />
          {provider ? (
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="size-4 text-forest" aria-hidden /> Verified host
            </span>
          ) : null}
        </div>
        <div className="mt-6">
          <Gallery exp={exp} />
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_24rem] lg:px-8">
        <div className="min-w-0 space-y-12">
          <section aria-label="Key facts" className="grid grid-cols-2 gap-4 rounded-[var(--radius-card)] border border-sand-deep p-5 sm:grid-cols-4">
            <div>
              <Clock className="mb-1 size-5 text-forest" aria-hidden />
              <p className="text-sm text-stone">Duration</p>
              <p className="font-medium">{formatDuration(exp.duration_minutes)}</p>
            </div>
            <div>
              <Users className="mb-1 size-5 text-forest" aria-hidden />
              <p className="text-sm text-stone">Group size</p>
              <p className="font-medium">
                {exp.min_participants === exp.max_participants ? exp.max_participants : `${exp.min_participants}–${exp.max_participants}`} guests
              </p>
            </div>
            <div>
              <Globe className="mb-1 size-5 text-forest" aria-hidden />
              <p className="text-sm text-stone">Languages</p>
              <p className="font-medium">{exp.languages.length ? exp.languages.join(", ") : "Ask the host"}</p>
            </div>
            <div>
              <Info className="mb-1 size-5 text-forest" aria-hidden />
              <p className="text-sm text-stone">Booking</p>
              <p className="font-medium">{exp.booking_mode === "instant" ? "Instant confirmation" : "Host confirms"}</p>
            </div>
          </section>

          <section className="prose-hk space-y-4">
            {exp.summary ? <p className="text-lg text-charcoal">{exp.summary}</p> : null}
            <Paragraphs text={exp.description} />
          </section>

          {exp.included.length || exp.excluded.length ? (
            <section className="grid gap-8 sm:grid-cols-2">
              {exp.included.length ? (
                <div>
                  <h2 className="text-2xl">Included</h2>
                  <ul className="mt-3 space-y-2">
                    {exp.included.map((i) => (
                      <li key={i} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden /> {i}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {exp.excluded.length ? (
                <div>
                  <h2 className="text-2xl">Not included</h2>
                  <ul className="mt-3 space-y-2">
                    {exp.excluded.map((i) => (
                      <li key={i} className="flex gap-2">
                        <X className="mt-0.5 size-4 shrink-0 text-terracotta" aria-hidden /> {i}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-2xl">Meeting point</h2>
            <p className="font-medium">{exp.meeting_point_name}</p>
            <p className="whitespace-pre-line text-charcoal/90">{exp.meeting_point_instructions}</p>
            {exp.meeting_latitude !== null && exp.meeting_longitude !== null ? (
              <MapBlock point={{ lat: exp.meeting_latitude, lng: exp.meeting_longitude }} label={exp.meeting_point_name} source="Location provided by the host." />
            ) : null}
          </section>

          {exp.accessibility_features.length || exp.accessibility_notes ? (
            <section className="space-y-3">
              <h2 className="text-2xl">Accessibility</h2>
              <p className="text-sm text-stone">Described by the host. Contact them through your booking if you need to confirm details.</p>
              <ul className="flex flex-wrap gap-2">
                {exp.accessibility_features.map((f) => (
                  <li key={f}>
                    <Badge>{accessibilityLabel(f)}</Badge>
                  </li>
                ))}
              </ul>
              {exp.accessibility_notes ? <p className="whitespace-pre-line">{exp.accessibility_notes}</p> : null}
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-2xl">Cancellation policy: {policy.label}</h2>
            <p>{policy.summary}</p>
            <p className="text-sm text-stone">
              If the host cancels, you get a full refund. <Link href="/legal/booking-and-cancellation" className="underline underline-offset-2">Full policy</Link>
            </p>
          </section>

          {provider ? (
            <section className="space-y-4 rounded-[var(--radius-card)] bg-sand/50 p-6">
              <h2 className="text-2xl">Your host: {provider.business_name}</h2>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  <BadgeCheck className="size-4 text-forest" aria-hidden />
                  Verified by Hidden Kenya{provider.verified_at ? ` since ${formatShortDate(provider.verified_at)}` : ""}
                </li>
                {provider.licence_checked_at ? (
                  <li className="flex items-center gap-2">
                    <BadgeCheck className="size-4 text-forest" aria-hidden />
                    Tourism licence document checked {formatShortDate(provider.licence_checked_at)}
                  </li>
                ) : null}
              </ul>
              {provider.description ? <p className="line-clamp-5 whitespace-pre-line text-charcoal/90">{provider.description}</p> : null}
              <p className="text-sm text-stone">Profile written by the host.</p>
              <Link href={`/hosts/${provider.slug}`} className="inline-block text-forest underline underline-offset-4">
                More from this host
              </Link>
            </section>
          ) : null}

          <Suspense fallback={<div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-sand/50" />}>
            <Reviews exp={exp} searchParams={searchParams} />
          </Suspense>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start" aria-label="Book this experience">
          <Suspense fallback={<div className="h-[28rem] animate-pulse rounded-[var(--radius-card)] bg-sand/60" />}>
            <BookingPanel exp={exp} />
          </Suspense>
          <p className="mt-3 text-center text-sm text-stone">
            From {formatMoney(exp.price_minor, exp.currency)} {exp.pricing_model === "per_person" ? "per person" : "per group"}
          </p>
        </aside>
      </div>

      <Suspense fallback={null}>
        <Related id={exp.id} />
      </Suspense>
    </>
  );
}

export default function ExperiencePage(props: PageProps<"/experiences/[slug]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8" aria-busy>
          <div className="h-10 w-2/3 animate-pulse rounded bg-sand/70" />
          <div className="mt-6 h-[26rem] animate-pulse rounded-[var(--radius-card)] bg-sand/60" />
        </div>
      }
    >
      <Detail params={props.params} searchParams={props.searchParams as Promise<Record<string, string | string[] | undefined>>} />
    </Suspense>
  );
}
