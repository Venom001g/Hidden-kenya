import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { MAIN_NAV } from "@/lib/site";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-sand-deep/60 bg-ivory/92 backdrop-blur supports-[backdrop-filter]:bg-ivory/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0 rounded-md" aria-label="Hidden Kenya home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {MAIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-[0.95rem] text-charcoal/85 transition-colors hover:bg-sand hover:text-charcoal"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Suspense fallback={<div className="h-9 w-24 animate-pulse rounded-md bg-sand/70" aria-hidden />}>
            <UserMenu />
          </Suspense>
          <Suspense fallback={<span className="inline-block size-10 lg:hidden" aria-hidden />}>
            <MobileNav items={MAIN_NAV.map((i) => ({ href: i.href, label: i.label }))} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
