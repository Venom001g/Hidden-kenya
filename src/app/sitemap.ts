import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { LEGAL } from "@/lib/content/legal";
import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";

/** Sitemap of public pages and every published listing, destination and verified host. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const statics = ["", "/experiences", "/destinations", "/how-it-works", "/for-providers", "/faq", ...Object.keys(LEGAL).map((s) => `/legal/${s}`)].map(
    (p) => ({ url: `${site}${p}` }),
  );
  if (!isSupabaseConfigured()) return statics;

  const db = createPublicClient();
  const [{ data: exps }, { data: dests }, { data: hosts }] = await Promise.all([
    db.from("experiences").select("slug, updated_at").eq("status", "published").limit(5000),
    db.from("destinations").select("slug, updated_at").eq("status", "published").limit(5000),
    db.from("provider_profiles").select("slug, updated_at").eq("verification_status", "verified").limit(5000),
  ]);
  return [
    ...statics,
    ...(exps ?? []).map((e) => ({ url: `${site}/experiences/${e.slug}`, lastModified: e.updated_at })),
    ...(dests ?? []).map((d) => ({ url: `${site}/destinations/${d.slug}`, lastModified: d.updated_at })),
    ...(hosts ?? []).map((h) => ({ url: `${site}/hosts/${h.slug}`, lastModified: h.updated_at })),
  ];
}
