"use server";

import { z } from "zod";
import { authorize } from "@/lib/auth";
import { siteUrl } from "@/lib/email";
import { fail, type ActionResult } from "@/lib/errors";
import { getGateway, GatewayError } from "@/lib/payments";
import { reconcilePayment } from "@/lib/payments/service";
import { RATE_LIMITED, rateLimitRequest } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts (or retries) payment for the signed-in customer's booking.
 * The amount comes from the booking row inside begin_payment(), never from the browser.
 */
export async function startPayment(bookingId: string): Promise<ActionResult<{ redirectUrl: string }>> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!z.uuid().safeParse(bookingId).success) return { ok: false, error: "Invalid booking." };
  if (!(await rateLimitRequest("payment", auth.user.id))) return { ok: false, error: RATE_LIMITED };

  const gateway = getGateway();
  if (!gateway.isConfigured()) {
    return { ok: false, error: "Online payment is not switched on yet, so no money has been taken. Your reservation will be released when the hold ends." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("begin_payment", { p_booking_id: bookingId });
  const payment = data?.[0];
  if (error || !payment) return fail(error);
  if (!gateway.supportedCurrencies().includes(payment.currency)) {
    return { ok: false, error: `Payments in ${payment.currency} are not available yet. No money has been taken.` };
  }

  try {
    const { redirectUrl } = await gateway.initialize({
      reference: payment.reference,
      amountMinor: payment.amount_minor,
      currency: payment.currency,
      email: payment.email,
      callbackUrl: `${siteUrl()}/checkout/${bookingId}/return`,
      metadata: { booking_id: bookingId },
    });
    return { ok: true, data: { redirectUrl } };
  } catch (e) {
    return { ok: false, error: e instanceof GatewayError ? e.userMessage : "The payment service is unavailable. Please try again shortly." };
  }
}

/** Re-checks the latest payment for a booking with the gateway (used by the return page). */
export async function refreshPaymentStatus(bookingId: string): Promise<ActionResult<{ status: string }>> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!z.uuid().safeParse(bookingId).success) return { ok: false, error: "Invalid booking." };
  const supabase = await createClient();
  // RLS: only the booking's customer (or provider/admin) can see these rows.
  const { data: booking } = await supabase.from("bookings").select("id, status, customer_id").eq("id", bookingId).maybeSingle();
  if (!booking || booking.customer_id !== auth.user.id) return { ok: false, error: "Booking not found." };
  const { data: pay } = await supabase
    .from("payments")
    .select("reference, status")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pay && ["initiated", "pending"].includes(pay.status)) {
    try {
      await reconcilePayment(pay.reference);
    } catch {
      /* gateway unreachable: keep showing the stored status */
    }
  }
  const { data: after } = await supabase.from("bookings").select("status").eq("id", bookingId).single();
  return { ok: true, data: { status: after?.status ?? booking.status } };
}
