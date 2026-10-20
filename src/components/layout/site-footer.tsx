import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { NewsletterForm } from "@/components/newsletter-form";
import { currentYear, getPublicSetting } from "@/lib/data/settings";

async function Year() {
  return <>{await currentYear()}</>;
}
import { LEGAL_PAGES, MAIN_NAV } from "@/lib/site";

async function ContactLine() {
  const email = await getPublicSetting<string>("support_email");
  if (!email) return <p className="text-paper/70">Signed-in guests and hosts can reach us from their account&apos;s support page.</p>;
  return (
    <p>
      Email{" "}
      <a href={`mailto:${email}`} className="underline underline-offset-4">
        {email}
      </a>
    </p>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-forest-deep text-paper">
      <svg viewBox="0 0 1200 40" preserveAspectRatio="none" className="block h-6 w-full text-ivory" aria-hidden>
        <path d="M0 0 H1200 V12 L1080 30 L960 18 L820 34 L700 16 L560 28 L430 12 L300 30 L170 20 L60 32 L0 22 Z" fill="currentColor" />
      </svg>
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr] lg:px-8">
        <div className="space-y-5">
          <Logo inverted />
          <p className="max-w-sm text-paper/80">
            A marketplace for experiences run by Kenyan guides, community groups and small tourism businesses.
          </p>
          <div id="newsletter" className="max-w-sm scroll-mt-24">
            <h2 className="mb-2 font-sans text-sm font-semibold text-paper">Newsletter</h2>
            <NewsletterForm tone="dark" />
          </div>
        </div>
        <nav aria-label="Explore" className="space-y-3">
          <h2 className="font-sans text-sm font-semibold">Explore</h2>
          <ul className="space-y-2 text-paper/80">
            {MAIN_NAV.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-paper hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/faq" className="hover:text-paper hover:underline">
                Questions and answers
              </Link>
            </li>
          </ul>
        </nav>
        <div className="space-y-3">
          <h2 className="font-sans text-sm font-semibold">Policies</h2>
          <ul className="space-y-2 text-paper/80">
            {LEGAL_PAGES.map((p) => (
              <li key={p.slug}>
                <Link href={`/legal/${p.slug}`} className="hover:text-paper hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
          <div className="pt-3 text-sm text-paper/80">
            <Suspense fallback={null}>
              <ContactLine />
            </Suspense>
          </div>
        </div>
      </div>
      <div className="border-t border-paper/15">
        <p className="mx-auto max-w-7xl px-4 py-5 text-sm text-paper/65 sm:px-6 lg:px-8">
          © <Year /> Hidden Kenya. Prices are set by hosts and shown in the currency they list.
        </p>
      </div>
    </footer>
  );
}
