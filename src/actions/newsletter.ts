"use server";

import { z } from "zod";
import { email } from "@/lib/validation/auth";
import { sendEmail, siteUrl, templates } from "@/lib/email";
import type { ActionResult } from "@/lib/errors";
import { RATE_LIMITED, randomToken, rateLimitRequest, safeEqual, sha256 } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEWSLETTER_CONSENT_TEXT, unsubscribeSignature } from "@/lib/newsletter";


const schema = z.object({
  email,
  consent: z.literal("on", { error: "Tick the box to confirm you want the newsletter." }),
});

export async function subscribeToNewsletter(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse({ email: formData.get("email"), consent: formData.get("consent") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (!(await rateLimitRequest("newsletter"))) return { ok: false, error: RATE_LIMITED };

  const email = parsed.data.email.trim().toLowerCase();
  const db = createAdminClient();
  // Same response whether or not the address exists, to avoid revealing subscribers.
  const done: ActionResult = { ok: true, message: "Check your inbox to confirm your subscription." };

  const { data: existing } = await db
    .from("newsletter_subscriptions")
    .select("id, status")
    .ilike("email", email)
    .maybeSingle();
  if (existing?.status === "subscribed") return done;

  const token = randomToken();
  let id = existing?.id;
  if (existing) {
    await db
      .from("newsletter_subscriptions")
      .update({
        status: "pending",
        confirm_token_hash: sha256(token),
        consent_text: NEWSLETTER_CONSENT_TEXT,
        consented_at: new Date().toISOString(),
        unsubscribed_at: null,
      })
      .eq("id", existing.id);
  } else {
    const { data, error } = await db
      .from("newsletter_subscriptions")
      .insert({
        email,
        consent_text: NEWSLETTER_CONSENT_TEXT,
        confirm_token_hash: sha256(token),
        unsubscribe_token_hash: sha256(randomToken()),
      })
      .select("id")
      .single();
    if (error) return done;
    id = data.id;
  }
  if (!id) return done;
  await db
    .from("newsletter_subscriptions")
    .update({ unsubscribe_token_hash: sha256(unsubscribeSignature(id)) })
    .eq("id", id);

  await sendEmail({
    to: email,
    template: "newsletter_confirm",
    content: templates.newsletterConfirm(siteUrl(), { url: `${siteUrl()}/newsletter/confirm?token=${token}` }),
    dedupeKey: `newsletter-confirm:${id}:${sha256(token).slice(0, 16)}`,
  });
  return done;
}

/** Confirmation happens on a button press (POST), so email link scanners cannot confirm on someone's behalf. */
export async function confirmNewsletter(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { ok: false, error: "This link is not valid." };
  const { data } = await createAdminClient()
    .from("newsletter_subscriptions")
    .update({ status: "subscribed", confirmed_at: new Date().toISOString(), confirm_token_hash: null })
    .eq("confirm_token_hash", sha256(token))
    .eq("status", "pending")
    .select("id");
  if (!data?.length) return { ok: false, error: "This link has already been used or replaced by a newer one." };
  return { ok: true, message: "You are subscribed. Every newsletter includes a link to unsubscribe." };
}

export async function unsubscribeNewsletter(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const id = z.uuid().safeParse(formData.get("id"));
  const sig = String(formData.get("sig") ?? "");
  if (!id.success || !sig || !safeEqual(sig, unsubscribeSignature(id.data))) {
    return { ok: false, error: "This unsubscribe link is not valid." };
  }
  await createAdminClient()
    .from("newsletter_subscriptions")
    .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
    .eq("id", id.data);
  return { ok: true, message: "You have been unsubscribed. Booking emails are not affected." };
}
