"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { createBooking } from "@/actions/bookings";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, fieldAria, Input, Textarea } from "@/components/ui/field";
import { formatMoney, TIMEZONE } from "@/lib/format";
import { cn } from "@/lib/utils";
import { email } from "@/lib/validation/auth";
import { phone } from "@/lib/validation/booking";

export type Slot = { starts_at: string; capacity: number; seats_available: number };

type Props = {
  experience: {
    id: string;
    priceMinor: number;
    currency: string;
    pricingModel: "per_person" | "per_group";
    minParticipants: number;
    maxParticipants: number;
    bookingMode: "instant" | "request";
  };
  slots: Slot[];
  contact: { name: string; email: string; phone: string } | null;
  loginHref: string;
};

const contactSchema = z.object({
  contactName: z.string().trim().min(2, "Enter the lead guest's name.").max(120),
  contactEmail: email,
  contactPhone: phone,
  notes: z.string().max(1000).optional(),
});
type Contact = z.infer<typeof contactSchema>;

const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function BookingWidget({ experience, slots, contact, loginHref }: Props) {
  const router = useRouter();
  const open = useMemo(() => slots.filter((s) => s.seats_available >= experience.minParticipants), [slots, experience.minParticipants]);
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of open) m.set(dayKey(s.starts_at), [...(m.get(dayKey(s.starts_at)) ?? []), s]);
    return m;
  }, [open]);
  const days = [...byDay.keys()];

  const [day, setDay] = useState<string | null>(days[0] ?? null);
  const [slot, setSlot] = useState<string | null>(byDay.get(days[0] ?? "")?.[0]?.starts_at ?? null);
  const [guests, setGuests] = useState(experience.minParticipants);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // One key per widget instance: retries of the same submission cannot create a second booking.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const form = useForm<Contact>({
    resolver: zodResolver(contactSchema as never) as unknown as Resolver<Contact>,
    defaultValues: { contactName: contact?.name ?? "", contactEmail: contact?.email ?? "", contactPhone: contact?.phone ?? "", notes: "" },
    mode: "onBlur",
  });

  const chosen = open.find((s) => s.starts_at === slot) ?? null;
  const maxGuests = Math.min(experience.maxParticipants, chosen?.seats_available ?? experience.maxParticipants);
  const total = experience.pricingModel === "per_person" ? experience.priceMinor * guests : experience.priceMinor;

  if (!open.length) {
    return (
      <div className="rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5">
        <p className="font-medium">No dates are open for booking right now.</p>
        <p className="mt-1 text-sm text-stone">The host has not published availability with places left. Check back later.</p>
      </div>
    );
  }

  const submit = form.handleSubmit((values) => {
    if (!chosen) return setError("Choose a date and time.");
    setError(null);
    start(async () => {
      const r = await createBooking({
        experienceId: experience.id,
        startsAt: chosen.starts_at,
        partySize: guests,
        idempotencyKey,
        ...values,
        notes: values.notes ?? "",
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/checkout/${r.data!.bookingId}`);
    });
  });

  const e = form.formState.errors;
  return (
    <form onSubmit={submit} className="min-w-0 space-y-5 rounded-[var(--radius-card)] border border-sand-deep bg-paper p-5 shadow-raised" noValidate>
      <p>
        <span className="text-2xl font-semibold">{formatMoney(experience.priceMinor, experience.currency)}</span>{" "}
        <span className="text-stone">{experience.pricingModel === "per_person" ? "per person" : "per group"}</span>
      </p>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Date</legend>
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Available dates">
          {days.map((d) => {
            const first = byDay.get(d)![0];
            const selected = d === day;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setDay(d);
                  setSlot(byDay.get(d)![0].starts_at);
                  setGuests((g) => Math.min(g, byDay.get(d)![0].seats_available));
                }}
                className={cn(
                  "shrink-0 snap-start rounded-[var(--radius-control)] border px-3 py-2 text-sm",
                  selected ? "border-forest bg-forest text-paper" : "border-sand-deep hover:bg-sand",
                )}
              >
                {dayLabel(first.starts_at)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {day ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Start time (Nairobi time)</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Start times">
            {byDay.get(day)!.map((s) => (
              <button
                key={s.starts_at}
                type="button"
                role="radio"
                aria-checked={s.starts_at === slot}
                onClick={() => {
                  setSlot(s.starts_at);
                  setGuests((g) => Math.min(g, s.seats_available));
                }}
                className={cn(
                  "rounded-[var(--radius-control)] border px-3 py-2 text-sm",
                  s.starts_at === slot ? "border-forest bg-forest-soft text-forest" : "border-sand-deep hover:bg-sand",
                )}
              >
                {timeLabel(s.starts_at)}
                <span className="ml-1.5 text-stone">· {s.seats_available} left</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex items-center justify-between">
        <span id="guests-label" className="text-sm font-medium">
          Guests
        </span>
        <div className="flex items-center gap-2" role="group" aria-labelledby="guests-label">
          <Button
            variant="secondary"
            size="sm"
            className="size-9 px-0"
            onClick={() => setGuests((g) => Math.max(experience.minParticipants, g - 1))}
            disabled={guests <= experience.minParticipants}
            aria-label="Fewer guests"
          >
            <Minus />
          </Button>
          <output className="w-8 text-center text-lg tabular-nums" aria-live="polite">
            {guests}
          </output>
          <Button
            variant="secondary"
            size="sm"
            className="size-9 px-0"
            onClick={() => setGuests((g) => Math.min(maxGuests, g + 1))}
            disabled={guests >= maxGuests}
            aria-label="More guests"
          >
            <Plus />
          </Button>
        </div>
      </div>

      {contact ? (
        <div className="space-y-4 border-t border-sand-deep pt-4">
          <Field id="contactName" label="Lead guest" error={e.contactName?.message}>
            <Input {...fieldAria("contactName", e.contactName?.message)} autoComplete="name" {...form.register("contactName")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field id="contactEmail" label="Email" error={e.contactEmail?.message}>
              <Input {...fieldAria("contactEmail", e.contactEmail?.message)} type="email" autoComplete="email" {...form.register("contactEmail")} />
            </Field>
            <Field id="contactPhone" label="Phone" error={e.contactPhone?.message}>
              <Input {...fieldAria("contactPhone", e.contactPhone?.message)} type="tel" autoComplete="tel" {...form.register("contactPhone")} />
            </Field>
          </div>
          <Field id="notes" label="Notes for the host" optional error={e.notes?.message}>
            <Textarea {...fieldAria("notes", e.notes?.message)} rows={3} placeholder="Dietary needs, pick-up questions…" {...form.register("notes")} />
          </Field>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between border-t border-sand-deep pt-4">
        <span className="text-stone">Total</span>
        <span className="text-lg font-semibold">{formatMoney(total, experience.currency)}</span>
      </div>

      {contact ? (
        <Button type="submit" size="lg" className="w-full" disabled={pending || !chosen}>
          {pending ? "Reserving…" : experience.bookingMode === "request" ? "Send booking request" : "Reserve and pay"}
        </Button>
      ) : (
        <ButtonLink href={loginHref} size="lg" className="w-full">
          Sign in to book
        </ButtonLink>
      )}
      <p className="text-center text-sm text-stone">
        {experience.bookingMode === "request"
          ? "The host confirms requests. You pay only after they accept."
          : "Your places are held for a short time while you pay. The checkout page shows exactly how long."}
      </p>
      <div aria-live="assertive">{error ? <Alert tone="error">{error}</Alert> : null}</div>
    </form>
  );
}
