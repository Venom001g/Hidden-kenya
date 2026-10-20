import "server-only";
import { notifyBooking } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGateway, GatewayError, PAYMENT_REFERENCE, type WebhookEvent } from "./index";

/**
 * Asks the gateway for the authoritative state of a payment and applies it.
 * Used by webhooks, the post-redirect status page and the reconciliation job.
 * Safe to call any number of times: apply_payment_result is idempotent.
 */
export async function reconcilePayment(reference: string): Promise<string> {
  if (!PAYMENT_REFERENCE.test(reference)) return "invalid_reference";
  const gateway = getGateway();
  if (!gateway.isConfigured()) return "gateway_not_configured";

  const tx = await gateway.verify(reference);
  const db = createAdminClient();
  const { data: outcome, error } = await db.rpc("apply_payment_result", {
    p_reference: reference,
    p_outcome: tx.outcome,
    p_amount_minor: tx.amountMinor as number,
    p_currency: tx.currency as string,
    p_gateway_transaction_id: tx.gatewayTransactionId,
    p_channel: tx.channel,
    p_fees_minor: tx.feesMinor,
    p_paid_at: tx.paidAt,
    p_failure_reason: tx.failureReason,
  });
  if (error) throw new Error(`apply_payment_result failed: ${error.message}`);

  if (outcome === "confirmed" || outcome === "confirmed_late" || outcome === "late_refund" || outcome === "duplicate_refund") {
    const { data: pay } = await db.from("payments").select("booking_id").eq("reference", reference).single();
    if (pay) {
      if (outcome.startsWith("confirmed")) await notifyBooking(pay.booking_id, "confirmed");
      if (outcome.endsWith("refund")) {
        if (outcome === "late_refund") await notifyBooking(pay.booking_id, "cancelled");
        await processPendingRefunds(pay.booking_id);
      }
    }
  }
  return outcome ?? "unknown";
}

/**
 * Submits pending refunds to the gateway. Without gateway credentials refunds stay pending
 * and appear in the admin refunds queue.
 */
export async function processPendingRefunds(bookingId?: string): Promise<{ submitted: number; failed: number }> {
  const gateway = getGateway();
  if (!gateway.isConfigured()) return { submitted: 0, failed: 0 };
  const db = createAdminClient();
  let query = db
    .from("refunds")
    .select("id, booking_id, amount_minor, currency, reason, payments(reference)")
    .eq("status", "pending")
    .order("created_at")
    .limit(25);
  if (bookingId) query = query.eq("booking_id", bookingId);
  const { data: refunds } = await query;

  let submitted = 0;
  let failed = 0;
  for (const r of refunds ?? []) {
    if (!r.payments) continue;
    // Claim the refund first so concurrent workers do not submit it twice.
    const { data: claimed } = await db
      .from("refunds")
      .update({ status: "processing" })
      .eq("id", r.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed?.length) continue;
    try {
      const result = await gateway.refund({
        transactionReference: r.payments.reference,
        amountMinor: r.amount_minor,
        currency: r.currency,
        note: r.reason,
      });
      await db.rpc("apply_refund_result", {
        p_refund_id: r.id,
        p_status: result.status === "pending" ? "processing" : result.status,
        p_gateway_refund_id: result.gatewayRefundId,
      });
      if (result.status === "processed") await notifyBooking(r.booking_id, "refunded");
      submitted++;
    } catch (e) {
      failed++;
      await db.rpc("apply_refund_result", {
        p_refund_id: r.id,
        p_status: "failed",
        p_failure_reason: e instanceof GatewayError ? e.message.slice(0, 300) : "Refund request failed",
      });
    }
  }
  return { submitted, failed };
}

async function handleRefundEvent(event: WebhookEvent): Promise<string> {
  const db = createAdminClient();
  const status =
    event.status === "processed" ? "processed" : event.status === "failed" ? "failed" : event.status ? "processing" : null;
  if (!status) return "ignored";

  let refundId: string | null = null;
  if (event.gatewayObjectId) {
    const { data } = await db.from("refunds").select("id").eq("gateway_refund_id", event.gatewayObjectId).maybeSingle();
    refundId = data?.id ?? null;
  }
  if (!refundId && event.reference) {
    const { data } = await db
      .from("refunds")
      .select("id, payments!inner(reference)")
      .eq("payments.reference", event.reference)
      .in("status", ["pending", "processing"])
      .eq("amount_minor", event.amountMinor ?? -1)
      .limit(1)
      .maybeSingle();
    refundId = data?.id ?? null;
  }
  if (!refundId) return "unknown_refund";

  const { data: outcome } = await db.rpc("apply_refund_result", {
    p_refund_id: refundId,
    p_status: status,
    p_gateway_refund_id: event.gatewayObjectId,
    p_failure_reason: status === "failed" ? "Gateway reported refund failure" : null,
  });
  if (outcome === "processed") {
    const { data: r } = await db.from("refunds").select("booking_id").eq("id", refundId).single();
    if (r) await notifyBooking(r.booking_id, "refunded");
  }
  return `refund_${outcome}`;
}

async function handleTransferEvent(event: WebhookEvent): Promise<string> {
  const m = /^HKT_([a-f0-9]{32})$/.exec(event.reference ?? "");
  if (!m) return "unknown_transfer";
  const id = m[1].replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  const status = event.eventType === "transfer.success" ? "success" : event.eventType === "transfer.reversed" ? "reversed" : "failed";
  const { data } = await createAdminClient().rpc("apply_payout_transfer_result", {
    p_payout_id: id,
    p_status: status,
    p_transfer_reference: event.gatewayObjectId,
  });
  return `transfer_${data}`;
}

/**
 * Authenticated webhook processing. Returns the HTTP status to send back:
 *  401 bad signature, 200 processed or duplicate, 500 processing error (gateway retries).
 */
export async function handlePaymentWebhook(rawBody: string, headers: Headers): Promise<{ status: number; outcome: string }> {
  const gateway = getGateway();
  if (!gateway.isConfigured()) return { status: 503, outcome: "gateway_not_configured" };
  if (!gateway.verifyWebhookSignature(rawBody, headers)) return { status: 401, outcome: "invalid_signature" };

  let event: WebhookEvent;
  try {
    event = gateway.parseWebhook(rawBody);
  } catch {
    return { status: 400, outcome: "malformed" };
  }

  const db = createAdminClient();
  const { data: isNew, error } = await db.rpc("record_payment_event", {
    p_gateway: gateway.id,
    p_dedupe_key: event.dedupeKey,
    p_event_type: event.eventType,
    p_reference: event.reference as string,
    p_payload: event.sanitized as never,
  });
  if (error) return { status: 500, outcome: "store_failed" };
  if (!isNew) return { status: 200, outcome: "duplicate" };

  try {
    let outcome = "ignored";
    if (event.kind === "charge" && event.reference) outcome = await reconcilePayment(event.reference);
    else if (event.kind === "refund") outcome = await handleRefundEvent(event);
    else if (event.kind === "transfer") outcome = await handleTransferEvent(event);
    await db.rpc("finish_payment_event", { p_dedupe_key: event.dedupeKey, p_outcome: outcome });
    return { status: 200, outcome };
  } catch (e) {
    await db.rpc("finish_payment_event", {
      p_dedupe_key: event.dedupeKey,
      p_outcome: "error",
      p_error: (e as Error).message.slice(0, 500),
    });
    return { status: 500, outcome: "processing_error" };
  }
}
