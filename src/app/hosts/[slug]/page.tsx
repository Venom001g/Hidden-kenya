import { BadgeCheck, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExperienceGrid } from "@/components/experiences/experience-card";
import { EmptyState } from "@/components/ui/feedback";
import { getProviderExperiences, getPublicProvider } from "@/lib/data/public";
import { formatShortDate } from "@/lib/format";

export async function generateMetadata(props: PageProps<"/hosts/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const p = await getPublicProvider(slug);
  if (!p) return { title: "Host not found", robots: { index: false } };
  return { title: p.business_name, description: p.description.slice(0, 160) || undefined, alternates: { canonical: `/hosts/${p.slug}` } };
}

async function Detail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublicProvider(slug);
  if (!p) notFound();
  const items = await getProviderExperiences(p.id);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-3xl">
        <h1 className="text-4xl">{p.business_name}</h1>
        <ul className="mt-4 space-y-1.5 text-[0.95rem]">
          <li className="flex items-center gap-2">
            <BadgeCheck className="size-4 text-forest" aria-hidden />
            Verified by Hidden Kenya{p.verified_at ? ` since ${formatShortDate(p.verified_at)}` : ""}
          </li>
          {p.licence_checked_at ? (
            <li className="flex items-center gap-2">
              <BadgeCheck className="size-4 text-forest" aria-hidden /> Tourism licence document checked
            </li>
          ) : null}
        </ul>
        {p.operating_areas ? <p className="mt-4 text-stone">Operates in: {p.operating_areas}</p> : null}
        {p.year_established ? <p className="text-stone">Established {p.year_established} (as stated by the host)</p> : null}
        <div className="prose-hk mt-6 whitespace-pre-line">{p.description}</div>
        <p className="mt-3 text-sm text-stone">This profile is written by the host.</p>
        {p.website_url ? (
          <a href={p.website_url} rel="noopener noreferrer nofollow" target="_blank" className="mt-4 inline-flex items-center gap-1 text-forest underline underline-offset-4">
            Host website <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </div>
      <section className="mt-14">
        <h2 className="mb-8 text-3xl">Experiences</h2>
        {items.length ? <ExperienceGrid items={items} /> : <EmptyState title="No experiences listed right now" />}
      </section>
    </div>
  );
}

export default function HostPage(props: PageProps<"/hosts/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-7xl px-4" />}>
      <Detail params={props.params} />
    </Suspense>
  );
}
