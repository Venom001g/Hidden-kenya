import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Host experiences on Hidden Kenya",
  description: "List tours and activities in Kenya, manage availability and take bookings with M-Pesa and card payments.",
  alternates: { canonical: "/for-providers" },
};

const STEPS = [
  { title: "Create your host profile", text: "Tell guests who you are and where you operate. Add the business, contact and licence details we need to verify you." },
  { title: "Upload verification documents", text: "For example business registration, ID, or your tourism licence. Documents are stored privately and seen only by our review team." },
  { title: "Get verified", text: "Our team reviews your profile. If something is missing we tell you exactly what to change." },
  { title: "Create listings", text: "Describe the experience, set the price, group size, meeting point, cancellation policy and the dates you run it. Add your own photos." },
  { title: "Submit for review", text: "We check each listing before it goes live. Changes to a live listing's description, price or terms are re-checked too." },
  { title: "Take bookings and get paid", text: "Guests pay online. You see confirmed bookings and guest contact details in your dashboard. Earnings are paid out to M-Pesa after each experience." },
];

export default function ForProvidersPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-3xl">
        <h1 className="text-4xl sm:text-5xl">Host your experiences on Hidden Kenya</h1>
        <p className="mt-4 text-lg text-stone">
          For guides, community groups, tour operators and activity businesses across Kenya. Free to join; we charge a commission only on bookings guests pay for.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/signup?intent=host" size="lg">
            Create a host account
          </ButtonLink>
          <ButtonLink href="/provider/onboarding" size="lg" variant="secondary">
            I already have an account
          </ButtonLink>
        </div>
      </div>

      <section className="mt-16">
        <h2 className="text-3xl">Getting started</h2>
        <ol className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="font-display text-3xl leading-none text-terracotta" aria-hidden>
                {i + 1}
              </span>
              <div>
                <h3 className="font-sans text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-stone">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="text-3xl">What you control</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-charcoal/90">
            <li>Prices, in KES or USD, per person or per group</li>
            <li>Weekly schedules, one-off dates, closures and capacity changes</li>
            <li>Instant booking, or approving each request yourself</li>
            <li>Your cancellation policy: flexible, moderate or strict</li>
            <li>How much notice you need before a booking</li>
          </ul>
        </div>
        <div>
          <h2 className="text-3xl">What we handle</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-charcoal/90">
            <li>Secure M-Pesa and card payments through Paystack</li>
            <li>Holding places while guests pay, so you are never double-booked</li>
            <li>Booking confirmations and reminders by email</li>
            <li>Refunds, calculated from the policy you chose</li>
            <li>Reviews only from guests who actually booked</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
