/**
 * Imports destination records from a reviewed JSON file. It never invents data: every record
 * must carry its source, and records are created as DRAFTS for an administrator to review
 * and publish in Admin → Destinations.
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… npm run import:destinations -- path/to/destinations.json [--dry-run]
 *
 * File format: see docs/data-onboarding.md. Existing slugs are skipped, never overwritten.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const record = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
    county_code: z.number().int().min(1).max(47),
    summary: z.string().max(300).default(""),
    description: z.string().min(100).max(10000),
    travel_information: z.string().max(5000).default(""),
    latitude: z.number().min(-5).max(5.5).nullable().default(null),
    longitude: z.number().min(33.5).max(42.5).nullable().default(null),
    location_source: z.string().max(300).default(""),
    content_source_name: z.string().min(2).max(200),
    content_source_url: z.url().nullable().default(null),
    content_retrieved_on: z.iso.date(),
  })
  .refine((r) => (r.latitude === null) === (r.longitude === null), "latitude and longitude must both be set or both null")
  .refine((r) => r.latitude === null || r.location_source.length > 0, "location_source is required with coordinates");

async function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!file) throw new Error("Usage: npm run import:destinations -- <file.json> [--dry-run]");
  const parsed = z.array(record).min(1).max(1000).safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 20)) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error("The file has invalid records; nothing was imported.");
  }
  const rows = parsed.data;
  console.log(`${rows.length} valid record(s) in ${file}.`);
  if (dryRun) return console.log("Dry run: nothing written.");

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: existing } = await db.from("destinations").select("slug").in("slug", rows.map((r) => r.slug));
  const skip = new Set((existing ?? []).map((e) => e.slug));
  const toInsert = rows.filter((r) => !skip.has(r.slug)).map((r) => ({ ...r, status: "draft" as const }));
  if (toInsert.length) {
    const { error } = await db.from("destinations").insert(toInsert);
    if (error) throw new Error(error.message);
    await db.rpc("record_audit_event", {
      p_actor_id: null as unknown as string,
      p_action: "destination.imported",
      p_entity_type: "destination",
      p_entity_id: null as unknown as string,
      p_metadata: { file: file.split("/").pop(), count: toInsert.length },
    });
  }
  console.log(`Imported ${toInsert.length} as drafts; skipped ${skip.size} existing slug(s). Review and publish them in Admin → Destinations.`);
}

main().catch((e) => {
  console.error(`Import failed: ${(e as Error).message}`);
  process.exit(1);
});
