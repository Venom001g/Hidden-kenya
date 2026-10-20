import { X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExperienceGrid, ExperienceGridSkeleton } from "@/components/experiences/experience-card";
import { SearchFilters } from "@/components/experiences/search-filters";
import { SortSelect } from "@/components/experiences/sort-select";
import { ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import {
  getCategories,
  getCounties,
  getDestinations,
  PAGE_SIZE,
  parseSearchParams,
  searchExperiences,
  type ExperienceSearch,
} from "@/lib/data/public";
import { formatDate } from "@/lib/format";
import { accessibilityLabel, DURATION_FILTERS } from "@/lib/site";

type SP = Record<string, string | string[] | undefined>;

export async function generateMetadata(props: PageProps<"/experiences">): Promise<Metadata> {
  const sp = (await props.searchParams) as SP;
  const filtered = Object.keys(sp).some((k) => k !== "page" && k !== "sort");
  return {
    title: "Experiences in Kenya",
    description: "Search bookable experiences across Kenya by place, type, date, group size and price.",
    alternates: { canonical: "/experiences" },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

function activeFilters(s: ExperienceSearch, labels: { categories: Map<string, string>; counties: Map<number, string> }) {
  const chips: { key: string; label: string; value?: string }[] = [];
  if (s.q) chips.push({ key: "q", label: `“${s.q}”` });
  if (s.category) chips.push({ key: "category", label: labels.categories.get(s.category) ?? s.category });
  if (s.region) chips.push({ key: "region", label: s.region });
  if (s.county) chips.push({ key: "county", label: `${labels.counties.get(s.county) ?? "County"} County` });
  if (s.destination) chips.push({ key: "destination", label: s.destination.replace(/-/g, " ") });
  if (s.date) chips.push({ key: "date", label: formatDate(`${s.date}T09:00:00+03:00`) });
  if (s.guests) chips.push({ key: "guests", label: `${s.guests} guest${s.guests === 1 ? "" : "s"}` });
  if (s.min) chips.push({ key: "min", label: `From ${s.currency ?? "KES"} ${s.min}` });
  if (s.max) chips.push({ key: "max", label: `Up to ${s.currency ?? "KES"} ${s.max}` });
  if (s.duration) chips.push({ key: "duration", label: DURATION_FILTERS.find((d) => d.value === s.duration)?.label ?? s.duration });
  for (const a of s.access ?? []) chips.push({ key: "access", value: a, label: accessibilityLabel(a) });
  if (s.licensed) chips.push({ key: "licensed", label: "Licence checked" });
  return chips;
}

function removeHref(sp: SP, key: string, value?: string) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page" || v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) {
      if (k === key && (value === undefined || item === value)) continue;
      if (item) next.append(k, item);
    }
  }
  const qs = next.toString();
  return qs ? `/experiences?${qs}` : "/experiences";
}

async function Results({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const search = parseSearchParams(sp);
  const [{ items, total, error }, categories, counties, destinations] = await Promise.all([
    searchExperiences(search),
    getCategories(),
    getCounties(),
    getDestinations(),
  ]);
  const chips = activeFilters(search, {
    categories: new Map(categories.map((c) => [c.slug, c.name])),
    counties: new Map(counties.map((c) => [c.code, c.name])),
  });

  return (
    <div className="grid gap-10 lg:grid-cols-[18rem_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <SearchFilters
          search={search}
          categories={categories.map((c) => ({ value: c.slug, label: c.name }))}
          counties={counties}
          destinations={destinations.map((d) => ({ value: d.slug, label: d.name }))}
        />
      </aside>
      <div className="min-w-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-stone" role="status">
            {error ? "Results unavailable" : total === 1 ? "1 experience" : `${total} experiences`}
          </p>
          {total > 1 ? <SortSelect value={search.sort} /> : null}
        </div>
        {chips.length ? (
          <ul className="mb-6 flex flex-wrap gap-2" aria-label="Active filters">
            {chips.map((c) => (
              <li key={`${c.key}:${c.value ?? ""}`}>
                <Link
                  href={removeHref(sp, c.key, c.value)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sand-deep bg-paper px-3 py-1 text-sm hover:bg-sand"
                >
                  {c.label}
                  <X className="size-3.5" aria-hidden />
                  <span className="sr-only">Remove filter</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <Alert tone="error" title="We could not load experiences">
            Please <Link href={removeHref(sp, "")}>try again</Link>. If this keeps happening, the service may be temporarily unavailable.
          </Alert>
        ) : items.length ? (
          <>
            <ExperienceGrid items={items} />
            <div className="mt-12">
              <Pagination page={search.page} pageSize={PAGE_SIZE} total={total} basePath="/experiences" params={sp} />
            </div>
          </>
        ) : chips.length ? (
          <EmptyState title="No experiences match these filters" action={<ButtonLink href="/experiences" variant="secondary">Clear all filters</ButtonLink>}>
            Try a different date, fewer filters, or a nearby county.
          </EmptyState>
        ) : (
          <EmptyState title="No experiences are bookable yet" action={<ButtonLink href="/for-providers">Host an experience</ButtonLink>}>
            Listings appear here once our team has verified the host and reviewed the listing.
          </EmptyState>
        )}
      </div>
    </div>
  );
}

export default function ExperiencesPage(props: PageProps<"/experiences">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-4xl">Experiences</h1>
      <Suspense
        fallback={
          <div className="grid gap-10 lg:grid-cols-[18rem_1fr]">
            <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-sand/50" />
            <ExperienceGridSkeleton count={8} />
          </div>
        }
      >
        <Results searchParams={props.searchParams as Promise<SP>} />
      </Suspense>
    </div>
  );
}
