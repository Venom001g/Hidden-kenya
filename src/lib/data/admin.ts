import "server-only";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin(next = "/admin") {
  const user = await requireRole("admin", next);
  return { user, db: await createClient() };
}

export function readParam(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" && v.length <= 200 ? v : undefined;
}
