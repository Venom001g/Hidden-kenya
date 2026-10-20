import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { toMinorUnits } from "@/lib/format";
import { createPublicClient } from "@/lib/supabase/public";

/* ----------------------------------------------------------------------------
 * Taxonomy (cached: changes rarely; invalidated with the "taxonomy" tag)
 * -------------------------------------------------------------------------- */

export async function getCategories() {
  "use cache";
  cacheTag("taxonomy");
  cacheLife("hours");
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient()
    .from("experience_categories")
    .select("id, slug, name, description")
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

export async function getCounties() {
  "use cache";
  cacheTag("taxonomy");
  cacheLife("days");
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient().from("counties").select("code, name, slug, former_province").order("name");
  return data ?? [];
}

/* ----------------------------------------------------------------------------
 * Experience search (not cached: listings and availability must be current)
 * -------------------------------------------------------------------------- */

export const PAGE_SIZE = 12;

const optionalText = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => v || undefined);

export const searchParamsSchema = z.object({
  q: optionalText,
  category: optionalText,
  region: optionalText,
  county: z.coerce.number().int().min(1).max(47).optional().catch(undefined),
  destination: optionalText,
  currency: z.enum(["KES", "USD"]).optional().catch(undefined),
  min: optionalText,
  max: optionalText,
  duration: z.enum(["up_to_3h", "3_to_8h", "full_day", "multi_day"]).optional().catch(undefined),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  guests: z.coerce.number().int().min(1).max(50).optional().catch(undefined),
  access: z.array(z.string().max(40)).max(8).optional().catch(undefined),
  licensed: z.enum(["1"]).optional().catch(undefined),
  sort: z.enum(["recommended", "newest", "price_asc", "price_desc", "rating"]).default("recommended").catch("recommended"),
  page: z.coerce.number().int().min(1).max(500).default(1).catch(1),
});

export type ExperienceSearch = z.infer<typeof searchParamsSchema>;

export function parseSearchParams(sp: Record<string, string | string[] | undefined>): ExperienceSearch {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sp)) raw[k] = k === "access" ? (Array.isArray(v) ? v : v ? [v] : undefined) : first(v);
  return searchParamsSchema.parse(raw);
}

export type ExperienceCardData = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  price_minor: number;
  currency: string;
  pricing_model: "per_person" | "per_group";
  duration_minutes: number;
  booking_mode: "instant" | "request";
  county_name: string;
  region: string;
  destination_name: string | null;
  category_name: string;
  provider_name: string;
  provider_licence_checked: boolean;
  cover_path: string | null;
  cover_alt: string | null;
  review_count: number;
  average_rating: number | null;
};

export async function searchExperiences(s: Partial<ExperienceSearch>, limit = PAGE_SIZE) {
  await connection();
  if (!isSupabaseConfigured()) return { items: [] as ExperienceCardData[], total: 0, error: false };
  // Currency only constrains results when a price range is given (prices are compared within one currency).
  const currency = s.min || s.max ? (s.currency ?? "KES") : undefined;
  const minMinor = s.min && currency ? toMinorUnits(s.min, currency) : null;
  const maxMinor = s.max && currency ? toMinorUnits(s.max, currency) : null;
  const page = s.page ?? 1;

  const { data, error } = await createPublicClient().rpc("search_experiences", {
    p_query: s.q ?? null,
    p_category: s.category ?? null,
    p_region: s.region ?? null,
    p_county: s.county ?? null,
    p_destination: s.destination ?? null,
    p_currency: currency ?? null,
    p_min_price_minor: minMinor,
    p_max_price_minor: maxMinor,
    p_duration: s.duration ?? null,
    p_date: s.date ?? null,
    p_group_size: s.guests ?? null,
    p_accessibility: s.access?.length ? s.access : null,
    p_licence_checked: s.licensed === "1" ? true : null,
    p_sort: s.sort ?? "recommended",
    p_limit: limit,
    p_offset: (page - 1) * limit,
  });
  if (error) {
    console.error("[hidden-kenya] search failed:", error.message);
    return { items: [] as ExperienceCardData[], total: 0, error: true };
  }
  const rows = data ?? [];
  return {
    items: rows as unknown as ExperienceCardData[],
    total: rows[0] ? Number(rows[0].total_count) : 0,
    error: false,
  };
}

/* ----------------------------------------------------------------------------
 * Experience detail
 * -------------------------------------------------------------------------- */

export async function getExperienceBySlug(slug: string) {
  await connection();
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{1,100}$/.test(slug)) return null;
  const db = createPublicClient();
  const { data: exp } = await db
    .from("experiences")
    .select(
      `id, slug, title, summary, description, pricing_model, price_minor, currency, duration_minutes,
       min_participants, max_participants, included, excluded, languages, tags,
       accessibility_features, accessibility_notes, meeting_point_name, meeting_point_instructions,
       meeting_latitude, meeting_longitude, booking_mode, lead_time_hours, max_advance_days,
       cancellation_policy, published_at, updated_at, county_code,
       experience_categories(name, slug),
       counties(name, former_province),
       destinations(name, slug),
       provider_profiles(id, business_name, slug, description, operating_areas, verified_at, licence_checked_at, year_established)`,
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!exp) return null;

  const [{ data: images }, { data: stats }] = await Promise.all([
    db
      .from("experience_images")
      .select("id, storage_path, alt_text, credit, width, height")
      .eq("experience_id", exp.id)
      .order("position")
      .order("created_at"),
    db.from("experience_review_stats").select("review_count, average_rating").eq("experience_id", exp.id).maybeSingle(),
  ]);
  return { ...exp, images: images ?? [], stats: stats ?? null };
}

export async function getReviews(experienceId: string, limit = 10, offset = 0) {
  await connection();
  const { data, count } = await createPublicClient()
    .from("reviews")
    .select("id, reviewer_display_name, rating, title, body, provider_response, provider_responded_at, experienced_on, created_at", {
      count: "exact",
    })
    .eq("experience_id", experienceId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return { reviews: data ?? [], total: count ?? 0 };
}

/** Card data for specific listings, in the order given. Unpublished ids are dropped. */
export async function getExperienceCards(ids: string[]): Promise<ExperienceCardData[]> {
  await connection();
  if (!ids.length || !isSupabaseConfigured()) return [];
  const { data } = await createPublicClient().rpc("search_experiences", { p_ids: ids, p_limit: 48 });
  const rows = (data ?? []) as unknown as ExperienceCardData[];
  return ids.map((id) => rows.find((r) => r.id === id)).filter((x): x is ExperienceCardData => Boolean(x));
}

export async function getRelatedExperiences(experienceId: string): Promise<ExperienceCardData[]> {
  await connection();
  const { data: ids } = await createPublicClient().rpc("related_experiences", { p_experience_id: experienceId, p_limit: 4 });
  return getExperienceCards(ids ?? []);
}

export async function getAvailability(experienceId: string, from?: string, to?: string) {
  await connection();
  const { data, error } = await createPublicClient().rpc("get_experience_availability", {
    p_experience_id: experienceId,
    p_from: (from ?? null) as string,
    p_to: (to ?? null) as string,
  });
  if (error) return { slots: [], error: true };
  return { slots: data ?? [], error: false };
}

/* ----------------------------------------------------------------------------
 * Destinations and providers
 * -------------------------------------------------------------------------- */

export async function getDestinations() {
  await connection();
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient()
    .from("destinations")
    .select("id, slug, name, summary, county_code, counties(name, former_province), destination_images(storage_path, alt_text, position)")
    .eq("status", "published")
    .order("name");
  return data ?? [];
}

export async function getDestinationBySlug(slug: string) {
  await connection();
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const { data } = await createPublicClient()
    .from("destinations")
    .select(
      "id, slug, name, summary, description, travel_information, latitude, longitude, location_source, content_source_name, content_source_url, content_retrieved_on, updated_at, counties(name, former_province), destination_images(id, storage_path, alt_text, credit, licence, source_url, width, height, position)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return data;
}

export async function getNearbyDestinations(destinationId: string) {
  await connection();
  const { data } = await createPublicClient().rpc("nearby_destinations", { p_destination_id: destinationId, p_radius_km: 150, p_limit: 6 });
  return data ?? [];
}

export async function getPublicProvider(slug: string) {
  await connection();
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const { data } = await createPublicClient()
    .from("provider_profiles")
    .select("id, business_name, slug, description, operating_areas, website_url, year_established, verified_at, licence_checked_at, created_at")
    .eq("slug", slug)
    .eq("verification_status", "verified")
    .maybeSingle();
  return data;
}

export async function getProviderExperiences(providerId: string): Promise<ExperienceCardData[]> {
  await connection();
  const { data } = await createPublicClient().rpc("search_experiences", { p_provider: providerId, p_limit: 48, p_sort: "newest" });
  return (data ?? []) as unknown as ExperienceCardData[];
}

/** Editorially selected listings (admin-curated). Sponsored entries are labelled as such. */
export async function getFeatured(): Promise<(ExperienceCardData & { sponsored: boolean })[]> {
  await connection();
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient().from("site_settings").select("value").eq("key", "featured_experiences").eq("is_public", true).maybeSingle();
  const entries = z
    .array(z.object({ id: z.uuid(), sponsored: z.boolean().default(false) }))
    .max(8)
    .catch([])
    .parse(data?.value ?? []);
  if (!entries.length) return [];
  const all = await getExperienceCards(entries.map((e) => e.id));
  return entries
    .map((e) => {
      const card = all.find((r) => r.id === e.id);
      return card ? { ...card, sponsored: e.sponsored } : null;
    })
    .filter((x): x is ExperienceCardData & { sponsored: boolean } => Boolean(x));
}
