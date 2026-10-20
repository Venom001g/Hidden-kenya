import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Toaster } from "@/components/ui/toaster";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import "./globals.css";

const youngSerif = localFont({
  src: [
    { path: "./fonts/young-serif-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/young-serif-latin-ext.woff2", weight: "400", style: "normal" },
  ],
  variable: "--font-young-serif",
  display: "swap",
});

const hanken = localFont({
  src: [
    { path: "./fonts/hanken-grotesk-latin.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/hanken-grotesk-latin-ext.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-hanken",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${SITE_NAME}: local experiences across Kenya`, template: `%s · ${SITE_NAME}` },
  description: SITE_TAGLINE,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_KE" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#1D4A37",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${youngSerif.variable} ${hanken.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-forest px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <Toaster />
      </body>
    </html>
  );
}
