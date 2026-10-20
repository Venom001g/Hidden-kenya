import { isAuthorizedCron } from "@/lib/cron";
import { notifyBooking } from "@/lib/notifications";
import { getGateway } from "@/lib/payments";
import { processPendingRefunds, reconcilePayment } from "@/lib/payments/service";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Scheduled maintenance (every 15 minutes, see vercel.json):
 *  1. expire unpaid holds and unanswered requests
 *  2. mark finished experiences as completed
 *  3. reconcile payments stuck in pending (missed webhooks)
 *  4. submit queued refunds
 *  5. send reminders for experiences starting in the next 24–48 hours
 * Each step is idempotent, so overlapping runs are safe.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  const db = createAdminClient();
  const report: Record<string, unknown> = {};

  const { data: expired } = await db.rpc("expire_stale_bookings");
  report.expired = expired ?? 0;
  const { data: completed } = await db.rpc("complete_past_bookings");
  report.completed = completed ?? 0;

  if (getGateway().isConfigured()) {
    const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const until = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: stuck } = await db
      .from("payments")
      .select("reference")
      .in("status", ["initiated", "pending"])
      .gte("created_at", since)
      .lte("created_at", until)
      .limit(50);
    let reconciled = 0;
    for (const p of stuck ?? []) {
      try {
        await reconcilePayment(p.reference);
        reconciled++;
      } catch {
        /* retried next run */
      }
    }
    report.reconciled = reconciled;
    report.refunds = await processPendingRefunds();
  } else {
    report.payments = "gateway not configured";
  }

  const from = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const to = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const { data: soon } = await db.from("bookings").select("id").eq("status", "confirmed").gte("starts_at", from).lt("starts_at", to).limit(200);
  for (const b of soon ?? []) await notifyBooking(b.id, "reminder");
  report.reminders = soon?.length ?? 0;

  return Response.json({ ok: true, ...report }, { headers: { "Cache-Control": "no-store" } });
}
