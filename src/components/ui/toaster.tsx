"use client";

import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";

type Toast = { id: number; message: string };

/** Announces a success message that should survive the form that triggered it re-rendering away. */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent("hk:toast", { detail: { message } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const message = (e as CustomEvent<{ message: string }>).detail?.message;
      if (!message) return;
      const id = ++n;
      setItems((list) => [...list.slice(-2), { id, message }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 6000);
    };
    window.addEventListener("hk:toast", onToast);
    return () => window.removeEventListener("hk:toast", onToast);
  }, []);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto flex max-w-md items-start gap-3 rounded-[var(--radius-card)] bg-forest-deep px-4 py-3 text-paper shadow-raised">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#E7B98F]" aria-hidden />
          <p className="text-[0.95rem]">{t.message}</p>
          <button type="button" className="ml-2 rounded p-0.5 hover:bg-paper/10" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}>
            <X className="size-4" aria-hidden />
            <span className="sr-only">Dismiss</span>
          </button>
        </div>
      ))}
    </div>
  );
}
