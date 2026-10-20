"use client";

import { Loader2, Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { startPayment } from "@/actions/payments";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

export function PayButton({ bookingId, label }: { bookingId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await startPayment(bookingId);
            if (!r.ok) return setError(r.error);
            // Top-level navigation to the gateway's hosted checkout page.
            window.location.assign(r.data!.redirectUrl);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
        {pending ? "Opening secure checkout…" : label}
      </Button>
      <div aria-live="assertive">{error ? <Alert tone="error">{error}</Alert> : null}</div>
    </div>
  );
}
