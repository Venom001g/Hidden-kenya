"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { siteUrl } from "@/lib/email";
import type { ActionResult } from "@/lib/errors";
import { RATE_LIMITED, rateLimitRequest } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { newPasswordSchema, resetRequestSchema, safeNext, signInSchema, signUpSchema } from "@/lib/validation/auth";

const fieldErrors = (e: z.ZodError) => z.flattenError(e).fieldErrors as Record<string, string[] | undefined>;

export async function signIn(input: z.input<typeof signInSchema>): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  if (!(await rateLimitRequest("signIn"))) return { ok: false, error: RATE_LIMITED };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") {
      return { ok: false, error: "Confirm your email address first. We sent you a link when you signed up." };
    }
    return { ok: false, error: "That email and password do not match an account." };
  }
  const { data: profile } = await supabase.from("profiles").select("deactivated_at").eq("id", data.user.id).maybeSingle();
  if (profile?.deactivated_at) {
    await supabase.auth.signOut();
    return { ok: false, error: "This account has been deactivated. Contact support if you think this is a mistake." };
  }
  redirect(safeNext(parsed.data.next));
}

export async function signUp(input: z.input<typeof signUpSchema>): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  if (!(await rateLimitRequest("signUp"))) return { ok: false, error: RATE_LIMITED };

  const next = parsed.data.intent === "host" ? "/provider/onboarding" : "/account";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Only the display name goes into metadata. Roles are assigned by the database, never from here.
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    if (error.code === "weak_password") return { ok: false, error: "Choose a stronger password." };
    if (error.code === "over_email_send_rate_limit") return { ok: false, error: RATE_LIMITED };
    return { ok: false, error: "We could not create the account. Please try again." };
  }
  // With email confirmation on (recommended), there is no session yet. The same message is
  // shown when the email already exists, so account existence is not revealed.
  if (!data.session) {
    return { ok: true, message: `Check ${parsed.data.email} for a link to confirm your account.` };
  }
  redirect(next);
}

export async function requestPasswordReset(input: z.input<typeof resetRequestSchema>): Promise<ActionResult> {
  const parsed = resetRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address.", fieldErrors: fieldErrors(parsed.error) };
  if (!(await rateLimitRequest("passwordReset"))) return { ok: false, error: RATE_LIMITED };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
  });
  return { ok: true, message: "If an account uses that address, we have emailed a reset link. It expires in one hour." };
}

export async function updatePassword(input: z.input<typeof newPasswordSchema>): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { ok: false, error: "Choose a password you have not used for this account." };
    return { ok: false, error: "We could not update your password. Request a new reset link." };
  }
  // End other sessions so a compromised session cannot persist after a reset.
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true, message: "Password updated." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
