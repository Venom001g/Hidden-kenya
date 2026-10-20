import type { Metadata } from "next";
import { FAQ } from "@/lib/content/faq";

export const metadata: Metadata = {
  title: "Questions and answers",
  description: "Payments, cancellations, host verification and reviews on Hidden Kenya.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <h1 className="text-4xl">Questions and answers</h1>
      <dl className="mt-10 space-y-8">
        {FAQ.map((f) => (
          <div key={f.q}>
            <dt className="text-xl font-semibold">{f.q}</dt>
            <dd className="mt-2 text-charcoal/85">{f.a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
