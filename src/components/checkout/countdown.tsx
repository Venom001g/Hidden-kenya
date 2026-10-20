"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Time left on a reservation hold. Refreshes the page when the hold ends. */
export function Countdown({ until }: { until: string }) {
  const router = useRouter();
  const end = Date.parse(until);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, end - now);
  useEffect(() => {
    if (left === 0) router.refresh();
  }, [left, router]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const h = Math.floor(m / 60);
  const text = h >= 1 ? `${h} h ${m % 60} min` : `${m}:${String(s).padStart(2, "0")}`;
  return (
    <span className="font-semibold tabular-nums" role="timer" aria-live="off">
      {text}
    </span>
  );
}
