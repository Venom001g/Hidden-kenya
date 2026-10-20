import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/feedback";
import { LEGAL } from "@/lib/content/legal";
import { formatShortDate } from "@/lib/format";
import { LEGAL_PAGES } from "@/lib/site";

export function generateStaticParams() {
  return Object.keys(LEGAL).map((slug) => ({ slug }));
}

export async function generateMetadata(props: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const doc = LEGAL[slug];
  return doc ? { title: doc.title, description: doc.summary, alternates: { canonical: `/legal/${slug}` } } : { title: "Not found" };
}

export default async function LegalPage(props: PageProps<"/legal/[slug]">) {
  const { slug } = await props.params;
  const doc = LEGAL[slug];
  if (!doc) notFound();
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[14rem_1fr] lg:px-8">
      <nav aria-label="Policies" className="lg:sticky lg:top-24 lg:self-start">
        <ul className="space-y-1 text-[0.95rem]">
          {LEGAL_PAGES.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/legal/${p.slug}`}
                aria-current={p.slug === slug ? "page" : undefined}
                className="block rounded-md px-2 py-1.5 hover:bg-sand aria-[current=page]:bg-sand aria-[current=page]:font-medium"
              >
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <article className="min-w-0">
        <h1 className="text-4xl">{doc.title}</h1>
        <p className="mt-2 text-stone">Last updated {formatShortDate(`${doc.updated}T12:00:00+03:00`)}</p>
        <Alert tone="warning" className="mt-6" title="Draft for legal review">
          This policy describes how the platform works but has not yet been reviewed by a Kenyan advocate. Items in square brackets must be completed by the business before launch.
        </Alert>
        <p className="mt-8 text-lg">{doc.summary}</p>
        <div className="prose-hk mt-4">
          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              {s.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
