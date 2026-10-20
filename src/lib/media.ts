export type PublicBucket = "experience-media" | "destination-media";

/** Public URL for an object in a public Storage bucket. */
export function publicImageUrl(bucket: PublicBucket, path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`;
}
