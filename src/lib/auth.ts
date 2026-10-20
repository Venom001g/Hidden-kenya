import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Enums } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type AppRole = Enums<"app_role">;

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  roles: AppRole[];
  emailConfirmed: boolean;
  deactivated: boolean;
  providerId: string | null;
};

/**
 * Data Access Layer: the single place that turns the session cookie into a user.
 * The JWT is verified by Supabase (getClaims), roles come from the database
 * (never from client input or user metadata). Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // Always request-time, even when Supabase is not configured, so protected pages are never prerendered.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const userId = claims.sub;

  const [{ data: profile }, { data: roles }, { data: provider }] = await Promise.all([
    supabase.from("profiles").select("full_name, deactivated_at").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("provider_profiles").select("id").eq("user_id", userId).maybeSingle(),
  ]);
  if (!profile) return null;

  return {
    id: userId,
    email: typeof claims.email === "string" ? claims.email : "",
    fullName: profile.full_name,
    roles: (roles ?? []).map((r) => r.role),
    emailConfirmed: Boolean((claims as { email_verified?: boolean }).email_verified ?? true),
    deactivated: profile.deactivated_at !== null,
    providerId: provider?.id ?? null,
  };
});

export function hasRole(user: SessionUser | null, role: AppRole) {
  return Boolean(user?.roles.includes(role));
}

/** For pages: redirect to login when signed out, or to a notice when deactivated. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (user.deactivated) redirect("/account-deactivated");
  return user;
}

export async function requireRole(role: AppRole, next?: string): Promise<SessionUser> {
  const user = await requireUser(next);
  if (!hasRole(user, role)) redirect(role === "admin" ? "/" : role === "provider" ? "/provider/onboarding" : "/");
  return user;
}

/** For server actions: returns the user or a typed failure instead of redirecting. */
export async function authorize(role?: AppRole): Promise<{ ok: true; user: SessionUser } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to continue." };
  if (user.deactivated) return { ok: false, error: "This account is deactivated." };
  if (role && !hasRole(user, role)) return { ok: false, error: "You do not have access to do that." };
  return { ok: true, user };
}
