"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { notifyBooking } from "@/lib/notifications";
import { processPendingRefunds } from "@/lib/payments/service";
import { RATE_LIMITED, rateLimitRequest } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { cancelSchema, createBookingSchema } from "@/lib/validation/booking";

export async function createBooking(input: z.input<typeof createBookingSchema>): Promise<ActionResult<{ bookingId: string }>> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  if (!(await rateLimitRequest("booking", auth.user.id))) return { ok: false, error: RATE_LIMITED };

  const v = parsed.data;
  const supabase = await createClient();
  // Price, capacity, lead time and policy are all checked and calculated in the database.
  const { data: bookingId, error } = await supabase.rpc("create_booking", {
    p_experience_id: v.experienceId,
    p_starts_at: v.startsAt,
    p_party_size: v.partySize,
    p_idempotency_key: v.idempotencyKey,
    p_contact_name: v.contactName,
    p_contact_email: v.contactEmail,
    p_contact_phone: v.contactPhone,
    p_notes: v.notes,
  });
  if (error || !bookingId) return fail(error);

  const { data: b } = await supabase.from("bookings").select("status").eq("id", bookingId).single();
  if (b?.status === "pending_provider_confirmation") await notifyBooking(bookingId, "requested");
  revalidatePath("/account/bookings");
  return { ok: true, data: { bookingId } };
}

export async function cancelBooking(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = cancelSchema.safeParse({ bookingId: formData.get("bookingId"), reason: formData.get("reason") ?? "" });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("cancel_booking", {
    p_booking_id: parsed.data.bookingId,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(error);
  await notifyBooking(parsed.data.bookingId, "cancelled");
  if (result === "refund_pending") await processPendingRefunds(parsed.data.bookingId);
  revalidatePath(`/account/bookings/${parsed.data.bookingId}`);
  revalidatePath("/account/bookings");
  return {
    ok: true,
    message: result === "refund_pending" ? "Booking cancelled. Your refund is being processed." : "Booking cancelled.",
  };
}

export async function toggleFavorite(experienceId: string, save: boolean): Promise<ActionResult<{ saved: boolean }>> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!z.uuid().safeParse(experienceId).success) return { ok: false, error: "Invalid listing." };
  const supabase = await createClient();
  const { error } = save
    ? await supabase.from("favorites").upsert({ user_id: auth.user.id, experience_id: experienceId }, { ignoreDuplicates: true })
    : await supabase.from("favorites").delete().eq("user_id", auth.user.id).eq("experience_id", experienceId);
  if (error) return fail(error, "We could not update your saved experiences.");
  revalidatePath("/account/favorites");
  return { ok: true, data: { saved: save } };
}
