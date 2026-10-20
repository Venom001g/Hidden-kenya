"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { notifyBooking } from "@/lib/notifications";
import { processPendingRefunds } from "@/lib/payments/service";
import { createClient } from "@/lib/supabase/server";

export async function respondToBookingRequest(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("provider");
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = z
    .object({ bookingId: z.uuid(), decision: z.enum(["accept", "decline"]), reason: z.string().trim().max(1000) })
    .safeParse({ bookingId: formData.get("bookingId"), decision: formData.get("decision"), reason: formData.get("reason") ?? "" });
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const accept = parsed.data.decision === "accept";
  const supabase = await createClient();
  const { error } = await supabase.rpc("provider_respond_to_booking", {
    p_booking_id: parsed.data.bookingId,
    p_accept: accept,
    p_note: parsed.data.reason,
  });
  if (error) return fail(error);
  await notifyBooking(parsed.data.bookingId, accept ? "accepted" : "cancelled");
  revalidatePath(`/provider/bookings/${parsed.data.bookingId}`);
  revalidatePath("/provider/bookings");
  return { ok: true, message: accept ? "Accepted. The guest has been asked to pay to confirm." : "Request declined. The guest has been told." };
}

export async function providerCancelBooking(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("provider");
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = z
    .object({ bookingId: z.uuid(), reason: z.string().trim().min(5, "Tell the guest why (5+ characters).").max(1000) })
    .safeParse({ bookingId: formData.get("bookingId"), reason: formData.get("reason") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("provider_cancel_booking", { p_booking_id: parsed.data.bookingId, p_reason: parsed.data.reason });
  if (error) return fail(error);
  await notifyBooking(parsed.data.bookingId, "cancelled");
  if (data === "refund_pending") await processPendingRefunds(parsed.data.bookingId);
  revalidatePath(`/provider/bookings/${parsed.data.bookingId}`);
  return { ok: true, message: "Booking cancelled. The guest receives a full refund of anything they paid." };
}

export async function respondToReview(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("provider");
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = z
    .object({ reviewId: z.uuid(), response: z.string().trim().min(2, "Write a response.").max(2000) })
    .safeParse({ reviewId: formData.get("reviewId"), response: formData.get("response") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_review", { p_review_id: parsed.data.reviewId, p_response: parsed.data.response });
  if (error) return fail(error);
  revalidatePath("/provider/reviews");
  return { ok: true, message: "Response published." };
}
