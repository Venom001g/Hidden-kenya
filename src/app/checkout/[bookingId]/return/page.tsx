import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PaymentStatusPoller } from "@/components/checkout/payment-status";
import { requireUser } from "@/lib/auth";
import { reconcilePayment } from "@/lib/payments/service";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payment status", robots: { index: false } };

/**
 * Where Paystack sends the guest after checkout. The query string is NOT trusted:
 * we look up the latest payment for this booking ourselves and verify it with Paystack.
 */
async function Status({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) notFound();
  const user = await requireUser(`/checkout/${bookingId}`);
  const supabase = await createClient();
  const { data: booking } = await supabase.from("bookings").select("id, status").eq("id", bookingId).eq("customer_id", user.id).maybeSingle();
  if (!booking) notFound();
  const { data: pay } = await supabase.from("payments").select("reference, status").eq("booking_id", bookingId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (pay && ["initiated", "pending"].includes(pay.status)) {
    try {
      await reconcilePayment(pay.reference);
    } catch {
      /* the poller retries */
    }
  }
  const { data: after } = await supabase.from("bookings").select("status").eq("id", bookingId).single();
  return <PaymentStatusPoller bookingId={bookingId} initialStatus={after?.status ?? booking.status} />;
}

export default function ReturnPage(props: PageProps<"/checkout/[bookingId]/return">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <Suspense fallback={<p role="status">Checking your payment with Paystack…</p>}>
        <Status params={props.params} />
      </Suspense>
    </div>
  );
}
