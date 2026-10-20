"use client";

import { useRouter } from "next/navigation";
import { createListing, updateListing } from "@/actions/listings";
import { useServerForm } from "@/components/forms/use-server-form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, fieldAria, Input, Select, Textarea } from "@/components/ui/field";
import { ACCESSIBILITY_FEATURES, CANCELLATION_POLICIES } from "@/lib/site";
import { listingSchema, type ListingInput } from "@/lib/validation/listing";

type Option = { value: string; label: string };

export function ListingForm({
  listingId,
  defaults,
  categories,
  counties,
  destinations,
  isLive,
}: {
  listingId?: string;
  defaults: ListingInput;
  categories: Option[];
  counties: Option[];
  destinations: Option[];
  isLive?: boolean;
}) {
  const router = useRouter();
  const action = (values: ListingInput) => (listingId ? updateListing(listingId, values) : createListing(values));
  const { form, onSubmit, pending, result } = useServerForm(listingSchema, action as never, defaults, (r) => {
    const created = (r as { data?: { id: string } }).data;
    if (!listingId && created) router.push(`/provider/listings/${created.id}/photos`);
    else router.refresh();
  });
  const e = form.formState.errors;
  const reg = form.register;
  const msg = (k: keyof typeof e) => e[k]?.message as string | undefined;

  return (
    <form onSubmit={onSubmit} className="space-y-10" noValidate>
      {isLive ? (
        <Alert tone="warning">This listing is live. Saving changes to its description, price, meeting point or terms sends it back to review, and it is hidden until approved.</Alert>
      ) : null}

      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold">The basics</legend>
        <Field id="title" label="Title" hint="Specific and plain, e.g. “Dawn birding walk in Kakamega Forest”." error={msg("title")}>
          <Input {...fieldAria("title", msg("title"), true)} {...reg("title")} />
        </Field>
        <Field id="summary" label="Summary" hint="One or two sentences shown in search results (20–300 characters)." error={msg("summary")}>
          <Textarea {...fieldAria("summary", msg("summary"), true)} rows={2} {...reg("summary")} />
        </Field>
        <Field id="description" label="Full description" hint="What guests will do, in order. What makes it special. At least 150 characters. Leave a blank line between paragraphs." error={msg("description")}>
          <Textarea {...fieldAria("description", msg("description"), true)} rows={10} {...reg("description")} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="categoryId" label="Type" error={msg("categoryId")}>
            <Select {...fieldAria("categoryId", msg("categoryId"))} {...reg("categoryId")}>
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="countyCode" label="County" error={msg("countyCode")}>
            <Select {...fieldAria("countyCode", msg("countyCode"))} {...reg("countyCode")}>
              <option value="0">Choose…</option>
              {counties.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="destinationId" label="Destination" optional error={msg("destinationId")}>
            <Select {...fieldAria("destinationId", msg("destinationId"))} {...reg("destinationId")}>
              <option value="">None</option>
              {destinations.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold">Price and group</legend>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="price" label="Price" hint="Before any discounts; guests pay exactly this." error={msg("price")}>
            <Input {...fieldAria("price", msg("price"), true)} inputMode="decimal" {...reg("price")} />
          </Field>
          <Field id="currency" label="Currency">
            <Select id="currency" {...reg("currency")}>
              <option value="KES">KES (Kenyan shilling)</option>
              <option value="USD">USD (US dollar)</option>
            </Select>
          </Field>
          <Field id="pricingModel" label="Charged">
            <Select id="pricingModel" {...reg("pricingModel")}>
              <option value="per_person">Per person</option>
              <option value="per_group">Per group (private booking)</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-4">
          <Field id="durationHours" label="Duration (hours)" error={msg("durationHours")}>
            <Input {...fieldAria("durationHours", msg("durationHours"))} type="number" min={0} max={720} {...reg("durationHours")} />
          </Field>
          <Field id="durationMinutes" label="and minutes">
            <Input id="durationMinutes" type="number" min={0} max={59} step={5} {...reg("durationMinutes")} />
          </Field>
          <Field id="minParticipants" label="Minimum guests per booking" error={msg("minParticipants")}>
            <Input {...fieldAria("minParticipants", msg("minParticipants"))} type="number" min={1} max={500} {...reg("minParticipants")} />
          </Field>
          <Field id="maxParticipants" label="Maximum guests per booking" error={msg("maxParticipants")}>
            <Input {...fieldAria("maxParticipants", msg("maxParticipants"))} type="number" min={1} max={500} {...reg("maxParticipants")} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold">What is included</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="included" label="Included" hint="One item per line." error={msg("included")}>
            <Textarea {...fieldAria("included", msg("included"), true)} rows={5} {...reg("included")} />
          </Field>
          <Field id="excluded" label="Not included" hint="One item per line." error={msg("excluded")}>
            <Textarea {...fieldAria("excluded", msg("excluded"), true)} rows={5} {...reg("excluded")} />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="languages" label="Languages" hint="Separate with commas, e.g. English, Kiswahili." error={msg("languages")}>
            <Input {...fieldAria("languages", msg("languages"), true)} {...reg("languages")} />
          </Field>
          <Field id="tags" label="Keywords" optional hint="Separate with commas. Helps search." error={msg("tags")}>
            <Input {...fieldAria("tags", msg("tags"), true)} {...reg("tags")} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold">Meeting point</legend>
        <p className="text-sm text-stone">Shown to everyone on the listing. Use a public place, not a home address.</p>
        <Field id="meetingPointName" label="Name of the place" error={msg("meetingPointName")}>
          <Input {...fieldAria("meetingPointName", msg("meetingPointName"))} {...reg("meetingPointName")} />
        </Field>
        <Field id="meetingPointInstructions" label="How to find you" hint="Landmarks, what to look for, parking, timing. At least 20 characters." error={msg("meetingPointInstructions")}>
          <Textarea {...fieldAria("meetingPointInstructions", msg("meetingPointInstructions"), true)} rows={4} {...reg("meetingPointInstructions")} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="meetingLatitude" label="Latitude" optional hint="Decimal degrees, e.g. -2.2717. Copy from your maps app." error={msg("meetingLatitude")}>
            <Input {...fieldAria("meetingLatitude", msg("meetingLatitude"), true)} inputMode="decimal" {...reg("meetingLatitude")} />
          </Field>
          <Field id="meetingLongitude" label="Longitude" optional hint="e.g. 40.9020" error={msg("meetingLongitude")}>
            <Input {...fieldAria("meetingLongitude", msg("meetingLongitude"), true)} inputMode="decimal" {...reg("meetingLongitude")} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-lg font-semibold">Accessibility</legend>
        <p className="-mt-2 text-sm text-stone">Shown to guests as described by you. Only tick what is reliably true.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACCESSIBILITY_FEATURES.map((f) => (
            <label key={f.value} className="flex items-center gap-2.5">
              <Checkbox value={f.value} {...reg("accessibilityFeatures")} />
              {f.label}
            </label>
          ))}
        </div>
        <Field id="accessibilityNotes" label="Accessibility notes" optional error={msg("accessibilityNotes")}>
          <Textarea {...fieldAria("accessibilityNotes", msg("accessibilityNotes"))} rows={3} placeholder="Terrain, distances, steps, rest stops…" {...reg("accessibilityNotes")} />
        </Field>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold">Booking rules</legend>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="bookingMode" label="Confirmation">
            <Select id="bookingMode" {...reg("bookingMode")}>
              <option value="instant">Instant: confirmed when paid</option>
              <option value="request">Request: I approve each booking</option>
            </Select>
          </Field>
          <Field id="leadTimeHours" label="Notice needed (hours)" error={msg("leadTimeHours")}>
            <Input {...fieldAria("leadTimeHours", msg("leadTimeHours"))} type="number" min={0} max={720} {...reg("leadTimeHours")} />
          </Field>
          <Field id="maxAdvanceDays" label="Bookable up to (days ahead)" error={msg("maxAdvanceDays")}>
            <Input {...fieldAria("maxAdvanceDays", msg("maxAdvanceDays"))} type="number" min={1} max={730} {...reg("maxAdvanceDays")} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Cancellation policy</legend>
          <div className="space-y-2">
            {Object.entries(CANCELLATION_POLICIES).map(([value, p]) => (
              <label key={value} className="flex items-start gap-3 rounded-[var(--radius-control)] border border-sand-deep p-3 has-[:checked]:border-forest has-[:checked]:bg-forest-soft">
                <input type="radio" value={value} className="mt-1 accent-forest" {...reg("cancellationPolicy")} />
                <span>
                  <span className="font-medium">{p.label}</span>
                  <span className="block text-sm text-stone">{p.summary}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-3 border-t border-sand-deep bg-paper/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : listingId ? "Save changes" : "Save draft and add photos"}
        </Button>
        <div aria-live="polite" className="min-w-0 flex-1">
          {result ? result.ok ? <p className="text-sm text-forest">{result.message ?? "Saved."}</p> : <p className="text-sm text-danger">{result.error}</p> : null}
        </div>
      </div>
    </form>
  );
}
