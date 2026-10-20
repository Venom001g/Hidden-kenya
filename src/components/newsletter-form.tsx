"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { NEWSLETTER_CONSENT_TEXT_CLIENT } from "@/components/newsletter-consent";
import { subscribeToNewsletter } from "@/actions/newsletter";
import type { ActionResult } from "@/lib/errors";
import { cn } from "@/lib/utils";

export function NewsletterForm({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [state, action, pending] = useActionState(subscribeToNewsletter, { ok: true } as ActionResult);
  const id = useId();
  const dark = tone === "dark";
  return (
    <form action={action} className="space-y-3" noValidate>
      <div className="flex gap-2">
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={cn(
            "h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border px-3",
            dark ? "border-paper/30 bg-forest text-paper placeholder:text-paper/55" : "border-sand-deep bg-paper",
          )}
        />
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "h-11 shrink-0 rounded-[var(--radius-control)] px-4 font-medium disabled:opacity-60",
            dark ? "bg-paper text-forest-deep hover:bg-sand" : "bg-forest text-paper hover:bg-forest-deep",
          )}
        >
          {pending ? "Sending…" : "Subscribe"}
        </button>
      </div>
      <label className={cn("flex items-start gap-2 text-sm", dark ? "text-paper/80" : "text-stone")}>
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-forest" />
        <span>
          {NEWSLETTER_CONSENT_TEXT_CLIENT}{" "}
          <Link href="/legal/privacy" className="underline underline-offset-2">
            Privacy policy
          </Link>
        </span>
      </label>
      <p aria-live="polite" className={cn("text-sm", !state.ok ? (dark ? "text-[#f3c2b4]" : "text-danger") : dark ? "text-paper" : "text-forest")}>
        {state.ok ? state.message : state.error}
      </p>
    </form>
  );
}
