"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { RATE_LIMITED, rateLimitRequest } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { password } from "@/lib/validation/auth";

export async function updateProfile(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = z
    .object({
      fullName: z.string().trim().min(2, "Enter your name.").max(120),
      phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.")]),
      country: z.union([z.literal(""), z.string().regex(/^[A-Z]{2}$/)]),
    })
    .safeParse({ fullName: formData.get("fullName"), phone: formData.get("phone") ?? "", country: formData.get("country") ?? "" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone || null, country_code: parsed.data.country || null })
    .eq("id", auth.user.id);
  if (error) return fail(error);
  revalidatePath("/account", "layout");
  return { ok: true, message: "Profile saved." };
}

export async function updateNotificationPrefs(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      email_booking_reminders: formData.get("reminders") === "on",
      email_product_updates: formData.get("productUpdates") === "on",
    })
    .eq("id", auth.user.id);
  if (error) return fail(error);
  revalidatePath("/account/settings");
  return { ok: true, message: "Preferences saved. Booking confirmations and changes are always emailed." };
}

export async function changePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!(await rateLimitRequest("signIn", auth.user.id))) return { ok: false, error: RATE_LIMITED };
  const parsed = z
    .object({ current: z.string().min(1, "Enter your current password."), next: password, confirm: z.string() })
    .refine((v) => v.next === v.confirm, { message: "New passwords do not match.", path: ["confirm"] })
    .safeParse({ current: formData.get("current"), next: formData.get("next"), confirm: formData.get("confirm") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const supabase = await createClient();
  // Re-authenticate: a stolen session alone must not be enough to change the password.
  const { error: authErr } = await supabase.auth.signInWithPassword({ email: auth.user.email, password: parsed.data.current });
  if (authErr) return { ok: false, error: "Your current password is not correct." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.next });
  if (error) return { ok: false, error: error.code === "same_password" ? "Choose a different password." : "We could not change your password." };
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true, message: "Password changed. Other devices have been signed out." };
}

export async function signOutEverywhere(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}

export async function createReview(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!(await rateLimitRequest("review", auth.user.id))) return { ok: false, error: RATE_LIMITED };
  const parsed = z
    .object({
      bookingId: z.uuid(),
      rating: z.coerce.number().int().min(1, "Choose a rating.").max(5),
      title: z.string().trim().max(120),
      body: z.string().trim().min(20, "Write at least 20 characters.").max(4000),
    })
    .safeParse({ bookingId: formData.get("bookingId"), rating: formData.get("rating"), title: formData.get("title") ?? "", body: formData.get("body") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_review", {
    p_booking_id: parsed.data.bookingId,
    p_rating: parsed.data.rating,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
  });
  if (error) return fail(error);
  revalidatePath(`/account/bookings/${parsed.data.bookingId}`);
  revalidatePath("/account/reviews");
  return { ok: true, message: "Thank you. Your review is published." };
}

export async function reportReview(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!(await rateLimitRequest("report", auth.user.id))) return { ok: false, error: RATE_LIMITED };
  const parsed = z.object({ reviewId: z.uuid(), reason: z.string().trim().min(5).max(1000) }).safeParse({ reviewId: formData.get("reviewId"), reason: formData.get("reason") });
  if (!parsed.success) return { ok: false, error: "Describe the problem (at least 5 characters)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_review", { p_review_id: parsed.data.reviewId, p_reason: parsed.data.reason });
  if (error) return fail(error);
  return { ok: true, message: "Thanks. Our team will look at this review." };
}

const ticketSchema = z.object({
  subject: z.string().trim().min(4, "Add a short subject.").max(160),
  category: z.enum(["booking", "payment", "account", "listing", "safety", "other"]),
  bookingId: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
  body: z.string().trim().min(10, "Describe the issue (10+ characters).").max(5000),
});

export async function createTicket(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!(await rateLimitRequest("support", auth.user.id))) return { ok: false, error: RATE_LIMITED };
  const parsed = ticketSchema.safeParse({
    subject: formData.get("subject"),
    category: formData.get("category"),
    bookingId: formData.get("bookingId") ?? "",
    body: formData.get("body"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const supabase = await createClient();
  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .insert({ user_id: auth.user.id, subject: parsed.data.subject, category: parsed.data.category, booking_id: parsed.data.bookingId })
    .select("id")
    .single();
  if (error) return fail(error, "We could not create the request.");
  const { error: mErr } = await supabase.from("support_messages").insert({ ticket_id: ticket.id, body: parsed.data.body });
  if (mErr) return fail(mErr);
  redirect(`/account/support/${ticket.id}`);
}

export async function replyToTicket(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!(await rateLimitRequest("support", auth.user.id))) return { ok: false, error: RATE_LIMITED };
  const parsed = z.object({ ticketId: z.uuid(), body: z.string().trim().min(1).max(5000) }).safeParse({ ticketId: formData.get("ticketId"), body: formData.get("body") });
  if (!parsed.success) return { ok: false, error: "Write a message." };
  const supabase = await createClient();
  const { error } = await supabase.from("support_messages").insert({ ticket_id: parsed.data.ticketId, body: parsed.data.body });
  if (error) return fail(error, "This request is closed. Open a new one if you still need help.");
  revalidatePath(`/account/support/${parsed.data.ticketId}`);
  return { ok: true, message: "Message sent." };
}

export async function closeTicket(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  const id = z.uuid().safeParse(formData.get("ticketId"));
  if (!id.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.from("support_tickets").update({ status: "closed" }).eq("id", id.data);
  if (error) return fail(error);
  revalidatePath(`/account/support/${id.data}`);
  return { ok: true, message: "Request closed." };
}

export async function markNotificationsRead(): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", auth.user.id).eq("channel", "in_app").is("read_at", null);
  revalidatePath("/account");
  return { ok: true };
}

/**
 * Deletes the signed-in user's account after re-entering the password and typing DELETE.
 * Booking and payment records are kept (legal record keeping) with contact details scrubbed.
 */
export async function deleteAccount(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (formData.get("confirm") !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
  if (!(await rateLimitRequest("signIn", auth.user.id))) return { ok: false, error: RATE_LIMITED };
  const supabase = await createClient();
  const { error: authErr } = await supabase.auth.signInWithPassword({ email: auth.user.email, password: String(formData.get("password") ?? "") });
  if (authErr) return { ok: false, error: "Your password is not correct." };

  const admin = createAdminClient();
  const { error: prepErr } = await admin.rpc("prepare_account_deletion", { p_user_id: auth.user.id });
  if (prepErr) return fail(prepErr);
  const { error } = await admin.auth.admin.deleteUser(auth.user.id);
  if (error) return { ok: false, error: "We could not delete the account. Contact support and we will do it for you." };
  await supabase.auth.signOut();
  redirect("/?account=deleted");
}
