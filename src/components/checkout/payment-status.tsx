"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { refreshPaymentStatus } from "@/actions/payments";
import { ButtonLink } from "@/components/ui/button";

const FINAL_OK = ["confirmed", "completed"];
const FINAL_BAD = ["payment_failed", "expired", "cancelled", "refund_pending", "refunded"];

/** Polls the server (which verifies with the gateway) for up to ~2 minutes. */
export function PaymentStatusPoller({ bookingId, initialStatus }: { bookingId: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [tries, setTries] = useState(0);
  const waiting = !FINAL_OK.includes(status) && !FINAL_BAD.includes(status);

  useEffect(() => {
    if (!waiting || tries >= 24) return;
    const t = setTimeout(async () => {
      const r = await refreshPaymentStatus(bookingId);
      if (r.ok && r.data) setStatus(r.data.status);
      setTries((n) => n + 1);
    }, 5000);
    return () => clearTimeout(t);
  }, [waiting, tries, bookingId]);

  if (FINAL_OK.includes(status)) {
    return (
      <div className="space-y-5 text-center" role="status">
        <CheckCircle2 className="mx-auto size-12 text-forest" aria-hidden />
        <h1 className="text-3xl">Payment received. You are booked.</h1>
        <p className="text-stone">A confirmation email is on its way with the meeting details.</p>
        <ButtonLink href={`/account/bookings/${bookingId}`}>View your booking</ButtonLink>
      </div>
    );
  }
  if (FINAL_BAD.includes(status)) {
    const msg =
      status === "payment_failed"
        ? "The payment did not go through and no money was taken."
        : status === "refund_pending" || status === "refunded"
          ? "Your payment arrived after the reservation ended and no places were left, so it is being refunded in full."
          : "This reservation is no longer active.";
    return (
      <div className="space-y-5 text-center" role="status">
        <XCircle className="mx-auto size-12 text-danger" aria-hidden />
        <h1 className="text-3xl">Payment not completed</h1>
        <p className="text-stone">{msg}</p>
        <ButtonLink href={status === "payment_failed" ? `/checkout/${bookingId}` : `/account/bookings/${bookingId}`}>
          {status === "payment_failed" ? "Try again" : "View booking"}
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="space-y-5 text-center" role="status" aria-live="polite">
      <Loader2 className="mx-auto size-12 animate-spin text-forest" aria-hidden />
      <h1 className="text-3xl">Waiting for confirmation</h1>
      <p className="text-stone">
        {tries >= 24
          ? "We have not received confirmation yet. M-Pesa payments can take a few minutes. We will email you as soon as it is confirmed; you can safely close this page."
          : "If you are paying by M-Pesa, approve the prompt on your phone. This page updates automatically."}
      </p>
      <ButtonLink href={`/account/bookings/${bookingId}`} variant="secondary">
        Go to your booking
      </ButtonLink>
    </div>
  );
}
