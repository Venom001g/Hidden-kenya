import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";

/** Public site settings (admin-managed). Cached; invalidated with the "settings" tag. */
export async function getPublicSetting<T>(key: string): Promise<T | null> {
  "use cache";
  cacheTag("settings");
  cacheLife("hours");
  if (!isSupabaseConfigured()) return null;
  const { data } = await createPublicClient().from("site_settings").select("value").eq("key", key).eq("is_public", true).maybeSingle();
  return (data?.value as T) ?? null;
}

export async function currentYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}
