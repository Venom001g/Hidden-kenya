import "server-only";
import { publicEnv, serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailContent } from "./templates";

export { templates } from "./templates";

export type EmailOutcome = "sent" | "failed" | "skipped_unconfigured" | "skipped_preference" | "duplicate";

/**
 * Sends a transactional email through Resend and records the attempt in `notifications`.
 *
 *  - dedupeKey makes sends idempotent (a booking confirmation is sent once, even if the
 *    webhook is delivered twice).
 *  - When Resend is not configured the notification is stored as skipped_unconfigured, and
 *    the admin dashboard shows a warning. Nothing pretends the email was sent.
 */
export async function sendEmail(input: {
  to: string;
  userId?: string | null;
  template: string;
  content: EmailContent;
  dedupeKey: string;
  data?: Record<string, string>;
  /** In-app copy of the notification for the signed-in user. */
  inApp?: boolean;
}): Promise<EmailOutcome> {
  const db = createAdminClient();

  const { data: row, error } = await db
    .from("notifications")
    .insert({
      user_id: input.userId ?? null,
      recipient_email: input.to,
      channel: "email",
      template: input.template,
      subject: input.content.subject.slice(0, 200),
      data: input.data ?? {},
      dedupe_key: input.dedupeKey,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return "duplicate";
    console.error("[hidden-kenya] notification insert failed:", error.message);
    return "failed";
  }

  if (input.inApp && input.userId) {
    await db.from("notifications").insert({
      user_id: input.userId,
      channel: "in_app",
      template: input.template,
      subject: input.content.subject.slice(0, 200),
      data: input.data ?? {},
      dedupe_key: `${input.dedupeKey}:in_app`,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
  }

  const apiKey = serverEnv.resendApiKey();
  const from = serverEnv.emailFrom();
  if (!apiKey || !from) {
    await db.from("notifications").update({ status: "skipped_unconfigured" }).eq("id", row.id);
    return "skipped_unconfigured";
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.dedupeKey.slice(0, 256),
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.content.subject,
        html: input.content.html,
        text: input.content.text,
        reply_to: serverEnv.emailReplyTo(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message ?? "error"}`);
    await db
      .from("notifications")
      .update({ status: "sent", sent_at: new Date().toISOString(), gateway_message_id: body.id ?? null, attempts: 1 })
      .eq("id", row.id);
    return "sent";
  } catch (e) {
    await db
      .from("notifications")
      .update({ status: "failed", error: (e as Error).message.slice(0, 500), attempts: 1 })
      .eq("id", row.id);
    return "failed";
  }
}

export const siteUrl = () => publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
