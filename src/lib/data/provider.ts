import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Signed-in provider with their profile. Redirects if not a provider. */
export async function requireProvider(next = "/provider") {
  const user = await requireRole("provider", next);
  if (!user.providerId) redirect("/provider/onboarding");
  const supabase = await createClient();
  const [{ data: profile }, { data: details }] = await Promise.all([
    supabase.from("provider_profiles").select("*").eq("id", user.providerId).single(),
    supabase.from("provider_private_details").select("*").eq("provider_id", user.providerId).single(),
  ]);
  if (!profile || !details) redirect("/provider/onboarding");
  return { user, profile, details, supabase };
}

/** A listing owned by the signed-in provider (RLS also enforces ownership). */
export async function requireOwnListing(id: string) {
  const ctx = await requireProvider(`/provider/listings/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: listing } = await ctx.supabase.from("experiences").select("*").eq("id", id).eq("provider_id", ctx.profile.id).maybeSingle();
  if (!listing) notFound();
  return { ...ctx, listing };
}
