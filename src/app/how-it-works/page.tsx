import type { Metadata } from "next";
import { HowItWorks, TrustSection } from "@/components/home/sections";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How it works",
  description: "How booking, payment, verification and reviews work on Hidden Kenya.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        <h1 className="max-w-3xl text-4xl sm:text-5xl">How Hidden Kenya works</h1>
        <p className="mt-4 max-w-2xl text-lg text-stone">
          Hidden Kenya connects travellers with experiences run by local guides and small tourism businesses. Hosts set their own prices and dates; we handle verification, booking and payment.
        </p>
      </div>
      <HowItWorks compact />
      <TrustSection />
      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <h2 className="text-3xl">How we make money</h2>
        <div className="prose-hk mt-4 text-charcoal/90">
          <p>Guests pay the price the host lists, with no booking fee added. We take a commission from the host on each booking, net of refunds; hosts see the rate before they publish.</p>
          <p>Some listings may be promoted on our homepage. Paid placements are always labelled “Sponsored”. Editorial picks without payment are labelled “Selected by our team”.</p>
        </div>
        <ButtonLink href="/experiences" className="mt-8">
          Browse experiences
        </ButtonLink>
      </section>
    </>
  );
}
